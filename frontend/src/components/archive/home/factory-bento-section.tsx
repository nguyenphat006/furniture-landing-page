import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  CalendarCheck,
  PencilRuler,
  ShieldCheck,
} from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { ArrowLink } from "@/components/shared/arrow-link";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { Link } from "@/i18n/navigation";

/*
 * PHƯƠNG ÁN CŨ, tạm không dùng (2026-11-04): user chọn bản offset kiểu Gloster ở factory-section.tsx.
 * Giữ lại để so sánh hoặc dùng lại. Section cuối trang chủ, dẫn sang /capabilities.
 * Bố cục học từ khối "See how we work" của Nghĩa Sơn: cụm tiêu đề → dải 3 điểm tin cậy có icon,
 * ngăn bằng vạch dọc → lưới ảnh: 1 ảnh lớn có tiêu đề + nút đè lên (trái), 2 ô nhỏ xếp dọc (phải).
 * Khác Nghĩa Sơn: không dùng video, 2 ô nhỏ là lối tắt tới từng phần của trang Năng lực.
 * Chữ là của BFC (bản nháp), ảnh tạm lấy từ slideshow nhà máy.
 */

const CHIPS = [
  { key: "since", Icon: CalendarCheck },
  { key: "oem", Icon: PencilRuler },
  { key: "visit", Icon: ShieldCheck },
] as const;

const TILES = [
  {
    key: "inhouse",
    href: `${navHref.capabilities}#inhouse`,
    img: "/Assets/Slideshow_Rope_2.jpg",
  },
  {
    key: "process",
    href: `${navHref.capabilities}#process`,
    img: "/Assets/Slideshow_Alu_4.jpg",
  },
] as const;

export function FactoryBentoSection() {
  const t = useTranslations("HomePage.factory");

  return (
    <Section
      id="factory"
      spacing="none"
      // Nền trắng liền section Dự án phía trên: chỉ chừa khoảng dưới
      className="pb-section"
    >
      <Container>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          lede={t("lede")}
          action={
            <ArrowLink href={navHref.capabilities}>{t("viewAll")}</ArrowLink>
          }
          className="mb-10 lg:mb-12"
        />

        {/* Dải 3 điểm tin cậy */}
        <ul className="border-line mb-10 grid border-t sm:grid-cols-3 lg:mb-12">
          {CHIPS.map(({ key, Icon }) => (
            <li
              key={key}
              className="border-line flex items-center gap-4 py-5 max-sm:not-first:border-t sm:px-6 sm:not-first:border-l sm:first:pl-0"
            >
              <span className="bg-surface-forest text-forest flex size-11 shrink-0 items-center justify-center rounded-full">
                <Icon
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-5"
                />
              </span>
              <span className="text-ink text-[15px] font-medium">
                {t(`chips.${key}`)}
              </span>
            </li>
          ))}
        </ul>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Ảnh lớn: tiêu đề + nút đè lên, căn giữa */}
          <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden sm:aspect-[16/10] lg:aspect-auto lg:min-h-[480px]">
            <Image
              src="/Assets/Slideshow_1_10.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 66vw, 100vw"
              className="object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-black/45" />
            <div className="relative flex flex-col items-center px-6 text-center">
              <p className="text-eyebrow text-gold mb-4 font-semibold uppercase">
                {t("feature.eyebrow")}
              </p>
              <h3 className="text-h2 mb-8 max-w-[22ch] font-semibold tracking-[-0.015em] text-balance text-white">
                {t("feature.title")}
              </h3>
              <ButtonLink href={navHref.capabilities} tone="light">
                {t("feature.cta")}
              </ButtonLink>
            </div>
          </div>

          {/* 2 ô nhỏ: lối tắt tới từng phần của trang Năng lực */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {TILES.map((tile) => (
              <li key={tile.key}>
                <Link
                  href={tile.href}
                  className="group/tile relative flex aspect-[16/10] items-end overflow-hidden p-6 hover:no-underline lg:aspect-auto lg:h-full lg:min-h-[232px]"
                >
                  <Image
                    src={tile.img}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="ease-out-soft object-cover transition-transform duration-(--duration-slow) group-hover/tile:scale-[1.04]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent"
                  />
                  <span className="relative flex w-full items-end justify-between gap-4">
                    <span className="text-lg leading-snug font-semibold text-white">
                      {t(`tiles.${tile.key}`)}
                    </span>
                    <span className="group-hover/tile:bg-gold group-hover/tile:text-ink group-hover/tile:border-gold flex size-10 shrink-0 items-center justify-center rounded-full border border-white/60 text-white transition-colors duration-(--duration-base)">
                      <ArrowUpRight
                        aria-hidden="true"
                        strokeWidth={2}
                        className="size-4"
                      />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
