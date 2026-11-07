"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { CircleNavButton } from "@/components/shared/circle-nav-button";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { MaterialSummary } from "@/data/catalog";

/*
 * Vật liệu (2026-11-05), thay chỗ section Dự án trên trang chủ (BFC làm OEM theo đơn hàng,
 * không có danh mục dự án công trình để khoe). Section Dự án vẫn giữ ở projects-section.tsx.
 * Dùng lại nguyên bố cục carousel của section Dự án (học ATC "Our Projects"):
 * SectionHeading trái + link xem tất cả phải; thẻ ảnh lớn 2 thẻ/khung từ mép trái container
 * tràn ra mép phải màn hình; dưới ảnh là tên | vạch dọc | "Khám phá →" (sát tên, 2026-11-06).
 * (2026-11-06) Thẻ to hơn (~60% container, thấy 1,6 thẻ/khung) và nút điều hướng kiểu ATC:
 * nút tròn CircleNavButton (viền hở ở đuôi, hover lấp nền + viền chạy vòng), cụm nút ở giữa màn hình,
 * một đường kẻ tĩnh từ nút ra mép phải.
 * Ảnh là ảnh cận bề mặt của từng vật liệu, thẻ dẫn sang trang chi tiết /materials/<slug>.
 */

const GAP = 32; // px, khớp gap-8

export function MaterialsShowcaseSection({
  materials,
}: {
  materials: MaterialSummary[];
}) {
  const t = useTranslations("HomePage.materialsShowcase");
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
      id="materials"
      spacing="none"
      // Nền trắng liền section Sản phẩm phía trên (giống section Dự án): chỉ chừa khoảng dưới, khoảng trên do padding-bottom của Sản phẩm lo
      className="pb-section"
    >
      <Container>
        <SectionHeading
          eyebrow={t("kicker")}
          title={t("title")}
          action={
            <ButtonLink href={navHref.materials}>{t("viewAll")}</ButtonLink>
          }
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
        {materials.map((m, i) => (
          <li
            key={m.slug}
            className="w-[84vw] shrink-0 snap-start sm:w-[62vw] lg:w-[calc(min(100vw-var(--spacing-gutter)*2,var(--container-content))*0.6)]"
          >
            <Link
              href={`${navHref.materials}/${m.slug}`}
              aria-label={t("cardAria", {
                name: m.name,
                current: i + 1,
                total: materials.length,
              })}
              className="group/card block hover:no-underline"
            >
              <div className="bg-surface-stone relative aspect-[16/10] overflow-hidden">
                <ImagePlaceholder
                  label={m.image}
                  sizes="(min-width: 1024px) 60vw, 84vw"
                  className="ease-out-soft transition-[transform,filter] duration-(--duration-slow) group-hover/card:scale-[1.04] group-hover/card:contrast-[1.08]"
                />
              </div>

              {/* Tên vật liệu | vạch dọc | Khám phá → */}
              <div className="mt-6 flex items-center gap-8">
                <h3 className="text-h3 text-ink min-w-0 font-normal tracking-[.02em] uppercase">
                  {m.name}
                </h3>
                <span className="border-line text-ink group-hover/card:text-forest flex shrink-0 items-center gap-2 self-stretch border-l py-1 pl-6 text-[13px] font-semibold tracking-[.14em] uppercase transition-colors">
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

      {/* Điều hướng kiểu ATC: 2 nút tròn ở giữa màn hình, đường kẻ tĩnh từ nút ra mép phải.
          Hàng tràn hết bề ngang: ô trống trái và đường kẻ phải cùng flex-1 nên cụm nút nằm giữa */}
      <div className="mt-12 flex items-center gap-5">
        <span aria-hidden="true" className="flex-1" />
        <CircleNavButton
          direction="prev"
          aria-label={t("prev")}
          disabled={edge.start}
          onClick={() => scrollByCard(-1)}
        />
        <CircleNavButton
          direction="next"
          aria-label={t("next")}
          disabled={edge.end}
          onClick={() => scrollByCard(1)}
        />
        <span aria-hidden="true" className="bg-ink/35 ml-3 h-px flex-1" />
      </div>
    </Section>
  );
}
