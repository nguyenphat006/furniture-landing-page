import type { CodedSection } from "@/features/home/page-content";
import type { PageSeo } from "@/lib/seo";
import type { ExportMarket } from "@/features/home/export-markets";

/*
 * Nội dung trang (Trang chủ...) dùng chung cho UI, nguồn CMS (apps/pages) hoặc mock từ messages.
 * Thân trang là danh sách block theo thứ tự admin sắp; section dùng chung đã được CMS thay bằng
 * block bên trong nên UI không phân biệt. Chuỗi rỗng ở nhãn nút = dùng nhãn mặc định trong messages.
 * Ảnh là URL CMS hoặc đường dẫn trong public (/Assets/...).
 */

export type HeroContent = {
  slides: string[];
  /** Xuống dòng = ngắt dòng ở màn hình lớn */
  title: string;
  lede: string;
  buttonLabel: string;
};

export type IntroContent = {
  /** Tiêu đề ẩn (sr-only) */
  heading: string;
  quote: string;
  body: string;
  buttonLabel: string;
};

export type ExportContent = {
  kicker: string;
  title: string;
  /** Nước tô trên bản đồ (mã ISO3) và vị trí cờ */
  markets: ExportMarket[];
  stats: { value: string; label: string }[];
};

export type FactoryContent = {
  kicker: string;
  title: string;
  lede: string;
  image: string | null;
  detailImage: string | null;
  points: string[];
  buttonLabel: string;
};

export type CtaContent = {
  kicker: string;
  title: string;
  image: string | null;
  quoteLabel: string;
  visitLabel: string;
};

export type PageBlock =
  | { id: string; type: "hero"; value: HeroContent }
  | { id: string; type: "intro"; value: IntroContent }
  | { id: string; type: "export"; value: ExportContent }
  | { id: string; type: "factory"; value: FactoryContent }
  | { id: string; type: "cta"; value: CtaContent }
  | { id: string; type: "section"; value: { section: CodedSection } };

/** Một mục của trang pháp lý: html là rich text từ CMS, text là bản chữ thuần (mô tả SEO) */
export type LegalSection = {
  id: string;
  heading: string;
  html: string;
  text: string;
};

export type LegalPage = {
  title: string;
  isFallback: boolean;
  /** Ngày cập nhật dạng YYYY-MM-DD, null = không hiện */
  updatedOn: string | null;
  seo: PageSeo & { ogImage: string | null };
  sections: LegalSection[];
};

export type ContentPage = {
  title: string;
  /** Chưa có bản dịch: đang hiện bản tiếng Việt, gắn noindex (docs/adr/0003 phía backend) */
  isFallback: boolean;
  seo: PageSeo & { ogImage: string | null };
  blocks: PageBlock[];
};
