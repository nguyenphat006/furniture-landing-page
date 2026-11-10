"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, Paperclip, X } from "lucide-react";
import { legalHref } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { submitInquiry } from "../actions";
import type { CountryOptions } from "../countries";
import {
  FILE_EXTENSIONS,
  MODEL_MAX,
  PURPOSES,
  isAllowedFile,
  isPurpose,
  type InquiryState,
  type Purpose,
} from "../inquiry";
import { Turnstile } from "./turnstile";

/*
 * Form Liên hệ (2026-11-05). useActionState + server action submitInquiry (chưa gửi thật, xem actions.ts).
 * - Mục đích dạng radio pill; mặc định lấy từ ?purpose= (vd nút "Đặt lịch thăm nhà máy").
 * - Lỗi trả về theo trường, giữ lại giá trị đã nhập (defaultValue = values từ server).
 *   Tệp đính kèm không giữ được sau khi lỗi (giới hạn của input file), người dùng chọn lại.
 * - Bảo mật: honeypot, startedAt (bẫy gửi quá nhanh), captcha Turnstile; kiểm tra thật nằm ở server (actions.ts, security.ts).
 * - Thành công: thay form bằng khung xác nhận, nút "Gửi yêu cầu khác" dựng lại form mới (đổi key).
 * - (2026-11-06) Thêm ô Mã mẫu (không bắt buộc), điền sẵn từ ?model= khi bấm "Yêu cầu báo giá" ở trang sản phẩm.
 *   Bố cục trộn: từ sm các cặp ô ngắn đi 2 cột (Họ tên | Email, Công ty | Quốc gia, Điện thoại | Mã mẫu),
 *   Mục đích, Nội dung, Đính kèm đi 1 cột full.
 * - (2026-11-06) Quốc gia là danh sách chọn (select gốc, gõ chữ để nhảy): mã ISO, tên dịch theo ngôn ngữ trang
 *   (countries.ts), nhóm "Thị trường chính" đứng đầu. Danh sách dựng ở server (ContactSection) rồi truyền xuống
 *   để tên nước khớp nhau khi hydrate (ICU của Node và trình duyệt có thể dịch khác).
 */

export function ContactForm({
  defaultPurpose,
  defaultModel = "",
  countries,
}: {
  defaultPurpose: Purpose;
  defaultModel?: string;
  countries: CountryOptions;
}) {
  const [round, setRound] = useState(0);
  return (
    <InquiryForm
      key={round}
      defaultPurpose={defaultPurpose}
      defaultModel={defaultModel}
      countries={countries}
      onReset={() => setRound((r) => r + 1)}
    />
  );
}

const initialState: InquiryState = { status: "idle" };

/** Server action ném lỗi thay vì trả state (body quá lớn, mất mạng): giữ chữ đã nhập, báo lỗi chung */
async function submitSafely(
  prev: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  try {
    return await submitInquiry(prev, formData);
  } catch {
    const s = (key: string) => {
      const v = formData.get(key);
      return typeof v === "string" ? v : "";
    };
    const purpose = formData.get("purpose");
    return {
      status: "error",
      values: {
        purpose: isPurpose(purpose) ? purpose : "quote",
        name: s("name"),
        email: s("email"),
        company: s("company"),
        country: s("country"),
        phone: s("phone"),
        model: s("model"),
        message: s("message"),
      },
      fieldErrors: {},
      formError: "generic",
    };
  }
}

