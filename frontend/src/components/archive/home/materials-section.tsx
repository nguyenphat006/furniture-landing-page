"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLink } from "@/components/shared/arrow-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { cn } from "@/lib/utils";
import { materialBands, type MaterialBand } from "@/features/home/data";

export function MaterialsSection() {
  return (
    <>
      {materialBands.map((band, i) => (
        <Band key={band.slug} band={band} anchor={i === 0} />
      ))}
    </>
  );
}

function Band({ band, anchor }: { band: MaterialBand; anchor: boolean }) {
  const t = useTranslations("HomePage.materials");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const name = t(`bands.${band.slug}.name`);

  const step = (dir: number) => {
    const el = scrollerRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    el.scrollBy({ left: dir * (first.offsetWidth + 16), behavior: "smooth" });
  };

  const text = (
    <div key="text">
      {anchor ? (
        <p className="text-ink-soft mb-3 text-xs font-medium tracking-[.16em] uppercase">
          {t("kicker")}
        </p>
      ) : null}
      <h2 className="text-ink mb-4 text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] font-semibold tracking-[-0.02em]">
        {name}
      </h2>
      <p
        className={cn(
          "mb-6 max-w-[46ch] text-[17px] leading-[1.8]",
          band.pending ? "text-ink-mute opacity-50" : "text-ink",
        )}
      >
        {t(`bands.${band.slug}.tagline`)}
      </p>
      <p
        className={cn(
          "mb-8 max-w-[52ch] text-base leading-[1.7]",
          band.pending ? "text-ink-mute opacity-50" : "text-ink-soft",
        )}
      >
        {t(`bands.${band.slug}.body`)}
      </p>
      <ArrowLink href={`/materials/${band.slug}`}>
        {t(`bands.${band.slug}.cta`)}
      </ArrowLink>
    </div>
  );

  const carousel = (
    <div key="carousel">
      <div
        ref={scrollerRef}
        data-scroller
        tabIndex={0}
        aria-label={t("photosAria", { name })}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1"
      >
        {band.shots.map((shot) => (
          <div
            key={shot}
            className="relative aspect-[3/4] flex-[0_0_calc((100%-16px)/1.8)] snap-start"
          >
            <ImagePlaceholder
              tone={band.tone}
              label={shot}
              labelClassName="text-ink-soft p-3"
            />
          </div>
        ))}
      </div>
      {!band.pending ? (
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            aria-label={t("prevPhoto", { name })}
            onClick={() => step(-1)}
            className="text-ink-soft hover:text-ink inline-flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-lg"
          >
            ←
          </button>
          <button
            type="button"
            aria-label={t("nextPhoto", { name })}
            onClick={() => step(1)}
            className="text-ink-soft hover:text-ink inline-flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-lg"
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      id={anchor ? "materials" : undefined}
      className="flex scroll-mt-[72px] flex-col justify-center py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
      style={{ background: band.bg }}
    >
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-center gap-12 px-7">
        {band.reversed ? [carousel, text] : [text, carousel]}
      </div>
    </section>
  );
}
