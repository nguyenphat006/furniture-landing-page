import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { navHref, type NavKey } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchSite } from "@/lib/cms/site";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { cmsSubmenus, mockSubmenus } from "./submenus";
import type { Site } from "./types";

/*
 * Đọc thông tin chung (CHỈ phía server, gọi ở layout rồi truyền xuống qua SiteProvider).
 * Nguồn: CMS khi đặt CMS_API_URL, nếu không thì mock từ config/site.ts + messages, giữ đúng site hiện tại.
 * CMS chưa nhập menu thì dùng menu mặc định, để header không bao giờ trống.
 */

export type {
  NavEntry,
  Site,
  SocialNetwork,
  SubmenuGroup,
  Submenus,
} from "./types";

/** Logo có sẵn trong public, dùng khi CMS chưa đặt logo */
const DEFAULT_LOGO = "/bfc_logo_color.png";

/** Menu header mặc định (thứ tự chốt 2026-11-06; Liên hệ là nút Báo giá riêng) */
const DEFAULT_NAV: NavKey[] = [
  "capabilities",
  "materials",
  "products",
  "about",
];

const defaultNav = () =>
  DEFAULT_NAV.map((key) => ({ key, label: "", href: navHref[key] }));

async function mockSite(locale: string): Promise<Site> {
  const tf = await getTranslations({ locale, namespace: "Footer" });
  const tm = await getTranslations({ locale, namespace: "Metadata" });
  return {
    name: siteConfig.name,
    tagline: "Furniture Company",
    legalName: siteConfig.legalName,
    taxCode: "",
    address: tf("address"),
    phone: siteConfig.phone,
    phoneHref: siteConfig.phoneHref,
    email: siteConfig.email,
    emailHref: siteConfig.emailHref,
    whatsappUrl: siteConfig.whatsappUrl,
    zaloUrl: siteConfig.zaloUrl,
    hours: siteConfig.hours
      ? siteConfig.hours[locale === "en" ? "en" : "vi"]
      : null,
    mapsUrl: siteConfig.mapsUrl,
    mapsEmbedUrl: siteConfig.mapsEmbedUrl,
    social: [],
    logo: DEFAULT_LOGO,
    logoOnDark: DEFAULT_LOGO,
    favicon: null,
    ogImage: null,
    nav: defaultNav(),
    submenus: await mockSubmenus(locale),
    taxonomy: await getTaxonomy(locale),
    footer: {
      blurb: tf("blurb"),
      // Chính sách bảo mật / Điều khoản luôn có sẵn ở footer (site-footer.tsx); đây là link thêm từ CMS
      links: [],
    },
    seo: { title: tm("title"), description: tm("description") },
  };
}

export const getSite = cache(async (locale: string): Promise<Site> => {
  if (!cmsEnabled()) return mockSite(locale);
  const [site, submenus, taxonomy] = await Promise.all([
    fetchSite(locale, { logo: DEFAULT_LOGO }),
    cmsSubmenus(locale),
    getTaxonomy(locale),
  ]);
  return {
    ...site,
    taxonomy,
    nav: site.nav.length ? site.nav : defaultNav(),
    submenus: submenus ?? (await mockSubmenus(locale)),
  };
});
