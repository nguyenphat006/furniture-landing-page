import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Nút "Xem thêm" đặt trên card ảnh. Chỉ là phần hiển thị (span): cả card đã là <Link>,
 * nên bấm vào nút cũng là bấm card. (2026-11-05) Hover cả card là nút sáng luôn (chữ gold, mũi tên trượt), cần class "group" trên Link của card;
 * focus bàn phím vào card (class "group" trên Link) thì nút cũng đổi màu.
 * (2026-11-05) Đổi sang dạng gọn chữ + icon (bỏ khung viền và nền kính mờ) vì trong thẻ là chỗ phụ,
 * không cần nổi bật; cùng kiểu với ArrowLink. Hover hoặc focus card: chữ gold, mũi tên trượt phải.
 */
export function CardAction({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "group/cta inline-flex h-10 shrink-0 items-center gap-2 text-[13px] font-semibold tracking-[.14em] whitespace-nowrap text-white uppercase",
        "transition-colors duration-(--duration-base)",
        "group-hover:text-gold group-focus-visible:text-gold",
        className,
      )}
    >
      {label}
      <ArrowRight
        aria-hidden="true"
        strokeWidth={2.75}
        className="ease-out-soft size-4 transition-transform duration-(--duration-slow) group-hover:translate-x-1 group-focus-visible:translate-x-1"
      />
    </span>
  );
}
