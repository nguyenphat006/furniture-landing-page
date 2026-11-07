import type { CategorySlug } from "./taxonomy";

/** Ảnh bìa nhóm, dùng cho ô bento trang chủ và đầu trang nhóm */
export const categoryCovers: Record<CategorySlug, string> = {
  "sunloungers-daybeds": "Slideshow_Wicker_5.jpg",
  "sofas-sectionals": "Slideshow_Rope_4.jpg",
  dining: "Slideshow_Teak_1.png",
  // Ảnh hiện tại là thợ đan, cần ảnh ghế lounge thật
  "lounge-chairs": "Slideshow_Wicker_4.jpg",
  tables: "Slideshow_Alu_4.jpg",
  // Ảnh showroom tạm, cần ảnh phụ kiện thật
  accessories: "Slideshow_1_9.jpg",
};
