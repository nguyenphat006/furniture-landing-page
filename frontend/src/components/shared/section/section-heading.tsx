import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Cụm tiêu đề chung của section: badge (eyebrow) + tiêu đề + mô tả tuỳ chọn + action tuỳ chọn.
 * Quy ước: badge luôn có; mô tả chỉ dùng khi section cần giải thích (tối đa 2 dòng);
 * action là link điều hướng phụ (ArrowLink), canh đáy bên phải.
 * (2026-11-05) Gọi tên theo người dùng: subtitle = nhãn nhỏ trên tiêu đề (eyebrow, có vạch ngắn phía trước),
 * desc = đoạn dưới tiêu đề (lede, chữ thường). Tiêu đề in hoa. Hiện các section chưa truyền desc.
 */

type SectionHeadingProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  align?: "left" | "center";
  /** "light" khi đặt trên nền tối */
  tone?: "dark" | "light";
  /** Cấp heading; section trên trang dùng h2, hero của trang con dùng h1 */
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  lede,
  action,
  align = "left",
  tone = "dark",
  as: Heading = "h2",
  className,
}: SectionHeadingProps) {
  const centered = align === "center";
  const light = tone === "light";

  return (
    <div
      className={cn(
        "mb-12 flex flex-wrap gap-x-12 gap-y-6 lg:mb-14",
        centered
          ? "flex-col items-center text-center"
          : "items-end justify-between",
        className,
      )}
    >
      {/* Khung tiêu đề (2026-11-05): nới từ 46ch (~400px) lên 40rem để tiêu đề ít xuống dòng hơn;
          đoạn mô tả vẫn giới hạn 60ch cho dễ đọc */}
      <div className={cn("max-w-[40rem]", centered && "mx-auto")}>
        {eyebrow ? (
          <p
            className={cn(
              // Vạch ngắn trước subtitle, cùng màu chữ
              "text-eyebrow mb-4 flex items-center gap-3 font-semibold uppercase before:block before:h-px before:w-8 before:bg-current before:content-['']",
              centered && "justify-center",
              light ? "text-white/60" : "text-forest",
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <Heading
          className={cn(
            // (2026-11-05) Tiêu đề in hoa cho cảm giác chắc hơn; chữ hoa cần nới tracking thay vì siết
            "text-section font-semibold tracking-[.01em] text-balance uppercase",
            light ? "text-white" : "text-ink",
          )}
        >
          {title}
        </Heading>
        {lede ? (
          <p
            className={cn(
              "text-lede mt-4 max-w-[60ch]",
              centered && "mx-auto",
              light ? "text-white/70" : "text-ink-soft",
            )}
          >
            {lede}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap gap-x-8 gap-y-3">{action}</div>
      ) : null}
    </div>
  );
}
