"use client";

import Image from "next/image";
import { useSite } from "@/components/providers/site-provider";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** dark = chữ tối trên nền sáng · light = chữ trắng trên nền tối */
  tone?: "dark" | "light";
  /** Cỡ thu gọn cho header khi đã cuộn (logo 52px, desktop 64px; chữ 18px) */
  compact?: boolean;
  /** Cỡ lớn trên desktop (xl+): logo 104px (mobile 60px), dùng cho header ở đầu trang trên hero */
  large?: boolean;
  /** Đặt logo trên đĩa tròn trắng có bóng mờ, để logo màu đọc rõ khi nằm trên ảnh */
  badge?: boolean;
  className?: string;
};

/** Lockup thương hiệu: logo tròn chữ B (bản không nền) + khối chữ ngang bên cạnh. Logo, tên, dòng dưới tên lấy từ CMS */
export function BrandLogo({
  tone = "dark",
  compact = false,
  large = false,
  badge = false,
  className,
}: BrandLogoProps) {
  const site = useSite();
  return (
    <span className={cn("inline-flex items-center gap-3.5", className)}>
      <Image
        src={tone === "light" ? site.logoOnDark : site.logo}
        alt={site.name}
        width={240}
        height={240}
        className={cn(
          "ease-out-soft rounded-full object-contain transition-[width,height,background-color,box-shadow] duration-(--duration-slow)",
          badge && "bg-white shadow-[0_6px_24px_rgba(0,0,0,.28)]",
          compact
            ? "size-[52px] xl:size-16"
            : large
              ? "size-[60px] xl:size-[104px]"
              : "size-[52px]",
        )}
      />
      <span className="leading-none">
        <span
          className={cn(
            "ease-out-soft block font-bold tracking-[.03em] transition-[font-size] duration-(--duration-slow)",
            compact ? "text-lg" : "text-[22px]",
            tone === "dark" ? "text-ink" : "text-white",
          )}
        >
          {site.name}
        </span>
        <span
          className={cn(
            "mt-[5px] block text-[11px] font-medium tracking-[.1em] uppercase",
            tone === "dark" ? "text-ink-mute" : "text-white/60",
          )}
        >
          {site.tagline}
        </span>
      </span>
    </span>
  );
}
