"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Mục lục trang pháp lý (2026-11-07): dính bên trái (lg+), mục đang đọc sáng màu forest + vạch dọc.
 * Mục đang đọc = mục cuối cùng có đầu mục đã cuộn qua vạch 35% chiều cao màn hình; cuộn tới đáy
 * trang thì sáng mục cuối (mục ngắn cuối trang không bao giờ chạm vạch).
 */
export function LegalToc({
  label,
  items,
}: {
  label: string;
  items: { id: string; heading: string }[];
}) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      let current = items[0]?.id;
      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(atBottom ? items[items.length - 1]?.id : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <nav aria-label={label} className="hidden lg:block">
      <div className="sticky top-28">
        <p className="text-ink-mute mb-4 pl-5 text-[11px] font-semibold tracking-[.14em] uppercase">
          {label}
        </p>
        <ol className="border-line space-y-1 border-l text-sm">
          {items.map((s) => {
            const on = s.id === active;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "location" : undefined}
                  className={cn(
                    "-ml-px block border-l-2 py-1.5 pl-5 transition-colors",
                    on
                      ? "border-forest text-forest font-semibold"
                      : "text-ink-soft hover:text-forest border-transparent",
                  )}
                >
                  {s.heading}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
