import "server-only";
import type { MaterialSlug } from "@/data/catalog/taxonomy";
import type { MaterialPage, MaterialSummary } from "@/data/catalog/types";
import { cmsGet } from "./client";
import type { components } from "./schema";

/*
 * Vật liệu từ CMS (GET /catalog/materials, /catalog/materials/<slug>), đổi sang kiểu của UI.
 * Mọi vật liệu CMS trả về đều có trang (2026-11-07). Ảnh CMS còn trống thì dùng `placeholder(slug)`:
 * tên file cần chụp, để khung kẻ sọc vẫn ghi rõ chỗ đó cần ảnh gì.
 */

type Schemas = components["schemas"];
type Image = Schemas["Image"] | null;

export type Placeholders = (slug: MaterialSlug) => {
  img: string;
  detail: string;
  use: string;
  craft: string;
};

const src = (image: Image, fallback: string) => image?.url ?? fallback;

function summary(
  m: Schemas["Material"],
  slug: MaterialSlug,
  placeholder: Placeholders,
): MaterialSummary {
  return {
    slug,
    name: m.name,
    lede: m.lede,
    image: src(m.image, placeholder(slug).img),
    noindex: m.noindex,
  };
}

export async function fetchMaterials(
  locale: string,
  placeholder: Placeholders,
): Promise<MaterialSummary[]> {
  const items =
    (await cmsGet<Schemas["Material"][]>("catalog/materials", { locale })) ??
    [];
  return items.map((m) => summary(m, m.slug, placeholder));
}

export async function fetchMaterial(
  slug: MaterialSlug,
  locale: string,
  placeholder: Placeholders,
): Promise<MaterialPage | null> {
  const m = await cmsGet<Schemas["MaterialDetail"]>(
    `catalog/materials/${encodeURIComponent(slug)}`,
    { locale },
  );
  if (!m) return null;
  const files = placeholder(slug);
  return {
    ...summary(m, slug, placeholder),
    seo: m.seo,
    properties: m.properties,
    craft: m.craft,
    care: m.care,
    detailImage: src(m.detail_image, files.detail),
    useImage: src(m.use_image, files.use),
    craftImage: src(m.craft_image, files.craft),
  };
}
