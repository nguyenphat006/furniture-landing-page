"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMotionValueEvent, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { chairParts } from "@/features/capabilities/data";
import type { ChairScene } from "@/features/capabilities/three/chair-scene";

type Chair3DProps = {
  /** 0 = ghế lắp ráp, 1 = tách rời hoàn toàn */
  explode: MotionValue<number>;
  /** Bộ phận đang được hover ở danh sách bên cạnh */
  activeKey?: string | null;
  className?: string;
};

/** Nhãn chỉ hiện khi các bộ phận đã tách đủ xa, tránh chồng lên nhau lúc ghế còn nguyên */
const LABEL_EXPLODE_MIN = 0.45;
/** Xoay nhẹ cả ghế theo tiến độ tách để thấy rõ khung hông và lưới đan hai bên */
const TURN_AT_FULL_EXPLODE = 0.35;
/** Khoảng cách thẻ nhãn tới mép khung bao ghế, và khoảng cách dọc tối thiểu giữa hai thẻ cùng phía */
const LABEL_GAP = 28;
const LABEL_MIN_SPACING = 64;
const LABEL_EDGE_PAD = 8;

type LabelLayout = {
  index: number;
  ax: number;
  ay: number;
  x: number;
  y: number;
  side: "left" | "right";
  show: boolean;
};

/**
 * Ghế xoay 3D dựng bằng img2threejs (3d/swivel-chair). Model nặng nên được tách chunk riêng và chỉ tải
 * khi section tới gần viewport; vòng vẽ dừng khi canvas ra khỏi màn hình.
 */
