import Image from "next/image";
import { resolveAsset } from "@/config/assets";
import { cn } from "@/lib/utils";

export type HatchTone = {
  base: string;
  stripeA: string;
  stripeB: string;
};

// Tông kẻ sọc mặc định (xám nhạt) — các section khác truyền tone riêng theo design
export const grayTone: HatchTone = {
  base: "#f2f2f2",
  stripeA: "#e9e9e9",
  stripeB: "#f3f3f3",
};

type ImagePlaceholderProps = {
  /** Tên file ảnh (dòng đầu) + ghi chú. Nếu file tồn tại trong public/Assets thì hiện ảnh thật */
  label?: string;
  tone?: HatchTone;
  className?: string;
  labelClassName?: string;
  labelPosition?: "center" | "top" | "top-left";
  /** Kích thước gợi ý cho next/image (mặc định phù hợp ảnh chiếm nửa màn hình) */
  sizes?: string;
};

/**
 * Khối ảnh của site: nếu nhãn trỏ tới file có thật trong public/Assets thì render
 * ảnh thật (next/image, object-cover); nếu chưa có thì hiện nền kẻ sọc + nhãn tên
 * file đúng theo mockup Claude Design để biết chỗ đó cần ảnh gì.
 */
export function ImagePlaceholder({
  label,
  tone = grayTone,
  className,
  labelClassName,
  labelPosition = "center",
  sizes = "(max-width: 1024px) 100vw, 50vw",
}: ImagePlaceholderProps) {
  const src = resolveAsset(label);

  if (src) {
    return (
      <div className={cn("absolute inset-0 overflow-hidden", className)}>
        <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0", className)}
      style={{
        backgroundColor: tone.base,
        backgroundImage: `repeating-linear-gradient(135deg, ${tone.stripeA} 0 10px, ${tone.stripeB} 10px 20px)`,
      }}
    >
      {label ? (
        <span
          className={cn(
            "text-ink-mute absolute inset-0 flex p-4 font-mono text-[11px] leading-[1.6] whitespace-pre-line",
            labelPosition === "center" &&
              "items-center justify-center text-center",
            labelPosition === "top" &&
              "items-start justify-center pt-5 text-center",
            labelPosition === "top-left" &&
              "items-start justify-start p-5 text-left",
            labelClassName,
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
