import type { PageSeo } from "@/lib/seo";

export const newsKinds = ["news", "notice"] as const;
/** Tin tức hoặc Thông báo */
export type NewsKind = (typeof newsKinds)[number];

export type NewsPost = {
  slug: string;
  kind: NewsKind;
  /** Ngày đăng yyyy-mm-dd */
  date: string;
  title: string;
  excerpt: string;
  /** Ảnh bìa (đường dẫn /Assets/... hoặc URL ảnh CMS); rỗng khi chưa có ảnh */
  cover: string;
  /** Chưa có bản dịch ở ngôn ngữ đang xem, đây là bản gốc tiếng Việt (trang tự noindex) */
  isFallback?: boolean;
  /** Admin bật "ẩn khỏi Google" */
  noindex?: boolean;
  /** Lần xuất bản gần nhất (lastmod sitemap) */
  updated?: string;
  /** Slug của bản đang xuất bản theo từng ngôn ngữ (mỗi ngôn ngữ một slug; thiếu = chưa dịch) */
  slugs?: Partial<Record<string, string>>;
};

/** Ảnh trong bài: URL ảnh CMS (kèm kích thước) hoặc /Assets/... của bài mẫu (không kích thước) */
export type NewsImage = {
  src: string;
  width?: number;
  height?: number;
  alt: string;
};

export type NewsSize = "text" | "wide";

/** Khối nội dung bài (giống khối CMS apps/news/blocks.py); HTML đã qua trình soạn thảo CMS */
export type NewsBlock = { id: string } & (
  | { type: "paragraph"; html: string }
  | { type: "image"; image: NewsImage; caption: string; size: NewsSize }
  | {
      type: "gallery";
      layout: "grid-2" | "grid-3" | "slider";
      images: { image: NewsImage; caption: string }[];
      caption: string;
    }
  | {
      type: "video";
      provider: "youtube" | "vimeo" | "file";
      /** Mã video YouTube / Vimeo (rỗng với tệp) */
      videoId: string;
      /** Link nhúng iframe (YouTube / Vimeo) hoặc link tệp MP4 / WebM */
      src: string;
      poster: NewsImage | null;
      caption: string;
      size: NewsSize;
    }
  | {
      type: "image_text";
      image: NewsImage;
      imagePosition: "left" | "right";
      heading: string;
      html: string;
    }
  | { type: "quote"; quote: string; author: string; role: string }
  | { type: "table"; columns: string[]; rows: string[][]; caption: string }
  | { type: "button"; label: string; url: string }
  | {
      type: "file";
      label: string;
      file: { url: string; title: string; extension: string; size: number };
    }
);

export type NewsArticle = NewsPost & {
  /** Nội dung bài theo khối */
  blocks: NewsBlock[];
  /** SEO riêng nhập trong CMS; chuỗi rỗng = tự tạo từ tiêu đề, tóm tắt */
  seo?: PageSeo;
};

export type NewsPage = {
  items: NewsPost[];
  total: number;
  page: number;
  pageCount: number;
};
