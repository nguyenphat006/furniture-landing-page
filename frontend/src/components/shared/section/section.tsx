import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * Khung chung của mọi section (2026-11-04). Một section = <Section> + <Container>
 * + <SectionHeading> + nội dung. Sửa nhịp khoảng cách hay độ rộng ở đây là đổi toàn site.
 */

export type SectionTone = "light" | "stone" | "forest" | "brand" | "dark";

const toneClass: Record<SectionTone, string> = {
  light: "bg-white text-ink",
  /** Vật liệu, tài liệu */
  stone: "bg-surface-stone text-ink",
  /** Chứng nhận, quy trình */
  forest: "bg-surface-forest text-ink",
  /** Khối nhấn màu thương hiệu: nền forest đậm, chữ trắng (intro trang chủ) */
  brand: "bg-forest text-white",
  dark: "bg-ink text-white",
};

const spacingClass = {
  /** Mặc định: 80px trên mobile, 112px trên màn lớn */
  default: "py-section",
  /** Dải có nền màu, nhịp ngắn hơn: 48 → 96px */
  band: "py-band",
  none: "",
} as const;

type SectionProps = ComponentProps<"section"> & {
  tone?: SectionTone;
  spacing?: keyof typeof spacingClass;
};

export function Section({
  tone = "light",
  spacing = "default",
  className,
  ...props
}: SectionProps) {
  return (
    <section
      {...props}
      className={cn(
        // chừa chỗ cho header sticky khi nhảy tới anchor
        "scroll-mt-[72px]",
        toneClass[tone],
        spacingClass[spacing],
        className,
      )}
    />
  );
}

const sizeClass = {
  /**
   * Container chung của toàn site (2026-11-04, học Gloster): header, hero, mọi section, footer
   * đều bám một trục trái. Lề = gutter, nội dung tối đa 1640px (tổng 1800px như Gloster).
   */
  wide: "max-w-[calc(var(--container-content)+var(--spacing-gutter)*2)]",
  /** Ngoại lệ cho section đặc biệt cần cột đọc hẹp, căn giữa (vd. giới thiệu trang chủ): 1100px */
  default: "max-w-[calc(1100px+var(--spacing-gutter)*2)]",
  /** Văn bản thuần: khoảng 8/12 cột */
  narrow: "max-w-[calc(760px+var(--spacing-gutter)*2)]",
} as const;

type ContainerProps = ComponentProps<"div"> & {
  size?: keyof typeof sizeClass;
};

export function Container({
  size = "wide",
  className,
  ...props
}: ContainerProps) {
  return (
    <div
      {...props}
      className={cn("px-gutter mx-auto w-full", sizeClass[size], className)}
    />
  );
}
