"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { mainNav, navHref, type NavKey } from "@/config/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { siteConfig } from "@/config/site";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Đường cong màn trập — mượt kiểu "curtain" hiện đại */
const CURTAIN_EASE = [0.76, 0, 0.24, 1] as const;
const ITEM_EASE = [0.16, 1, 0.3, 1] as const;

/** Mục đầu tiên có submenu — nội dung mặc định cho cột giữa */
const DEFAULT_SUB = mainNav.find((item) => item.children?.length)?.key ?? null;

type MenuDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function MenuDialog({ open, onClose }: MenuDialogProps) {
  const t = useTranslations("Common");
  const tf = useTranslations("Footer");
  const locale = useLocale();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [subKey, setSubKey] = useState<NavKey | null>(DEFAULT_SUB);

  // Khoá cuộn nền + đóng bằng Escape khi dialog đang mở
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const activeKey = mainNav.find(
    (item) =>
      pathname === navHref[item.key] ||
      pathname.startsWith(`${navHref[item.key]}/`),
  )?.key;

  const childLabel = (navKey: NavKey, slug: string) =>
    t(`${navKey === "materials" ? "materials" : "products"}.${slug}`);

  const subItem = mainNav.find((item) => item.key === subKey);
  const subChildren = subItem?.children ?? [];

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t("menuTitle")}
          className="bg-ink fixed inset-0 z-[80] overflow-y-auto text-white"
          initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
          animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
          exit={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
          transition={{ duration: reduce ? 0.15 : 0.7, ease: CURTAIN_EASE }}
        >
          {/* Nền trang trí: 2 quầng sáng thương hiệu + watermark BFC mờ */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div className="bg-forest/25 absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full blur-[160px]" />
            <div className="bg-gold/15 absolute -right-32 bottom-0 h-[480px] w-[480px] rounded-full blur-[140px]" />
            <span className="absolute right-[-2%] bottom-[-6%] text-[26vw] leading-none font-bold tracking-tighter text-white/[.03] select-none">
              BFC
            </span>
          </div>

          <div className="relative flex min-h-full flex-col">
            {/* Hàng trên: logo + nút đóng, trùng vị trí với header */}
            <div className="mx-auto flex h-[72px] w-full max-w-[1600px] shrink-0 items-center justify-between px-7">
              <BrandLogo tone="light" />
              <button
                type="button"
                aria-label={t("closeMenu")}
                onClick={onClose}
                autoFocus
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[2px] border border-white/25 bg-transparent text-lg text-white transition-colors hover:border-white"
              >
                ✕
              </button>
            </div>

            <div className="mx-auto grid w-full max-w-[1600px] flex-1 content-center gap-12 px-7 py-10 lg:grid-cols-[1.35fr_0.75fr_0.9fr] lg:gap-16 lg:py-12">
              {/* Cột 1 — nav chính, các hàng cao đồng nhất */}
              <nav aria-label="Main">
                <ul className="grid gap-1.5 lg:gap-3">
                  {mainNav.map((item, i) => {
                    const isActive = activeKey === item.key;
                    const hasChildren = Boolean(item.children?.length);
                    const isSub = subKey === item.key;
                    return (
                      <motion.li
                        key={item.key}
                        initial={reduce ? false : { opacity: 0, y: 28 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.55,
                          delay: reduce ? 0 : 0.25 + i * 0.05,
                          ease: ITEM_EASE,
                        }}
                        onMouseEnter={
                          hasChildren ? () => setSubKey(item.key) : undefined
                        }
                      >
                        <Link
                          href={navHref[item.key]}
                          onClick={onClose}
                          onFocus={
                            hasChildren ? () => setSubKey(item.key) : undefined
                          }
                          className="group flex h-[clamp(60px,8.5vh,96px)] items-center justify-between gap-6 hover:no-underline"
                        >
                          <span
                            className={cn(
                              "text-[clamp(1.75rem,4.2vw,3.375rem)] leading-none font-semibold tracking-[.01em] uppercase transition-[color,transform] duration-300 group-hover:translate-x-2",
                              isActive || (hasChildren && isSub)
                                ? "text-gold"
                                : "group-hover:text-gold text-white",
                            )}
                          >
                            {t(`nav.${item.key}`)}
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-gold shrink-0 translate-x-2 text-xl opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                          >
                            →
                          </span>
                        </Link>

                        {/* Mobile: submenu hiện ngay dưới mục cha */}
                        {hasChildren ? (
                          <div className="flex flex-wrap gap-x-5 gap-y-1.5 pb-5 lg:hidden">
                            {item.children?.map((c) => (
                              <Link
                                key={c.slug}
                                href={c.href}
                                onClick={onClose}
                                className="text-sm text-white/55 transition-colors hover:text-white hover:no-underline"
                              >
                                {childLabel(item.key, c.slug)}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </ul>
              </nav>

              {/* Cột 2 — submenu của mục đang trỏ tới (chỉ desktop) */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  delay: reduce ? 0 : 0.45,
                  ease: ITEM_EASE,
                }}
                className="hidden border-white/10 lg:block lg:border-l lg:pl-12"
              >
                <AnimatePresence mode="wait">
                  {subItem ? (
                    <motion.div
                      key={subItem.key}
                      initial={reduce ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.28, ease: ITEM_EASE }}
                    >
                      <p className="text-gold mb-6 text-xs tracking-[.16em] uppercase">
                        {t(`nav.${subItem.key}`)}
                      </p>
                      <ul className="grid gap-3.5">
                        {subChildren.map((c) => (
                          <li key={c.slug}>
                            <Link
                              href={c.href}
                              onClick={onClose}
                              className="hover:text-gold text-[15px] text-white/65 transition-colors hover:no-underline"
                            >
                              {childLabel(subItem.key, c.slug)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>

              {/* Cột 3 — thông tin doanh nghiệp + đổi ngôn ngữ */}
              <motion.aside
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  delay: reduce ? 0 : 0.55,
                  ease: ITEM_EASE,
                }}
                className="grid content-start gap-8 border-white/10 lg:border-l lg:pl-12"
              >
                <div>
                  <p className="text-gold mb-3 text-xs tracking-[.16em] uppercase">
                    {tf("contactTitle")}
                  </p>
                  <p className="max-w-[36ch] text-sm leading-[1.7] text-white/70">
                    {t("tagline")}
                  </p>
                  <p className="mt-3 max-w-[36ch] text-sm leading-[1.7] text-white/70">
                    {tf("address")}
                  </p>
                </div>

                <div className="grid gap-2">
                  <a
                    href={siteConfig.phoneHref}
                    className="text-base text-white/85 transition-colors hover:text-white"
                  >
                    {siteConfig.phone}
                  </a>
                  <a
                    href={siteConfig.emailHref}
                    className="text-base text-white/85 transition-colors hover:text-white"
                  >
                    {siteConfig.email}
                  </a>
                </div>

                <Link
                  href={navHref.contact}
                  onClick={onClose}
                  className="text-ink hover:bg-gold inline-flex min-h-11 w-fit items-center justify-center rounded-[2px] bg-white px-7 py-3.5 text-[13px] font-medium tracking-[.08em] uppercase transition-colors hover:no-underline"
                >
                  {t("requestQuote")}
                </Link>

                <div>
                  <p className="text-gold mb-3 text-xs tracking-[.16em] uppercase">
                    {t("languageLabel")}
                  </p>
                  <div className="flex gap-2">
                    {routing.locales.map((l) =>
                      l === locale ? (
                        <span
                          key={l}
                          className="border-gold rounded-[2px] border px-5 py-2.5 text-sm font-semibold text-white"
                        >
                          {t(`languages.${l}`)}
                        </span>
                      ) : (
                        <Link
                          key={l}
                          href={pathname}
                          locale={l}
                          className="rounded-[2px] border border-white/25 px-5 py-2.5 text-sm text-white/70 transition-colors hover:border-white hover:text-white hover:no-underline"
                        >
                          {t(`languages.${l}`)}
                        </Link>
                      ),
                    )}
                  </div>
                </div>
              </motion.aside>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
