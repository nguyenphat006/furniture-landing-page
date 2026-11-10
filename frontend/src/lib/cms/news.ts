import "server-only";
import type {
  NewsArticle,
  NewsBlock,
  NewsImage,
  NewsPost,
} from "@/data/news/types";
import { cmsGet, cmsGetAll } from "./client";
import { previewContent } from "./preview";
import type { components } from "./schema";

/*
 * Tin tức từ CMS (GET /news, /news/<slug>), đổi sang kiểu của UI. Danh sách lấy hết một lần (cache
 * theo tag "cms") rồi lọc / phân trang trong Next: số bài ít, mọi trang (trang chủ, /news, Tin khác,
 * sitemap, tìm kiếm) dùng chung một lần gọi.
 */

type Schemas = components["schemas"];
type ApiNewsItem = Schemas["NewsList"];
type ApiNewsDetail = Schemas["NewsDetail"];
type ApiBlock = Schemas["NewsBlock"];
type ApiImage = Schemas["ImageData"];

const image = (i: ApiImage): NewsImage => ({
  src: i.url,
  width: i.width,
  height: i.height,
  alt: i.alt,
});

/** Khối CMS -> khối UI; khối thiếu ảnh / tệp (đã xoá khỏi thư viện) thì bỏ */
function block(b: ApiBlock): NewsBlock | null {
  const id = b.id;
  switch (b.type) {
    case "paragraph":
      return { id, type: "paragraph", html: b.value.html };
    case "image":
      return b.value.image
        ? { id, type: "image", ...b.value, image: image(b.value.image) }
        : null;
    case "gallery":
      return {
        id,
        type: "gallery",
        layout: b.value.layout,
        caption: b.value.caption,
        images: b.value.images.map((g) => ({
          image: image(g.image),
          caption: g.caption,
        })),
      };
    case "video":
      return {
        id,
        type: "video",
        provider: b.value.provider,
        videoId: b.value.video_id,
        src: b.value.src,
        poster: b.value.poster ? image(b.value.poster) : null,
        caption: b.value.caption,
        size: b.value.size,
      };
    case "image_text":
      return b.value.image
        ? {
            id,
            type: "image_text",
            image: image(b.value.image),
            imagePosition: b.value.image_position,
            heading: b.value.heading,
            html: b.value.html,
          }
        : null;
    case "quote":
      return { id, type: "quote", ...b.value };
    case "table":
      return { id, type: "table", ...b.value };
    case "button":
      return { id, type: "button", ...b.value };
    case "file":
      return b.value.file
        ? { id, type: "file", label: b.value.label, file: b.value.file }
        : null;
    default:
      return null;
  }
}

function post(p: ApiNewsItem): NewsPost {
  return {
    slug: p.slug,
    kind: p.kind,
    date: p.date,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.cover?.url ?? "",
    isFallback: p.is_fallback,
    noindex: p.noindex,
    updated: p.updated ?? undefined,
    slugs: p.slugs,
  };
}

/** Bài đang xuất bản, mới nhất trước */
export async function fetchNews(locale: string): Promise<NewsPost[]> {
  return (await cmsGetAll<ApiNewsItem>("news", { locale })).map(post);
}

export async function fetchNewsArticle(
  slug: string,
  locale: string,
): Promise<NewsArticle | null> {
  // Admin đang xem trước bài này: dùng bản đang sửa
  const p =
    (await previewContent<ApiNewsDetail>("news", slug, locale)) ??
    (await cmsGet<ApiNewsDetail>(`news/${encodeURIComponent(slug)}`, {
      locale,
    }));
  if (!p) return null;
  return {
    ...post(p),
    blocks: p.body.map(block).filter((b): b is NewsBlock => b !== null),
    seo: p.seo,
  };
}
