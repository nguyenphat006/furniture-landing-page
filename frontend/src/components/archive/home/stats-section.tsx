"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { animate, useInView, useReducedMotion } from "motion/react";
import { Container, Section } from "@/components/shared/section";

/*
 * Dải số liệu ngay dưới hero (2026-11-04): section đầu tiên của trang chủ.
 * Số đếm lên khi cuộn tới (cùng cách làm của AboutSection, ghi thẳng vào DOM, không setState mỗi frame).
 * 370 nhân sự và 28.000 m² lấy từ nội dung About; 6 xưởng theo danh sách workshops trong data.ts.
 */
const STATS = [
  { key: "years", value: new Date().getFullYear() - 2010, suffix: "+" },
  { key: "employees", value: 370, suffix: "" },
  { key: "area", value: 28000, suffix: "" },
  { key: "workshops", value: 6, suffix: "" },
] as const;

export function StatsSection() {
  const t = useTranslations("HomePage.stats");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDListElement>(null);
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const started = useRef(false);
  const inView = useInView(listRef, { once: true, margin: "0px 0px -15% 0px" });

  useEffect(() => {
    const fmt = (n: number) =>
      n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");
    const controls: ReturnType<typeof animate>[] = [];

    const start = () => {
      if (started.current) return;
      started.current = true;
      STATS.forEach((stat, i) => {
        const el = numberRefs.current[i];
        if (!el) return;
        if (reduce) {
          el.textContent = fmt(stat.value);
          return;
        }
        controls.push(
          animate(0, stat.value, {
            duration: 1.5,
            ease: [0.33, 1, 0.68, 1],
            onUpdate: (v) => {
              el.textContent = fmt(Math.round(v));
            },
          }),
        );
      });
    };

    if (inView) start();
    // Dự phòng: observer không kích hoạt thì vẫn hiện số sau 6s
    const fallback = setTimeout(start, 6000);
    return () => {
      clearTimeout(fallback);
      controls.forEach((c) => c.stop());
    };
  }, [inView, reduce, locale]);

  return (
    <Section
      id="stats"
      spacing="none"
      // Chỉ chừa khoảng trên; khoảng dưới đã có padding-top của section Sản phẩm
      className="pt-band"
      aria-label={t("aria")}
    >
      <Container>
        <dl
          ref={listRef}
          className="border-line grid grid-cols-2 border-y lg:grid-cols-4"
        >
          {STATS.map((stat, i) => (
            <div
              key={stat.key}
              className={
                // Vạch ngăn: 2 cột trên mobile, 4 cột từ lg
                "border-line flex flex-col-reverse items-center gap-3 px-5 py-10 text-center max-lg:even:border-l max-lg:nth-[n+3]:border-t lg:py-14 lg:not-first:border-l"
              }
            >
              <dt className="text-ink-mute text-xs tracking-[.14em] uppercase">
                {t(stat.key)}
              </dt>
              <dd className="text-ink text-[clamp(2.5rem,4.5vw,3.75rem)] leading-none font-bold tracking-[-0.03em] tabular-nums">
                <span
                  ref={(el) => {
                    numberRefs.current[i] = el;
                  }}
                >
                  0
                </span>
                {stat.suffix}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}
