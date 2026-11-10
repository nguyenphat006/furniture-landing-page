import "server-only";
import { hasLocale } from "next-intl";
import {
  defaultLanguages,
  isFlagCode,
  type SiteLanguage,
} from "@/config/languages";
import { navHref, navKeys, type NavKey } from "@/config/navigation";
import { routing } from "@/i18n/routing";
import { isActionIcon } from "@/config/action-icons";
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

/**
 * Link do quản trị viên nhập: https://, tel:, mailto: hoặc đường dẫn trong web. Lớp thứ hai sau
 * kiểm tra ở CMS (sitesettings/models.py): bản ghi lưu trước khi CMS chặn /\host vẫn có thể còn
 * (QC 09/11). Trình duyệt hiểu /\host và //host là link sang web khác nên bỏ.
 */
export function safeLink(url: string): boolean {
  if (/^(https?:\/\/|tel:|mailto:)/i.test(url)) return true;
  return (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    !/[\s\u0000-\u001f\u007f]/.test(url)
  );
}

function navEntry(item: ApiSite["nav"][number]): NavEntry | null {
  if (item.target === "link") {
    return item.url ? { key: null, label: item.label, href: item.url } : null;
  }
  if (!isNavKey(item.target)) return null;
  return { key: item.target, label: item.label, href: navHref[item.target] };
}

/** Ngôn ngữ CMS bật mà web chưa có (chưa thêm vào routing) thì bỏ; không còn gì thì dùng mặc định */
function languages(items: ApiSite["languages"] | undefined): SiteLanguage[] {
  // CMS bản cũ (chưa có languages) hoặc cache cũ: dùng mặc định
  const list = (items ?? []).flatMap((l) =>
    hasLocale(routing.locales, l.code)
      ? [
          {
            code: l.code,
            label: l.label,
            flag: isFlagCode(l.flag) ? l.flag : null,
          },
        ]
      : [],
  );
  return list.length ? list : defaultLanguages();
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
      links: s.footer.links
        .filter((l) => safeLink(l.url))
        .map((l) => ({ label: l.label, href: l.url })),
    },
    seo: s.seo,
    gaMeasurementId: s.analytics.ga_measurement_id || null,
    // Tìm kiếm, Báo giá không có link (web tự xử lý)
    // Ẩn / hiện theo ô Hiện trong CMS; link không an toàn coi như chưa có link (nút không bấm được)
    floating: s.floating.map((f) => ({
      kind: f.kind,
      label: f.label,
      href: f.url && safeLink(f.url) ? f.url : "",
      icon: f.icon && isActionIcon(f.icon) ? f.icon : "",
    })),
    languages: languages(s.languages),
    verification: {
      google: s.analytics.google_site_verification,
      bing: s.analytics.bing_site_verification,
    },
  };
}
