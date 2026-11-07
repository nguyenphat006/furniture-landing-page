"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { CmsError, cmsEnabled, cmsPostForm } from "@/lib/cms/client";
import { verifyCaptcha } from "./captcha";
import { isCountryCode } from "./countries";
import {
  MODEL_MAX,
  isPurpose,
  type InquiryField,
  type InquiryState,
  type InquiryValues,
} from "./inquiry";
import {
  checkAttachment,
  cleanText,
  clientIp,
  rateLimited,
  submittedTooFast,
} from "./security";

/*
 * Nhận form Liên hệ (2026-11-05). Trang công khai, không đăng nhập, nên mọi dữ liệu là
 * không tin cậy. Thứ tự kiểm tra (rẻ trước, tốn kém sau):
 *   1. Giới hạn tần suất theo IP (5 lần / 10 phút).
 *   2. Bẫy bot: trường ẩn "website" (honeypot) và gửi quá nhanh (< 3 giây) → giả như thành công.
 *   3. Captcha Cloudflare Turnstile (captcha.ts).
 *   4. Kiểm tra trường bằng zod, làm sạch ký tự điều khiển.
 *   5. Kiểm tra tệp: đuôi, kích thước, magic bytes, PDF có mã chủ động (security.ts).
 * CSRF: Next tự so Origin với Host cho server action.
 *
 * Gửi đi (G2, 2026-11-07): POST multipart có ký HMAC sang CMS (/api/v1/inquiries, xem
 * backend/apps/inquiries). CMS kiểm tra lại dữ liệu và tệp, lưu tệp ở kho riêng tư, gửi email
 * text thuần cho nhân viên (email khách chỉ ở Reply-To, không đính kèm tệp).
 * Chưa nối CMS (CMS_API_URL trống): dev báo thành công để thử giao diện, production báo lỗi
 * (không giả vờ đã nhận yêu cầu của khách).
 * Không ghi log nội dung form hay thông tin cá nhân.
 */

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.email().max(200),
  message: z.string().min(1).max(5000),
});

function text(formData: FormData, key: string, max: number, singleLine = true) {
  const v = formData.get(key);
  return typeof v === "string"
    ? cleanText(v, singleLine).trim().slice(0, max)
    : "";
}

export async function submitInquiry(
  _prev: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  const purposeRaw = formData.get("purpose");
  const values: InquiryValues = {
    purpose: isPurpose(purposeRaw) ? purposeRaw : "quote",
    name: text(formData, "name", 120),
    email: text(formData, "email", 200),
    company: text(formData, "company", 200),
    // Chỉ nhận mã ISO có trong danh sách, giá trị lạ coi như bỏ trống
    country: isCountryCode(formData.get("country"))
      ? (formData.get("country") as string)
      : "",
    phone: text(formData, "phone", 50),
    model: text(formData, "model", MODEL_MAX),
    message: text(formData, "message", 5000, false),
  };

  const ip = clientIp(await headers());
  if (rateLimited(ip)) {
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: "rateLimited",
    };
  }

  // Bot: giả như thành công để bot không dò ra luật chặn
  if (
    text(formData, "website", 200) ||
    submittedTooFast(formData.get("startedAt"))
  ) {
    return { status: "success", email: values.email };
  }

  const captcha = await verifyCaptcha(
    formData.get("cf-turnstile-response"),
    ip,
  );
  if (captcha !== "ok") {
    if (captcha === "misconfigured") {
      console.error(
        "[contact] TURNSTILE_SECRET_KEY chưa cấu hình ở production",
      );
    }
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: captcha === "failed" ? "captcha" : "generic",
    };
  }

  const fieldErrors: Partial<Record<InquiryField, true>> = {};
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "email" || key === "message") {
        fieldErrors[key] = true;
      }
    }
  }

  const attachment = await checkAttachment(formData);
  if (!attachment.ok) fieldErrors.file = true;

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", values, fieldErrors };
  }

  if (!cmsEnabled()) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[contact] CMS_API_URL chưa cấu hình, không lưu được yêu cầu",
      );
      return { status: "error", values, fieldErrors: {}, formError: "generic" };
    }
    console.warn(
      "[contact] Chưa nối CMS: yêu cầu không được lưu (chỉ ở máy dev)",
    );
    return { status: "success", email: values.email };
  }

  const form = new FormData();
  const { model, ...rest } = values;
  for (const [key, value] of Object.entries(rest)) form.set(key, value);
  form.set("model", model);
  form.set("locale", await getLocale());
  if (attachment.ok && attachment.file) {
    const { name, bytes } = attachment.file;
    form.set("file", new Blob([bytes as BlobPart]), name);
  }

  try {
    await cmsPostForm<{ id: string }>("inquiries", form);
    return { status: "success", email: values.email };
  } catch (err) {
    // CMS giới hạn số yêu cầu theo email (backend/apps/inquiries/spam.py)
    if (err instanceof CmsError && err.status === 429) {
      return {
        status: "error",
        values,
        fieldErrors: {},
        formError: "rateLimited",
      };
    }
    // Chỉ ghi mã lỗi, không ghi dữ liệu khách
    console.error(
      "[contact] Gửi sang CMS lỗi",
      err instanceof CmsError ? (err.status ?? "network") : "unknown",
    );
    return { status: "error", values, fieldErrors: {}, formError: "generic" };
  }
}
