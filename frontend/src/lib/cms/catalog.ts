import "server-only";
import {
  containerTypes,
  type Loading,
  type Product,
  type SetItem,
} from "@/data/catalog/types";
import { cmsGet, cmsGetAll } from "./client";
import { previewContent } from "./preview";
import type { components } from "./schema";

/*
 * Catalog từ CMS: kiểu dữ liệu API sinh từ backend/openapi.yaml (schema.d.ts; backend đổi API thì chạy
 * `npm run cms:types`, TypeScript sẽ báo chỗ phải sửa) và hàm đổi sang kiểu Product của UI.
 * Phân loại là dữ liệu CMS (2026-11-07): sản phẩm mang sẵn nhóm, loại, chất liệu; nhãn hiển thị CMS đè lên messages.
 */

type Schemas = components["schemas"];
type ApiSetItem = Schemas["SetItem"];
/** Phần quy cách dùng chung giữa sản phẩm lẻ và món trong bộ */
type ApiSpec = Pick<
  ApiSetItem,
  | "dimensions"
  | "assembly"
  | "pcs_per_box"
  | "carton"
  | "loading"
  | "materials"
  | "features"
>;
type ApiProductBase = Omit<Schemas["ProductList"], "image">;
type ApiProductListItem = Schemas["ProductList"];
type ApiProductDetail = Schemas["ProductDetail"];

function loading(value: Loading | null): Loading | undefined {
  if (!value) return undefined;
  const out: Loading = {};
  for (const c of containerTypes) if (value[c] != null) out[c] = value[c];
  return Object.keys(out).length ? out : undefined;
}

function spec(item: ApiSpec) {
  return {
    dimensions: item.dimensions ?? undefined,
    assembly: item.assembly ?? undefined,
    pcsPerBox: item.pcs_per_box ?? undefined,
    carton: item.carton ?? undefined,
    loading: loading(item.loading),
    materials: item.materials,
    features: item.features,
  };
}

function base(p: ApiProductBase, images: string[]): Product {
  return {
    slug: p.slug,
    name: p.name,
    code: p.code || undefined,
    type: p.type,
    category: p.category,
    materials: p.materials,
    features: p.features,
    isFallback: p.is_fallback,
    noindex: p.noindex,
    images,
  };
}

function setItem(item: ApiSetItem): SetItem {
  return {
    type: item.type,
    qty: item.qty,
    ...spec(item),
    image: item.image?.url,
  };
}

/** Sản phẩm đang xuất bản (thứ tự theo nhóm rồi thứ tự trong CMS), ảnh đại diện là bản thu nhỏ */
export async function fetchProducts(locale: string): Promise<Product[]> {
  const items = await cmsGetAll<ApiProductListItem>("catalog/products", {
    locale,
  });
  return items.map((p) => base(p, p.image ? [p.image.thumb] : []));
}

export async function fetchProduct(
  slug: string,
  locale: string,
): Promise<Product | null> {
  // Admin đang xem trước sản phẩm này: dùng bản đang sửa
  const p =
    (await previewContent<ApiProductDetail>("product", slug, locale)) ??
    (await cmsGet<ApiProductDetail>(
      `catalog/products/${encodeURIComponent(slug)}`,
      { locale },
    ));
  if (!p) return null;
  const product = base(
    p,
    p.images.map((i) => i.url),
  );
  const setItems = p.set_items.map(setItem);
  return {
    ...product,
    ...spec(p),
    descriptionHtml: p.description || undefined,
    seo: p.seo,
    setItems: setItems.length ? setItems : undefined,
  };
}

export type ApiTaxonomy = Schemas["Taxonomy"];

/** Nhóm (kèm loại, mô tả, ảnh bìa, SEO), chất liệu, tính năng theo thứ tự trong CMS */
export async function fetchTaxonomy(
  locale: string,
): Promise<ApiTaxonomy | null> {
  return cmsGet<ApiTaxonomy>("catalog/taxonomy", { locale });
}

/** SEO riêng của các nhóm sản phẩm (nhập trong CMS), theo slug */
export async function fetchCategorySeo(
  locale: string,
): Promise<Record<string, Schemas["PageSeo"]>> {
  const taxonomy = await fetchTaxonomy(locale);
  return Object.fromEntries(
    (taxonomy?.categories ?? []).map((c) => [c.slug, c.seo]),
  );
}
