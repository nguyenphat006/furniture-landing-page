import type { MaterialSlug } from "@/data/catalog";

/*
 * Ảnh cho trang Vật liệu và trang chi tiết /materials/<slug> (2026-11-05).
 * Từ 2026-11-07 nội dung vật liệu đọc từ CMS (data/catalog/materials.ts). File này chỉ còn là mock khi chưa
 * nối CMS, nguồn cho import_mock, và tên file hiện trong khung kẻ sọc khi ảnh CMS còn trống.
 *   img    ảnh đại diện: thumbnail (trang Vật liệu, trang chủ, trang sản phẩm) + ảnh trên cùng trang chi tiết
 *   detail ảnh cận bề mặt: ảnh dọc ở mục Đặc tính (khác ảnh đại diện, 2026-11-07)
 *   use   ảnh sản phẩm / ứng dụng: ảnh ngang ở mục Đặc tính
 *   craft ảnh xưởng / gia công: ảnh lớn ở mục Gia công tại BFC
 * Ảnh BFC tạm lấy từ slideshow nhà máy. Ảnh cận tạm từ thư viện mở (đã tải về public/Assets,
 * cắt vuông 1200px), thay khi có ảnh BFC chụp:
 *   steel    Material_Steel    ambientCG Metal009 (CC0)
 *   fabric   Material_Fabric   ambientCG Fabric066 (CC0)
 *   ceramic  Material_Ceramic  ambientCG Marble012 (CC0), vân đá như mặt gốm
 *   glass    Material_Glass    Wikimedia Commons "Opaque glass.jpg" (Public domain)
 * Tên file chưa có trong Assets (vd Material_Glass_Use.jpg) hiện khung kẻ sọc chờ ảnh.
 * Thứ tự theo materialSlugs (khớp menu Vật liệu, link /materials#<slug>).
 */

export type MaterialCard = {
  slug: MaterialSlug;
  img: string;
  detail: string;
  use: string;
  craft: string;
};

export const materialCards: MaterialCard[] = [
  {
    slug: "wood",
    img: "Slideshow_Teak_6.png",
    detail: "Slideshow_Teak_1.png",
    use: "Slideshow_1_10.jpg",
    craft: "Slideshow_Teak_5.JPG",
  },
  {
    slug: "aluminum",
    img: "Slideshow_Alu_1.png",
    detail: "Slideshow_Teak_3.jpg",
    use: "Slideshow_1_4_2.jpg",
    craft: "Slideshow_Alu_2.png",
  },
  {
    slug: "rope",
    img: "Slideshow_Rope_3.jpg",
    detail: "Slideshow_Rope_4.jpg",
    use: "Slideshow_Rope_1.png",
    craft: "Slideshow_Rope_2.jpg",
  },
  {
    slug: "wicker",
    img: "Slideshow_Wicker_3.png",
    detail: "Slideshow_Wicker_1.png",
    use: "Slideshow_Wicker_5.jpg",
    craft: "Slideshow_Wicker_2.png",
  },
  {
    slug: "steel",
    img: "Material_Steel.jpg",
    detail: "Material_Steel_Detail.jpg",
    use: "Material_Steel_Use.jpg",
    // Hàn laser chi tiết kim loại, tạm dùng tới khi có ảnh xưởng thép
    craft: "Slideshow_1_6.jpg",
  },
  {
    slug: "fabric",
    img: "Material_Fabric.jpg",
    detail: "Material_Fabric_Detail.jpg",
    use: "Slideshow_1_4_2.jpg",
    craft: "Material_Fabric_Craft.jpg",
  },
  {
    slug: "glass",
    img: "Material_Glass.jpg",
    detail: "Material_Glass_Detail.jpg",
    use: "Material_Glass_Use.jpg",
    craft: "Material_Glass_Craft.jpg",
  },
  {
    slug: "ceramic",
    img: "Material_Ceramic.jpg",
    detail: "Material_Ceramic_Detail.jpg",
    use: "Slideshow_1_9.jpg",
    craft: "Slideshow_Alu_4.jpg",
  },
];

export function getMaterialCard(slug: string): MaterialCard | undefined {
  return materialCards.find((m) => m.slug === slug);
}