function InquiryForm({
  defaultPurpose,
  defaultModel,
  countries,
  onReset,
}: {
  defaultPurpose: Purpose;
  defaultModel: string;
  countries: CountryOptions;
  onReset: () => void;
}) {
  const t = useTranslations("ContactPage.form");
  const [state, formAction, pending] = useActionState(
    submitSafely,
    initialState,
  );
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (startedRef.current) startedRef.current.value = String(Date.now());
  }, []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);

  if (state.status === "success") {
    return (
      <div role="status" className="py-10 text-center sm:py-16">
        <span className="bg-forest mx-auto flex size-14 items-center justify-center rounded-full text-white">
          <Check aria-hidden="true" strokeWidth={2.5} className="size-6" />
        </span>
        <h3 className="text-h3 text-ink mt-6 font-bold">
          {t("success.title")}
        </h3>
        <p className="text-ink-soft mx-auto mt-3 max-w-[40ch] leading-relaxed">
          {t("success.body", { email: state.email })}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="text-ink hover:text-forest mt-8 text-[13px] font-medium tracking-[.08em] uppercase underline-offset-4 hover:underline"
        >
          {t("success.again")}
        </button>
      </div>
    );
  }

  const values = state.values;
  const errors = state.status === "error" ? state.fieldErrors : {};
  const purpose = values?.purpose ?? defaultPurpose;
  const showFileError = fileError || Boolean(errors.file);

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setFileName(null);
    setFileError(false);
  }

  return (
    <form action={formAction} noValidate className="grid gap-7">
      <fieldset>
        <legend className="text-ink mb-3 text-sm font-medium">
          {t("purposeLabel")}
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {PURPOSES.map((p) => (
            <label key={p} className="cursor-pointer">
              <input
                type="radio"
                name="purpose"
                value={p}
                defaultChecked={p === purpose}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "border-line text-ink-soft inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors",
                  "hover:border-ink hover:text-ink",
                  "peer-checked:border-forest peer-checked:bg-forest peer-checked:text-white",
                  "peer-focus-visible:ring-forest/40 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2",
                )}
              >
                {t(`purposes.${p}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
        <Field
          label={t("fields.name")}
          required={t("required")}
          error={errors.name ? t("errors.name") : undefined}
        >
          {(p) => (
            <input
              {...p}
              name="name"
              autoComplete="name"
              defaultValue={values?.name}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          label={t("fields.email")}
          required={t("required")}
          error={errors.email ? t("errors.email") : undefined}
        >
          {(p) => (
            <input
              {...p}
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={values?.email}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t("fields.company")}>
          {(p) => (
            <input
              {...p}
              name="company"
              autoComplete="organization"
              defaultValue={values?.company}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t("fields.country")}>
          {(p) => (
            <div className="relative">
              <select
                // key: React không cập nhật defaultValue của select sau lần đầu, form báo lỗi xong mất quốc gia.
                // Đặt trước {...p}: key đứng sau spread làm JSX dịch sang createElement, React 19 bản dev
                // coi các <option> viết tay là danh sách thiếu key và báo lỗi console
                key={values?.country ?? ""}
                {...p}
                name="country"
                autoComplete="country"
                defaultValue={values?.country ?? ""}
                className={cn(
                  inputClass,
                  "cursor-pointer appearance-none pr-11",
                )}
              >
                <option value="">{t("countryPlaceholder")}</option>
                <optgroup label={t("countryMain")}>
                  {countries.main.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t("countryAll")}>
                  {countries.rest.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown
                aria-hidden="true"
                strokeWidth={1.75}
                className="text-ink-mute pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
              />
            </div>
          )}
        </Field>
        <Field label={t("fields.phone")}>
          {(p) => (
            <input
              {...p}
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={values?.phone}
              className={inputClass}
            />
          )}
        </Field>
        <Field label={t("fields.model")}>
          {(p) => (
            <input
              {...p}
              name="model"
              autoComplete="off"
              maxLength={MODEL_MAX}
              placeholder={t("modelPlaceholder")}
              defaultValue={values?.model ?? defaultModel}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          className="sm:col-span-2"
          label={t("fields.message")}
          required={t("required")}
          error={errors.message ? t("errors.message") : undefined}
        >
          {(p) => (
            <textarea
              {...p}
              name="message"
              rows={5}
              placeholder={t("messagePlaceholder")}
              defaultValue={values?.message}
              className={cn(inputClass, "h-auto resize-y py-3")}
            />
          )}
        </Field>
      </div>

      {/* Đính kèm bản vẽ */}
      <div>
        <label
          className={cn(
            "group/file flex cursor-pointer items-center gap-4 rounded-[2px] border border-dashed px-5 py-4 transition-colors",
            showFileError
              ? "border-red-700"
              : "border-ink/25 hover:border-forest has-[:focus-visible]:border-forest",
          )}
        >
          <span className="bg-surface-stone text-forest flex size-10 shrink-0 items-center justify-center rounded-full">
            <Paperclip aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-sm font-medium">
              {fileName ?? t("attach")}
            </span>
            <span className="text-ink-mute block text-xs">
              {t("attachHint")}
            </span>
          </span>
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept={FILE_EXTENSIONS.join(",")}
            className="sr-only"
            aria-invalid={showFileError || undefined}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return clearFile();
              if (!isAllowedFile(f.name, f.size)) {
                e.currentTarget.value = "";
                setFileName(null);
                setFileError(true);
                return;
              }
              setFileError(false);
              setFileName(f.name);
            }}
          />
        </label>
        {fileName ? (
          <button
            type="button"
            onClick={clearFile}
            className="text-ink-mute hover:text-ink mt-2 inline-flex items-center gap-1.5 text-xs"
          >
            <X aria-hidden="true" className="size-3.5" />
            {t("attachRemove")}
          </button>
        ) : null}
        {showFileError ? (
          <p role="alert" className="mt-1.5 text-sm text-red-700">
            {t("errors.file")}
          </p>
        ) : null}
      </div>

      {/* Honeypot chống spam: người dùng không thấy */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {/* Thời điểm mở form (điền ở client); gửi quá nhanh bị coi là bot */}
      <input ref={startedRef} type="hidden" name="startedAt" />

      {/* Captcha Cloudflare Turnstile (ẩn khi chưa cấu hình khoá) */}
      <Turnstile language={locale} resetKey={state} />

      {state.status === "error" && state.formError ? (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${state.formError}`)}
        </p>
      ) : null}

      <div className="border-line flex flex-col-reverse gap-5 border-t pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-mute max-w-[36ch] text-xs leading-relaxed">
          {t.rich("privacy", {
            link: (chunks) => (
              <Link
                href={legalHref.privacy}
                className="hover:text-forest underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="bg-forest hover:bg-ink group/btn ease-out-soft inline-flex h-12 items-center justify-center gap-3 px-8 text-[13px] font-semibold tracking-[.14em] text-white uppercase transition-colors duration-(--duration-base) disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? t("sending") : t("submit")}
          <ArrowRight
            aria-hidden="true"
            strokeWidth={2.5}
            className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-hover/btn:translate-x-1"
          />
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "border-line text-ink placeholder:text-ink-mute focus:border-forest focus:ring-forest/15 h-12 w-full rounded-[2px] border bg-white px-4 transition-colors outline-none focus:ring-2 aria-[invalid=true]:border-red-700";

type ControlProps = {
  id: string;
  required?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  /** Chữ "bắt buộc" cho trình đọc màn hình; có giá trị nghĩa là trường bắt buộc */
  required?: string;
  error?: string;
  className?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-ink mb-2 block text-sm font-medium">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-gold-ink ml-0.5">
              *
            </span>
            <span className="sr-only"> ({required})</span>
          </>
        ) : null}
      </label>
      {children({
        id,
        required: Boolean(required),
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
