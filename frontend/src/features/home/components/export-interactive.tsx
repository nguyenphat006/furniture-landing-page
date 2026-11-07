"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInView } from "motion/react";
import { SectionHeading } from "@/components/shared/section";
import { cn } from "@/lib/utils";
import type { ExportCountry } from "../export-markets";

/*
 * Phần tương tác của section Xuất khẩu (2026-11-06): tiêu đề + khung bản đồ.
 * - Bản đồ (SVG dựng ở server, truyền qua prop `map`) + lớp HTML phủ:
 *   (2026-11-06) MỖI NƯỚC MỘT BADGE RIÊNG, không gom theo châu lục; chỉ hiện CỜ (viền màu nhấn),
 *   bỏ tên theo yêu cầu, tên chỉ hiện tooltip khi rê chuột / focus.
 *   Badge đặt tại điểm neo admin chọn trong CMS (trống = ngay tại nước), que mảnh trong SVG nối từ chấm nước tới badge.
 *   Dưới lg bản đồ quá nhỏ cho 15 badge → badge ẩn trên bản đồ, hiện thành hàng chip bên dưới.
 *   BFC là nhãn trắng cờ Việt Nam nằm dưới điểm.
 * - Rê chuột / focus một badge → data-active=<mã nước> trên khung bản đồ: nước đó + đường cung sáng,
 *   phần còn lại mờ (CSS globals.css khối .export-map + luật sinh trong SVG).
 * - Cuộn tới → data-inview: đường cung nét liền tự vẽ, rồi vệt trắng chạy lặp dọc đường từ BFC tỏa ra.
 */

function Flag({ iso2, className }: { iso2: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG cờ tĩnh rất nhỏ, không cần next/image
    <img
      src={`/flags/${iso2}.svg`}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      className={cn("shrink-0 rounded-full object-cover", className)}
    />
  );
}

const SIDE_CLASS = {
  L: "-translate-x-full -translate-y-1/2",
  R: "-translate-y-1/2",
  C: "-translate-x-1/2 -translate-y-1/2",
} as const;

export function ExportInteractive({
  eyebrow,
  title,
  countries,
  hubLabel,
  hubPos,
  map,
}: {
  eyebrow: string;
  title: string;
  countries: ExportCountry[];
  hubLabel: string;
  /** Vị trí điểm gốc trên bản đồ, % theo chiều ngang / dọc */
  hubPos: [number, number];
  map: ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(mapRef, { once: true, amount: 0.3 });

  return (
    <div>
      <SectionHeading tone="light" eyebrow={eyebrow} title={title} />

      <div
        ref={mapRef}
        data-active={active ?? undefined}
        data-inview={inView ? "" : undefined}
        className="export-map relative mx-auto max-w-[72rem]"
      >
        {map}

        {/* Badge từng nước (lg+) */}
        {countries.map((c, i) => (
          <div
            key={c.code}
            tabIndex={0}
            aria-label={c.name}
            onMouseEnter={() => setActive(c.code)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(c.code)}
            onBlur={() => setActive(null)}
            style={
              {
                "--c": c.color,
                left: `${c.label[0]}%`,
                top: `${c.label[1]}%`,
                transitionDelay: inView ? `${0.4 + i * 0.05}s` : undefined,
              } as CSSProperties
            }
            className={cn(
              "absolute hidden cursor-default outline-none lg:block",
              "transition-opacity duration-500",
              !inView && "opacity-0",
              inView && active && active !== c.code && "opacity-30",
            )}
          >
            {/* (2026-11-06) Chỉ cờ, bỏ tên; tên hiện dạng tooltip khi rê chuột / focus */}
            <span
              className={cn(
                "relative block rounded-full transition-transform duration-300",
                SIDE_CLASS[c.side],
                active === c.code && "scale-125",
              )}
            >
              <Flag
                iso2={c.iso2}
                className="size-9 shadow-[0_0_18px_-2px_var(--c),0_4px_10px_rgb(0_0_0/0.3)] ring-[3px] ring-(--c) [div:focus-visible_&]:ring-white"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "text-ink pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shadow-lg transition-opacity duration-200",
                  active === c.code ? "opacity-100" : "opacity-0",
                )}
              >
                {c.name}
              </span>
            </span>
          </div>
        ))}

        {/* Điểm gốc BFC: nhãn trắng cờ Việt Nam, nằm DƯỚI điểm để không đè các đường cung */}
        <div
          className="absolute"
          style={{ left: `${hubPos[0]}%`, top: `${hubPos[1]}%` }}
        >
          <span className="absolute top-0 left-0 flex -translate-x-1/2 flex-col items-center">
            <span
              aria-hidden="true"
              className="h-2 w-[1.5px] bg-white sm:h-4"
            />
            <span
              aria-hidden="true"
              className="-mt-1 size-2 rotate-45 bg-white sm:-mt-1.5 sm:size-2.5"
            />
            <span className="text-forest relative z-10 -mt-1 flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-[10px] font-bold tracking-[.12em] whitespace-nowrap uppercase shadow-[0_8px_28px_-6px_white,0_4px_10px_rgb(0_0_0/0.25)] sm:-mt-1.5 sm:gap-3 sm:py-1.5 sm:pr-4 sm:pl-1.5 sm:text-xs">
              <Flag iso2="vn" className="size-5 sm:size-7" />
              {hubLabel}
            </span>
          </span>
        </div>
      </div>

      {/* Dưới lg: hàng cờ dưới bản đồ (tên chỉ cho trình đọc màn hình + title) */}
      <ul className="mt-6 flex flex-wrap gap-3 lg:hidden">
        {countries.map((c) => (
          <li
            key={c.code}
            style={{ "--c": c.color } as CSSProperties}
            title={c.name}
          >
            <Flag iso2={c.iso2} className="size-8 ring-[3px] ring-(--c)" />
            <span className="sr-only">{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
