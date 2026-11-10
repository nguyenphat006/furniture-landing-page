import "server-only";
import { getTranslations } from "next-intl/server";
import { navHref } from "@/config/navigation";
import {
  catalogHref,
  type MaterialSummary,
  type Product,
} from "@/data/catalog";
import { getMaterials } from "@/data/catalog/materials";
import { getProducts } from "@/data/catalog/products";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { getAllNews, type NewsPost } from "@/data/news";
import { workshopDefs } from "@/features/capabilities/data";
import { routing } from "@/i18n/routing";
import { MIN_QUERY, normalize, tokens } from "./normalize";

/*
 * Tìm kiếm trên site (B7, 2026-11-09). Tìm ngay trong Next trên dữ liệu đã có sẵn cho các trang
 * (sản phẩm, phân loại, vật liệu từ CMS hoặc mock, cache theo tag "cms"), không gọi CMS theo từng từ
 * khoá: không tạo thêm tải cho CMS, CMS tạm lỗi thì vẫn tìm được trên bản dự phòng, kết quả giống
 * hệt ở local (SQLite) và server (Postgres). Dữ liệu cỡ vài nghìn mục vẫn chỉ mất vài ms.
 *
 * Khớp: mọi từ khoá (đã bỏ dấu, xem normalize.ts) phải có trong tên / mã / trường phụ của mục.
 * Điểm: mã mẫu trùng hoặc bắt đầu bằng cả cụm từ khoá > tên bắt đầu bằng cụm > tên chứa cụm > cả cụm
 * nằm trong trường phụ > từng từ
 * khoá nằm ở đầu một từ của tên > nằm trong tên > chỉ khớp trường phụ (nhóm, loại, chất liệu, mô tả).
 * Tên nhóm / loại / chất liệu lấy cả hai ngôn ngữ, nên gõ "teak" hay "gỗ" đều ra ở trang nào cũng được.
 * (2026-11-09) Thêm tin tức "Cuộc sống tại BFC": khớp tiêu đề và tóm tắt, thứ tự mới nhất trước.
 */

type Entry<T> = {
  item: T;
  /** Đã chuẩn hoá */
  title: string;
  code?: string;
  extra: string;
};

function entry<T>(
  item: T,
  title: string,
  extra: string[],
  code?: string,
): Entry<T> {
  return {
    item,
    title: normalize(title),
    code: code ? normalize(code) : undefined,
    extra: normalize(extra.join(" ")),
  };
}

function score(e: Entry<unknown>, words: string[], phrase: string): number {
  const all = `${e.title} ${e.code ?? ""} ${e.extra}`;
  if (!words.every((w) => all.includes(w))) return 0;
  let s = 1;
  if (e.code && e.code.startsWith(phrase)) s += e.code === phrase ? 200 : 100;
  if (e.title.startsWith(phrase)) s += 60;
  else if (e.title.includes(phrase)) s += 40;
  // Cả cụm khớp nhóm / loại / chất liệu (vd "ghe tam nang" là tên loại): xếp trên mục chỉ khớp lẻ từng từ
  else if (e.extra.includes(phrase)) s += 30;
  const titleWords = e.title.split(" ");
  for (const w of words) {
    if (titleWords.some((tw) => tw.startsWith(w))) s += 10;
    else if (e.title.includes(w)) s += 5;
    else if (e.code?.includes(w)) s += 5;
  }
  return s;
}

