import { routing, type Locale } from "@/i18n/routing";

/*
 * Ngôn ngữ trong nút đổi ngôn ngữ (2026-11-10). CMS quản lý thứ tự, cờ, tên, ẩn/hiện
 * (Cài đặt → Thông tin chung → Ngôn ngữ); đây là mặc định khi chưa có CMS.
 * Thêm ngôn ngữ: thêm mã vào i18n/routing.ts + messages/<mã>.json + một dòng ở dưới, rồi thêm mã
 * vào CMS_LANGUAGES của backend.
 */

/** Cờ có SVG (components/shared/flag-icon.tsx), trùng danh sách FLAGS ở backend sitesettings */
export const flagCodes = [
  "VN",
  "GB",
  "US",
  "AU",
  "CA",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "BE",
  "PT",
  "BR",
  "MX",
  "SE",
  "DK",
  "NO",
  "FI",
  "PL",
  "RU",
  "TR",
  "SA",
  "AE",
  "IN",
  "CN",
  "TW",
  "JP",
  "KR",
  "TH",
  "ID",
  "MY",
] as const;

export type FlagCode = (typeof flagCodes)[number];

export const isFlagCode = (s: string): s is FlagCode =>
  (flagCodes as readonly string[]).includes(s);

export type SiteLanguage = {
  code: Locale;
  /** Tên gốc của ngôn ngữ, vd English, Deutsch */
  label: string;
  flag: FlagCode | null;
};

const defaults: Record<Locale, Omit<SiteLanguage, "code">> = {
  vi: { label: "Tiếng Việt", flag: "VN" },
  en: { label: "English", flag: "GB" },
};

export const defaultLanguages = (): SiteLanguage[] =>
  routing.locales.map((code) => ({ code, ...defaults[code] }));
