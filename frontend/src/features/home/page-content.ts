/*
 * Bố cục và ảnh mặc định của trang chủ khi chưa có CMS (mock), đồng thời là nguồn để
 * backend/scripts/export_frontend_mock.mjs sinh dữ liệu ban đầu cho CMS (apps/pages, `import_pages`).
 * Có CMS thì thứ tự section, chữ và ảnh do admin quyết định (Trang → Trang chủ).
 */

/** Ảnh hero: bãi container, hoàn thiện gỗ, hàn nhôm, showroom */
export const heroSlides = [
  "/Assets/Landing.jpg",
  "/Assets/Slideshow_1_3.jpg",
  "/Assets/Slideshow_1_6.jpg",
  "/Assets/Slideshow_1_8.jpg",
];

/** Ảnh nền chìm của dải CTA */
export const ctaImage = "/Assets/Slideshow_1_2.png";

/** Ảnh section Nhà máy: ảnh lớn tràn mép trái, ảnh chi tiết dọc đè góc */
export const factoryImages = {
  image: "/Assets/Slideshow_1_6.jpg",
  detail: "/Assets/Slideshow_Rope_2.jpg",
};

/** Điểm nổi bật section Nhà máy (khoá trong messages HomePage.factory.chips) */
export const factoryPoints = ["since", "oem", "visit"] as const;

/**
 * Section lấy nội dung từ catalog (chữ tiêu đề trong messages), khớp CODED_SECTIONS phía backend.
 * Admin chỉ đặt vị trí; nội dung sửa ở Sản phẩm → Nhóm / Chất liệu.
 */
export const codedSections = ["products", "materials"] as const;
export type CodedSection = (typeof codedSections)[number];

/** Thứ tự section trang chủ (2026-11-06) */
export const homeLayout = [
  "hero",
  "intro",
  "products",
  "materials",
  "export",
  "factory",
  "cta",
] as const;
