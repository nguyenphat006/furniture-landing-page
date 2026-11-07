import type { Site } from "@/data/site/types";
import { localePath, siteUrl } from "@/lib/seo";

/*
 * Dữ liệu có cấu trúc schema.org (2026-11-07) cho trang chủ: Organization + WebSite, lấy từ Cài đặt →
 * Thông tin chung (tên, tên pháp lý, địa chỉ, điện thoại, email, mã số thuế, logo, mạng xã hội). Giúp
 * Google hiện đúng tên, logo, liên hệ của BFC. Trường trống thì bỏ, không tự đặt giá trị.
 * Kiểm tra: https://search.google.com/test/rich-results
 */

type Json = Record<string, unknown>;

/** Bỏ trường rỗng (chuỗi trống, mảng trống, undefined) */
function compact(obj: Json): Json {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    ),
  );
}

export function organizationJsonLd(site: Site, locale: string): Json {
  const base = siteUrl();
  const origin = base.origin;
  const orgId = `${origin}/#organization`;
  const organization = compact({
    "@type": "Organization",
    "@id": orgId,
    name: site.name,
    legalName: site.legalName,
    url: `${origin}/`,
    logo: site.logo ? new URL(site.logo, base).toString() : undefined,
    description: site.seo.description || site.footer.blurb,
    email: site.email,
    telephone: site.phoneHref.replace(/^tel:/, ""),
    taxID: site.taxCode,
    address: site.address
      ? {
          "@type": "PostalAddress",
          streetAddress: site.address,
          addressCountry: "VN",
        }
      : undefined,
    sameAs: site.social.map((s) => s.url),
  });
  const website = compact({
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: site.name,
    url: new URL(localePath("/", locale), base).toString(),
    inLanguage: locale,
    publisher: { "@id": orgId },
  });
  return {
    "@context": "https://schema.org",
    "@graph": [organization, website],
  };
}

export function OrganizationJsonLd({
  site,
  locale,
}: {
  site: Site;
  locale: string;
}) {
  return (
    <script
      type="application/ld+json"
      // Chặn chèn thẻ HTML qua dữ liệu (khuyến nghị của Next): đổi "<" thành <
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(organizationJsonLd(site, locale)).replace(
          /</g,
          "\\u003c",
        ),
      }}
    />
  );
}
