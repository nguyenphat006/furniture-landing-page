"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CircleNavButtonProps = Omit<ComponentProps<"button">, "children"> & {
  direction: "prev" | "next";
};

/*
 * Nút điều hướng carousel dạng tròn (2026-11-06), học nút ← → của ATC:
 * - Mặc định: nền trắng, viền tròn mảnh bị HỞ một đoạn ở phía đuôi mũi tên
 *   (nút "sau" hở bên trái, nút "trước" hở bên phải).
 * - Hover/focus: nền đậm lan ra từ tâm, một đường viền trắng bên trong nút (hở y hệt viền gốc)
 *   được vẽ dần liền một nét (stroke-dashoffset) từ chỗ hở qua đỉnh trên xuống đỉnh dưới trong ~1,1s,
 *   mũi tên chuyển trắng.
 * Vẽ bằng SVG với pathLength=100 nên dash tính theo phần trăm chu vi.
 * Tới đầu/cuối thì nút bị vô hiệu hoá; nếu nút đang có focus (bấm bằng bàn phím) thì chuyển focus
 * sang nút còn lại cùng cụm, không để rơi về body (QC 09/11).
 */
export function CircleNavButton({
  direction,
  className,
  ...props
}: CircleNavButtonProps) {
  const Icon = direction === "next" ? ArrowRight : ArrowLeft;
  // Vòng viền hở 20% chu vi. Hình học vẽ cho nút "sau" (hở bên trái: nét bắt đầu ở 216°, mép trên
  // của chỗ hở, chạy theo chiều kim đồng hồ qua đỉnh trên, bên phải, đỉnh dưới rồi dừng ở 144°).
  // Nút "trước" lật ngang SVG nên hở bên phải và nét vẫn chạy từ trên xuống.
  const gapRotate = 216;
  const ref = useRef<HTMLButtonElement>(null);
  // Layout effect: chạy ngay sau khi DOM đổi, trước khi trình duyệt bỏ focus khỏi nút bị vô hiệu
  useLayoutEffect(() => {
    const el = ref.current;
    if (!props.disabled || !el || document.activeElement !== el) return;
    const other = Array.from(
      el.parentElement?.querySelectorAll("button") ?? [],
    ).find((b) => b !== el && !b.disabled);
    other?.focus();
  }, [props.disabled]);

  return (
    <button
      type="button"
      className={cn(
        "group/cnb text-ink-mute relative flex size-[4.25rem] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white",
        "transition-[color,opacity] duration-(--duration-base) hover:text-white focus-visible:text-white",
        "disabled:hover:text-ink-mute disabled:cursor-default disabled:opacity-40",
        className,
      )}
      {...props}
      ref={ref}
    >
      {/* Nền đậm lan từ tâm khi hover */}
      <span
        aria-hidden="true"
        className="bg-ink/80 ease-out-soft absolute inset-0 scale-0 rounded-full transition-transform duration-(--duration-slow) group-hover/cnb:scale-100 group-focus-visible/cnb:scale-100 group-disabled/cnb:scale-0"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 68 68"
        className={cn(
          "pointer-events-none absolute inset-0 size-full",
          direction === "prev" && "-scale-x-100",
        )}
      >
        {/* Viền tĩnh, hở một đoạn ở đuôi */}
        <circle
          cx="34"
          cy="34"
          r="33.5"
          fill="none"
          pathLength={100}
          strokeDasharray="80 20"
          transform={`rotate(${gapRotate} 34 34)`}
          stroke="var(--color-ink)"
          strokeOpacity={0.35}
          className="transition-opacity duration-(--duration-base) group-hover/cnb:opacity-0 group-focus-visible/cnb:opacity-0 group-disabled/cnb:opacity-100"
          strokeWidth="1"
        />
        {/* Viền khi active: cùng chỗ hở với viền gốc, VẼ DẦN liền một nét bằng stroke-dashoffset
            (dash 80 + khoảng trống 100 để chỉ có một nét; offset 80 → 0 kéo nét từ đầu tới cuối) */}
        <circle
          cx="34"
          cy="34"
          r="29"
          fill="none"
          pathLength={100}
          strokeDasharray="80 100"
          transform={`rotate(${gapRotate} 34 34)`}
          stroke="white"
          strokeOpacity={0.8}
          strokeWidth="1"
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-[1100ms] ease-[cubic-bezier(.45,0,.2,1)] [stroke-dashoffset:80] group-hover/cnb:[stroke-dashoffset:0] group-focus-visible/cnb:[stroke-dashoffset:0] group-disabled/cnb:[stroke-dashoffset:80]"
        />
      </svg>
      <Icon aria-hidden="true" strokeWidth={1.5} className="relative size-7" />
    </button>
  );
}
