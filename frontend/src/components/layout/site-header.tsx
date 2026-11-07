"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useSite } from "@/components/providers/site-provider";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Container } from "@/components/shared/section";
import { navHref, type NavKey } from "@/config/navigation";
import type { NavEntry } from "@/data/site/types";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
// Menu modal fullscreen tạm ẩn (2026-11-04), thay bằng dropdown. Giữ file, không xoá:
// import { MenuDialog } from "./menu-dialog";
import {
  DesktopDropdownPanel,
  isDropdownKey,
  MobileNavPanel,
  type DropdownKey,
} from "./nav-dropdowns";

/*
 * Header (chốt 2026-11-04): logo trái, dải menu ở giữa, gắn cứng khi cuộn (không tự ẩn).
 * Luôn nền trắng chữ tối, kể cả trên hero; cao cố định 72px (xl 80px), logo cỡ thường.
 * Từ xl (1280px): logo | Năng lực · Vật liệu ▾ · Sản phẩm ▾ · Về chúng tôi | VI/EN · Báo giá.
 * Vật liệu và Sản phẩm mở mega dropdown full-width khi hover, hoặc bấm nút ▾ (bàn phím, cảm ứng).
 * Dưới xl: logo trái; Báo giá + hamburger sát phải; hamburger thả panel menu xuống dưới header.
 * Mục menu, thứ tự, tên sửa ở CMS (Cài đặt → Thông tin chung → Menu); mặc định ở data/site.
 */

/** Trễ khi rời chuột khỏi header trước khi đóng dropdown, tránh nháy khi lướt qua mép */
const CLOSE_DELAY = 140;

