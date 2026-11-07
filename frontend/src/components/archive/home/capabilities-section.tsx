"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLink } from "@/components/shared/arrow-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { cn } from "@/lib/utils";
import { workshops } from "@/features/home/data";

const creamTone = { base: "#f2eddf", stripeA: "#ece5d3", stripeB: "#f6f1e4" };

export function CapabilitiesSection() {
  const t = useTranslations("HomePage.capabilities");
  const [panel, setPanel] = useState(0);

  return (
    // Fullscreen thật sự: section = 100svh, accordion tràn viền ngang và chạm đáy màn hình
    <section
      id="capabilities"
      className="flex scroll-mt-[72px] flex-col bg-white lg:h-[100svh] lg:min-h-[720px]"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-end justify-between gap-x-12 gap-y-4 px-7 pt-10 pb-6 lg:pt-14 lg:pb-8">
        <div>
          <h2 className="text-ink text-[clamp(2rem,3.2vw,3rem)] leading-[1.12] font-semibold tracking-[-0.015em]">
            {t("title")}
          </h2>
          <p className="text-ink mt-3 max-w-[52ch] text-[17px] leading-[1.8]">
            {t("lede")}
          </p>
        </div>
        <ArrowLink href="/capabilities" className="mb-1.5">
          {t("cta")}
        </ArrowLink>
      </div>

      {/* Accordion ngang full-bleed chiếm trọn phần còn lại; mobile xếp dọc, mở toàn bộ */}
      <div className="border-line flex min-h-[480px] w-full flex-1 gap-0.5 border-t max-lg:min-h-0 max-lg:flex-col">
        {workshops.map((w, i) => {
          const open = panel === i;
          const name = t(`items.${w.key}.name`);
          return (
            <div
              key={w.key}
              role="button"
              tabIndex={0}
              aria-label={name}
              aria-expanded={open}
              onMouseEnter={() => setPanel(i)}
              onFocus={() => setPanel(i)}
              onClick={() => setPanel(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPanel(i);
                }
              }}
              className="relative min-w-[72px] cursor-pointer overflow-hidden transition-[flex-grow] duration-600 ease-[cubic-bezier(.2,.7,.2,1)] max-lg:h-[400px] max-lg:flex-none"
              style={{ flex: open ? "4 1 0%" : "1 1 0%" }}
            >
              <ImagePlaceholder
                tone={creamTone}
                label={w.img}
                labelPosition="top"
                labelClassName="text-ink-soft opacity-80 px-3"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,20,20,0)_40%,rgba(20,20,20,.78)_100%)]"
              />
              {/* Nhãn dọc khi panel đóng (chỉ desktop) */}
              <div
                className={cn(
                  "absolute bottom-8 left-7 flex rotate-180 items-center gap-3.5 transition-opacity duration-300 [writing-mode:vertical-rl] max-lg:hidden",
                  open ? "opacity-0" : "opacity-100",
                )}
              >
                <span className="text-xs tracking-[.16em] text-white/60">
                  0{i + 1}
                </span>
                <span className="text-base font-semibold tracking-[.02em] whitespace-nowrap text-white">
                  {name}
                </span>
              </div>
              {/* Nội dung khi panel mở (mobile luôn hiện) */}
              <div
                className={cn(
                  "absolute right-10 bottom-10 left-10 w-[380px] max-w-[calc(100%-80px)] transition-[opacity,transform] delay-120 duration-400",
                  open
                    ? "translate-y-0 opacity-100"
                    : "translate-y-3 opacity-0",
                  "max-lg:right-7 max-lg:bottom-7 max-lg:left-7 max-lg:max-w-[calc(100%-56px)] max-lg:translate-y-0 max-lg:opacity-100",
                )}
              >
                <p className="mb-3 text-xs tracking-[.16em] text-white/60">
                  0{i + 1}
                </p>
                <h3 className="mb-3 text-[clamp(1.5rem,2.2vw,2.25rem)] leading-[1.2] font-semibold tracking-[-0.01em] text-white">
                  {name}
                </h3>
                <p className="text-[15px] leading-[1.7] text-white/85">
                  {t(`items.${w.key}.desc`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
