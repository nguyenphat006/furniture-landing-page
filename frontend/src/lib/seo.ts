import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { routing } from "@/i18n/routing";

/*
 * SEO dùng chung (2026-11-07): địa chỉ gốc, URL theo ngôn ngữ, canonical + hreflang.
 * Mỗi trang gọi `pageAlternates(path, locale)` trong generateMetadata; tiếng Việt không có tiền tố
 * (/materials), tiếng Anh có /en (/en/materials), giống cấu hình localePrefix "as-needed".
 */

/** Địa chỉ gốc của site thật (SITE_URL, mặc định theo config/site.ts) */
export function siteUrl(): URL {
  return new URL(process.env.SITE_URL?.trim() || siteConfig.url);
}

/** Đường dẫn của `path` ở ngôn ngữ `locale`, vd ("/materials", "en") → "/en/materials" */
export function localePath(path: string, locale: string): string {
  const clean = path === "/" ? "" : path;
  if (locale === routing.defaultLocale) return clean || "/";
  return `/${locale}${clean}`;
}

/** canonical của trang đang xem + hreflang vi / en / x-default */
export function pageAlternates(
  path: string,
  locale: string,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localePath(path, locale),
    languages: {
      ...Object.fromEntries(
        routing.locales.map((l) => [l, localePath(path, l)]),
      ),
      "x-default": localePath(path, routing.defaultLocale),
    },
  };
}

/** Chữ thuần từ HTML (mô tả rich text), cắt gọn cho thẻ meta description */
export function metaText(html: string, max = 160): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

/** SEO riêng nhập trong CMS; chuỗi rỗng = dùng giá trị tự tạo */
export type PageSeo = { title: string; description: string; noindex: boolean };

/** Ghép SEO riêng (nếu có) với giá trị tự tạo từ nội dung */
export function withSeo(
  auto: { title: string; description: string },
  seo: PageSeo | undefined,
): Pick<Metadata, "title" | "description" | "robots"> {
  return {
    title: seo?.title || auto.title,
    description: seo?.description || auto.description,
    ...(seo?.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
