/*
 * Thị trường xuất khẩu cho section Xuất khẩu trang chủ (2026-11-06).
 * File thường (không "use client") để cả server component và client component cùng import được.
 * (2026-11-07) Danh sách nước và vị trí cờ quản lý trong CMS (Trang chủ → block Xuất khẩu); chọn được
 * mọi nước có trong world-dots.ts (DESTINATIONS, sinh từ dotted-map). DEFAULT_MARKETS chỉ là bản mock
 * khi chưa có CMS và là nội dung ban đầu của lệnh import_pages.
 * Tên nước: messages HomePage.export.countries nếu có (tên ngắn quen dùng), còn lại Intl.DisplayNames.
 * Cờ: /public/flags/<iso2>.svg, bản vuông 1x1 lấy từ country-flag-icons 1.6.20 (MIT, xem flags/LICENSE.txt).
 * Màu nhấn theo khu vực chỉ để tô chấm nước + đường cung cho phong phú (chỉ dùng trong section này,
 * không phải token chung).
 */
import { REGIONS } from "./world-dots";

/** Nước đã tính sẵn để vẽ: toạ độ chấm và vị trí badge, đều tính % theo khung bản đồ */
export type ExportCountry = {
  code: string;
  iso2: string;
  name: string;
  color: string;
  label: [number, number];
  side: LabelSide;
};

/** Badge nằm bên trái (L, mép phải badge chạm điểm neo), bên phải (R) hoặc canh giữa (C) điểm neo */
export type LabelSide = "L" | "R" | "C";

/** Một nước trên bản đồ: label là điểm neo badge (đơn vị bản đồ), null = ngay tại nước */
export type ExportMarket = {
  code: string;
  label: [number, number] | null;
  side: LabelSide;
};

const REGION_COLOR: Record<string, string> = {
  europe: "#f2c230",
  northAmerica: "#ff8a65",
  southAmerica: "#ff8fc7",
  asia: "#6fd0f5",
  middleEast: "#5eead4",
  africa: "#ffd27a",
  oceania: "#c3a6ff",
};

export const colorOf = (code: string) =>
  REGION_COLOR[REGIONS[code] ?? "europe"] ?? REGION_COLOR.europe;

/** Thị trường ban đầu (2026-11-06, theo người dùng): Mỹ, Úc, Anh, Tây Ban Nha, Hà Lan, Trung Quốc, Nhật Bản, Hàn Quốc */
export const DEFAULT_MARKETS: ExportMarket[] = [
  { code: "GBR", label: [61, 20], side: "L" },
  { code: "ESP", label: [61, 33], side: "L" },
  { code: "NLD", label: [71, 15], side: "C" },
  { code: "USA", label: [28, 36], side: "L" },
  { code: "CHN", label: [110, 23], side: "C" },
  { code: "JPN", label: [130, 30], side: "R" },
  { code: "KOR", label: [119, 23], side: "C" },
  { code: "AUS", label: [135, 57], side: "C" },
];
