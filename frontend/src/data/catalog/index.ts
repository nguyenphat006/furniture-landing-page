import { categoryCovers } from "./covers";
import {
  categorySlugs,
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

export function categoryOf(type: ProductTypeSlug): CategorySlug {
  return productTypes[type];
}

export function typesInCategory(category: CategorySlug): ProductTypeSlug[] {
  return (Object.keys(productTypes) as ProductTypeSlug[]).filter(
    (t) => productTypes[t] === category,
  );
}

/** Ảnh bìa mặc định (mock); trang đọc ảnh theo CMS qua getTaxonomy / useTaxonomy */
export function categoryCover(category: CategorySlug): string {
  return categoryCovers[category];
}

export const categories = categorySlugs;

/** URL chuẩn: /products/<nhóm> và /products/<nhóm>/<sản phẩm> */
export const catalogHref = {
  category: (category: CategorySlug) => `/products/${category}`,
  /** Loại sản phẩm là bộ lọc trong trang nhóm, không phải một cấp URL riêng */
  type: (type: ProductTypeSlug) =>
    `/products/${productTypes[type]}?type=${type}`,
  product: (p: Pick<Product, "slug" | "type">) =>
    `/products/${productTypes[p.type]}/${p.slug}`,
};