function rank<T>(list: Entry<T>[], words: string[], phrase: string): T[] {
  return list
    .map((e, i) => ({ e, i, s: score(e, words, phrase) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.e.item);
}

export type SearchCategory = {
  slug: string;
  name: string;
  href: string;
  cover: string;
};
export type SearchType = {
  slug: string;
  name: string;
  categoryName: string;
  href: string;
};
export type SearchPage = { title: string; description: string; href: string };

export type SearchResults = {
  query: string;
  /** Từ khoá quá ngắn (dưới MIN_QUERY ký tự): chưa tìm */
  tooShort: boolean;
  products: Product[];
  materials: MaterialSummary[];
  news: NewsPost[];
  categories: SearchCategory[];
  types: SearchType[];
  pages: SearchPage[];
  total: number;
};

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Nhãn phân loại; slug mới thêm trong CMS mà messages chưa có thì dùng chính slug */
const label = (t: Translator, key: string, slug: string) =>
  t.has(key) ? t(key) : slug;

async function buildIndex(locale: string) {
  const others = routing.locales.filter((l) => l !== locale);
  const [products, taxonomy, materials, news, tc, ...tOthers] =
    await Promise.all([
      getProducts(locale),
      getTaxonomy(locale),
      getMaterials(locale),
      getAllNews(locale),
      getTranslations({ locale, namespace: "Common" }),
      ...others.map((l) => getTranslations({ locale: l, namespace: "Common" })),
    ]);
  /** Nhãn ở mọi ngôn ngữ, ghép vào trường phụ để gõ tiếng nào cũng khớp */
  const labelsAll = (key: string, slug: string) =>
    [tc, ...tOthers].map((t) => label(t, key, slug));

  const categoryName = (slug: string) => label(tc, `products.${slug}`, slug);
  const typeName = (slug: string) => label(tc, `productTypes.${slug}`, slug);

  const productEntries = products.map((p) =>
    entry(
      p,
      p.name,
      [
        ...labelsAll(`products.${p.category}`, p.category),
        ...labelsAll(`productTypes.${p.type}`, p.type),
        ...p.materials.flatMap((m) => labelsAll(`materials.${m}`, m)),
      ],
      p.code,
    ),
  );

  const categoryEntries = taxonomy.categories.map((c) =>
    entry<SearchCategory>(
      {
        slug: c.slug,
        name: categoryName(c.slug),
        href: catalogHref.category(c.slug),
        cover: c.cover,
      },
      categoryName(c.slug),
      labelsAll(`products.${c.slug}`, c.slug),
    ),
  );

  // Loại chưa có sản phẩm nào thì bỏ (trang lọc sẽ trống); nhóm của loại lấy từ sản phẩm
  const typeCategory = new Map<string, string>();
  for (const p of products)
    if (!typeCategory.has(p.type)) typeCategory.set(p.type, p.category);
  const typeEntries = taxonomy.types.flatMap((slug) => {
    const category = typeCategory.get(slug);
    if (!category) return [];
    return [
      entry<SearchType>(
        {
          slug,
          name: typeName(slug),
          categoryName: categoryName(category),
          href: catalogHref.type(category, slug),
        },
        typeName(slug),
        [
          ...labelsAll(`productTypes.${slug}`, slug),
          ...labelsAll(`products.${category}`, category),
        ],
      ),
    ];
  });

  const materialEntries = materials.map((m) =>
    entry(m, m.name, [...labelsAll(`materials.${m.slug}`, m.slug), m.lede]),
  );

  const newsEntries = news.map((p) => entry(p, p.title, [p.excerpt]));

  return {
    productEntries,
    newsEntries,
    categoryEntries,
    typeEntries,
    materialEntries,
    pageEntries: await pageEntries(locale),
  };
}

const PAGES = [
  ["about", "AboutPage"],
  ["capabilities", "CapabilitiesPage"],
  ["materials", "MaterialsPage"],
  ["products", "ProductsPage"],
  ["contact", "ContactPage"],
] as const;

/** Trang của site (tiêu đề + mô tả SEO) và từng xưởng trong trang Năng lực (tên, tóm tắt, công đoạn) */
async function pageEntries(locale: string): Promise<Entry<SearchPage>[]> {
  const [tc, tw, ...tPages] = await Promise.all([
    getTranslations({ locale, namespace: "Common" }),
    getTranslations({ locale, namespace: "CapabilitiesPage.workshops" }),
    ...PAGES.map(([, ns]) => getTranslations({ locale, namespace: ns })),
  ]);
  const pages = PAGES.map(([key], i) => {
    const page: SearchPage = {
      title: tc(`nav.${key}`),
      description: tPages[i]("metaDescription"),
      href: navHref[key],
    };
    return entry(page, page.title, [tPages[i]("metaTitle"), page.description]);
  });
  const workshops = workshopDefs.map((w, i) => {
    const page: SearchPage = {
      title: tw(`items.${w.key}.name`),
      description: tw(`items.${w.key}.summary`),
      href: `${navHref.capabilities}#ws-${i + 1}`,
    };
    return entry(page, page.title, [
      page.description,
      ...(tw.raw(`items.${w.key}.ops`) as string[]),
    ]);
  });
  return [...pages, ...workshops];
}

/**
 * Tìm trên toàn site. `limit` giới hạn số sản phẩm trả về (tổng số khớp vẫn tính trong `total`);
 * các nhóm khác tối đa `groupLimit` mục.
 */
export async function searchSite(
  query: string,
  locale: string,
  { limit = 60, groupLimit = 8 }: { limit?: number; groupLimit?: number } = {},
): Promise<SearchResults> {
  const q = query.trim().slice(0, 100);
  const phrase = normalize(q);
  const empty: SearchResults = {
    query: q,
    tooShort: phrase.length < MIN_QUERY,
    products: [],
    materials: [],
    news: [],
    categories: [],
    types: [],
    pages: [],
    total: 0,
  };
  if (empty.tooShort) return empty;
  const words = tokens(q);
  const index = await buildIndex(locale);
  const products = rank(index.productEntries, words, phrase);
  const materials = rank(index.materialEntries, words, phrase);
  const categories = rank(index.categoryEntries, words, phrase);
  const types = rank(index.typeEntries, words, phrase);
  const pages = rank(index.pageEntries, words, phrase);
  const news = rank(index.newsEntries, words, phrase);
  return {
    ...empty,
    products: products.slice(0, limit),
    materials: materials.slice(0, groupLimit),
    categories: categories.slice(0, groupLimit),
    types: types.slice(0, groupLimit),
    pages: pages.slice(0, groupLimit),
    news: news.slice(0, groupLimit),
    total:
      products.length +
      materials.length +
      categories.length +
      types.length +
      pages.length +
      news.length,
  };
}
