import Image from "next/image";
import type { Certification } from "@/data/certifications";
import { cn } from "@/lib/utils";

/**
 * Logo chứng nhận nhỏ (footer). Có file logo thì đặt trên nền trắng để logo đen/đỏ
 * đọc được trên nền tối; chưa có logo thì hiện chữ viết tắt trong khung.
 */
export function CertBadge({ cert }: { cert: Certification }) {
  if (cert.logo) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-9 items-center rounded-[2px] bg-white px-2"
      >
        <Image
          src={cert.logo}
          alt=""
          width={28}
          height={28}
          className="h-6 w-auto"
          unoptimized
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-8 items-center justify-center border px-2.5 text-[11px] font-bold tracking-[.06em]",
        cert.confirmed
          ? "border-white/40 text-white"
          : "border-dashed border-white/25 text-white/30",
      )}
    >
      {cert.short}
    </span>
  );
}
