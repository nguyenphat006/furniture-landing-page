import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { getSite } from "@/data/site";
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

/** og:locale theo ngôn ngữ trang */
const OG_LOCALE: Record<string, string> = { vi: "vi_VN", en: "en_US" };

/** Ảnh chia sẻ khi cả trang lẫn Cài đặt CMS đều chưa có ảnh (public/og-default.jpg, 1200×630) */
export const DEFAULT_OG_IMAGE = "/og-default.jpg";

/** URL ảnh dùng được: URL CMS hoặc đường dẫn trong public; tên file ảnh còn thiếu thì bỏ */
function usableImage(url: string | null | undefined): url is string {
  return Boolean(url) && /^(https?:\/\/|\/)/.test(url as string);
}

/**
 * canonical + hreflang + Open Graph của trang (QC 07/11). Mỗi trang gọi trong generateMetadata.
 * openGraph của trang thay hẳn của layout (Next không gộp sâu), nên ghi đủ: tên site, og:url,
 * og:locale, ảnh. Ảnh: ảnh riêng của trang (sản phẩm, vật liệu, ảnh bìa nhóm, ảnh nhập ở CMS),
 * rồi ảnh mặc định ở Cài đặt CMS, rồi ảnh tĩnh của site.
 */
export async function pageLinks(
  path: string,
  locale: string,
  image?: string | null,
): Promise<Pick<Metadata, "alternates" | "openGraph">> {
  const site = await getSite(locale);
  const own = usableImage(image) ? image : null;
  const fallback = usableImage(site.ogImage) ? site.ogImage : DEFAULT_OG_IMAGE;
  return {
    alternates: pageAlternates(path, locale),
    openGraph: {
      type: "website",
      siteName: site.name,
      url: localePath(path, locale),
      locale: OG_LOCALE[locale] ?? locale,
      alternateLocale: routing.locales
        .filter((l) => l !== locale)
        .map((l) => OG_LOCALE[l] ?? l),
      images: own
        ? [{ url: own }]
        : [{ url: fallback, width: 1200, height: 630 }],
    },
  };
}
