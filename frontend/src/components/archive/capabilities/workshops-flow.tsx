"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { cn } from "@/lib/utils";
import { workshopDefs } from "@/features/capabilities/data";

/**
 * Dòng chảy 6 xưởng: đường dọc màu vàng chạy tiến độ theo scroll, từng khối
 * "sáng lên" khi cuộn tới. Mỗi khối là 1 anchor #ws-N (đích của sơ đồ ghế).
 */
export function WorkshopsFlow() {
  const t = useTranslations("CapabilitiesPage.workshops");
  const reduce = useReducedMotion();
  const [seenCount, setSeenCount] = useState(0);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  const seen = reduce ? workshopDefs.length : seenCount;

  useEffect(() => {
    // Khối được tính là "đã thấy" khi đỉnh của nó vào 70% trên của viewport; không lùi lại
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = blockRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx >= 0) setSeenCount((s) => Math.max(s, idx + 1));
        }
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    for (const el of blockRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section className="pb-16 lg:pb-24">
      <div className="mx-auto max-w-[1100px] px-7">
        <h2 className="text-ink mb-4 max-w-[24ch] text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>
        <p className="text-ink mb-24 max-w-[46ch] text-[17px] leading-[1.8]">
          {t("lede")}
        </p>

        <div className="relative pl-16 lg:pl-24">
          <div
            aria-hidden="true"
            className="bg-gold absolute top-0 bottom-0 left-5 w-px opacity-45 lg:left-12"
          />
          <div
            aria-hidden="true"
            className="bg-gold absolute top-0 left-5 w-px transition-[height] duration-600 ease-out lg:left-12"
            style={{ height: `${(seen / workshopDefs.length) * 100}%` }}
          />
          <div className="grid gap-[clamp(80px,12vw,128px)]">
            {workshopDefs.map((w, i) => {
              const active = seen > i;
              const ops = t.raw(`items.${w.key}.ops`) as string[];
              return (
                <div
                  key={w.key}
                  id={`ws-${i + 1}`}
                  ref={(el) => {
                    blockRefs.current[i] = el;
                  }}
                  className="bfc-ws relative scroll-mt-32"
                >
                  <div
                    className={cn(
                      "transition-[opacity,transform] duration-600",
                      active
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-25",
                    )}
                  >
                    <div
                      className={cn(
                        "border-gold absolute top-0 -left-16 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-400 lg:-left-[68px]",
                        active ? "bg-gold text-white" : "text-ink bg-white",
                      )}
                    >
                      {i + 1}
                    </div>
                    <div className="grid grid-cols-1 gap-[8.33%] gap-y-10 lg:grid-cols-[5fr_6fr]">
                      <div>
                        <h3 className="text-ink my-1.5 text-[clamp(1.25rem,2vw,1.75rem)] leading-[1.25] font-semibold tracking-[-0.01em]">
                          {t(`items.${w.key}.name`)}
                        </h3>
                        {w.hasReceives ? (
                          <p className="text-ink-mute mb-5 text-xs tracking-[.14em] uppercase">
                            {t("receivesLabel")}
                            {"  "}
                            <span className="text-ink text-sm tracking-normal normal-case">
                              {t(`items.${w.key}.receives`)}
                            </span>
                          </p>
                        ) : null}
                        <p className="text-ink-mute mt-5 mb-3 text-xs tracking-[.14em] uppercase">
                          {t("insideLabel")}
                        </p>
                        <div className="grid gap-2">
                          {ops.map((op, j) => (
                            <div
                              key={op}
                              className="grid grid-cols-[32px_1fr] items-baseline gap-3"
                            >
                              <span className="text-gold text-xs font-semibold tracking-[.1em] tabular-nums">
                                0{j + 1}
                              </span>
                              <span className="text-ink-soft text-sm leading-[1.6]">
                                {op}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="border-line mt-6 grid grid-cols-[1fr_auto] gap-6 border-t pt-4">
                          <div>
                            <p className="text-ink-mute mb-2 text-xs tracking-[.14em] uppercase">
                              {w.hand
                                ? t("noMachinesLabel")
                                : t("machinesLabel")}
                            </p>
                            <p className="text-ink-soft text-sm leading-[1.6]">
                              {t(`items.${w.key}.machines`)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-ink-mute mb-2 text-xs tracking-[.14em] uppercase">
                              {t("capacityLabel")}
                            </p>
                            <span className="text-ink-mute text-sm opacity-50">
                              NULL
                            </span>
                          </div>
                        </div>
                        <div className="mt-6 bg-[#FBF6EA] px-6 py-5">
                          <p className="text-ink-soft mb-1.5 text-xs tracking-[.14em] uppercase">
                            ↓ {t("handsOverLabel")}
                            {"  "}
                            <span className="text-ink text-sm font-semibold tracking-normal normal-case">
                              {t(`items.${w.key}.handoverTo`)}
                            </span>
                          </p>
                          <p className="text-ink-soft text-sm leading-[1.6] italic">
                            {t(`items.${w.key}.handoverState`)}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "grid content-start gap-4",
                          w.imgs.length > 1 && "grid-cols-2",
                        )}
                      >
                        {w.imgs.map((img, j) => (
                          <div
                            key={img}
                            className={cn(
                              "group relative aspect-[4/3] overflow-hidden",
                              w.imgs.length === 3 && j === 0 && "col-span-full",
                            )}
                          >
                            <div className="absolute inset-0 transition-transform duration-600 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.03]">
                              <ImagePlaceholder
                                label={img}
                                labelClassName="p-3"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
