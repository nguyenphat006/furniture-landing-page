"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";

/** Ngưỡng hiện nút — qua khoảng một màn hình đầu tiên */
const SHOW_AFTER = 600;

/** Nút nổi góc dưới phải, đưa trang về đầu */
export function ScrollToTop() {
  const t = useTranslations("Common");
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setVisible(y > SHOW_AFTER));

  const toTop = () =>
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          onClick={toTop}
          aria-label={t("backToTop")}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.9 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.9 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="bg-ink hover:bg-forest fixed right-6 bottom-6 z-50 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-white shadow-[0_8px_28px_rgba(20,20,20,.28)] transition-colors max-lg:bottom-[calc(3.5rem+1rem+env(safe-area-inset-bottom))] lg:right-8 lg:bottom-8"
        >
          <span aria-hidden="true" className="text-lg leading-none font-light">
            ↑
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
