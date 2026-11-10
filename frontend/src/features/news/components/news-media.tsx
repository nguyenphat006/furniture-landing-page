"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PhotoLightbox } from "@/components/shared/photo-lightbox";
import { resolveAsset } from "@/config/assets";
import type { NewsImage } from "@/data/news/types";
import { cn } from "@/lib/utils";

/*
 * Phần tương tác của khối nội dung bài tin tức (2026-11-09):
 * - ArticleImage / ArticleGallery: bấm ảnh mở PhotoLightbox (dùng chung với ảnh sản phẩm, ảnh xưởng),
 *   gallery lướt qua lại được giữa các ảnh, chú thích từng ảnh hiện trong lightbox.
 * - ArticleVideo: chỉ hiện ảnh bìa + nút phát; bấm mới tải trình phát (iframe YouTube không cookie /
 *   Vimeo, hoặc thẻ video với tệp MP4 / WebM) để trang nhẹ và không gắn cookie bên thứ ba khi chưa xem.
 */

const slide = (img: NewsImage, caption: string) => ({
  src: resolveAsset(img.src) ?? img.src,
  alt: img.alt,
  title: caption,
});

/** Ảnh trong khung (bài mẫu không có kích thước: khung 3:2, ảnh CMS: theo tỉ lệ thật) */
function Picture({
  image,
  sizes,
  ratio,
}: {
  image: NewsImage;
  sizes: string;
  /** Ép khung theo tỉ lệ (gallery dạng lưới); không truyền = theo ảnh */
  ratio?: string;
}) {
  const natural = !ratio && image.width && image.height;
  return (
    <div
      className="bg-surface-stone relative overflow-hidden"
      style={{
        aspectRatio: natural
          ? `${image.width} / ${image.height}`
          : (ratio ?? "3 / 2"),
      }}
    >
      <ImagePlaceholder
        label={image.src}
        sizes={sizes}
        className="transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
      />
    </div>
  );
}

export function ArticleImage({
  image,
  caption,
  sizes,
}: {
  image: NewsImage;
  caption: string;
  sizes: string;
}) {
  const t = useTranslations("News.blocks");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("enlarge", { name: image.alt })}
        className="group block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <Picture image={image} sizes={sizes} />
      </button>
      <PhotoLightbox
        open={open}
        close={() => setOpen(false)}
        index={0}
        slides={[slide(image, caption || image.alt)]}
      />
    </>
  );
}

export function ArticleGallery({
  images,
  columns,
}: {
  images: { image: NewsImage; caption: string }[];
  columns: 2 | 3;
}) {
  const t = useTranslations("News.blocks");
  const [index, setIndex] = useState(-1);
  return (
    <>
      <ul
        className={cn(
          "grid grid-cols-2 gap-3 sm:gap-4",
          columns === 3 && "md:grid-cols-3",
        )}
      >
        {images.map(({ image, caption }, i) => (
          <li key={`${image.src}-${i}`}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t("enlarge", { name: caption || image.alt })}
              className="group block w-full cursor-zoom-in text-left focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <Picture
                image={image}
                ratio="4 / 3"
                sizes={
                  columns === 3
                    ? "(min-width: 1024px) 280px, (min-width: 768px) 30vw, 50vw"
                    : "(min-width: 1024px) 420px, 50vw"
                }
              />
              {caption ? (
                <span className="text-ink-mute mt-2 block text-[13px] leading-snug">
                  {caption}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <PhotoLightbox
        open={index >= 0}
        close={() => setIndex(-1)}
        index={Math.max(index, 0)}
        slides={images.map(({ image, caption }) =>
          slide(image, caption || image.alt),
        )}
        onView={setIndex}
      />
    </>
  );
}

export function ArticleVideo({
  provider,
  videoId,
  src,
  poster,
  title,
}: {
  provider: "youtube" | "vimeo" | "file";
  videoId: string;
  src: string;
  poster: NewsImage | null;
  title: string;
}) {
  const t = useTranslations("News.blocks");
  const [playing, setPlaying] = useState(false);
  const posterSrc = poster
    ? (resolveAsset(poster.src) ?? poster.src)
    : provider === "youtube" && videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : "";

  return (
    <div className="relative aspect-video overflow-hidden bg-[rgb(14_14_14)]">
      {playing ? (
        provider === "file" ? (
          <video
            src={src}
            poster={posterSrc || undefined}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 size-full"
          />
        ) : (
          <iframe
            src={src}
            title={title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t("play", { name: title })}
          className="group absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
        >
          {posterSrc ? (
            <Image
              src={posterSrc}
              alt=""
              fill
              sizes="(min-width: 1024px) 860px, 100vw"
              // Ảnh YouTube ở i.ytimg.com không qua bộ tối ưu ảnh của Next
              unoptimized={!poster}
              className="object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
            />
          ) : null}
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"
          />
          <span className="bg-forest absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-300 group-hover:scale-110 md:size-20">
            <Play
              aria-hidden="true"
              className="ml-1 size-7 fill-current md:size-8"
            />
          </span>
        </button>
      )}
    </div>
  );
}
