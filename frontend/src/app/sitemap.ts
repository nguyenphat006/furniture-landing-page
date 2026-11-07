import type { MetadataRoute } from "next";
import { legalHref, navHref } from "@/config/navigation";
import { catalogHref } from "@/data/catalog";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { getMaterials } from "@/data/catalog/materials";
import { getCategorySeo, getProducts } from "@/data/catalog/products";
import { routing } from "@/i18n/routing";
import { localePath, siteUrl } from "@/lib/seo";

/*
 * sitemap.xml (2026-11-07): trang tĩnh, nhóm sản phẩm, vật liệu, sản phẩm. Mỗi ngôn ngữ một <url>
 * (QC 07/11), kèm hreflang các bản có thật và x-default (tiếng Việt). Bỏ trang quản trị viên bật
 * "ẩn khỏi Google" trong CMS. Sản phẩm chưa dịch tiếng Anh: trang tiếng Anh tự noindex nên không
 * ghi bản đó (Search Console báo lỗi URL gửi lên mà noindex).
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
  const entry = (
    path: string,
    locales: readonly string[] = routing.locales,
  ): MetadataRoute.Sitemap => {
    const languages = {
      ...Object.fromEntries(locales.map((l) => [l, url(path, l)])),
      "x-default": url(path, locale),
    };
    return locales.map((l) => ({
      url: url(path, l),
      alternates: { languages },
    }));
  };

  const [products, productsEn, materials, taxonomy] = await Promise.all([
    getProducts(locale),
    getProducts("en"),
    getMaterials(locale),
    getTaxonomy(locale),
  ]);
  const categories = taxonomy.categories.map((c) => c.slug);
  const categorySeo = await Promise.all(
    categories.map(async (c) => [c, await getCategorySeo(c, locale)] as const),
  );
  const hiddenCategories = new Set<string>(
    categorySeo.filter(([, seo]) => seo?.noindex).map(([c]) => c),
  );

  const untranslated = new Set(
    productsEn.filter((p) => p.isFallback).map((p) => p.slug),
  );

  return [
    ...STATIC_PATHS.flatMap((path) => entry(path)),
    ...categories
      .filter((c) => !hiddenCategories.has(c))
      .flatMap((c) => entry(catalogHref.category(c))),
    ...materials
      .filter((m) => !m.noindex)
      .flatMap((m) => entry(`${navHref.materials}/${m.slug}`)),
    ...products
      .filter((p) => !p.noindex)
      .flatMap((p) =>
        entry(
          catalogHref.product(p),
          untranslated.has(p.slug) ? [locale] : routing.locales,
        ),
      ),
  ];
}
