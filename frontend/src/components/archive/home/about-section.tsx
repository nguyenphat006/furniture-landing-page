"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { animate, useInView, useReducedMotion } from "motion/react";
import { ArrowLink } from "@/components/shared/arrow-link";

const ANIMATED_STATS = [
  { key: "years", value: new Date().getFullYear() - 2010 },
  { key: "employees", value: 370 },
  { key: "area", value: 28000 },
] as const;

const PENDING_STATS = ["containers", "markets"] as const;

export function AboutSection() {
  const t = useTranslations("HomePage.about");
  const locale = useLocale();
  const statsRef = useRef<HTMLDivElement>(null);
  const numberRefs = useRef<(HTMLDivElement | null)[]>([]);
  const started = useRef(false);
  const inView = useInView(statsRef, {
    once: true,
    margin: "0px 0px -15% 0px",
  });
  const reduce = useReducedMotion();

  useEffect(() => {
    const fmt = (n: number) =>
      n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");
    const controls: ReturnType<typeof animate>[] = [];

    const start = () => {
      if (started.current) return;
      started.current = true;
      ANIMATED_STATS.forEach((stat, i) => {
        const el = numberRefs.current[i];
        if (!el) return;
        if (reduce) {
          el.textContent = fmt(stat.value);
          return;
        }
        controls.push(
          // Ghi thẳng vào DOM node — không setState mỗi frame để tránh re-render cả cây
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
    // Dự phòng: nếu observer không kích hoạt thì vẫn hiện số sau 6s
    const fallback = setTimeout(start, 6000);
    return () => {
      clearTimeout(fallback);
      controls.forEach((c) => c.stop());
    };
  }, [inView, reduce, locale]);

  return (
    <section
      id="about"
      className="flex scroll-mt-[72px] flex-col justify-center py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <h2 className="text-ink mx-auto mb-12 max-w-[24ch] text-center text-[clamp(2rem,3.2vw,3rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>
        <div className="mx-auto grid max-w-[900px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-8">
          <p className="text-ink-soft text-[17px] leading-[1.8]">{t("p1")}</p>
          <p className="text-ink-soft text-[17px] leading-[1.8]">{t("p2")}</p>
        </div>

        <div ref={statsRef} className="bfc-stats border-line mt-20 border-y">
          {ANIMATED_STATS.map((stat, i) => (
            <div key={stat.key} className="px-5 py-12 text-center">
              <div
                ref={(el) => {
                  numberRefs.current[i] = el;
                }}
                className="text-ink text-[clamp(2.5rem,4.5vw,3.75rem)] leading-none font-bold tracking-[-0.03em] tabular-nums"
              >
                0
              </div>
              <div className="text-ink-mute mt-3 text-xs tracking-[.14em] uppercase">
                {t(`stats.${stat.key}`)}
              </div>
            </div>
          ))}
          {PENDING_STATS.map((key) => (
            <div key={key} className="px-5 py-12 text-center">
              <div className="text-ink-mute text-[clamp(2.5rem,4.5vw,3.75rem)] leading-none font-bold tracking-[-0.03em] tabular-nums opacity-50">
                NULL
              </div>
              <div className="text-ink-mute mt-3 text-xs tracking-[.14em] uppercase">
                {t(`stats.${key}`)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <ArrowLink href="/about">{t("cta")}</ArrowLink>
        </div>
      </div>
    </section>
  );
}
