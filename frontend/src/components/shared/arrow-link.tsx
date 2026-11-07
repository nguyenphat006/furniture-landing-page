import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type ArrowLinkProps = ComponentProps<typeof Link> & {
  tone?: "dark" | "light";
};

/*
 * Link gọn dạng "CHỮ  →" (làm lại 2026-11-05): chữ in hoa + icon mũi tên, không khung, không nền.
 * Chỉ dùng ở chỗ phụ, không cần nổi bật: "Xem thêm" trong thẻ (vd thẻ vật liệu).
 * CTA chính của section dùng ButtonLink (khung viền). Cùng ngôn ngữ với CardAction (bản span trên thẻ ảnh).
 * Hover: chữ chuyển forest (gold trên nền tối), mũi tên trượt phải.
 */
export function ArrowLink({
  tone = "dark",
  className,
  children,
  ...props
}: ArrowLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        "group/arrow inline-flex items-center gap-2 text-[13px] font-semibold tracking-[.14em] whitespace-nowrap uppercase hover:no-underline",
        "transition-colors duration-(--duration-base)",
        tone === "dark"
          ? "text-ink hover:text-forest"
          : "hover:text-gold text-white",
        className,
      )}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        strokeWidth={2.5}
        className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-hover/arrow:translate-x-1"
      />
    </Link>
  );
}
