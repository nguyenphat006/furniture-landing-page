/** Một gợi ý trong ô tìm nhanh (GET /api/search). href chưa có tiền tố ngôn ngữ (Link của next-intl tự thêm) */
export type Suggestion = {
  group: "products" | "categories" | "materials" | "news" | "pages";
  title: string;
  /** Dòng phụ: mã mẫu · loại, nhóm của loại... rỗng = không hiện */
  sub: string;
  href: string;
  image: string | null;
};

export type SuggestResponse = { q: string; total: number; items: Suggestion[] };

/** Sự kiện mở ô tìm nhanh (nút trên header, nút nổi Tìm kiếm) */
export const OPEN_SEARCH_EVENT = "bfc:open-search";
