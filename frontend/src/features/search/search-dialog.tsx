"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  FileText,
  LayoutGrid,
  Layers,
  Newspaper,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { MIN_QUERY, normalize } from "./normalize";
import {
  OPEN_SEARCH_EVENT,
  type SuggestResponse,
  type Suggestion,
} from "./types";

/*
 * Ô tìm nhanh (B7, 2026-11-09): modal (<dialog> gốc của trình duyệt: khoá nền, giữ focus, Esc đóng)
 * mở từ icon kính lúp trên header và nút nổi Tìm kiếm (sự kiện OPEN_SEARCH_EVENT). Gõ tới đâu gợi
 * ý tới đó (GET /api/search, chờ 180ms sau phím cuối, huỷ request cũ): sản phẩm có ảnh nhỏ + mã mẫu,
 * nhóm / loại, vật liệu, trang. Combobox ARIA: ↑ ↓ chọn gợi ý, Enter mở gợi ý đang chọn, không chọn
 * gì thì Enter mở trang /search?q= với đủ kết quả.
 */

const DEBOUNCE = 180;
const GROUPS = [
  "products",
  "categories",
  "materials",
  "news",
  "pages",
] as const;
/** Icon thay ảnh cho gợi ý không có ảnh (loại sản phẩm, trang), để các dòng thẳng hàng */
const GROUP_ICON: Record<Suggestion["group"], LucideIcon> = {
  products: LayoutGrid,
  categories: LayoutGrid,
  materials: Layers,
  news: Newspaper,
  pages: FileText,
};

export function SearchDialog() {
  const t = useTranslations("Search");
  const locale = useLocale();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);

  const ready = normalize(query).length >= MIN_QUERY;
  const items = ready && data ? data.items : [];

  useEffect(() => {
    const open = () => {
      const dialog = ref.current;
      if (!dialog || dialog.open) return;
      dialog.showModal();
      inputRef.current?.select();
    };
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, open);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?${new URLSearchParams({ q: query, locale })}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as SuggestResponse);
        setFailed(false);
        setActive(-1);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [query, locale, ready]);

  const close = () => ref.current?.close();
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const searchAll = () => {
    if (!ready) return;
    go(`/search?${new URLSearchParams({ q: query.trim() })}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active].href);
      else searchAll();
    }
  };

  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <dialog
      ref={ref}
      aria-label={t("dialog")}
      // Bấm vào nền tối (ngoài khung) thì đóng
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="text-ink m-0 mx-auto mt-[min(12vh,7rem)] w-[min(44rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-black/55 backdrop:backdrop-blur-[2px] max-sm:mt-4"
    >
      <div className="overflow-hidden rounded-[2px] bg-white shadow-[0_24px_60px_rgb(0_0_0/0.28)]">
        <div className="border-line flex items-center gap-3 border-b px-5">
          {loading ? (
            <Loader2
              aria-hidden="true"
              className="text-forest size-5 shrink-0 animate-spin"
            />
          ) : (
            <Search
              aria-hidden="true"
              className="text-ink-mute size-5 shrink-0"
            />
          )}
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label={t("label")}
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={100}
            value={query}
            placeholder={t("placeholder")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="placeholder:text-ink-mute h-16 min-w-0 flex-1 bg-transparent text-lg outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label={t("clear")}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-ink-mute hover:text-ink flex size-9 cursor-pointer items-center justify-center"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="text-ink-mute hover:text-ink border-line cursor-pointer rounded-[2px] border px-2 py-1 text-[11px] font-semibold tracking-[.1em] uppercase"
          >
            <span aria-hidden="true">Esc</span>
            <span className="sr-only">{t("close")}</span>
          </button>
        </div>

        <div className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain">
          {!ready ? (
            <p className="text-ink-mute px-5 py-6 text-sm">{t("hint")}</p>
          ) : failed ? (
            <p className="text-ink-mute px-5 py-6 text-sm">{t("error")}</p>
          ) : data && !items.length && !loading ? (
            <p className="text-ink-mute px-5 py-6 text-sm">
              {t("noSuggestions", { q: query.trim() })}
            </p>
          ) : null}

          <ul id={listId} role="listbox" aria-label={t("suggestions")}>
            {GROUPS.map((group) => {
              const list = items.filter((s) => s.group === group);
              if (!list.length) return null;
              return (
                <li key={group} role="presentation" className="py-2">
                  <p
                    role="presentation"
                    className="text-ink-mute px-5 pt-2 pb-1 text-[11px] font-bold tracking-[.16em] uppercase"
                  >
                    {t(group)}
                  </p>
                  <ul role="presentation">
                    {list.map((s) => {
                      const i = items.indexOf(s);
                      return (
                        <SuggestionRow
                          key={`${s.group}-${s.href}`}
                          s={s}
                          id={optionId(i)}
                          active={i === active}
                          onHover={() => setActive(i)}
                          onPick={close}
                        />
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>

        {ready && items.length ? (
          <button
            type="button"
            onClick={searchAll}
            className="border-line text-forest hover:bg-surface-stone flex w-full cursor-pointer items-center justify-between border-t px-5 py-4 text-sm font-bold"
          >
            {t("viewAll")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </dialog>
  );
}

function SuggestionRow({
  s,
  id,
  active,
  onHover,
  onPick,
}: {
  s: Suggestion;
  id: string;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const Icon = GROUP_ICON[s.group];
  return (
    <li role="option" id={id} aria-selected={active}>
      <Link
        href={s.href}
        tabIndex={-1}
        onClick={onPick}
        onMouseMove={onHover}
        className={cn(
          "flex items-center gap-4 px-5 py-2.5 hover:no-underline",
          active && "bg-surface-stone",
        )}
      >
        <span className="bg-surface-stone text-ink-mute relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[2px]">
          {s.image ? (
            <ImagePlaceholder label={s.image} sizes="44px" />
          ) : (
            <Icon aria-hidden="true" className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[15px] font-medium">
            {s.title}
          </span>
          {s.sub ? (
            <span className="text-ink-mute block truncate text-xs">
              {s.sub}
            </span>
          ) : null}
        </span>
        <ArrowRight
          aria-hidden="true"
          className={cn(
            "text-forest size-4 shrink-0 transition-opacity",
            active ? "opacity-100" : "opacity-0",
          )}
        />
      </Link>
    </li>
  );
}
