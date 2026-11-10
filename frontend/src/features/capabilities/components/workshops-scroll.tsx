"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { reveal } from "@/components/shared/reveal";
import {
  Container,
  EYEBROW,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { cn } from "@/lib/utils";
import { workshopDefs } from "../data";
import { WorkshopGallery } from "./workshop-gallery";

/*
 * 6 xưởng sản xuất (2026-11-05, bản 4; làm đẹp 2026-11-09, bố cục giữ nguyên).
 * - Trái: đường timeline dọc, phần vàng dài ra theo cuộn; mỗi xưởng một chấm + SỐ LỚN dính theo
 *   màn hình, vàng khi đã cuộn tới. Chỉ có số, không thêm gì khác (user 09/11).
 * - Phải: dòng "Nhận từ" (kiểu eyebrow của SectionHeading, EYEBROW, chữ đen) → TÊN XƯỞNG cỡ lớn
 *   màu forest (điểm nhấn chính) → câu tóm tắt → vạch ngăn → công đoạn dạng bảng kẻ vạch cạnh
 *   gallery ảnh 4:3 (từ 2 ảnh thì tự chuyển, WorkshopGallery) → dải "Bàn giao cho" (đúng tiêu đề section: mỗi xưởng giao gì cho xưởng sau).
 * - Vàng chỉ còn ở timeline và số đã cuộn tới để làm điểm nhấn; còn lại forest / mực.
 * - Nền stone; ảnh và dải bàn giao nền trắng. Anchor #ws-1 … #ws-6 giữ nguyên.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function WorkshopsScroll() {
  const t = useTranslations("CapabilitiesPage.workshops");
  const trackRef = useRef<HTMLOListElement>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [progress, setProgress] = useState(0);
  const [reached, setReached] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const track = trackRef.current;
      if (!track) return;
      const mid = window.innerHeight * 0.5;
      const r = track.getBoundingClientRect();
      setProgress(Math.min(1, Math.max(0, (mid - r.top) / r.height)));
      let n = 0;
      stepRefs.current.forEach((el) => {
        if (el && el.getBoundingClientRect().top <= mid) n++;
      });
      setReached(n);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <Section id="workshops" tone="stone">
      <Container>
        <SectionHeading
          eyebrow={t("kicker")}
          title={t("title")}
          className="lg:mb-20"
        />

        <ol ref={trackRef} className="relative">
          {/* Đường timeline: nền mờ + phần vàng chạy theo cuộn */}
          <span
            aria-hidden="true"
            className="bg-ink/10 absolute top-0 bottom-0 left-[5px] w-px"
          />
          <span
            aria-hidden="true"
            className="bg-gold absolute top-0 left-[4.5px] w-0.5"
            style={{ height: `${progress * 100}%` }}
          />

          {workshopDefs.map((w, i) => {
            const on = reached > i;
            const ops = t.raw(`items.${w.key}.ops`) as string[];
            const name = t(`items.${w.key}.name`);
            return (
              <li
                key={w.key}
                id={`ws-${i + 1}`}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className="relative grid scroll-mt-28 gap-y-5 pb-20 pl-10 last:pb-0 lg:grid-cols-12 lg:gap-x-8 lg:pb-32"
              >
                {/* Trái: chấm trên đường + số lớn, dính theo màn hình */}
                <div className="lg:col-span-2 xl:col-span-3">
                  <div className="relative lg:sticky lg:top-[calc(80px+3rem)]">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-3 -left-10 size-3 rounded-full ring-4 transition-colors duration-(--duration-base) lg:top-5",
                        on
                          ? "bg-gold ring-gold/25"
                          : "bg-surface-stone ring-ink/10",
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "block text-[clamp(3rem,6vw,5.5rem)] leading-[0.85] font-bold tracking-[-0.04em] tabular-nums transition-colors duration-(--duration-slow)",
                        on ? "text-gold" : "text-ink/15",
                      )}
                    >
                      {pad(i + 1)}
                    </span>
                  </div>
                </div>

                {/* Phải: nội dung */}
                <div className="min-w-0 lg:col-span-10 xl:col-span-9">
                  {w.hasReceives ? (
                    <p className={cn(EYEBROW, "text-ink mb-4")}>
                      <span>
                        {t("receivesLabel")}
                        <span aria-hidden="true" className="mx-2">
                          ·
                        </span>
                        {t(`items.${w.key}.receives`)}
                      </span>
                    </p>
                  ) : null}

                  <h3 className="text-forest text-[clamp(2.25rem,1.5rem+2.6vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.02em] uppercase">
                    <span className="sr-only">{pad(i + 1)}. </span>
                    {name}
                  </h3>

                  <div className="border-line mt-5 border-b pb-8">
                    <p className="text-ink-soft text-lede max-w-[62ch] lg:text-lg lg:leading-relaxed">
                      {t(`items.${w.key}.summary`)}
                    </p>
                  </div>

                  {/* Công đoạn (trái) + gallery ảnh 4:3 (phải) cùng một hàng */}
                  <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start">
                    <div>
                      <p className="text-ink-mute border-ink/80 border-b-2 pb-3 text-xs font-semibold tracking-[.16em] uppercase">
                        {t("insideLabel")}
                      </p>
                      <ol {...reveal("stagger")}>
                        {ops.map((op, j) => (
                          <li
                            key={op}
                            className="group/op border-line hover:border-forest flex items-baseline gap-5 border-b py-4 transition-colors duration-(--duration-base)"
                          >
                            <span className="text-forest w-6 shrink-0 text-xs font-bold tabular-nums">
                              {pad(j + 1)}
                            </span>
                            <span className="text-ink group-hover/op:text-forest text-base leading-snug font-medium transition-colors duration-(--duration-base)">
                              {op}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <WorkshopGallery images={w.imgs} name={name} />
                  </div>

                  {/* Bàn giao cho xưởng sau */}
                  <div className="border-forest mt-8 flex flex-col gap-x-6 gap-y-2 rounded-[2px] border-l-2 bg-white px-6 py-5 sm:flex-row sm:items-center">
                    <p className="text-forest flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                      <span className="basis-full text-xs tracking-[.16em] uppercase sm:basis-auto">
                        {t("handsOverLabel")}
                      </span>
                      <span className="inline-flex items-start gap-2">
                        <ArrowRight
                          className="mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{t(`items.${w.key}.handoverTo`)}</span>
                      </span>
                    </p>
                    <span
                      aria-hidden="true"
                      className="bg-line hidden h-5 w-px sm:block"
                    />
                    <p className="text-ink-soft text-[15px] leading-snug">
                      {t(`items.${w.key}.handoverState`)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Container>
    </Section>
  );
}
