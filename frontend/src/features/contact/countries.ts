/*
 * Danh sách quốc gia cho ô Quốc gia của form Liên hệ (2026-11-06): mã ISO 3166-1 alpha-2.
 * Tên nước không lưu ở đây mà dịch theo ngôn ngữ trang bằng Intl.DisplayNames (countryOptions).
 * Server chỉ nhận mã có trong danh sách (isCountryCode).
 * Nhóm "Thị trường chính" đứng đầu, khớp bản đồ xuất khẩu trang chủ (export-markets.ts).
 */

export const MAIN_MARKETS = [
  "US",
  "AU",
  "GB",
  "ES",
  "NL",
  "CN",
  "JP",
  "KR",
] as const;

// prettier-ignore
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export function isCountryCode(value: unknown): value is CountryCode {
  return (
    typeof value === "string" &&
    (COUNTRY_CODES as readonly string[]).includes(value)
  );
}

type Option = { code: string; name: string };
export type CountryOptions = { main: Option[]; rest: Option[] };

/** Tên nước theo ngôn ngữ, chia nhóm: thị trường chính (giữ thứ tự) và còn lại (xếp A-Z theo ngôn ngữ) */
export function countryOptions(locale: string): CountryOptions {
  const dn = new Intl.DisplayNames([locale], { type: "region" });
  const name = (code: string) => dn.of(code) ?? code;
  const main = MAIN_MARKETS.map((code) => ({ code, name: name(code) }));
  const mainSet = new Set<string>(MAIN_MARKETS);
  const rest = COUNTRY_CODES.filter((c) => !mainSet.has(c))
    .map((code) => ({ code, name: name(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return { main, rest };
}
