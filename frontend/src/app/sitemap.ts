import type { MetadataRoute } from "next";
import { legalHref, navHref } from "@/config/navigation";
import { catalogHref, categories, type CategorySlug } from "@/data/catalog";
import { getMaterials } from "@/data/catalog/materials";
import { getCategorySeo, getProducts } from "@/data/catalog/products";
import { routing } from "@/i18n/routing";
import { localePath, siteUrl } from "@/lib/seo";

/*
 * sitemap.xml (2026-11-07): trang tĩnh, nhóm sản phẩm, vật liệu, sản phẩm; mỗi URL kèm bản vi / en
 * (hreflang). Bỏ trang quản trị viên bật "ẩn khỏi Google" trong CMS. Dữ liệu theo tiếng Việt
 * (ngôn ngữ gốc); sản phẩm chỉ có bản gốc thì trang tiếng Anh tự noindex, sitemap vẫn ghi để
 * Google biết có bản đó khi được dịch.
 * Làm mới theo cache CMS (tag "cms"), không cần build lại khi thêm sản phẩm.
 */

const STATIC_PATHS = [
  "/",
  navHref.capabilities,
  navHref.materials,
  navHref.products,
  navHref.about,
  navHref.contact,
  legalHref.privacy,
  legalHref.terms,
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const locale = routing.defaultLocale;
  const url = (path: string, l: string) =>
    new URL(localePath(path, l), base).toString();
  const entry = (path: string): MetadataRoute.Sitemap[number] => ({
    url: url(path, locale),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, url(path, l)]),
      ),
    },
  });

  const [products, materials, categorySeo] = await Promise.all([
    getProducts(locale),
    getMaterials(locale),
    Promise.all(
      categories.map(
        async (c) => [c, await getCategorySeo(c, locale)] as const,
      ),
    ),
  ]);
  const hiddenCategories = new Set<CategorySlug>(
    categorySeo.filter(([, seo]) => seo?.noindex).map(([c]) => c),
  );

  return [
    ...STATIC_PATHS.map(entry),
    ...categories
      .filter((c) => !hiddenCategories.has(c))
      .map((c) => entry(catalogHref.category(c))),
    ...materials
      .filter((m) => !m.noindex)
      .map((m) => entry(`${navHref.materials}/${m.slug}`)),
    ...products
      .filter((p) => !p.noindex)
      .map((p) => entry(catalogHref.product(p))),
  ];
}
