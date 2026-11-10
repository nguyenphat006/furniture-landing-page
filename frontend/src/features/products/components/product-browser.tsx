"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { useTaxonomy } from "@/components/providers/site-provider";
import type { MaterialSlug, Product } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { ProductCard, ProductRow } from "./product-card";
import { reveal } from "@/components/shared/reveal";

/*
 * Danh sách sản phẩm có lọc + phân trang + đổi kiểu xem (2026-11-06), dùng ở:
 *   - /products (facet="category"): tất cả sản phẩm, lọc theo Nhóm + Chất liệu;
 *   - /products/<nhóm> (facet="type"): sản phẩm của nhóm, lọc theo Loại + Chất liệu.
 * Bố cục: bộ lọc là các hàng chip phía trên (mobile: mỗi hàng cuộn ngang) (không dùng cột bên trái) để lưới đủ rộng cho 6 cột từ xl
 * (người dùng yêu cầu 6 cột một hàng, các thẻ sát nhau); lg 4 cột, sm 3 cột, mobile 2 cột.
 * - Facet chính (Nhóm hoặc Loại): chọn một. Chất liệu: chọn nhiều (khớp BẤT KỲ chất liệu đã chọn).
 *   Mỗi lựa chọn kèm số mẫu, tính theo các bộ lọc còn lại; chỉ hiện lựa chọn có mẫu.
 * - Thanh trên lưới: số mẫu + nút đổi kiểu xem Lưới / Danh sách.
 * - Phân trang PAGE_SIZE mẫu một trang (trước / số trang / sau); đổi lọc thì về trang 1, đổi trang thì cuộn lên đầu danh sách.
 * - Trạng thái ghi vào URL (?category= | ?type=, ?material=a,b, ?view=list, ?page=2) bằng history.replaceState
 *   để gửi link vẫn giữ đúng bộ lọc; Next đồng bộ với useSearchParams. Trang tĩnh nên phải bọc <Suspense>,
 *   fallback là ProductGrid (lưới trang đầu, không lọc).
 */

/** 2 hàng x 6 cột; tăng lên (vd 24) khi có đủ dữ liệu thật */
const PAGE_SIZE = 12;

type Facet = "category" | "type";
type View = "grid" | "list";

const facetOf = (facet: Facet, p: Product): string =>
  facet === "category" ? p.category : p.type;

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul
      {...reveal("stagger")}
      className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-y-10 xl:grid-cols-6"
    >
      {products.map((p) => (
        <li key={p.slug}>
          <ProductCard
            product={p}
            sizes="(min-width: 1280px) 17vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          />
        </li>
      ))}
    </ul>
  );
}

