import "server-only";
import type { LegalKey } from "@/config/navigation";
import type {
  ContentPage,
  LegalPage,
  LegalSection,
  PageBlock,
} from "@/data/pages/types";
import { codedSections, type CodedSection } from "@/features/home/page-content";
import { routing } from "@/i18n/routing";
import { localePath } from "@/lib/seo";
import { cmsGet } from "./client";
import { previewContent } from "./preview";
import type { components } from "./schema";

/*
 * Trang nội dung từ CMS (GET /pages/<key>), đổi sang kiểu ContentPage của UI.
 * Section có sẵn mà frontend không biết (CMS mới hơn frontend) bị bỏ qua.
 */

type Schemas = components["schemas"];
type ApiBlock = Schemas["PageBlock"];

const isCoded = (s: string): s is CodedSection =>
  (codedSections as readonly string[]).includes(s);

function block(b: ApiBlock): PageBlock | null {
  switch (b.type) {
    case "hero":
      return {
        id: b.id,
        type: "hero",
        value: {
          slides: b.value.slides.map((s) => s.url),
          title: b.value.title,
          lede: b.value.lede,
          buttonLabel: b.value.button_label,
        },
      };
    case "intro":
      return {
        id: b.id,
        type: "intro",
        value: {
          heading: b.value.heading,
          quote: b.value.quote,
          body: b.value.body,
          buttonLabel: b.value.button_label,
        },
      };
    case "export":
      return {
        id: b.id,
        type: "export",
        value: {
          kicker: b.value.kicker,
          title: b.value.title,
          markets: b.value.markets.map((m) => ({
            code: m.code,
            label: m.label ? [m.label[0], m.label[1]] : null,
            side: m.side,
          })),
          stats: b.value.stats.map((s) => ({ value: s.value, label: s.label })),
        },
      };
    case "factory":
      return {
        id: b.id,
        type: "factory",
        value: {
          kicker: b.value.kicker,
          title: b.value.title,
          lede: b.value.lede,
          image: b.value.image?.url ?? null,
          detailImage: b.value.detail_image?.url ?? null,
          points: [...b.value.points],
          buttonLabel: b.value.button_label,
        },
      };
    case "cta":
      return {
        id: b.id,
        type: "cta",
        value: {
          kicker: b.value.kicker,
          title: b.value.title,
          image: b.value.image?.url ?? null,
          quoteLabel: b.value.quote_label,
          visitLabel: b.value.visit_label,
        },
      };
    case "section":
      return isCoded(b.value.section)
        ? { id: b.id, type: "section", value: { section: b.value.section } }
        : null;
    default:
      return null;
  }
}

export async function fetchPage(
  key: "home",
  locale: string,
): Promise<ContentPage | null> {
  const page = await getContentPage(key, locale);
  if (!page) return null;
  return {
    title: page.title,
    isFallback: page.is_fallback,
    seo: seoOf(page),
    blocks: page.body.map(block).filter((b): b is PageBlock => b !== null),
  };
}

/** Trang đã xuất bản, hoặc bản nháp khi admin đang xem trước đúng trang này */
async function getContentPage(
  key: string,
  locale: string,
): Promise<Schemas["ContentPage"] | null> {
  return (
    (await previewContent<Schemas["ContentPage"]>("page", key, locale)) ??
    cmsGet<Schemas["ContentPage"]>(`pages/${key}`, { locale })
  );
}

function seoOf(page: Schemas["ContentPage"]): ContentPage["seo"] {
  return {
    title: page.seo.title,
    description: page.seo.description,
    noindex: page.seo.noindex,
    ogImage: page.seo.og_image,
  };
}

/** Chữ thuần từ rich text (mô tả SEO): bỏ thẻ, giải vài thực thể HTML hay gặp */
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Link trong rich text: đường dẫn nội bộ admin tự gõ (vd "/privacy") thêm tiền tố ngôn ngữ đang xem
 * (link chọn trang trong CMS đã có sẵn tiền tố); link ra ngoài mở tab mới.
 */
export function localizeLinks(html: string, locale: string): string {
  return html.replace(/<a href="([^"]*)"/g, (tag, href: string) => {
    if (/^https?:\/\//i.test(href))
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"`;
    const prefixed = routing.locales.some(
      (l) => href === `/${l}` || href.startsWith(`/${l}/`),
    );
    if (href.startsWith("/") && !href.startsWith("//") && !prefixed)
      return `<a href="${localePath(href, locale)}"`;
    return tag;
  });
}

/** Trang pháp lý (Chính sách bảo mật, Điều khoản): các mục tiêu đề + rich text */
export async function fetchLegalPage(
  key: LegalKey,
  locale: string,
): Promise<LegalPage | null> {
  const page = await getContentPage(key, locale);
  if (!page) return null;
  return {
    title: page.title,
    isFallback: page.is_fallback,
    updatedOn: page.updated_on,
    seo: seoOf(page),
    sections: page.body.flatMap((b): LegalSection[] =>
      b.type === "legal"
        ? [
            {
              id: b.id,
              heading: b.value.heading,
              html: localizeLinks(b.value.body, locale),
              text: plain(b.value.body),
            },
          ]
        : [],
    ),
  };
}
