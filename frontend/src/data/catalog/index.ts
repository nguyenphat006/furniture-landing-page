import { categoryCovers } from "./covers";
import {
  productTypes,
  type CategorySlug,
  type ProductTypeSlug,
} from "./taxonomy";
import type { Product } from "./types";

/*
 * Phân loại tĩnh + helper URL, dùng được ở cả server lẫn client component.
 * Đọc sản phẩm (CMS hoặc mock) ở ./products (chỉ phía server).
 */

export * from "./taxonomy";
export type {
  Product,
  SetItem,
  Dimensions,
  Loading,
  Assembly,
  MaterialSummary,
  MaterialPage,
  CategoryEntry,
  Taxonomy,
} from "./types";
export { containerTypes } from "./types";

/** Loại thuộc nhóm `category` trong MOCK (khi có CMS, loại theo nhóm lấy từ API) */
export function typesInCategory(category: CategorySlug): ProductTypeSlug[] {
  return (Object.keys(productTypes) as (keyof typeof productTypes)[]).filter(
    (t) => productTypes[t] === category,
  );
}

/** Ảnh bìa mặc định (mock); trang đọc ảnh theo CMS qua getTaxonomy / useTaxonomy */
export function categoryCover(category: CategorySlug): string {
  return (categoryCovers as Record<string, string>)[category] ?? "";
}

/** URL chuẩn: /products/<nhóm> và /products/<nhóm>/<sản phẩm> */
export const catalogHref = {
  category: (category: CategorySlug) => `/products/${category}`,
  /** Loại sản phẩm là bộ lọc trong trang nhóm, không phải một cấp URL riêng */
  type: (category: CategorySlug, type: ProductTypeSlug) =>
    `/products/${category}?type=${type}`,
  product: (p: Pick<Product, "slug" | "category">) =>
    `/products/${p.category}/${p.slug}`,
};
