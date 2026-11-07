"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleNavButton } from "@/components/shared/circle-nav-button";
import type { Product } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

/*
 * Carousel sản phẩm một hàng, chuyển theo trang (2026-11-07): mục "Mẫu khác" ở trang sản phẩm và
 * "Sản phẩm dùng <vật liệu>" ở trang vật liệu. Số thẻ mỗi trang khớp lưới ProductGrid
 * (2 / 3 / 4 / 6 cột), nút ← → (CircleNavButton như carousel trang chủ) cuộn đúng một trang, kèm
 * số trang "01 / 03". Vuốt / cuộn ngang vẫn được (snap theo thẻ). Vừa một trang thì ẩn điều hướng.
 */

const GAP = 12; // px, khớp gap-x-3

const pad = (n: number) => String(n).padStart(2, "0");

export function ProductCarousel({
  products,
  label,
}: {
  products: Product[];
  /** Tên vùng cho trình đọc màn hình (thường là tiêu đề section) */
  label: string;
}) {
  const t = useTranslations("ProductsPage.browser");
  const trackRef = useRef<HTMLUListElement>(null);
  const [state, setState] = useState({ page: 1, pages: 1 });

  const measure = () => {
    const el = trackRef.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    const perPage = Math.max(
      1,
      Math.round((el.clientWidth + GAP) / (card.clientWidth + GAP)),
    );
    const pages = Math.ceil(products.length / perPage);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    const page = atEnd
      ? pages
      : Math.min(pages, Math.round(el.scrollLeft / (el.clientWidth + GAP)) + 1);
    setState((s) =>
      s.page === page && s.pages === pages ? s : { page, pages },
    );
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // measure chỉ đọc DOM + products.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const go = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth + GAP), behavior: "smooth" });
  };

  return (
    <div>
      <ul
        ref={trackRef}
        onScroll={measure}
        aria-label={label}
        className={cn(
          "flex snap-x snap-mandatory gap-x-3 overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {products.map((p) => (
          <li
            key={p.slug}
            className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/3)] lg:w-[calc((100%-2.25rem)/4)] xl:w-[calc((100%-3.75rem)/6)]"
          >
            <ProductCard
              product={p}
              sizes="(min-width: 1280px) 17vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            />
          </li>
        ))}
      </ul>

      {state.pages > 1 ? (
        <div className="mt-10 flex items-center gap-5">
          <p
            aria-live="polite"
            className="text-ink-mute text-sm font-medium tracking-[.14em] tabular-nums"
          >
            <span className="text-ink">{pad(state.page)}</span> /{" "}
            {pad(state.pages)}
          </p>
          <span aria-hidden="true" className="bg-ink/35 h-px flex-1" />
          <CircleNavButton
            direction="prev"
            aria-label={t("prev")}
            disabled={state.page <= 1}
            onClick={() => go(-1)}
          />
          <CircleNavButton
            direction="next"
            aria-label={t("next")}
            disabled={state.page >= state.pages}
            onClick={() => go(1)}
          />
        </div>
      ) : null}
    </div>
  );
}
