import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { getMaterialCard, materialCards } from "@/features/materials/data";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchMaterial, fetchMaterials } from "@/lib/cms/materials";
import { materialSlugs, type MaterialSlug } from "./taxonomy";
import type { MaterialPage, MaterialSummary } from "./types";

/*
 * Đọc vật liệu (CHỈ phía server). Nguồn: CMS khi đặt CMS_API_URL, nếu không thì mock:
 * chữ ở messages/*.json (MaterialsPage.items, MaterialDetail.items), ảnh ở features/materials/data.ts.
 * Thứ tự: CMS theo thứ tự trong admin, mock theo materialSlugs. Có CMS thì danh sách vật liệu cũng
 * theo CMS (thêm vật liệu trong admin là có trang); vật liệu mới chưa có ảnh mock thì khung trống.
 */

const placeholder = (slug: MaterialSlug) => {
  const card = getMaterialCard(slug);
  return {
    img: card?.img ?? "",
    detail: card?.detail ?? "",
    use: card?.use ?? "",
    craft: card?.craft ?? "",
  };
};

async function mockMaterial(
  slug: MaterialSlug,
  locale: string,
): Promise<MaterialPage> {
  const tn = await getTranslations({ locale, namespace: "MaterialsPage" });
  const t = await getTranslations({ locale, namespace: "MaterialDetail" });
  const files = placeholder(slug);
  const paras = (key: "properties" | "craft" | "care") =>
    t.raw(`items.${slug}.${key}`) as string[];
  return {
    slug,
    name: tn(`items.${slug}.name`),
    lede: t(`items.${slug}.lede`),
    image: files.img,
    properties: paras("properties"),
    craft: paras("craft"),
    care: paras("care"),
    detailImage: files.detail,
    useImage: files.use,
    craftImage: files.craft,
  };
}

const isMaterial = (s: string): s is MaterialSlug =>
  (materialSlugs as readonly string[]).includes(s);

/** Mọi vật liệu (thẻ: tên, mô tả ngắn, ảnh cận) */
export const getMaterials = cache(
  async (locale: string): Promise<MaterialSummary[]> => {
    if (cmsEnabled()) return fetchMaterials(locale, placeholder);
    return Promise.all(materialCards.map((c) => mockMaterial(c.slug, locale)));
  },
);

/** Nội dung trang /materials/<slug>; slug lạ hoặc CMS không có thì undefined */
export const getMaterial = cache(
  async (slug: string, locale: string): Promise<MaterialPage | undefined> => {
    // Có CMS: slug nào CMS có là có trang (thêm trong admin là vào được)
    if (cmsEnabled())
      return (await fetchMaterial(slug, locale, placeholder)) ?? undefined;
    if (!isMaterial(slug)) return undefined;
    return getMaterialCard(slug) ? mockMaterial(slug, locale) : undefined;
  },
);
