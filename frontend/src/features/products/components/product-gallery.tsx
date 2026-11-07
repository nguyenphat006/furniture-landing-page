"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { resolveAsset } from "@/config/assets";
import { cn } from "@/lib/utils";

/*
 * Bộ ảnh trang chi tiết sản phẩm (2026-11-06), kiểu Gloster / Nghĩa Sơn: ảnh lớn 3:2 (khớp tỉ lệ đa số ảnh studio ERP),
 * dải ảnh nhỏ vuông bên dưới để đổi ảnh (chỉ hiện khi có từ 2 ảnh). Ảnh ERP chụp studio nền sáng
 * nên khung lớn dùng object-contain để không cắt mất sản phẩm dài (ghế tắm nắng, sofa).
 * Không có nền màu khung, không có icon phóng to (người dùng bỏ); con trỏ kính lúp gợi ý bấm được.
 *
 * Bấm ảnh lớn → lightbox toàn màn hình dùng thư viện yet-another-react-lightbox 3.32.2 (MIT), các plugin:
 *   - Zoom: phóng to / thu nhỏ bằng nút, cuộn chuột, nhấp đúp, chụm 2 ngón; kéo để di chuyển khi đang zoom;
 *   - Fullscreen: bật / tắt toàn màn hình trình duyệt;
 *   - Thumbnails + Counter: dải ảnh nhỏ dưới đáy và số thứ tự (chỉ bật khi có từ 2 ảnh);
 *   - Captions: tên sản phẩm.
 * Sẵn có: vuốt / phím ← → để chuyển ảnh, Esc để đóng, khoá cuộn trang, giữ focus trong modal.
 * Nhãn nút dịch qua messages ProductsPage.detail.lightbox.
 */
export function ProductGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const t = useTranslations("ProductsPage.detail");
  const tl = useTranslations("ProductsPage.detail.lightbox");
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

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        index={active}
        slides={slides}
        on={{ view: ({ index }) => setActive(index) }}
        plugins={
          many
            ? [Zoom, Fullscreen, Thumbnails, Counter, Captions]
            : [Zoom, Fullscreen, Captions]
        }
        carousel={{ finite: !many }}
        render={
          many ? undefined : { buttonPrev: () => null, buttonNext: () => null }
        }
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
        thumbnails={{
          width: 96,
          height: 64,
          border: 2,
          borderRadius: 0,
          padding: 0,
          gap: 12,
          imageFit: "cover",
        }}
        captions={{ descriptionTextAlign: "start" }}
        // Số thứ tự ở giữa phía trên để không đè tên sản phẩm (Captions nằm góc trái trên).
        // Ẩn dưới sm vì thanh trên hẹp sẽ đè nút; dải ảnh nhỏ đã cho biết ảnh đang xem.
        counter={{
          container: {
            className: "max-sm:hidden",
            style: {
              top: 0,
              left: "50%",
              right: "auto",
              transform: "translateX(-50%)",
            },
          },
        }}
        styles={{
          container: { backgroundColor: "rgb(14 14 14)" },
          thumbnailsContainer: { backgroundColor: "rgb(14 14 14)" },
          thumbnail: { borderColor: "rgb(255 255 255 / 0.15)" },
        }}
        labels={{
          Previous: tl("previous"),
          Next: tl("next"),
          Close: tl("close"),
          "Zoom in": tl("zoomIn"),
          "Zoom out": tl("zoomOut"),
          "Enter Fullscreen": tl("enterFullscreen"),
          "Exit Fullscreen": tl("exitFullscreen"),
          Lightbox: tl("lightbox"),
          Carousel: tl("carousel"),
          Slide: tl("slide"),
          Thumbnails: tl("thumbnails"),
          "Photo gallery": tl("lightbox"),
          "{index} of {total}": tl.raw("slideOf") as string,
        }}
      />
    </div>
  );
}
