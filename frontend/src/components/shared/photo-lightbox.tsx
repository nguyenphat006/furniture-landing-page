"use client";

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

/*
 * Xem ảnh toàn màn hình dùng chung (tách từ ProductGallery 2026-11-09, dùng cho ảnh sản phẩm và ảnh
 * xưởng ở trang Năng lực): thư viện yet-another-react-lightbox 3.32.2 (MIT), các plugin:
 *   - Zoom: phóng to / thu nhỏ bằng nút, cuộn chuột, nhấp đúp, chụm 2 ngón; kéo để di chuyển khi đang zoom;
 *   - Fullscreen: bật / tắt toàn màn hình trình duyệt;
 *   - Thumbnails + Counter: dải ảnh nhỏ dưới đáy và số thứ tự (chỉ bật khi có từ 2 ảnh);
 *   - Captions: tiêu đề ảnh (tên sản phẩm / tên xưởng).
 * Sẵn có: vuốt / phím ← → để chuyển ảnh, Esc để đóng, khoá cuộn trang, giữ focus trong modal.
 * Nhãn nút dịch qua messages Lightbox.
 */

export type LightboxSlide = { src: string; alt: string; title: string };

export function PhotoLightbox({
  open,
  close,
  index,
  slides,
  onView,
}: {
  open: boolean;
  close: () => void;
  index: number;
  slides: LightboxSlide[];
  onView?: (index: number) => void;
}) {
  const tl = useTranslations("Lightbox");
  const many = slides.length > 1;

  return (
    <Lightbox
      open={open}
      close={close}
      index={index}
      slides={slides}
      on={{ view: ({ index: i }) => onView?.(i) }}
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
      // Số thứ tự ở giữa phía trên để không đè tiêu đề (Captions nằm góc trái trên).
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
  );
}
