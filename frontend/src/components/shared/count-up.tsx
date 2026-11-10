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

/*
 * Số liệu dạng chữ từ CMS/messages ("28.000 m²", "50+", "2010") đếm lên khi cuộn tới (2026-11-09).
 * Chỉ đếm cụm số đầu tiên; năm (1900-2099, 4 chữ số) và chữ không có số giữ nguyên.
 * Kết thúc luôn ghi lại đúng chuỗi gốc nên không lệch định dạng.
 */
export function CountUpText({
  text,
  duration = 1.5,
}: {
  text: string;
  duration?: number;
}) {
  const locale = useLocale();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });

  useEffect(() => {
    const el = ref.current;
    const m = /^(\D*?)(\d[\d.,\s]*\d|\d)([^]*)$/.exec(text);
    if (!el || reduce || !inView || !m) return;
    const digits = m[2].replace(/\D/g, "");
    const value = Number(digits);
    if (!value || /^(19|20)\d\d$/.test(digits)) return;
    const fmt = (n: number) =>
      n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");
    const controls = animate(0, value, {
      duration,
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (v) => {
        el.textContent = `${m[1]}${fmt(Math.round(v))}${m[3]}`;
      },
      onComplete: () => {
        el.textContent = text;
      },
    });
    return () => {
      controls.stop();
      el.textContent = text;
    };
  }, [inView, reduce, text, duration, locale]);

  return <span ref={ref}>{text}</span>;
}
