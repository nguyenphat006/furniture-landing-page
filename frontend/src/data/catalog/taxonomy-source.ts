import "server-only";
import { cache } from "react";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchTaxonomy, type ApiTaxonomy } from "@/lib/cms/catalog";
import { categoryCovers } from "./covers";
import {
  categorySlugs,
  featureSlugs,
  materialSlugs,
  productTypes,
  type ProductTypeSlug,
} from "./taxonomy";
import type { Taxonomy } from "./types";

/*
 * Phân loại đang dùng (CHỈ phía server): thứ tự, ảnh bìa nhóm và tên hiển thị.
 * - Slug và trang có sẵn vẫn do frontend khai báo (taxonomy.ts); CMS quyết định thứ tự, tên, mô tả,
 *   ảnh bìa (docs/adr/0012 phía backend). Slug CMS có mà frontend chưa khai báo bị bỏ qua; slug
 *   frontend có mà CMS chưa có (chưa chạy sync_taxonomy) xếp cuối, dùng dữ liệu mặc định.
 * - Tên và mô tả đi qua messages: i18n/request.ts đè nhãn từ CMS lên Common.products, productTypes,
 *   materials, features và HomePage.products.items, nên mọi chỗ gọi t(...) tự đổi theo admin.
 */

/** Gọi CMS một lần mỗi lượt render (dùng chung cho thứ tự và nhãn) */
export const getCmsTaxonomy = cache(
  async (locale: string): Promise<ApiTaxonomy | null> =>
    cmsEnabled() ? fetchTaxonomy(locale) : null,
);

/** Slug đã khai báo theo thứ tự CMS, slug CMS chưa có xếp sau theo thứ tự frontend */
function ordered<T extends string>(known: readonly T[], cms: string[]): T[] {
  const fromCms = [...new Set(cms)].filter((s): s is T =>
    (known as readonly string[]).includes(s),
  );
  return [...fromCms, ...known.filter((s) => !fromCms.includes(s))];
}

const allTypes = Object.keys(productTypes) as ProductTypeSlug[];

function mockTaxonomy(): Taxonomy {
  return {
    categories: categorySlugs.map((slug) => ({
      slug,
      cover: categoryCovers[slug],
    })),
    types: allTypes,
    materials: [...materialSlugs],
    features: [...featureSlugs],
  };
}

export const getTaxonomy = cache(async (locale: string): Promise<Taxonomy> => {
  const cms = await getCmsTaxonomy(locale);
  if (!cms) return mockTaxonomy();
  const covers = new Map(cms.categories.map((c) => [c.slug, c.cover?.url]));
  return {
    categories: ordered(
      categorySlugs,
      cms.categories.map((c) => c.slug),
    ).map((slug) => ({
      slug,
      cover: covers.get(slug) || categoryCovers[slug],
    })),
    // Loại nằm trong nhóm của nó (productTypes), nên thứ tự loại theo nhóm rồi theo CMS
    types: ordered(
      allTypes,
      cms.categories.flatMap((c) => c.types.map((t) => t.slug)),
    ),
    materials: ordered(
      materialSlugs,
      cms.materials.map((m) => m.slug),
    ),
    features: ordered(
      featureSlugs,
      cms.features.map((f) => f.slug),
    ),
  };
});

type Labels = Record<string, string>;

/** Thoát ký tự đặc biệt của ICU message để tên nhập trong admin hiện đúng nguyên văn */
const icuLiteral = (s: string) =>
  s.replace(/'/g, "''").replace(/[{}<>]/g, (c) => `'${c}'`);

const labels = (items: { slug: string; name: string }[]): Labels =>
  Object.fromEntries(
    items.filter((i) => i.name).map((i) => [i.slug, icuLiteral(i.name)]),
  );

/**
 * Nhãn phân loại từ CMS để đè lên messages (i18n/request.ts). CMS tắt hoặc lỗi thì null:
 * site giữ nhãn trong messages, không làm hỏng trang.
 */
export async function cmsTaxonomyMessages(locale: string) {
  let cms: ApiTaxonomy | null;
  try {
    cms = await getCmsTaxonomy(locale);
  } catch (err) {
    console.error(
      "Không đọc được phân loại từ CMS, dùng nhãn trong messages",
      err,
    );
    return null;
  }
  if (!cms) return null;
  return {
    Common: {
      products: labels(cms.categories),
      productTypes: labels(cms.categories.flatMap((c) => c.types)),
      materials: labels(cms.materials),
      features: labels(cms.features),
    },
    HomePage: {
      products: {
        items: labels(
          cms.categories.map((c) => ({ slug: c.slug, name: c.description })),
        ),
      },
    },
  };
}
