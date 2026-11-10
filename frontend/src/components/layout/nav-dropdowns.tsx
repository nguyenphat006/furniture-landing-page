"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown } from "lucide-react";
import { navHref, type NavKey } from "@/config/navigation";
import { useSite } from "@/components/providers/site-provider";
import type { NavEntry } from "@/data/site/types";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/shared/section";
import { cn } from "@/lib/utils";
import { LanguageList } from "./language-switcher";

/*
 * Dropdown của header (2026-11-04), thay cho MenuDialog fullscreen.
 * Tham khảo:
 * - Gloster: mega panel chỉ có chữ, chia cột theo nhóm; nhãn nhóm in hoa màu nhấn,
 *   cuối panel có link "xem tất cả" ngăn bằng divider.
 * - Nghĩa Sơn: panel mở khi hover, liệt kê đủ nhóm → loại. Mục cha vẫn là trang thật
 *   (Nghĩa Sơn dùng href="#" cho vài mục cha, BFC không làm vậy).
 * Khác hai site: có nút mũi tên riêng cạnh mục cha để mở bằng bàn phím/cảm ứng,
 * Esc để đóng; mobile dùng panel thả xuống dưới header (không phải dialog fullscreen).
 * Nội dung menu con lấy từ CMS (site.submenus): Sản phẩm = nhóm → loại, Vật liệu = Menu vật liệu.
 */

/** Các mục menu có dropdown */
export type DropdownKey = Extract<NavKey, "products" | "materials">;
export const dropdownKeys: DropdownKey[] = ["materials", "products"];
export const isDropdownKey = (key: NavKey): key is DropdownKey =>
  (dropdownKeys as NavKey[]).includes(key);

const panelLink =
  "text-ink-soft hover:text-ink text-[15px] leading-snug transition-colors duration-(--duration-micro) hover:no-underline";
const groupLabel =
  "text-forest hover:text-ink text-xs font-bold tracking-[.14em] uppercase transition-colors hover:no-underline";

/* ---------------------------------- Desktop --------------------------------- */

type DesktopPanelProps = {
  menu: DropdownKey;
  id: string;
  onNavigate: () => void;
};

/** Nội dung panel desktop: nền full-width dưới header, nội dung trong Container chung */
export function DesktopDropdownPanel({
  menu,
  id,
  onNavigate,
}: DesktopPanelProps) {
  const t = useTranslations("Common");
  const { submenus } = useSite();

  return (
    <Container id={id} className="pt-10 pb-8">
      {menu === "products" ? (
        <ul className="grid grid-cols-6 gap-x-8 gap-y-10">
          {submenus.products.map((group) => (
            <li key={group.key}>
              <Link
                href={group.href}
                onClick={onNavigate}
                className={cn(groupLabel, "mb-5 block")}
              >
                {group.label}
              </Link>
              <ul className="grid gap-3">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={panelLink}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,6fr)] gap-x-8">
          <p className="text-ink-soft max-w-[30ch] text-[15px] leading-relaxed">
            {t("menu.materialsIntro")}
          </p>
          {/* Nhóm vật liệu (in hoa, giống panel Sản phẩm) → loại con nếu có */}
          <ul className="grid grid-cols-4 gap-x-8 gap-y-10">
            {submenus.materials.map((group) => (
              <li key={group.key}>
                <Link
                  href={group.href}
                  onClick={onNavigate}
                  className={cn(groupLabel, "block")}
                >
                  {group.label}
                </Link>
                {group.items.length > 0 ? (
                  <ul className="mt-5 grid gap-3">
                    {group.items.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          className={panelLink}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Link "xem tất cả" ngăn bằng divider, kiểu Gloster */}
      <div className="border-line mt-10 border-t pt-6">
        <Link
          href={navHref[menu]}
          onClick={onNavigate}
          className="group/all text-ink inline-flex items-center gap-2 text-[13px] font-semibold tracking-[.14em] uppercase hover:no-underline"
        >
          {t(
            menu === "products"
              ? "menu.viewAllProducts"
              : "menu.viewAllMaterials",
          )}
          <ArrowRight
            aria-hidden="true"
            strokeWidth={2.5}
            className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-hover/all:translate-x-1"
          />
        </Link>
      </div>
    </Container>
  );
}

/* ---------------------------------- Mobile ---------------------------------- */

type MobilePanelProps = {
  nav: NavEntry[];
  onNavigate: () => void;
};

/** Panel thả xuống dưới header ở màn < xl: danh sách mục, mục có con mở dạng accordion */
export function MobileNavPanel({ nav, onNavigate }: MobilePanelProps) {
  const t = useTranslations("Common");
  const { submenus } = useSite();
  const [expanded, setExpanded] = useState<DropdownKey | null>(null);

  const children = (key: DropdownKey) =>
    // Mobile giữ như trước: Sản phẩm chỉ liệt kê nhóm, Vật liệu có thêm mục con
    submenus[key].map((g) => ({
      ...g,
      sub: key === "materials" ? g.items : [],
    }));

  return (
    <div className="px-gutter max-h-[calc(100svh-72px)] overflow-y-auto pt-2 pb-8">
      <ul>
        {nav.map((entry) => {
          const { key } = entry;
          const sub = key && isDropdownKey(key) ? key : null;
          const open = sub !== null && expanded === sub;
          const label = entry.label || (key ? t(`nav.${key}`) : entry.href);
          return (
            <li key={key ?? entry.href} className="border-line border-b">
              <div className="flex items-center justify-between">
                <Link
                  href={entry.href}
                  onClick={onNavigate}
                  {...(key
                    ? {}
                    : { target: "_blank", rel: "noopener noreferrer" })}
                  className="text-ink flex-1 py-4 text-[15px] font-medium tracking-[.06em] uppercase hover:no-underline"
                >
                  {label}
                </Link>
                {sub ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`m-sub-${sub}`}
                    aria-label={t("menu.toggleSubmenu", { label })}
                    onClick={() => setExpanded(open ? null : sub)}
                    className="text-ink -mr-2 flex size-11 cursor-pointer items-center justify-center"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className={cn(
                        "ease-out-soft size-5 transition-transform duration-(--duration-base)",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                ) : null}
              </div>
              {sub ? (
                <ul
                  id={`m-sub-${sub}`}
                  hidden={!open}
                  className="grid gap-3 pb-5 pl-4"
                >
                  {children(sub).map((c) => (
                    <li key={c.key}>
                      <Link
                        href={c.href}
                        onClick={onNavigate}
                        className={panelLink}
                      >
                        {c.label}
                      </Link>
                      {"sub" in c && c.sub.length > 0 ? (
                        <ul className="mt-3 grid gap-3 pl-4">
                          {c.sub.map((s) => (
                            <li key={s.key}>
                              <Link
                                href={s.href}
                                onClick={onNavigate}
                                className={cn(panelLink, "text-ink-mute")}
                              >
                                {s.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Đổi ngôn ngữ: cờ + tên theo CMS */}
      <LanguageList onNavigate={onNavigate} />
    </div>
  );
}
