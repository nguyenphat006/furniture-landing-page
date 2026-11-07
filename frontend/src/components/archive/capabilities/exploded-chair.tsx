"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";
import { chairParts } from "@/features/capabilities/data";
import { Chair3D } from "./chair-3d";

/**
 * "Mọi bộ phận của chiếc ghế": ghế xoay 3D ghim giữa màn hình, cuộn trang thì ghế tách rời dần
 * thành khung teak, lưới dây đan, nệm và đế xoay; mỗi bộ phận trỏ về xưởng làm ra nó.
 */
export function ExplodedChair() {
  const t = useTranslations("CapabilitiesPage.madeHere");
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Desktop: section cao 260vh, khối nội dung sticky; tách rời chạy trong lúc khối được ghim
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.8", "end end"],
  });
  const scrollExplode = useTransform(scrollYProgress, [0.4, 0.85], [0, 1], {
    clamp: true,
  });
  const staticExplode = useMotionValue(0.85);
  const explode = reduce ? staticExplode : scrollExplode;

  return (
    <section ref={sectionRef} className="relative lg:h-[260vh]">
      <div className="lg:sticky lg:top-0 lg:h-svh lg:overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1440px] items-center gap-10 px-7 py-16 lg:grid-cols-12 lg:py-0">
          <div className="lg:col-span-4">
            <h2 className="text-ink max-w-[16ch] text-[clamp(2rem,3.6vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.02em]">
              {t("title")}
            </h2>
            <p className="text-ink-mute mt-5 max-w-[40ch] text-[17px] leading-[1.7]">
              {t("lede")}
            </p>

            <ul className="border-line mt-10 border-t max-lg:hidden">
              {chairParts.map((part) => (
                <li key={part.key}>
                  <a
                    href={`#ws-${part.ws}`}
                    onMouseEnter={() => setActiveKey(part.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onFocus={() => setActiveKey(part.key)}
                    onBlur={() => setActiveKey(null)}
                    className={cn(
                      "border-line group flex items-baseline justify-between gap-6 border-b py-4 transition-opacity duration-300 hover:no-underline",
                      activeKey && activeKey !== part.key
                        ? "opacity-45"
                        : "opacity-100",
                    )}
                  >
                    <span className="text-ink text-lg font-semibold tracking-[-0.01em]">
                      {t(`callouts.${part.key}.part`)}
                    </span>
                    <span className="text-gold group-hover:text-ink text-xs font-medium tracking-[.16em] whitespace-nowrap uppercase transition-colors">
                      {t(`callouts.${part.key}.shop`)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            <p className="text-ink mt-8 max-w-[44ch] text-[15px] leading-[1.75] max-lg:hidden">
              {t("note")}{" "}
              <a
                href="#inhouse"
                className="text-ink hover:text-forest underline underline-offset-4"
              >
                {t("noteLink")}
              </a>
              .
            </p>
          </div>

          <Chair3D
            explode={explode}
            activeKey={activeKey}
            className="h-[min(calc(100svh-5rem),960px)] max-lg:aspect-[4/5] max-lg:h-auto lg:col-span-8"
          />

          {/* Mobile: danh sách bộ phận dưới mô hình */}
          <div className="lg:hidden">
            <div className="border-line border-t">
              {chairParts.map((part) => (
                <a
                  key={part.key}
                  href={`#ws-${part.ws}`}
                  className="border-line flex items-baseline justify-between gap-4 border-b py-4 hover:no-underline"
                >
                  <span className="text-ink text-base font-semibold">
                    {t(`callouts.${part.key}.part`)}
                  </span>
                  <span className="text-ink-mute text-xs tracking-[.14em] whitespace-nowrap uppercase">
                    {t(`callouts.${part.key}.shop`)}
                  </span>
                </a>
              ))}
            </div>
            <p className="text-ink mt-8 text-[15px] leading-[1.75]">
              {t("note")}{" "}
              <a
                href="#inhouse"
                className="text-ink hover:text-forest underline underline-offset-4"
              >
                {t("noteLink")}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
