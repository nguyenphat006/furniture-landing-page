"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { animate, useInView, useReducedMotion } from "motion/react";

/*
 * Số đếm lên khi cuộn tới (2026-11-04). Ghi thẳng vào DOM, không setState mỗi frame.
 * SSR render sẵn số cuối nên không JS / bot vẫn đọc đúng; tắt hiệu ứng khi reduced-motion.
 */
export function CountUp({
  value,
  duration = 1.5,
}: {
  value: number;
  duration?: number;
}) {
  const locale = useLocale();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const fmt = (n: number) =>
    n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !inView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (v) => {
        el.textContent = fmt(Math.round(v));
      },
    });
    return () => controls.stop();
    // fmt chỉ phụ thuộc locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value, duration, locale]);

  return <span ref={ref}>{fmt(value)}</span>;
}
