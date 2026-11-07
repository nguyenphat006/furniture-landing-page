import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, draftMode } from "next/headers";
import { cmsEnabled, cmsGetSigned, cmsSharedSecret } from "./client";
import type { components } from "./schema";

/*
 * Xem trước bản nháp (docs/adr/0014 bên backend). Admin bấm Xem trước → CMS lưu bản đang sửa,
 * chuyển tới /api/draft?token&path&ts&sig (chữ ký HMAC bằng CMS_SHARED_SECRET) → route bật draft
 * mode, lưu token vào cookie PREVIEW_COOKIE rồi mở path. Khi draft mode bật, trang đọc bản nháp
 * qua GET /pages/preview/<token> (request ký, không cache) và dùng nó thay bản đã xuất bản nếu
 * đúng loại / khoá / ngôn ngữ đang xem. Khách không có cookie nên luôn thấy bản đã xuất bản.
 */

type Schemas = components["schemas"];
export type CmsPreview = Schemas["Preview"];

export const PREVIEW_COOKIE = "bfc_preview";
/** Link xem trước CMS tạo ra chỉ dùng được trong 5 phút */
const LINK_MAX_AGE_SECONDS = 300;

/** Kiểm chữ ký link xem trước: hex(HMAC(secret, "<ts>.<token>.<path>")), khớp apps/pages/preview.py */
export function validPreviewLink(
  token: string,
  path: string,
  timestamp: string,
  signature: string,
): boolean {
  const secret = cmsSharedSecret();
  if (!secret || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > LINK_MAX_AGE_SECONDS)
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${token}.${path}`)
    .digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Chỉ cho mở đường dẫn trong site (chống open redirect) */
export function safePreviewPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

/** Bản nháp của request này (một lần gọi CMS mỗi request), null khi không ở chế độ xem trước */
export const getPreview = cache(async (): Promise<CmsPreview | null> => {
  if (!cmsEnabled()) return null;
  if (!(await draftMode()).isEnabled) return null;
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (!token) return null;
  try {
    return await cmsGetSigned<CmsPreview>(
      `pages/preview/${encodeURIComponent(token)}`,
    );
  } catch (err) {
    console.error("[cms] không đọc được bản xem trước", err);
    return null;
  }
});

/** Nội dung bản nháp nếu đang xem trước đúng nội dung này, ngược lại null */
export async function previewContent<T>(
  kind: CmsPreview["kind"],
  key: string,
  locale: string,
): Promise<T | null> {
  const preview = await getPreview();
  if (!preview || preview.kind !== kind) return null;
  if (preview.key !== key || preview.locale !== locale) return null;
  return preview.content as T;
}
