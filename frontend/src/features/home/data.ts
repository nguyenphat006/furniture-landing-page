import type { HatchTone } from "@/components/shared/image-placeholder";
import type { MaterialSlug } from "@/config/navigation";

/*
 * Dữ liệu cấu trúc của trang chủ (theo mockup "BINH BFC Homepage" trên Claude Design).
 * Nhãn "NULL" và các chuỗi img là placeholder có chủ đích — đánh dấu dữ liệu/ảnh
 * đang chờ khách hàng xác nhận, sẽ thay khi có nội dung thật.
 */

// Nhóm sản phẩm, ảnh bìa và chất liệu: xem src/data/catalog (2026-11-04)

/** (Không còn dùng từ 2026-11-04, layout cũ của section Sản phẩm) 3 cột masonry: mỗi cột lệch xuống một khoảng khác nhau (chỉ áp dụng desktop) */
export const productColumns: { offset: string; items: number[] }[] = [
  { offset: "0px", items: [0, 3] },
  { offset: "96px", items: [1, 4] },
  { offset: "40px", items: [2, 5] },
];

export type Workshop = { key: string; img: string };

export const workshops: Workshop[] = [
  { key: "woodworking", img: "Slideshow_Teak_4.JPG" },
  { key: "aluminum", img: "Slideshow_Alu_5.jpg" },
  { key: "weaving", img: "Slideshow_Rope_2.jpg" },
  { key: "powderCoating", img: "Slideshow_Alu_3.JPG" },
  // Ảnh xưởng may nệm chưa có — tạm dùng ảnh nhà máy tổng hợp
  {
    key: "upholstery",
    img: "Slideshow_1_10.jpg\nstand-in - upholstery photo pending",
  },
  { key: "packing", img: "Slideshow_1_7.jpg" },
];

export type MaterialBand = {
  slug: MaterialSlug;
  bg: string;
  tone: HatchTone;
  shots: string[];
  /** true → carousel bên trái, chữ bên phải */
  reversed: boolean;
  /** true → nội dung đang chờ xác nhận (NULL), không render nút carousel */
  pending?: boolean;
};

export const materialBands: MaterialBand[] = [
  {
    slug: "wood",
    bg: "#F7F7F7",
    tone: { base: "#ffffff", stripeA: "#ededed", stripeB: "#f8f8f8" },
    shots: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Slideshow_Teak_${i}\n3:4`),
    reversed: false,
  },
  {
    slug: "aluminum",
    bg: "#C9CED6",
    tone: { base: "#dfe3e8", stripeA: "#d5dae1", stripeB: "#e4e8ec" },
    shots: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Slideshow_Alu_${i}\n3:4`),
    reversed: true,
  },
  {
    slug: "rope",
    bg: "#F5EEE6",
    tone: { base: "#efe6db", stripeA: "#e8ded1", stripeB: "#f2ebe2" },
    shots: [1, 2, 3, 4, 5].map((i) => `Slideshow_Rope_${i}\n3:4`),
    reversed: false,
  },
  {
    slug: "wicker",
    bg: "#E6E7E6",
    tone: { base: "#dfe0df", stripeA: "#d7d9d7", stripeB: "#e6e7e6" },
    shots: [1, 2, 3, 4, 5].map((i) => `Slideshow_Wicker_${i}\n3:4`),
    reversed: true,
  },
  {
    slug: "steel",
    bg: "#DDE0E3",
    tone: { base: "#d3d7da", stripeA: "#cbcfd3", stripeB: "#dadde0" },
    // Ảnh thép chưa có — tạm dùng ảnh xưởng nhôm (cùng chất kim loại)
    shots: [1, 2, 8].map(
      (i) => `Slideshow_Alu_${i}\nstand-in - steel photo pending · 3:4`,
    ),
    reversed: false,
    pending: true,
  },
];

export const processSteps = [
  { key: "step1", hasLead: false },
  { key: "step2", hasLead: true },
  { key: "step3", hasLead: true },
  { key: "step4", hasLead: false },
  { key: "step5", hasLead: true },
  { key: "step6", hasLead: false },
] as const;

export const projectFilters = [
  "all",
  "resorts",
  "hotels",
  "residential",
  "restaurants",
] as const;

export type ProjectFilter = (typeof projectFilters)[number];

/**
 * 6 dự án MẪU (2026-11-04): tên, địa điểm, năm và số lượng là dữ liệu BỊA để dựng giao diện,
 * không phải dự án thật của BFC. Phải thay bằng dự án thật trước khi lên production.
 * Ảnh chưa có: nhãn trỏ tới file chưa tồn tại nên ImagePlaceholder hiện nền kẻ sọc.
 */
export const projectPlaceholders = [
  {
    slug: "costa-serena-resort",
    name: "Costa Serena Resort",
    city: "Amalfi",
    country: "it",
    year: 2025,
    items: 420,
    type: "resorts",
  },
  {
    slug: "hotel-mar-azul",
    name: "Hotel Mar Azul",
    city: "Mallorca",
    country: "es",
    year: 2024,
    items: 310,
    type: "hotels",
  },
  {
    slug: "domaine-des-oliviers",
    name: "Domaine des Oliviers",
    city: "Provence",
    country: "fr",
    year: 2024,
    items: 180,
    type: "residential",
  },
  {
    slug: "aegean-blue-suites",
    name: "Aegean Blue Suites",
    city: "Santorini",
    country: "gr",
    year: 2023,
    items: 260,
    type: "hotels",
  },
  {
    slug: "quinta-do-rio-beach-club",
    name: "Quinta do Rio Beach Club",
    city: "Algarve",
    country: "pt",
    year: 2023,
    items: 150,
    type: "restaurants",
  },
  {
    slug: "seehof-lakeside-hotel",
    name: "Seehof Lakeside Hotel",
    city: "Bavaria",
    country: "de",
    year: 2022,
    items: 220,
    type: "hotels",
  },
].map((p) => ({
  ...p,
  type: p.type as Exclude<ProjectFilter, "all">,
  img: `project-${p.slug}.jpg\n16:10 · project photo`,
}));

export const certifications = [
  { name: "FSC", pending: false },
  { name: "NULL", pending: true },
  { name: "NULL", pending: true },
  { name: "NULL", pending: true },
] as const;

/** Các anchor cho thanh chấm điều hướng bên phải */
export const sectionAnchors = [
  "top",
  "intro",
  // Tạm ẩn khỏi trang chủ (2026-11-04): "stats" (dải số liệu); chuyển sang trang riêng: "about", "capabilities", "materials", "process"
  "products",
  // "projects" tạm ẩn (2026-11-05), thay bằng carousel vật liệu
  "materials",
  "factory",
  "contact",
] as const;