export function ProductBrowser({
  products,
  facet,
}: {
  products: Product[];
  facet: Facet;
}) {
  const t = useTranslations("ProductsPage.browser");
  const tc = useTranslations("Common");
  const params = useSearchParams();
  const topRef = useRef<HTMLDivElement>(null);

  // Thứ tự lựa chọn theo thứ tự trong CMS (mock: taxonomy.ts)
  const taxonomy = useTaxonomy();
  const facetOrder: string[] =
    facet === "category"
      ? taxonomy.categories.map((c) => c.slug)
      : taxonomy.types;
  const facetLabel = (v: string) =>
    facet === "category" ? tc(`products.${v}`) : tc(`productTypes.${v}`);

  const [primary, setPrimary] = useState<string | null>(() => {
    const v = params.get(facet);
    return v && products.some((p) => facetOf(facet, p) === v) ? v : null;
  });
  const [materials, setMaterials] = useState<MaterialSlug[]>(() =>
    (params.get("material") ?? "")
      .split(",")
      .filter((m) => taxonomy.materials.includes(m)),
  );
  const [view, setView] = useState<View>(() =>
    params.get("view") === "list" ? "list" : "grid",
  );
  const [page, setPage] = useState(() =>
    Math.max(1, Number(params.get("page")) || 1),
  );

  const matchPrimary = (p: Product, v = primary) =>
    !v || facetOf(facet, p) === v;
  const matchMaterial = (p: Product, ms = materials) =>
    ms.length === 0 || ms.some((m) => p.materials.includes(m));

  const filtered = products.filter((p) => matchPrimary(p) && matchMaterial(p));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const primaryOptions = facetOrder
    .map((v) => ({
      value: v,
      count: products.filter((p) => facetOf(facet, p) === v && matchMaterial(p))
        .length,
      total: products.filter((p) => facetOf(facet, p) === v).length,
    }))
    .filter((o) => o.total > 0);
  const materialOptions = taxonomy.materials
    .map((m) => ({
      value: m,
      count: products.filter((p) => matchPrimary(p) && p.materials.includes(m))
        .length,
      total: products.filter((p) => p.materials.includes(m)).length,
    }))
    .filter((o) => o.total > 0);

  const sync = (next: {
    primary?: string | null;
    materials?: MaterialSlug[];
    view?: View;
    page?: number;
  }) => {
    const s = {
      primary: next.primary !== undefined ? next.primary : primary,
      materials: next.materials ?? materials,
      view: next.view ?? view,
      page: next.page ?? current,
    };
    const q = new URLSearchParams();
    if (s.primary) q.set(facet, s.primary);
    if (s.materials.length) q.set("material", s.materials.join(","));
    if (s.view === "list") q.set("view", "list");
    if (s.page > 1) q.set("page", String(s.page));
    const qs = q.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  };

  const pickPrimary = (v: string | null) => {
    setPrimary(v);
    setPage(1);
    sync({ primary: v, page: 1 });
  };
  const toggleMaterial = (m: MaterialSlug) => {
    const next = materials.includes(m)
      ? materials.filter((x) => x !== m)
      : taxonomy.materials.filter((x) => x === m || materials.includes(x));
    setMaterials(next);
    setPage(1);
    sync({ materials: next, page: 1 });
  };
  const reset = () => {
    setPrimary(null);
    setMaterials([]);
    setPage(1);
    sync({ primary: null, materials: [], page: 1 });
  };
  const pickView = (v: View) => {
    setView(v);
    sync({ view: v });
  };
  const goPage = (n: number) => {
    setPage(n);
    sync({ page: n });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const active = primary !== null || materials.length > 0;

  return (
    <div ref={topRef} className="scroll-mt-[calc(80px+1.5rem)]">
      {/* Bộ lọc: hàng chip */}
      <div className="border-line grid grid-cols-1 gap-5 border-y py-6">
        <ChipRow label={facet === "category" ? t("category") : t("type")}>
          <Chip
            pressed={primary === null}
            onClick={() => pickPrimary(null)}
            label={t("all")}
          />
          {primaryOptions.map((o) => (
            <Chip
              key={o.value}
              pressed={primary === o.value}
              onClick={() => pickPrimary(o.value)}
              label={facetLabel(o.value)}
              count={o.count}
            />
          ))}
        </ChipRow>
        {materialOptions.length > 1 && (
          <ChipRow label={t("material")}>
            {materialOptions.map((o) => (
              <Chip
                key={o.value}
                pressed={materials.includes(o.value)}
                onClick={() => toggleMaterial(o.value)}
                label={tc(`materials.${o.value}`)}
                count={o.count}
              />
            ))}
            {active && (
              <button
                type="button"
                onClick={reset}
                className="text-ink hover:text-forest decoration-line ml-2 text-xs font-semibold tracking-[.14em] uppercase underline underline-offset-4 transition-colors"
              >
                {t("reset")}
              </button>
            )}
          </ChipRow>
        )}
      </div>

      {/* Nội dung */}
      <div>
        <div className="mt-6 mb-8 flex items-center justify-between gap-4">
          <p
            aria-live="polite"
            className="text-ink-mute text-xs font-semibold tracking-[.14em] uppercase"
          >
            {t("count", { count: filtered.length })}
          </p>
          <div role="group" aria-label={t("view")} className="flex gap-1">
            {(
              [
                ["grid", LayoutGrid],
                ["list", List],
              ] as const
            ).map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={t(v)}
                title={t(v)}
                onClick={() => pickView(v)}
                className={cn(
                  "flex size-10 items-center justify-center border transition-colors duration-(--duration-base)",
                  view === v
                    ? "border-ink bg-ink text-white"
                    : "border-line text-ink hover:border-ink",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
              </button>
            ))}
          </div>
        </div>

        <h2 className="sr-only">{t("resultsHeading")}</h2>
        {shown.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-ink-soft">{t("empty")}</p>
            <button
              type="button"
              onClick={reset}
              className="border-ink text-ink hover:bg-ink mt-6 inline-flex h-12 items-center border px-7 text-sm font-medium tracking-[.14em] uppercase transition-colors duration-(--duration-base) hover:text-white"
            >
              {t("reset")}
            </button>
          </div>
        ) : view === "grid" ? (
          <ProductGrid products={shown} />
        ) : (
          <ul className="border-line border-t">
            {shown.map((p) => (
              <li key={p.slug} className="border-line border-b">
                <ProductRow product={p} />
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <Pagination
            label={t("pagination")}
            prevLabel={t("prev")}
            nextLabel={t("next")}
            pageLabel={(n) => t("page", { page: n })}
            current={current}
            pages={pages}
            onPick={goPage}
          />
        )}
      </div>
    </div>
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="sm:flex sm:items-center">
      <span className="text-ink-mute mb-3 block text-xs font-semibold tracking-[.14em] uppercase sm:mb-0 sm:w-26 sm:shrink-0">
        {label}
      </span>
      {/* Mobile: một hàng cuộn ngang tràn mép; từ sm xuống dòng */}
      <div className="-mx-gutter px-gutter flex [scrollbar-width:none] gap-2 overflow-x-auto sm:mx-0 sm:flex-wrap sm:items-center sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  label,
  count,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={count === 0 && !pressed}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-semibold tracking-[.08em] whitespace-nowrap uppercase transition-colors duration-(--duration-base) disabled:opacity-40",
        pressed
          ? "border-ink bg-ink text-white"
          : "border-line text-ink hover:border-ink",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums",
            pressed ? "text-white/70" : "text-ink-mute",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Pagination({
  label,
  prevLabel,
  nextLabel,
  pageLabel,
  current,
  pages,
  onPick,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  pageLabel: (n: number) => string;
  current: number;
  pages: number;
  onPick: (n: number) => void;
}) {
  const btn =
    "flex size-10 items-center justify-center border text-sm font-semibold tabular-nums transition-colors duration-(--duration-base) disabled:pointer-events-none disabled:opacity-35";

  return (
    <nav
      aria-label={label}
      className="mt-14 flex items-center justify-center gap-2"
    >
      <button
        type="button"
        aria-label={prevLabel}
        disabled={current === 1}
        onClick={() => onPick(current - 1)}
        className={cn(btn, "border-line text-ink hover:border-ink")}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={pageLabel(n)}
          aria-current={n === current ? "page" : undefined}
          onClick={() => onPick(n)}
          className={cn(
            btn,
            n === current
              ? "border-ink bg-ink text-white"
              : "border-line text-ink hover:border-ink",
          )}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        aria-label={nextLabel}
        disabled={current === pages}
        onClick={() => onPick(current + 1)}
        className={cn(btn, "border-line text-ink hover:border-ink")}
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  );
}
