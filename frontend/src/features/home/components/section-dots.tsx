"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { sectionAnchors } from "../data";

export type SectionAnchor = (typeof sectionAnchors)[number];

/**
 * Thanh chấm điều hướng cố định bên phải, đánh dấu section đang xem (chỉ desktop).
 * `anchors` theo thứ tự section trên trang (trang chủ tính từ thứ tự block trong CMS).
 */
export function SectionDots({
  anchors,
}: {
  anchors: readonly SectionAnchor[];
}) {
  const t = useTranslations("HomePage.dots");
  const [active, setActive] = useState<string>("top");

  useEffect(() => {
    // Section trở thành active khi đỉnh của nó đi vào dải 20%-25% phía trên viewport
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-20% 0px -75% 0px" },
    );
    for (const anchor of anchors) {
      const el = document.getElementById(anchor);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [anchors]);

  return (
    <nav
      aria-label={t("aria")}
      className="fixed top-1/2 right-5 z-50 grid -translate-y-1/2 gap-3.5 max-lg:hidden"
    >
      {anchors.map((anchor) => (
        <a
          key={anchor}
          href={`#${anchor}`}
          aria-label={t(anchor)}
          className="h-1.5 w-1.5 rounded-full transition-colors duration-240"
          style={{
            background:
              active === anchor ? "var(--color-forest)" : "var(--color-line)",
          }}
        />
      ))}
    </nav>
  );
}
