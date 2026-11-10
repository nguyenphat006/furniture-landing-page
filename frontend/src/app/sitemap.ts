import type { MetadataRoute } from "next";
import { legalHref, navHref } from "@/config/navigation";
import { catalogHref } from "@/data/catalog";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { getMaterials } from "@/data/catalog/materials";
import {
  getCategorySeo,
  getProduct,
  getProducts,
} from "@/data/catalog/products";
import { getAllNews, newsSlugs } from "@/data/news";
import { routing } from "@/i18n/routing";
import { localePath, type LocalizedPath, pathFor, siteUrl } from "@/lib/seo";

/*
 * sitemap.xml (2026-11-07): trang tĩnh, nhóm sản phẩm, vật liệu, sản phẩm, tin tức (2026-11-09). Mỗi ngôn ngữ một <url>
 * (QC 07/11), kèm hreflang các bản có thật và x-default (tiếng Việt). Bỏ trang quản trị viên bật
 * "ẩn khỏi Google" trong CMS. Sản phẩm chưa dịch tiếng Anh mà bản gốc có mô tả: trang tiếng Anh
 * hiện mô tả tiếng Việt nên tự noindex (xem trang chi tiết), sitemap không ghi bản đó (Search
 * Console báo lỗi URL gửi lên mà noindex). Chưa dịch nhưng không có mô tả thì trang toàn chữ
 * tiếng Anh, vẫn ghi.
 * Làm mới theo cache CMS (tag "cms"), không cần build lại khi thêm sản phẩm.
 */

const STATIC_PATHS = [
  "/",
  navHref.capabilities,
  navHref.materials,
  navHref.products,
  navHref.about,
  navHref.contact,
  navHref.news,
  legalHref.privacy,
  legalHref.terms,
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const locale = routing.defaultLocale;
  const url = (path: string, l: string) =>
    new URL(localePath(path, l), base).toString();
  const entry = (
    path: LocalizedPath,
    locales: readonly string[] = routing.locales,
    lastModified?: string,
  ): MetadataRoute.Sitemap => {
    const languages = {
      ...Object.fromEntries(locales.map((l) => [l, url(pathFor(path, l), l)])),
      "x-default": url(pathFor(path, locale), locale),
    };
    return locales.map((l) => ({
      url: url(pathFor(path, l), l),
      alternates: { languages },
      // Chỉ sản phẩm và tin tức có ngày xuất bản từ CMS; trang khác không ghi để không báo sai (QC 09/11)
      ...(lastModified ? { lastModified } : {}),
    }));
  };

  const [products, productsEn, materials, taxonomy, news, newsEn] =
    await Promise.all([
      getProducts(locale),
      getProducts("en"),
      getMaterials(locale),
      getTaxonomy(locale),
      getAllNews(locale),
      getAllNews("en"),
    ]);
  // Bài chưa dịch tiếng Anh: trang tiếng Anh hiện bản tiếng Việt và noindex, không ghi vào sitemap
  const newsEnFallback = new Set(
    newsEn.filter((p) => p.isFallback).map((p) => p.slug),
  );
  const categories = taxonomy.categories.map((c) => c.slug);
  const categorySeo = await Promise.all(
    categories.map(async (c) => [c, await getCategorySeo(c, locale)] as const),
  );
  const hiddenCategories = new Set<string>(
    categorySeo.filter(([, seo]) => seo?.noindex).map(([c]) => c),
  );

  // Cùng điều kiện noindex với trang chi tiết; dữ liệu chi tiết dùng chung cache với trang
  const enNoindex = new Set(
    (
      await Promise.all(
        productsEn
          .filter((p) => p.isFallback)
          .map(async (p) => {
            const detail = await getProduct(p.slug, "en");
            return detail?.descriptionHtml ? p.slug : null;
          }),
      )
    ).filter((slug): slug is string => slug !== null),
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
          enNoindex.has(p.slug) ? [locale] : routing.locales,
          p.updated,
        ),
      ),
    ...news
      .filter((p) => !p.noindex)
      .flatMap((p) =>
        entry(
          Object.fromEntries(
            Object.entries(newsSlugs(p)).map(([l, s]) => [
              l,
              `${navHref.news}/${s}`,
            ]),
          ),
          newsEnFallback.has(p.slug) ? [locale] : routing.locales,
          p.updated,
        ),
      ),
  ];
}
