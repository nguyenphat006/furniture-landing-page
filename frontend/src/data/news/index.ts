import "server-only";
import { cache } from "react";
import { routing } from "@/i18n/routing";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchNews, fetchNewsArticle } from "@/lib/cms/news";
import {
  mockBlocks,
  mockPosts,
  mockSlugs,
  type MockBlock,
  type MockPost,
} from "./posts.mock";
import type {
  NewsArticle,
  NewsBlock,
  NewsKind,
  NewsPage,
  NewsPost,
} from "./types";

export * from "./types";

/*
 * Tin tức "Cuộc sống tại BFC" (CHỈ phía server). Nguồn: CMS (Tin tức) khi đặt CMS_API_URL, nếu không
 * thì 10 bài mẫu ở posts.mock.ts (cũng là dữ liệu ban đầu CMS nhập bằng `manage.py import_news`).
 * Lọc theo loại / phân trang làm ở đây trên toàn bộ danh sách (đã cache theo tag "cms").
 */

export const NEWS_PAGE_SIZE = 9;

const lang = (locale: string) => (locale === "en" ? "en" : "vi");

function mockPost(p: MockPost, locale: string): NewsPost {
  const t = p[lang(locale)];
  const slugs = mockSlugs(p);
  return {
    slug: slugs[lang(locale)],
    slugs,
    kind: p.kind,
    date: p.date,
    title: t.title,
    excerpt: t.excerpt,
    cover: p.cover,
  };
}

/** Khối song ngữ của bài mẫu -> khối UI ở một ngôn ngữ (ảnh không chú thích: alt = tiêu đề bài) */
function mockBlock(
  b: MockBlock,
  i: number,
  locale: string,
  title: string,
): NewsBlock {
  const l = lang(locale);
  const id = `${b.type}-${i}`;
  const img = (src: string, caption?: string) => ({
    src,
    alt: caption || title,
  });
  switch (b.type) {
    case "paragraph":
      return { id, type: "paragraph", html: b.html[l] };
    case "image":
      return {
        id,
        type: "image",
        image: img(b.image, b.caption?.[l]),
        caption: b.caption?.[l] ?? "",
        size: b.size,
      };
    case "gallery":
      return {
        id,
        type: "gallery",
        layout: b.layout,
        caption: b.caption?.[l] ?? "",
        images: b.images.map((g) => ({
          image: img(g.image, g.caption?.[l]),
          caption: g.caption?.[l] ?? "",
        })),
      };
    case "image_text":
      return {
        id,
        type: "image_text",
        image: img(b.image, b.heading?.[l]),
        imagePosition: b.imagePosition,
        heading: b.heading?.[l] ?? "",
        html: b.html[l],
      };
    case "quote":
      return {
        id,
        type: "quote",
        quote: b.quote[l],
        author: b.author ?? "",
        role: b.role?.[l] ?? "",
      };
    case "table":
      return {
        id,
        type: "table",
        columns: b.columns[l],
        rows: b.rows[l],
        caption: b.caption?.[l] ?? "",
      };
    case "button":
      return { id, type: "button", label: b.label[l], url: b.url };
  }
}

/** Mọi bài đang xuất bản, mới nhất trước */
export const getAllNews = cache(async (locale: string): Promise<NewsPost[]> => {
  if (cmsEnabled()) return fetchNews(locale);
  return [...mockPosts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => mockPost(p, locale));
});

export const getNewsPage = cache(
  async (
    locale: string,
    kind: NewsKind | null,
    page: number,
  ): Promise<NewsPage> => {
    const all = (await getAllNews(locale)).filter(
      (p) => !kind || p.kind === kind,
    );
    const pageCount = Math.max(1, Math.ceil(all.length / NEWS_PAGE_SIZE));
    const current = Math.min(Math.max(1, page), pageCount);
    const start = (current - 1) * NEWS_PAGE_SIZE;
    return {
      items: all.slice(start, start + NEWS_PAGE_SIZE),
      total: all.length,
      page: current,
      pageCount,
    };
  },
);

export const getLatestNews = cache(
  async (locale: string, count = 3, exclude?: string): Promise<NewsPost[]> =>
    (await getAllNews(locale))
      .filter((p) => p.slug !== exclude)
      .slice(0, count),
);

/** Slug của bài ở từng ngôn ngữ; ngôn ngữ chưa dịch dùng slug bản gốc (trang đó hiện bản gốc) */
export function newsSlugs(post: NewsPost): Record<string, string> {
  const own = post.slugs ?? {};
  const fallback = own[routing.defaultLocale] ?? post.slug;
  return Object.fromEntries(
    routing.locales.map((l) => [l, own[l] ?? fallback]),
  );
}

/**
 * Nội dung bài /news/<slug>; slug lạ thì undefined. Slug của bài đó ở ngôn ngữ khác (bấm đổi ngôn ngữ
 * trên trang bài, link cũ) vẫn trả bài ở ngôn ngữ đang xem, `slug` của kết quả khác slug hỏi: trang
 * chuyển hướng sang slug đúng.
 */
export const getNewsArticle = cache(
  async (slug: string, locale: string): Promise<NewsArticle | undefined> => {
    if (cmsEnabled())
      return (await fetchNewsArticle(slug, locale)) ?? undefined;
    const p =
      mockPosts.find((m) => mockSlugs(m)[lang(locale)] === slug) ??
      mockPosts.find((m) => Object.values(mockSlugs(m)).includes(slug));
    if (!p) return undefined;
    const post = mockPost(p, locale);
    return {
      ...post,
      blocks: mockBlocks(p).map((b, i) => mockBlock(b, i, locale, post.title)),
    };
  },
);
