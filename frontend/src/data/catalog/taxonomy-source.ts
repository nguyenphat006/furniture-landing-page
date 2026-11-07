import "server-only";
import { cache } from "react";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchTaxonomy, type ApiTaxonomy } from "@/lib/cms/catalog";
import { categoryCovers } from "./covers";
import { categoryCover } from "./index";
import {
  categorySlugs,
  featureSlugs,
  materialSlugs,
  productTypes,
  type ProductTypeSlug,
} from "./taxonomy";
import type { Taxonomy } from "./types";

/*
 * Phân loại đang dùng (CHỈ phía server): danh sách, thứ tự, ảnh bìa nhóm và tên hiển thị.
 * - (2026-11-07) Có CMS thì CMS là nguồn duy nhất: nhóm, loại, chất liệu, tính năng thêm trong admin
 *   là có trang / menu / bộ lọc ngay, không khai báo gì ở frontend. Không có CMS thì dùng mock
 *   taxonomy.ts. Ảnh bìa nhóm CMS còn trống thì lấy ảnh mặc định (covers.ts) nếu có.
 * - Tên và mô tả đi qua messages: i18n/request.ts đè nhãn từ CMS lên Common.products, productTypes,
 *   materials, features và HomePage.products.items, nên mọi chỗ gọi t(...) tự đổi theo admin.
 */

/** Gọi CMS một lần mỗi lượt render (dùng chung cho thứ tự và nhãn) */
export const getCmsTaxonomy = cache(
  async (locale: string): Promise<ApiTaxonomy | null> =>
    cmsEnabled() ? fetchTaxonomy(locale) : null,
);

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
  return {
    categories: cms.categories.map((c) => ({
      slug: c.slug,
      cover: c.cover?.url || categoryCover(c.slug),
    })),
    // Loại theo nhóm rồi theo thứ tự trong nhóm
    types: cms.categories.flatMap((c) => c.types.map((t) => t.slug)),
    materials: cms.materials.map((m) => m.slug),
    features: cms.features.map((f) => f.slug),
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
