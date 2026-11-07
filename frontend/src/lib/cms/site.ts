import "server-only";
import { navHref, navKeys, type NavKey } from "@/config/navigation";
import type { NavEntry, Site, SocialNetwork } from "@/data/site/types";
import { cmsGet, CmsError } from "./client";
import type { components } from "./schema";

/*
 * Thông tin chung từ CMS (GET /site), đổi sang kiểu Site của UI. Mục menu trỏ tới trang frontend chưa
 * có (target lạ) bị bỏ qua. Ảnh chưa đặt thì dùng `defaults` (logo có sẵn trong public).
 */

type ApiSite = components["schemas"]["Site"];

const isNavKey = (s: string): s is NavKey =>
  (navKeys as readonly string[]).includes(s);

function navEntry(item: ApiSite["nav"][number]): NavEntry | null {
  if (item.target === "link") {
    return item.url ? { key: null, label: item.label, href: item.url } : null;
  }
  if (!isNavKey(item.target)) return null;
  return { key: item.target, label: item.label, href: navHref[item.target] };
}

export async function fetchSite(
  locale: string,
  defaults: Pick<Site, "logo">,
): Promise<Omit<Site, "submenus" | "taxonomy">> {
  const s = await cmsGet<ApiSite>("site", { locale });
  if (!s) throw new CmsError("CMS không trả thông tin chung (/site)");
  const { company, contact, branding } = s;
  return {
    name: company.name,
    tagline: company.tagline,
    legalName: company.legal_name,
    taxCode: company.tax_code,
    address: company.address,
    phone: contact.phone,
    phoneHref: contact.phone_href,
    email: contact.email,
    emailHref: contact.email ? `mailto:${contact.email}` : "",
    whatsappUrl: contact.whatsapp_url || null,
    zaloUrl: contact.zalo_url || null,
    hours: contact.hours || null,
    mapsUrl: contact.maps_url,
    mapsEmbedUrl: contact.maps_embed_url,
    social: s.social.map((l) => ({
      network: l.network as SocialNetwork,
      url: l.url,
    })),
    logo: branding.logo ?? defaults.logo,
    logoOnDark: branding.logo_on_dark ?? defaults.logo,
    favicon: branding.favicon,
    ogImage: branding.og_image,
    nav: s.nav.map(navEntry).filter((n): n is NavEntry => n !== null),
    footer: {
      blurb: s.footer.blurb,
      links: s.footer.links.map((l) => ({ label: l.label, href: l.url })),
    },
    seo: s.seo,
  };
}
