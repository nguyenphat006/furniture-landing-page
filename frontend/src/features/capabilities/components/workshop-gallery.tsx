"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PhotoLightbox } from "@/components/shared/photo-lightbox";
import { resolveAsset } from "@/config/assets";
import { cn } from "@/lib/utils";

/*
 * Ảnh xưởng (2026-11-09): khung cố định 4:3 (ảnh xưởng đều chụp 4:3, khung không co giãn theo cột
 * bên cạnh để ảnh không bị cắt méo). 1 ảnh: ảnh tĩnh. Từ 2 ảnh: tự chuyển ảnh (mờ dần chồng lên nhau)
 * mỗi INTERVAL ms, không có nút ‹ › (user 09/11).
 * - Góc dưới trái: số "01 / 03" + vạch tiến độ, vạch đang chạy đầy dần theo thời gian; bấm vạch để tới
 *   ảnh đó.
 * - Chạy luôn từ khi tải trang, không chờ cuộn tới (user 09/11). Tạm dừng khi rê chuột / focus vào
 *   khung (WCAG 2.2.2: nội dung tự chạy phải dừng được) và khi tab bị ẩn. prefers-reduced-motion:
 *   không tự chạy.
 * - Bấm ảnh: mở PhotoLightbox (dùng chung với ảnh sản phẩm) tại ảnh đang hiện; trong lúc mở thì
 *   ngừng tự chạy, đóng lại thì khung ở đúng ảnh vừa xem.
 * Dùng lại cho khối Gallery kiểu slider trong bài tin tức: `namespace` đổi bộ nhãn (cùng các khoá
 * galleryLabel / galleryGoTo / galleryOpen), `captions` là chú thích từng ảnh hiện trong lightbox.
 */

const INTERVAL = 4500;
const pad = (n: number) => String(n).padStart(2, "0");

export function WorkshopGallery({
  images,
  name,
  captions,
  namespace = "CapabilitiesPage.workshops",
}: {
  images: string[];
  name: string;
  captions?: string[];
  namespace?: "CapabilitiesPage.workshops" | "News.gallery";
}) {
  const t = useTranslations(namespace);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [open, setOpen] = useState(false);
  const many = images.length > 1;
  const playing = many && tabVisible && !hovered && !reduced && !open;

  const slides = images
    .map((img, i) => ({ src: resolveAsset(img), title: captions?.[i] || name }))
    .filter((s): s is { src: string; title: string } => Boolean(s.src))
    .map(({ src, title }) => ({ src, alt: title, title }));

  useEffect(() => {
    if (!many) return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [many]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % images.length),
      INTERVAL,
    );
    return () => window.clearTimeout(id);
  }, [playing, index, images.length]);

  return (
    <div
      className="group relative aspect-[4/3] overflow-hidden rounded-[2px] bg-white"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      {...(many
        ? {
            role: "region",
            "aria-roledescription": "carousel",
            "aria-label": t("galleryLabel", { name }),
          }
        : {})}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={slides.length === 0}
        aria-label={t("galleryOpen", { name })}
        className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
      >
        {images.map((img, i) => (
          <div
            key={img}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000 ease-out motion-reduce:transition-none",
              i === index ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={i === index ? undefined : true}
          >
            <ImagePlaceholder
              label={img}
              sizes="(min-width: 1024px) 45vw, 100vw"
            />
          </div>
        ))}
      </button>

      {many ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent"
          />
          <div className="absolute bottom-3 left-5 flex items-center gap-3 text-white">
            <span
              aria-hidden="true"
              className="text-xs font-semibold tracking-[.14em] tabular-nums"
            >
              {pad(index + 1)} / {pad(images.length)}
            </span>
            <span className="flex">
              {images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  aria-label={t("galleryGoTo", { n: i + 1 })}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => setIndex(i)}
                  className="flex h-6 cursor-pointer items-center px-1 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span className="relative block h-0.5 w-7 overflow-hidden bg-white/35">
                    {i === index ? (
                      // Đang chạy: vạch đầy dần trong INTERVAL; tạm dừng: vạch đầy sẵn
                      <span
                        key={`${index}-${playing}`}
                        className={cn(
                          "absolute inset-0 origin-left bg-white",
                          playing && "animate-[ws-progress_linear_both]",
                        )}
                        style={
                          playing
                            ? { animationDuration: `${INTERVAL}ms` }
                            : undefined
                        }
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </span>
          </div>
        </>
      ) : null}
      <PhotoLightbox
        open={open}
        close={() => setOpen(false)}
        index={index}
        slides={slides}
        onView={setIndex}
      />
    </div>
  );
}
