import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  /** "light" khi đặt trên ảnh hoặc nền tối */
  tone?: "dark" | "light";
};

/*
 * Nút viền dùng cho CTA chính trong nội dung (2026-11-04), cùng ngôn ngữ với CardAction trên thẻ:
 * khung 1px, chữ in hoa giãn chữ, mũi tên đậm bên phải.
 * Hover: lấp nền (ink trên nền sáng, trắng trên nền tối), mũi tên trượt sang phải.
 * (2026-11-05) Là kiểu nút DUY NHẤT cho CTA trên toàn site (LineLink thôi dùng). Cỡ chữ 14px medium theo
 * nút "Xem thêm" trang Vật liệu người dùng đã chỉnh; nơi dùng không ghi đè cỡ/độ đậm chữ.
 */
/** Bộ class của nút; dùng cho cả <button> cần cùng kiểu (vd nút "Thử lại" ở trang lỗi) */
export function buttonLinkClass(tone: "dark" | "light" = "dark") {
  return cn(
    "group/btn inline-flex h-12 items-center gap-3 border px-7 text-sm font-medium tracking-[.14em] whitespace-nowrap uppercase hover:no-underline",
    "ease-out-soft transition-colors duration-(--duration-base)",
    tone === "light"
      ? "hover:text-ink focus-visible:text-ink border-white text-white hover:bg-white focus-visible:bg-white"
      : "border-ink text-ink hover:bg-ink focus-visible:bg-ink hover:text-white focus-visible:text-white",
  );
}

/** Mũi tên của nút, trượt sang phải khi hover */
export function ButtonArrow() {
  return (
    <ArrowRight
      aria-hidden="true"
      strokeWidth={2.5}
      className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-hover/btn:translate-x-1"
    />
  );
}

export function ButtonLink({
  tone = "dark",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link {...props} className={cn(buttonLinkClass(tone), className)}>
      {children}
      <ButtonArrow />
    </Link>
  );
}
