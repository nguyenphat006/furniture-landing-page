/*
 * Manifest ảnh thật trong public/Assets — SINH TỰ ĐỘNG từ nội dung thư mục.
 * Key = tên file (chữ thường, bỏ đuôi). Khi thêm/xoá ảnh trong Assets thì cập nhật lại.
 */

export const assetMap: Record<string, string> = {
  company_gate: "/Assets/Company_Gate.png",
  landing: "/Assets/Landing.jpg",
  material_ceramic: "/Assets/Material_Ceramic.jpg",
  material_fabric: "/Assets/Material_Fabric.jpg",
  material_glass: "/Assets/Material_Glass.jpg",
  material_steel: "/Assets/Material_Steel.jpg",
  slideshow_1_1: "/Assets/Slideshow_1_1.png",
  slideshow_1_10: "/Assets/Slideshow_1_10.jpg",
  slideshow_1_2: "/Assets/Slideshow_1_2.png",
  slideshow_1_3: "/Assets/Slideshow_1_3.jpg",
  slideshow_1_4_2: "/Assets/Slideshow_1_4_2.jpg",
  slideshow_1_6: "/Assets/Slideshow_1_6.jpg",
  slideshow_1_7: "/Assets/Slideshow_1_7.jpg",
  slideshow_1_8: "/Assets/Slideshow_1_8.jpg",
  slideshow_1_9: "/Assets/Slideshow_1_9.jpg",
  slideshow_alu_1: "/Assets/Slideshow_Alu_1.png",
  slideshow_alu_2: "/Assets/Slideshow_Alu_2.png",
  slideshow_alu_3: "/Assets/Slideshow_Alu_3.JPG",
  slideshow_alu_4: "/Assets/Slideshow_Alu_4.jpg",
  slideshow_alu_5: "/Assets/Slideshow_Alu_5.jpg",
  slideshow_alu_6: "/Assets/Slideshow_Alu_6.jpg",
  slideshow_alu_7: "/Assets/Slideshow_Alu_7.jpg",
  slideshow_alu_8: "/Assets/Slideshow_Alu_8.JPG",
  slideshow_rope_1: "/Assets/Slideshow_Rope_1.png",
  slideshow_rope_2: "/Assets/Slideshow_Rope_2.jpg",
  slideshow_rope_3: "/Assets/Slideshow_Rope_3.jpg",
  slideshow_rope_4: "/Assets/Slideshow_Rope_4.jpg",
  slideshow_rope_5: "/Assets/Slideshow_Rope_5.jpg",
  slideshow_teak_1: "/Assets/Slideshow_Teak_1.png",
  slideshow_teak_2: "/Assets/Slideshow_Teak_2.jpg",
  slideshow_teak_3: "/Assets/Slideshow_Teak_3.jpg",
  slideshow_teak_4: "/Assets/Slideshow_Teak_4.JPG",
  slideshow_teak_5: "/Assets/Slideshow_Teak_5.JPG",
  slideshow_teak_6: "/Assets/Slideshow_Teak_6.png",
  slideshow_teak_7: "/Assets/Slideshow_Teak_7.JPG",
  slideshow_teak_8: "/Assets/Slideshow_Teak_8.JPG",
  slideshow_wicker_1: "/Assets/Slideshow_Wicker_1.png",
  slideshow_wicker_2: "/Assets/Slideshow_Wicker_2.png",
  slideshow_wicker_3: "/Assets/Slideshow_Wicker_3.png",
  slideshow_wicker_4: "/Assets/Slideshow_Wicker_4.jpg",
  slideshow_wicker_5: "/Assets/Slideshow_Wicker_5.jpg",
};

/**
 * Tìm đường dẫn ảnh thật từ nhãn placeholder (dòng đầu là tên file,
 * có thể kèm tiền tố "Assets/" và có/không đuôi mở rộng).
 * Trả về null nếu chưa có ảnh — component sẽ hiện khối kẻ sọc như cũ.
 */
export function resolveAsset(label?: string): string | null {
  if (!label) return null;
  const first = label.split("\n")[0].trim();
  const base = first
    .split("/")
    .pop()!
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .toLowerCase();
  // URL ảnh từ CMS và đường dẫn tuyệt đối trong public (vd /products/<slug>.webp) dùng thẳng
  if (/^https?:\/\//.test(first) || first.startsWith("/")) return first;
  return assetMap[base] ?? null;
}
