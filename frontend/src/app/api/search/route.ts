import { getTranslations } from "next-intl/server";
import { catalogHref } from "@/data/catalog";
import { searchSite } from "@/features/search/search";
import type { Suggestion } from "@/features/search/types";
import { routing } from "@/i18n/routing";

/*
 * Gợi ý khi gõ cho ô tìm nhanh (GET /api/search?q=&locale=). Tìm trên dữ liệu đã cache sẵn của site
 * (features/search/search.ts), không gọi CMS theo từng từ khoá. Trả danh sách gọn: tối đa 5 sản
 * phẩm, mỗi nhóm khác 3 mục; trang /search hiện đủ kết quả.
 */

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const requested = params.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? requested
    : routing.defaultLocale;

  const [results, tc] = await Promise.all([
    searchSite(q, locale, { limit: 5, groupLimit: 3 }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  const typeName = (slug: string) =>
    tc.has(`productTypes.${slug}`) ? tc(`productTypes.${slug}`) : slug;

  const items: Suggestion[] = [
    ...results.products.map((p) => ({
      group: "products" as const,
      title: p.name,
      sub: [p.code, typeName(p.type)].filter(Boolean).join(" · "),
      href: catalogHref.product(p),
      image: p.images[0] ?? null,
    })),
    ...results.categories.map((c) => ({
      group: "categories" as const,
      title: c.name,
      sub: "",
      href: c.href,
      image: c.cover || null,
    })),
    ...results.types.map((t) => ({
      group: "categories" as const,
      title: t.name,
      sub: t.categoryName,
      href: t.href,
      image: null,
    })),
    ...results.materials.map((m) => ({
      group: "materials" as const,
      title: m.name,
      sub: "",
      href: `/materials/${m.slug}`,
      image: m.image || null,
    })),
    ...results.news.map((p) => ({
      group: "news" as const,
      title: p.title,
      sub: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${p.date}T00:00:00`)),
      href: `/news/${p.slug}`,
      image: p.cover || null,
    })),
    ...results.pages.map((p) => ({
      group: "pages" as const,
      title: p.title,
      sub: "",
      href: p.href,
      image: null,
    })),
  ];

  return Response.json(
    { q: results.query, total: results.total, items },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
