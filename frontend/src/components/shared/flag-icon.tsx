import {
  AE,
  AU,
  BE,
  BR,
  CA,
  CN,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  ID,
  IN,
  IT,
  JP,
  KR,
  MX,
  MY,
  NL,
  NO,
  PL,
  PT,
  RU,
  SA,
  SE,
  TH,
  TR,
  TW,
  US,
  VN,
  type FlagComponent,
} from "country-flag-icons/react/3x2";
import type { FlagCode } from "@/config/languages";
import { cn } from "@/lib/utils";

/*
 * Cờ quốc gia SVG cho nút đổi ngôn ngữ (2026-11-10), thư viện country-flag-icons (tỉ lệ 3:2).
 * Chỉ import các cờ chọn được trong CMS để không kéo cả bộ ~250 cờ vào bundle.
 */
const FLAGS: Record<FlagCode, FlagComponent> = {
  VN,
  GB,
  US,
  AU,
  CA,
  DE,
  FR,
  ES,
  IT,
  NL,
  BE,
  PT,
  BR,
  MX,
  SE,
  DK,
  NO,
  FI,
  PL,
  RU,
  TR,
  SA,
  AE,
  IN,
  CN,
  TW,
  JP,
  KR,
  TH,
  ID,
  MY,
};

/** Cờ trang trí cạnh tên ngôn ngữ (aria-hidden); chưa có cờ thì không hiện gì */
export function FlagIcon({
  code,
  className,
}: {
  code: FlagCode | null;
  className?: string;
}) {
  const Flag = code ? FLAGS[code] : null;
  if (!Flag) return null;
  return (
    <Flag
      aria-hidden="true"
      focusable="false"
      // Viền mờ để cờ nền trắng (Nhật, Phần Lan...) vẫn rõ trên nền trắng
      className={cn(
        "h-[14px] w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,.12)]",
        className,
      )}
    />
  );
}
