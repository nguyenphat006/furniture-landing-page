import "server-only";
import {
  featureSlugs,
  materialSlugs,
  productTypes,
  type FeatureSlug,
  type MaterialSlug,
  type ProductTypeSlug,
} from "@/data/catalog/taxonomy";
import {
  containerTypes,
  type Loading,
  type Product,
  type SetItem,
} from "@/data/catalog/types";
import { cmsGet, cmsGetAll } from "./client";
import type { components } from "./schema";

/*
 * Catalog từ CMS: kiểu dữ liệu API sinh từ backend/openapi.yaml (schema.d.ts; backend đổi API thì chạy
 * `npm run cms:types`, TypeScript sẽ báo chỗ phải sửa) và hàm đổi sang kiểu Product của UI.
 * Phân loại dùng slug cố định ở taxonomy.ts (nhãn trong messages/*.json): slug lạ từ CMS (chưa khai báo ở frontend) bị bỏ qua, sản phẩm thuộc loại lạ không hiển thị.
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

const isType = (s: string): s is ProductTypeSlug => s in productTypes;
const isMaterial = (s: string): s is MaterialSlug =>
  (materialSlugs as readonly string[]).includes(s);
const isFeature = (s: string): s is FeatureSlug =>
  (featureSlugs as readonly string[]).includes(s);

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
    materials: item.materials.filter(isMaterial),
    features: item.features.filter(isFeature),
  };
}

function base(p: ApiProductBase, images: string[]): Product | null {
  if (!isType(p.type)) return null;
  return {
    slug: p.slug,
    name: p.name,
    code: p.code || undefined,
    type: p.type,
    materials: p.materials.filter(isMaterial),
    features: p.features.filter(isFeature),
    isFallback: p.is_fallback,
    noindex: p.noindex,
    images,
  };
}

function setItem(item: ApiSetItem): SetItem | null {
  if (!isType(item.type)) return null;
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
  return items
    .map((p) => base(p, p.image ? [p.image.thumb] : []))
    .filter((p): p is Product => p !== null);
}

export async function fetchProduct(
  slug: string,
  locale: string,
): Promise<Product | null> {
  const p = await cmsGet<ApiProductDetail>(
    `catalog/products/${encodeURIComponent(slug)}`,
    { locale },
  );
  if (!p) return null;
  const product = base(
    p,
    p.images.map((i) => i.url),
  );
  if (!product) return null;
  const setItems = p.set_items
    .map(setItem)
    .filter((i): i is SetItem => i !== null);
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
