/*
 * Kiểu dữ liệu và hằng số dùng chung giữa form Liên hệ (client) và server action.
 * Không đặt trong actions.ts vì file "use server" chỉ được export hàm async.
 */

export const PURPOSES = ["quote", "oem", "visit", "other"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_EXTENSIONS = [
  ".pdf",
  ".dwg",
  ".dxf",
  ".jpg",
  ".jpeg",
  ".png",
] as const;

export type InquiryField = "name" | "email" | "message" | "file";

export type InquiryValues = {
  purpose: Purpose;
  name: string;
  email: string;
  company: string;
  country: string;
  phone: string;
  /** Mã mẫu quan tâm, không bắt buộc; điền sẵn từ ?model= khi bấm "Yêu cầu báo giá" ở trang sản phẩm */
  model: string;
  message: string;
};

export type InquiryState =
  | { status: "idle"; values?: InquiryValues }
  | {
      status: "error";
      values: InquiryValues;
      /** Khoá lỗi theo trường; client dịch sang ContactPage.form.errors.* */
      fieldErrors: Partial<Record<InquiryField, true>>;
      /** Lỗi chung của form (không gắn với trường nào) */
      formError?: "generic" | "rateLimited" | "captcha";
    }
  | { status: "success"; email: string };

export const MODEL_MAX = 200;

/**
 * Làm sạch ?model= từ URL trước khi điền vào form: chỉ giữ chữ, số, khoảng trắng và , . - _ /
 * (mã mẫu BFC dạng 2BFC2636, có thể nhiều mã cách nhau dấu phẩy). Giá trị lạ trả về "".
 */
export function sanitizeModel(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return "";
  return v
    .replace(/[^\p{L}\p{N} ,._/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MODEL_MAX);
}

export function isPurpose(value: unknown): value is Purpose {
  return typeof value === "string" && PURPOSES.includes(value as Purpose);
}

export function isAllowedFile(name: string, size: number) {
  const lower = name.toLowerCase();
  return (
    size <= MAX_FILE_BYTES && FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
  );
}
