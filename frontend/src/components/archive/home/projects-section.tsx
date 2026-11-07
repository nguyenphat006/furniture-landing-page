"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ArrowLink } from "@/components/shared/arrow-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { projectPlaceholders } from "@/features/home/data";

/*
 * Dự án (2026-11-04), bố cục theo section "Our Projects" của ATC:
 * nền trắng; cụm tiêu đề SectionHeading chuẩn (trái) + link xem tất cả (phải); carousel thẻ ảnh lớn (2 thẻ/khung trên desktop) bắt đầu từ mép trái
 * container chung và tràn ra mép phải màn hình; dưới ảnh là tên dự án | vạch dọc | "Khám phá →";
 * mũi tên ← → căn giữa bên dưới.
 * Carousel dùng cuộn ngang gốc + scroll-snap (kéo/vuốt được, bàn phím được), nút chỉ gọi scrollBy.
 * Bộ lọc theo loại công trình của bản cũ tạm bỏ khỏi UI (projectFilters và messages vẫn giữ).
 */

const GAP = 32; // px, khớp gap-8

export function ProjectsSection() {
  const t = useTranslations("HomePage.projects");
  const trackRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const updateEdge = () => {
    const el = trackRef.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  };

  const scrollByCard = (dir: 1 | -1) => {
    const el = trackRef.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.clientWidth + GAP), behavior: "smooth" });
  };

  return (
    <Section
      id="projects"
      spacing="none"
      // Nền trắng liền section Sản phẩm phía trên: chỉ chừa khoảng dưới, khoảng trên do padding-bottom của Sản phẩm lo
      className="pb-section"
    >
      <Container>
        <SectionHeading
          eyebrow={t("kicker")}
          title={t("title")}
          action={<ArrowLink href={navHref.projects}>{t("viewAll")}</ArrowLink>}
        />
      </Container>

      <ul
        ref={trackRef}
        onScroll={updateEdge}
        aria-label={t("title")}
        className={cn(
          "flex snap-x snap-mandatory gap-8 overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Thẻ đầu canh đúng mép trái container chung, phần còn lại tràn ra mép phải màn hình
          "pr-gutter pl-[max(var(--spacing-gutter),calc((100%-var(--container-content))/2))]",
          "scroll-pl-[max(var(--spacing-gutter),calc((100%-var(--container-content))/2))]",
        )}
      >
        {projectPlaceholders.map((p, i) => (
          <li
            key={p.slug}
            className="w-[84vw] shrink-0 snap-start sm:w-[62vw] lg:w-[calc((min(100vw-var(--spacing-gutter)*2,var(--container-content))-2rem)/2)]"
          >
            <Link
              href={navHref.projects}
              aria-label={t("projectAria", {
                current: i + 1,
                total: projectPlaceholders.length,
              })}
              className="group/card block hover:no-underline"
            >
              <div className="bg-surface-stone relative aspect-[16/10] overflow-hidden">
                <ImagePlaceholder
                  label={p.img}
                  sizes="(min-width: 1024px) 50vw, 84vw"
                  className="ease-out-soft transition-[transform,filter] duration-(--duration-slow) group-hover/card:scale-[1.04] group-hover/card:contrast-[1.08]"
                />
              </div>

              {/* Tên dự án | vạch dọc | Khám phá → */}
              {/* Chỉ giữ tên dự án (2026-11-04); loại công trình + địa điểm/năm/số lượng vẫn có trong data và messages */}
              <div className="mt-6 flex items-center justify-between gap-6">
                <h3 className="text-h3 text-ink min-w-0 font-normal tracking-[.02em] uppercase">
                  {p.name}
                </h3>
                <span className="border-line text-ink group-hover/card:text-forest flex shrink-0 items-center gap-2 self-stretch border-l py-1 pl-6 text-[11px] font-semibold tracking-[.16em] uppercase transition-colors">
                  {t("discover")}
                  <ArrowRight
                    aria-hidden="true"
                    strokeWidth={2.5}
                    className="ease-out-soft size-3.5 transition-transform duration-(--duration-base) group-hover/card:translate-x-1"
                  />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Mũi tên ← → mảnh, căn giữa */}
      <div className="mt-12 flex justify-center gap-10">
        {(
          [
            [-1, "prev", ArrowLeft, edge.start],
            [1, "next", ArrowRight, edge.end],
          ] as const
        ).map(([dir, label, Icon, disabled]) => (
          <button
            key={label}
            type="button"
            aria-label={t(label)}
            disabled={disabled}
            onClick={() => scrollByCard(dir)}
            className="text-ink hover:text-forest flex size-11 cursor-pointer items-center justify-center transition-colors disabled:cursor-default disabled:opacity-30"
          >
            <Icon aria-hidden="true" strokeWidth={1.5} className="size-6" />
          </button>
        ))}
      </div>
    </Section>
  );
}
