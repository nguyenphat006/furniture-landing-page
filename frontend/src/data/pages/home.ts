import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import {
  codedSections,
  ctaImage,
  factoryImages,
  factoryPoints,
  heroSlides,
  homeLayout,
  type CodedSection,
} from "@/features/home/page-content";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchPage } from "@/lib/cms/pages";
import { DEFAULT_MARKETS } from "@/features/home/export-markets";
import type { ContentPage, PageBlock } from "./types";

/*
 * Trang chủ (CHỈ phía server). Nguồn: CMS (Trang → Trang chủ) khi đặt CMS_API_URL; CMS chưa có trang
 * (chưa chạy import_pages) hoặc tắt CMS thì dùng mock dựng từ messages, đúng như trang trước khi nối CMS.
 */

const isCoded = (s: string): s is CodedSection =>
  (codedSections as readonly string[]).includes(s);

async function mockHome(locale: string): Promise<ContentPage> {
  const t = await getTranslations({ locale, namespace: "HomePage" });
  const blocks = homeLayout.map((type): PageBlock => {
    const id = `mock-${type}`;
    if (type === "hero")
      return {
        id,
        type,
        value: {
          slides: heroSlides,
          // <br></br> trong messages là chỗ ngắt dòng ở màn hình lớn
          title: (t.raw("hero.title") as string).replace(
            /\s*<br><\/br>\s*/g,
            "\n",
          ),
          lede: t("hero.lede"),
          buttonLabel: "",
        },
      };
    if (type === "intro")
      return {
        id,
        type,
        value: {
          heading: t("intro.title"),
          quote: t("intro.quote"),
          body: t("intro.body"),
          buttonLabel: "",
        },
      };
    if (type === "export")
      return {
        id,
        type,
        value: {
          kicker: t("export.kicker"),
          title: t("export.title"),
          markets: DEFAULT_MARKETS,
          stats: t.raw("export.stats") as { value: string; label: string }[],
        },
      };
    if (type === "factory")
      return {
        id,
        type,
        value: {
          kicker: t("factory.eyebrow"),
          title: t("factory.title"),
          lede: t("factory.lede"),
          image: factoryImages.image,
          detailImage: factoryImages.detail,
          points: factoryPoints.map((k) => t(`factory.chips.${k}`)),
          buttonLabel: "",
        },
      };
    if (type === "cta")
      return {
        id,
        type,
        value: {
          kicker: t("cta.kicker"),
          title: t("cta.title"),
          image: ctaImage,
          quoteLabel: "",
          visitLabel: "",
        },
      };
    if (isCoded(type)) return { id, type: "section", value: { section: type } };
    throw new Error(`Section lạ: ${type satisfies never}`);
  });
  return {
    title: "",
    isFallback: false,
    seo: { title: "", description: "", noindex: false, ogImage: null },
    blocks,
  };
}

export const getHomePage = cache(
  async (locale: string): Promise<ContentPage> =>
    (cmsEnabled() ? await fetchPage("home", locale) : null) ?? mockHome(locale),
);