export function SiteHeader() {
  const t = useTranslations("Common");
  const { nav } = useSite();
  const locale = useLocale();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [openMenu, setOpenMenu] = useState<DropdownKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  // Mở dropdown bằng bàn phím: đưa focus vào link đầu của panel (panel nằm cuối header trong DOM,
  // Tab tự nhiên sẽ đi qua các mục menu khác trước). QC 07/11.
  const focusPanel = useRef(false);
  useEffect(() => {
    if (!openMenu || !focusPanel.current) return;
    focusPanel.current = false;
    const id = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`#dd-${openMenu} a[href]`)?.focus(),
    );
    return () => cancelAnimationFrame(id);
  }, [openMenu]);

  /** Tab ra khỏi panel: đóng, Shift+Tab ở link đầu về nút ▾, Tab ở link cuối sang mục menu kế tiếp */
  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !openMenu) return;
    const links = [
      ...e.currentTarget.querySelectorAll<HTMLElement>("a[href], button"),
    ];
    const first = links[0];
    const last = links.at(-1);
    const toggle = document.querySelector<HTMLElement>(
      `[data-dropdown-toggle="${openMenu}"]`,
    );
    if (!toggle) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      setOpenMenu(null);
      toggle.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      const items = [
        ...(headerRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button",
        ) ?? []),
      ].filter((el) => !e.currentTarget.contains(el) && el.offsetParent);
      const next = items[items.indexOf(toggle) + 1];
      e.preventDefault();
      setOpenMenu(null);
      (next ?? toggle).focus();
    }
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenMenu(null), CLOSE_DELAY);
  };
  const closeAll = () => {
    cancelClose();
    setOpenMenu(null);
    setMobileOpen(false);
  };

  // Esc đóng dropdown và trả focus về nút ▾ của mục đang mở
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openMenu) {
        document
          .querySelector<HTMLButtonElement>(
            `[data-dropdown-toggle="${openMenu}"]`,
          )
          ?.focus();
      }
      // Panel mobile: trả focus về nút hamburger
      if (mobileOpen) burgerRef.current?.focus();
      setOpenMenu(null);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, mobileOpen]);

  // Panel mobile đang mở: khoá cuộn nền; lên xl thì tự đóng
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const mq = window.matchMedia("(min-width: 80rem)");
    const onChange = () => mq.matches && setMobileOpen(false);
    mq.addEventListener("change", onChange);
    return () => {
      document.documentElement.style.overflow = prev;
      mq.removeEventListener("change", onChange);
    };
  }, [mobileOpen]);

  useEffect(() => cancelClose, []);

  const isActive = (key: NavKey) =>
    pathname === navHref[key] || pathname.startsWith(`${navHref[key]}/`);

  // Chữ menu: 14px, weight 400, chữ in hoa giãn nhẹ (nhịp như ATC, giữ font Inter của BFC)
  const navText =
    "text-sm font-normal tracking-[.06em] whitespace-nowrap uppercase";

  const navItem = (entry: NavEntry) => {
    const { key } = entry;
    const dropdown = key && isDropdownKey(key) ? key : null;
    const open = dropdown !== null && openMenu === dropdown;
    const label = entry.label || (key ? t(`nav.${key}`) : entry.href);
    return (
      <div
        key={key ?? entry.href}
        className="flex items-center gap-1"
        onMouseEnter={() => {
          cancelClose();
          setOpenMenu(dropdown);
        }}
      >
        <Link
          href={entry.href}
          onClick={closeAll}
          {...(key
            ? { "aria-current": isActive(key) ? ("page" as const) : undefined }
            : { target: "_blank", rel: "noopener noreferrer" })}
          className={cn(
            "text-ink relative py-2 hover:no-underline",
            navText,
            // vạch dưới chạy từ trái sang khi hover, giữ nguyên khi là trang hiện tại hoặc đang mở dropdown
            "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-(--duration-base) hover:after:scale-x-100 aria-[current=page]:after:scale-x-100",
            open && "after:scale-x-100",
          )}
        >
          {label}
        </Link>
        {dropdown ? (
          <button
            type="button"
            data-dropdown-toggle={dropdown}
            aria-expanded={open}
            aria-controls={`dd-${dropdown}`}
            aria-label={t("menu.toggleSubmenu", { label })}
            onClick={(e) => {
              cancelClose();
              // detail 0: bấm bằng Enter / Space
              focusPanel.current = !open && e.detail === 0;
              setOpenMenu(open ? null : dropdown);
            }}
            className="text-ink -mr-1 flex size-6 cursor-pointer items-center justify-center"
          >
            <ChevronDown
              aria-hidden="true"
              strokeWidth={1.75}
              className={cn(
                "ease-out-soft size-3.5 transition-transform duration-(--duration-base)",
                open && "rotate-180",
              )}
            />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <header
        ref={headerRef}
        onMouseLeave={scheduleClose}
        onMouseEnter={cancelClose}
        // Focus rời khỏi header (Tab ra ngoài) thì đóng dropdown
        onBlur={(e) => {
          if (!headerRef.current?.contains(e.relatedTarget as Node | null)) {
            setOpenMenu(null);
          }
        }}
        className="border-line fixed inset-x-0 top-0 z-[60] border-b bg-white"
      >
        {/* Cùng container với mọi section (Container wide): lề = gutter, nội dung tối đa 1640px */}
        <Container className="flex h-[72px] items-center justify-between gap-6 xl:grid xl:h-20 xl:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/"
            aria-label={t("homeAria")}
            onClick={closeAll}
            onMouseEnter={scheduleClose}
            className="flex items-center justify-self-start hover:no-underline"
          >
            <BrandLogo
              // Logo 52px, từ xl 64px
              compact
              // Header chỉ hiện logo tròn, không kèm tên (chốt 2026-11-04)
              className="[&>span]:hidden"
            />
          </Link>

          {/* Giữa (xl+): toàn bộ dải menu chính */}
          <nav
            aria-label={t("mainNavAria")}
            className="hidden items-center gap-9 xl:flex"
          >
            {nav.map(navItem)}
          </nav>

          {/* Phải: VI/EN (xl+), nút Báo giá; dưới xl thêm hamburger sát phải */}
          <div
            className="flex items-center justify-end gap-3 xl:gap-8"
            onMouseEnter={scheduleClose}
          >
            <div
              className={cn(
                "text-ink hidden items-center gap-2 xl:flex",
                navText,
              )}
            >
              {routing.locales.map((l, i) => (
                <span key={l} className="flex items-center gap-2">
                  {i > 0 ? (
                    <span aria-hidden="true" className="opacity-40">
                      /
                    </span>
                  ) : null}
                  {l === locale ? (
                    <span aria-current="true" className="font-semibold">
                      {l.toUpperCase()}
                    </span>
                  ) : (
                    <Link
                      href={pathname}
                      locale={l}
                      aria-label={t(`languages.${l}`)}
                      className="opacity-60 transition-opacity hover:no-underline hover:opacity-100"
                    >
                      {l.toUpperCase()}
                    </Link>
                  )}
                </span>
              ))}
            </div>

            <Link
              href={navHref.contact}
              onClick={closeAll}
              className="bg-forest hover:bg-ink inline-flex min-h-11 items-center justify-center rounded-sm px-5 text-[13px] font-medium tracking-[.08em] whitespace-nowrap text-white uppercase transition-colors hover:no-underline"
            >
              {t("requestQuoteShort")}
            </Link>

            {/* Hamburger (dưới xl): 3 vạch, mở thì thành dấu × */}
            <button
              ref={burgerRef}
              type="button"
              aria-label={t(mobileOpen ? "closeMenu" : "openMenu")}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen((v) => !v)}
              className="group relative -mr-1.5 flex size-12 cursor-pointer flex-col items-end justify-center gap-[9px] xl:hidden"
            >
              {["w-10", "w-10", "w-6"].map((w, i) => (
                <span
                  key={i}
                  className={cn(
                    "bg-ink ease-out-soft block h-px transition-[width,transform,opacity] duration-(--duration-base)",
                    w,
                    !mobileOpen && i === 2 && "group-hover:w-10",
                    mobileOpen && i === 0 && "w-8 translate-y-[10px] rotate-45",
                    mobileOpen && i === 1 && "opacity-0",
                    mobileOpen &&
                      i === 2 &&
                      "w-8 -translate-y-[10px] -rotate-45",
                  )}
                />
              ))}
            </button>
          </div>
        </Container>

        {/* Mega dropdown desktop: full-width ngay dưới header */}
        <AnimatePresence>
          {openMenu ? (
            <motion.div
              key="dd"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="border-line absolute inset-x-0 top-full hidden border-t bg-white shadow-[0_18px_40px_-24px_rgba(0,0,0,.25)] xl:block"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={openMenu}
                  onKeyDown={onPanelKeyDown}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <DesktopDropdownPanel
                    menu={openMenu}
                    id={`dd-${openMenu}`}
                    onNavigate={closeAll}
                  />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Panel menu mobile: thả xuống dưới header */}
        <AnimatePresence>
          {mobileOpen ? (
            <motion.div
              id="mobile-nav"
              key="m"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="border-line absolute inset-x-0 top-full border-t bg-white xl:hidden"
            >
              <MobileNavPanel nav={nav} onNavigate={closeAll} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      {/* Lớp mờ phía sau dropdown, bấm để đóng */}
      <AnimatePresence>
        {openMenu || mobileOpen ? (
          <motion.div
            key="scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={closeAll}
            className={cn(
              "fixed inset-0 z-[55] bg-black/25",
              // Dropdown desktop chỉ hiện từ xl; panel mobile chỉ dưới xl
              openMenu && !mobileOpen && "hidden xl:block",
              mobileOpen && !openMenu && "xl:hidden",
            )}
          />
        ) : null}
      </AnimatePresence>

      {/* <MenuDialog open={menuOpen} onClose={() => setMenuOpen(false)} /> */}
    </>
  );
}
