import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type LineLinkProps = ComponentProps<typeof Link> & {
  /** "light" khi đặt trên ảnh hoặc nền tối */
  tone?: "dark" | "light";
};

/*
 * CTA dạng "line" (biến thể nút thứ 2 trong design token, học từ Gloster):
 * chữ in hoa, vạch 1px phía trên dài bằng chữ, không có nền.
 * Hover: vạch và chữ chuyển gold, mũi tên trượt vào bên phải.
 * Dùng cho CTA trong nội dung/hero; nút đặc forest chỉ dành cho "Báo giá" ở header.
 */
export function LineLink({
  tone = "dark",
  className,
  children,
  ...props
}: LineLinkProps) {
  const light = tone === "light";
  return (
    <Link
      {...props}
      className={cn(
        "group inline-flex min-h-11 items-center gap-3 border-t pt-3 text-[15px] font-normal tracking-[.08em] uppercase hover:no-underline",
        "transition-colors duration-(--duration-base)",
        light
          ? "hover:border-gold hover:text-gold border-white text-white"
          : "border-ink text-ink hover:border-gold-ink hover:text-gold-ink",
        className,
      )}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        strokeWidth={1.75}
        className="ease-out-soft -ml-1 size-4 opacity-0 transition-[opacity,transform] duration-(--duration-slow) group-hover:translate-x-1 group-hover:opacity-100"
      />
    </Link>
  );
}
