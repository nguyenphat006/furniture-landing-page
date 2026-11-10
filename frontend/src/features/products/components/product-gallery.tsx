"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PhotoLightbox } from "@/components/shared/photo-lightbox";
import { resolveAsset } from "@/config/assets";
import { cn } from "@/lib/utils";

/*
 * Bộ ảnh trang chi tiết sản phẩm (2026-11-06), kiểu Gloster / Nghĩa Sơn: ảnh lớn 3:2 (khớp tỉ lệ đa số ảnh studio ERP),
 * dải ảnh nhỏ vuông bên dưới để đổi ảnh (chỉ hiện khi có từ 2 ảnh). Ảnh ERP chụp studio nền sáng
 * nên khung lớn dùng object-contain để không cắt mất sản phẩm dài (ghế tắm nắng, sofa).
 * Không có nền màu khung, không có icon phóng to (người dùng bỏ); con trỏ kính lúp gợi ý bấm được.
 *
 * Bấm ảnh lớn → lightbox toàn màn hình PhotoLightbox (components/shared, dùng chung với ảnh xưởng).
 */
export function ProductGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const t = useTranslations("ProductsPage.detail");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const many = images.length > 1;

  const slides = images
    .map((img) => resolveAsset(img))
    .filter((src): src is string => Boolean(src))
    .map((src) => ({ src, alt: name, title: name }));

  return (
    <div role="group" aria-label={t("gallery")}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={slides.length === 0}
        aria-label={`${t("zoom")}: ${name}`}
        className="group/zoom focus-visible:outline-forest relative block aspect-[3/2] w-full cursor-zoom-in overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ImagePlaceholder
          key={images[active]}
          label={images[active]}
          sizes="(min-width: 1024px) 58vw, 100vw"
          priority={active === 0}
          className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/zoom:scale-[1.02] [&_img]:object-contain"
        />
      </button>

      {many && (
        <ul className="mt-3 grid grid-cols-5 gap-3 sm:grid-cols-6">
          {images.map((img, i) => (
            <li key={img}>
              <button
                type="button"
                aria-label={t("galleryThumb", { n: i + 1 })}
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden border-2 transition-colors",
                  i === active
                    ? "border-ink"
                    : "hover:border-line border-transparent",
                )}
              >
                <ImagePlaceholder label={img} sizes="120px" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PhotoLightbox
        open={open}
        close={() => setOpen(false)}
        index={active}
        slides={slides}
        onView={setActive}
      />
    </div>
  );
}