export function Chair3D({ explode, activeKey, className }: Chair3DProps) {
  const t = useTranslations("CapabilitiesPage.madeHere");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const leaderRefs = useRef<(SVGGElement | null)[]>([]);
  const chairRef = useRef<ChairScene | null>(null);
  // Tách "đã tới lúc tải" khỏi trạng thái hiển thị: effect dựng cảnh chỉ phụ thuộc shouldLoad,
  // nếu phụ thuộc status thì lúc chuyển sang "ready" cleanup sẽ dispose luôn cảnh vừa dựng
  const [shouldLoad, setShouldLoad] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [interactive, setInteractive] = useState(false);

  useMotionValueEvent(explode, "change", (value) => {
    chairRef.current?.setExplode(value);
    chairRef.current?.setTurn(value * TURN_AT_FULL_EXPLODE);
  });

  // Chỉ tải model khi section sắp vào màn hình
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || shouldLoad) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShouldLoad(true);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let cancelled = false;
    let chair: ChairScene | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;

    // Thẻ nhãn nằm ngoài khung bao của ghế (trái/phải theo vị trí điểm neo), nối về điểm neo bằng đường chỉ.
    // Cập nhật DOM trực tiếp mỗi khung, không đi qua state của React.
    const layoutLabels = () => {
      if (!chair) return;
      const bounds = chair.projectBounds();
      const centreX = (bounds.left + bounds.right) / 2;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const exploded = explode.get() >= LABEL_EXPLODE_MIN;
      const layouts: LabelLayout[] = [];
      chairParts.forEach((part, index) => {
        const point = chair?.projectComponent(part.anchor);
        if (!point) return;
        const side = point.x < centreX ? "left" : "right";
        layouts.push({
          index,
          ax: point.x,
          ay: point.y,
          side,
          x:
            side === "left"
              ? bounds.left - LABEL_GAP
              : bounds.right + LABEL_GAP,
          y: point.y,
          show: exploded && point.visible,
        });
      });
      for (const side of ["left", "right"] as const) {
        const column = layouts
          .filter((layout) => layout.side === side)
          .sort((a, b) => a.y - b.y);
        column.forEach((layout, i) => {
          if (i > 0)
            layout.y = Math.max(layout.y, column[i - 1].y + LABEL_MIN_SPACING);
        });
      }
      for (const layout of layouts) {
        const label = labelRefs.current[layout.index];
        const leader = leaderRefs.current[layout.index];
        if (!label || !leader) continue;
        const cardWidth = label.offsetWidth;
        const x =
          layout.side === "left"
            ? Math.max(layout.x, cardWidth + LABEL_EDGE_PAD)
            : Math.min(layout.x, width - cardWidth - LABEL_EDGE_PAD);
        const y = Math.min(Math.max(layout.y, 32), height - 32);
        const left = layout.side === "left" ? x - cardWidth : x;
        label.style.transform = `translate3d(${left}px, ${y}px, 0) translateY(-50%)`;
        label.style.opacity = layout.show ? "1" : "0";
        const [line, dot] = leader.children;
        line.setAttribute("x1", String(layout.ax));
        line.setAttribute("y1", String(layout.ay));
        line.setAttribute("x2", String(x));
        line.setAttribute("y2", String(y));
        dot.setAttribute("cx", String(layout.ax));
        dot.setAttribute("cy", String(layout.ay));
        leader.style.opacity = layout.show ? "1" : "0";
      }
    };

    import("@/features/capabilities/three/chair-scene")
      .then(({ createChairScene }) => {
        if (cancelled) return;
        // Cảm ứng: không bật kéo xoay để vuốt trên canvas vẫn cuộn được trang
        const canOrbit = window.matchMedia("(pointer: fine)").matches;
        chair = createChairScene(canvas, {
          azimuthDeg: 140,
          elevationDeg: 14,
          interactive: canOrbit,
          background: null,
          // desktop chừa chỗ hai bên cho thẻ nhãn; màn hẹp không hiện nhãn nên cho ghế to hết khung
          margin: window.matchMedia("(min-width: 640px)").matches ? 1.22 : 0.98,
          frameExplode: 1,
          shadowOpacity: 0.12,
          onFrame: () => layoutLabels(),
        });
        chair.setExplode(explode.get());
        chair.setTurn(explode.get() * TURN_AT_FULL_EXPLODE);
        chairRef.current = chair;
        setInteractive(canOrbit);

        const scene = chair;
        resizeObserver = new ResizeObserver(() => scene.resize());
        resizeObserver.observe(canvas);
        visibilityObserver = new IntersectionObserver(([entry]) =>
          scene.setActive(entry.isIntersecting),
        );
        visibilityObserver.observe(wrap);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      chair?.dispose();
      chairRef.current = null;
    };
    // explode chỉ đọc giá trị hiện tại khi dựng cảnh; thay đổi sau đó đi qua useMotionValueEvent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        aria-label={t("canvasAria")}
        role="img"
        className={cn(
          // mép dưới mờ dần để bóng đổ trên sàn không bị cắt thẳng ở cạnh canvas
          "absolute inset-0 block h-full w-full [mask-image:linear-gradient(to_bottom,#000_84%,transparent)] transition-opacity duration-700",
          interactive && "cursor-grab active:cursor-grabbing",
          status === "ready" ? "opacity-100" : "opacity-0",
        )}
      />

      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-ink-mute text-xs tracking-[.16em] uppercase">
            {status === "error" ? t("loadError") : t("loading")}
          </span>
        </div>
      ) : null}

      {/* Nhãn bộ phận: điểm neo trên model + đường chỉ + thẻ tên đặt ngoài khung bao ghế */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 max-sm:hidden"
      >
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          {chairParts.map((part, index) => {
            const active = activeKey === part.key;
            return (
              <g
                key={part.key}
                ref={(el) => {
                  leaderRefs.current[index] = el;
                }}
                opacity={0}
                className="transition-opacity duration-500"
              >
                <line
                  strokeWidth={1}
                  className={cn(
                    "transition-[stroke] duration-300",
                    active ? "stroke-ink" : "stroke-gold",
                  )}
                />
                <circle
                  r={active ? 5 : 3.5}
                  className={cn(
                    "transition-[fill] duration-300",
                    active ? "fill-ink" : "fill-gold",
                  )}
                />
              </g>
            );
          })}
        </svg>
        {chairParts.map((part, index) => (
          <a
            key={part.key}
            ref={(el) => {
              labelRefs.current[index] = el;
            }}
            href={`#ws-${part.ws}`}
            tabIndex={-1}
            className={cn(
              "pointer-events-auto absolute top-0 left-0 border bg-white/90 px-3.5 py-2 whitespace-nowrap opacity-0 shadow-[0_10px_30px_rgba(20,20,20,.08)] backdrop-blur-sm transition-[opacity,border-color] duration-500 hover:no-underline",
              activeKey === part.key
                ? "border-ink"
                : "border-line hover:border-ink",
            )}
          >
            <span className="text-ink block text-sm leading-tight font-semibold">
              {t(`callouts.${part.key}.part`)}
            </span>
            <span className="text-gold mt-0.5 block text-[10px] font-medium tracking-[.16em] uppercase">
              {t(`callouts.${part.key}.shop`)}
            </span>
          </a>
        ))}
      </div>

      {status === "ready" && interactive ? (
        <p className="text-ink-mute pointer-events-none absolute right-0 bottom-3 left-0 text-center text-[11px] tracking-[.16em] uppercase">
          {t("dragHint")}
        </p>
      ) : null}
    </div>
  );
}
