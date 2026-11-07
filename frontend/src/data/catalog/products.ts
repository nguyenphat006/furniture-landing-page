import "server-only";
import { cache } from "react";
import { cmsEnabled } from "@/lib/cms/client";
import {
  fetchCategorySeo,
  fetchProduct,
  fetchProducts,
} from "@/lib/cms/catalog";
import type { PageSeo } from "@/lib/seo";
import { mockProducts } from "./products.mock";
import { productTypes, type CategorySlug, type MaterialSlug } from "./taxonomy";
import { getTaxonomy } from "./taxonomy-source";
import type { CategoryEntry, Product } from "./types";

/*
 * Đọc sản phẩm (CHỈ phía server: page, generateMetadata, generateStaticParams).
 * Nguồn: CMS khi đặt CMS_API_URL, nếu không thì mock (products.mock.ts), để frontend vẫn chạy
 * khi chưa bật backend. Component chỉ gọi các hàm ở đây, không gọi thẳng CMS hay mock.
 * cache() của React: trong một lượt render, gọi lại cùng tham số không gọi CMS lần nữa.
 */

/** Tất cả sản phẩm đang xuất bản, xếp theo thứ tự nhóm (danh sách: ảnh đại diện là bản thu nhỏ) */
export const getProducts = cache(async (locale: string): Promise<Product[]> => {
  const [list, { categories }] = await Promise.all([
    cmsEnabled() ? fetchProducts(locale) : mockProducts,
    getTaxonomy(locale),
  ]);
  return categories.flatMap((c) =>
    list.filter((p) => productTypes[p.type] === c.slug),
  );
});

export async function getProductsInCategory(
  category: CategorySlug,
  locale: string,
): Promise<Product[]> {
  return (await getProducts(locale)).filter(
    (p) => productTypes[p.type] === category,
  );
}

/** Chi tiết sản phẩm (đủ quy cách, món trong bộ, ảnh cỡ lớn); không có thì undefined */
export const getProduct = cache(
  async (slug: string, locale: string): Promise<Product | undefined> => {
    if (!cmsEnabled()) return mockProducts.find((p) => p.slug === slug);
    return (await fetchProduct(slug, locale)) ?? undefined;
  },
);

/** Chất liệu có trong nhóm, tính từ sản phẩm; theo thứ tự chất liệu trong CMS */
export async function getMaterialsInCategory(
  category: CategorySlug,
  locale: string,
): Promise<MaterialSlug[]> {
  const used = new Set(
    (await getProductsInCategory(category, locale)).flatMap((p) => p.materials),
  );
  return (await getTaxonomy(locale)).materials.filter((m) => used.has(m));
}

/** Các nhóm có sản phẩm dùng chất liệu `material` (mục "Sản phẩm dùng ..." ở trang vật liệu) */
export async function getCategoriesUsingMaterial(
  material: MaterialSlug,
  locale: string,
): Promise<CategoryEntry[]> {
  const products = await getProducts(locale);
  return (await getTaxonomy(locale)).categories.filter((c) =>
    products.some(
      (p) => productTypes[p.type] === c.slug && p.materials.includes(material),
    ),
  );
}

/** SEO riêng của nhóm sản phẩm nhập trong CMS; mock không có */
export const getCategorySeo = cache(
  async (
    category: CategorySlug,
    locale: string,
  ): Promise<PageSeo | undefined> =>
    cmsEnabled() ? (await fetchCategorySeo(locale))[category] : undefined,
);
