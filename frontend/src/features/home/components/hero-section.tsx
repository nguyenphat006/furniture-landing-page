"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { Container } from "@/components/shared/section";
import type { HeroContent } from "@/data/pages/types";
import { cn } from "@/lib/utils";

const SLIDE_MS = 6500;

/** Nội dung (ảnh, tiêu đề, mô tả, chữ nút) do CMS hoặc mock truyền vào (data/pages/home.ts) */
export function HeroSection({
  content,
  nextId,
}: {
  content: HeroContent;
  /** id section ngay sau hero (nút cuộn xuống); không có thì ẩn nút */
  nextId?: string;
}) {
  const t = useTranslations("HomePage.hero");
  const slides = content.slides;
  const titleLines = content.title.split("\n");
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  // Slide đã tải: lúc đầu chỉ slide 0 (ảnh LCP), slide kế tiếp tải sau khi trang đã hiện (QC 07/11)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]));
  useEffect(() => {
    if (slides.length < 2) return;
    const next = (index + 1) % slides.length;
    const id = setTimeout(
      () => setLoaded((s) => (s.has(next) ? s : new Set(s).add(next))),
      2000,
    );
    return () => clearTimeout(id);
  }, [index, slides.length]);

  // Tự chuyển slide; đổi slide thủ công sẽ reset đồng hồ. Reduced-motion → đứng yên slide đầu
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % slides.length),
      SLIDE_MS,
    );
    return () => clearTimeout(id);
  }, [index, reduce, slides.length]);

  return (
    <section
      id="top"
      data-hero
      className="relative flex min-h-[100svh] items-end overflow-hidden"
    >
      {/* Các slide xếp chồng: crossfade + Ken Burns drift trên slide đang hiện */}
      {slides.map((src, i) => {
        const active = i === index;
        return (
          <motion.div
            key={src}
            aria-hidden={!active}
            initial={false}
            animate={
              reduce
                ? { opacity: active ? 1 : 0 }
                : { opacity: active ? 1 : 0, scale: active ? 1.08 : 1 }
            }
            transition={{
              opacity: { duration: 1.2, ease: [0.4, 0, 0.2, 1] },
              scale: { duration: SLIDE_MS / 1000 + 1.2, ease: "linear" },
            }}
            className="absolute inset-0"
          >
            {loaded.has(i) || active ? (
              <Image
                src={src}
                alt=""
                fill
                {...(i === 0
                  ? { loading: "eager", fetchPriority: "high" }
                  : {})}
                sizes="100vw"
                quality={60}
                className="object-cover"
              />
            ) : null}
          </motion.div>
        );
      })}

      {/* Scrim kiểu Gloster: tối dần từ đáy lên cho chữ (header giờ nền trắng nên bỏ dải tối trên đỉnh) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 bottom-0 h-[70%] bg-linear-to-t from-black/60 via-black/25 to-transparent" />
      </div>

      {/*
        Chữ hero theo bố cục Gloster: dồn trái-dưới, cùng một trục trái với header và mọi section (Container wide, lề = gutter).
        Tiêu đề h1 in hoa, semibold như tiêu đề section, một đoạn mô tả, CTA nút khung viền chung (ButtonLink, đồng nhất 2026-11-05; LineLink giữ trong code).
        Kicker "Nhà sản xuất nội thất ngoài trời" tạm không hiện để giữ bố cục 3 tầng của Gloster (key vẫn giữ trong messages).
      */}
      <Container className="relative pb-28 xl:pb-24">
        <h1 className="text-h1 mb-5 font-semibold tracking-[-0.015em] text-balance text-white uppercase">
          {/* Ngắt dòng cố định sau dấu phẩy ở sm+, mobile tự xuống dòng */}
          {titleLines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 ? <br className="max-sm:hidden" /> : null}
              {line}
            </Fragment>
          ))}
        </h1>
        {/* Mô tả ngắn (2026-11-04): nói cách BFC làm việc với khách (OEM/ODM, mẫu thử → container),
            không lặp số liệu nhà máy đã có ở đoạn giới thiệu bên dưới */}
        {content.lede ? (
          <p className="text-lede mb-8 max-w-[64ch] text-white/85">
            {content.lede}
          </p>
        ) : null}
        <ButtonLink href="/contact" tone="light">
          {content.buttonLabel || t("ctaQuote")}
        </ButtonLink>
      </Container>

      {/* Nút cuộn xuống section kế tiếp */}
      {nextId ? (
        <a
          href={`#${nextId}`}
          aria-label={t("scrollNext")}
          className="group absolute bottom-8 left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center text-white hover:no-underline"
        >
          {/* Viền nét đứt xoay chậm quanh mũi tên */}
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-dashed border-white/60 transition-colors group-hover:border-white motion-safe:animate-[spin_14s_linear_infinite]"
          />
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.5}
            className="motion-safe:animate-bfc-nudge size-5"
          />
        </a>
      ) : null}

      {/* Chỉ báo slide: vạch mảnh + tiến độ gold, bấm để nhảy slide */}
      {/* Lớp bọc full-width không nhận click, để không đè lên nút cuộn ở giữa */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8">
        <Container className="flex items-center justify-end gap-4 *:pointer-events-auto">
          <span className="text-xs font-medium tracking-[.16em] text-white/70 tabular-nums">
            0{index + 1}
          </span>
          <div className="flex items-center gap-2">
            {slides.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className="group flex h-11 w-10 cursor-pointer items-center"
              >
                <span
                  className={cn(
                    "relative h-[2px] w-full overflow-hidden transition-colors",
                    i === index
                      ? "bg-white/30"
                      : "bg-white/25 group-hover:bg-white/50",
                  )}
                >
                  {i === index && !reduce ? (
                    <motion.span
                      key={`progress-${index}`}
                      className="bg-gold absolute inset-y-0 left-0"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: SLIDE_MS / 1000, ease: "linear" }}
                    />
                  ) : null}
                  {i === index && reduce ? (
                    <span className="bg-gold absolute inset-0" />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </Container>
      </div>
    </section>
  );
}
