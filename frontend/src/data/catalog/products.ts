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
import type { CategorySlug, MaterialSlug } from "./taxonomy";
import { getTaxonomy } from "./taxonomy-source";
import type { Product } from "./types";

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
  return categories.flatMap((c) => list.filter((p) => p.category === c.slug));
});

export async function getProductsInCategory(
  category: CategorySlug,
  locale: string,
): Promise<Product[]> {
  return (await getProducts(locale)).filter((p) => p.category === category);
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

/** Sản phẩm dùng chất liệu `material` (mục "Sản phẩm dùng ..." ở trang vật liệu), theo thứ tự catalog */
export async function getProductsWithMaterial(
  material: MaterialSlug,
  locale: string,
): Promise<Product[]> {
  return (await getProducts(locale)).filter((p) =>
    p.materials.includes(material),
  );
}

/**
 * Mẫu khác cho trang sản phẩm (2026-11-07): cùng nhóm, bỏ chính nó; cùng loại xếp trước, rồi tới
 * mẫu chung nhiều chất liệu hơn; cùng điểm thì giữ thứ tự catalog.
 */
export async function getRelatedProducts(
  product: Product,
  locale: string,
  limit: number,
): Promise<Product[]> {
  const score = (p: Product) =>
    (p.type === product.type ? 100 : 0) +
    p.materials.filter((m) => product.materials.includes(m)).length;
  return (await getProductsInCategory(product.category, locale))
    .filter((p) => p.slug !== product.slug)
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ p }) => p);
}

/** SEO riêng của nhóm sản phẩm nhập trong CMS; mock không có */
export const getCategorySeo = cache(
  async (
    category: CategorySlug,
    locale: string,
  ): Promise<PageSeo | undefined> =>
    cmsEnabled() ? (await fetchCategorySeo(locale))[category] : undefined,
);
