"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { cn } from "@/lib/utils";
import { workshopDefs } from "../data";

/*
 * 6 xưởng sản xuất (2026-11-05, bản 4). Thay WorkshopsFlow (file cũ giữ nguyên, không render).
 * Bố cục lấy từ timeline "Quá khứ / Hiện tại / Tương lai" người dùng từng làm cho LHBS,
 * chuyển sang ngôn ngữ BFC:
 * - Trái: đường timeline dọc, phần vàng dài ra theo cuộn; mỗi xưởng một chấm + SỐ LỚN màu gold,
 *   dính theo màn hình trong lúc đọc xưởng đó (thay cho icon + chữ "QUÁ KHỨ").
 * - Phải: pill "Nhận từ · …" có đuôi → tên xưởng in hoa màu forest → 1 câu tóm tắt có vạch gold
 *   bên trái → hàng dưới: thẻ công đoạn 1 cột (chỉ tên, vạch gold bên phải) cạnh ảnh xưởng 4:3
 *   có nhãn tên ở góc dưới trái (đặt cạnh nhau để section không quá dài).
 * - Khác bản gốc: bỏ mô tả phụ trong thẻ, bo góc 2px theo token BFC, không có slider ảnh.
 * - Nền stone; thẻ và pill nền trắng/gold để nổi trên nền.
 * Anchor #ws-1 … #ws-6 giữ nguyên.
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
            className="bg-ink/12 absolute top-0 bottom-0 left-[5px] w-0.5"
          />
          <span
            aria-hidden="true"
            className="bg-gold absolute top-0 left-[5px] w-0.5"
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
                className="relative grid scroll-mt-28 gap-y-6 pb-20 pl-10 last:pb-0 lg:grid-cols-12 lg:gap-x-8 lg:pb-28"
              >
                {/* Trái: chấm trên đường + số lớn, dính theo màn hình */}
                <div className="lg:col-span-2 xl:col-span-3">
                  <div className="relative lg:sticky lg:top-[calc(80px+3rem)]">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-3 -left-10 size-3 rounded-full ring-4 transition-colors duration-(--duration-base)",
                        on
                          ? "bg-gold ring-gold/25"
                          : "bg-surface-stone ring-ink/12",
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "block text-[clamp(3rem,5vw,5rem)] leading-[0.9] font-semibold tracking-[-0.03em] tabular-nums transition-colors duration-(--duration-slow)",
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
                    <p className="mb-5 flex items-center">
                      <span className="bg-gold rounded-[2px] px-4 py-1.5 text-[11px] font-semibold tracking-[.14em] text-white uppercase">
                        {t("receivesLabel")}
                        <span className="mx-2 opacity-60">·</span>
                        <span className="tracking-normal normal-case">
                          {t(`items.${w.key}.receives`)}
                        </span>
                      </span>
                      {/* Đuôi pill: vạch mảnh như bản gốc */}
                      <span
                        aria-hidden="true"
                        className="bg-gold/50 h-px w-12"
                      />
                    </p>
                  ) : null}

                  <h3 className="text-h2 text-forest font-bold tracking-[-0.01em] uppercase">
                    <span className="sr-only">{pad(i + 1)}. </span>
                    {name}
                  </h3>

                  <p className="border-gold text-ink-soft mt-5 max-w-[60ch] border-l-2 pl-5 leading-relaxed">
                    {t(`items.${w.key}.summary`)}
                  </p>

                  {/* Thẻ công đoạn (trái) + ảnh (phải) cùng một hàng để rút chiều cao */}
                  <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start">
                    <p className="sr-only">{t("insideLabel")}</p>
                    <ol className="grid content-start gap-2.5">
                      {ops.map((op, j) => (
                        <li
                          key={op}
                          className="border-line flex items-center justify-between gap-4 rounded-[2px] border bg-white px-5 py-3.5"
                        >
                          <span className="text-ink text-[15px] leading-snug font-medium">
                            <span className="text-gold-ink mr-3 text-xs font-semibold tabular-nums">
                              {pad(j + 1)}
                            </span>
                            {op}
                          </span>
                          <span
                            aria-hidden="true"
                            className="bg-gold h-5 w-0.5 shrink-0"
                          />
                        </li>
                      ))}
                    </ol>

                    <div className="relative aspect-[4/3] overflow-hidden rounded-[2px] bg-white md:col-start-2 md:row-start-1">
                      <ImagePlaceholder
                        label={w.imgs[0]}
                        sizes="(min-width: 1024px) 60vw, 100vw"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent"
                      />
                      <span className="absolute bottom-5 left-5 text-xs font-semibold tracking-[.16em] text-white uppercase">
                        {name}
                      </span>
                    </div>
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
