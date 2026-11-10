import { Download, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ButtonArrow,
  ButtonLink,
  buttonLinkClass,
} from "@/components/shared/button-link";
import type { NewsBlock } from "@/data/news/types";
import { WorkshopGallery } from "@/features/capabilities/components/workshop-gallery";
import { cn } from "@/lib/utils";
import { ArticleGallery, ArticleImage, ArticleVideo } from "./news-media";

/*
 * Nội dung bài tin tức theo khối (2026-11-09), giống khối CMS apps/news/blocks.py: đoạn văn, ảnh,
 * gallery (lưới 2 / 3 cột hoặc slider tự chạy), video, ảnh + chữ, trích dẫn, bảng, nút, tệp đính kèm.
 * Mọi khối rộng hết cột bài, thẳng mép với ảnh bìa (user 09/11); ảnh / video cỡ "nhỏ" căn giữa cột.
 */

/** Ảnh / video cỡ nhỏ: khoảng 2/3 cột, căn giữa */
const SMALL = "mx-auto w-full max-w-xl";

/** Kiểu chữ cho HTML từ trình soạn thảo (đoạn, tiêu đề phụ, danh sách, đậm, nghiêng, link) */
export const PROSE =
  "text-ink-soft [&_a]:text-forest [&_strong]:text-ink [&_b]:text-ink [&_h2]:text-ink [&_h3]:text-ink space-y-5 text-[17px] leading-[1.75] [&_a]:underline [&_a]:underline-offset-2 [&_h2]:pt-5 [&_h2]:text-xl [&_h2]:leading-snug [&_h2]:font-bold [&_h2]:tracking-[-0.01em] md:[&_h2]:text-2xl [&_h3]:pt-3 [&_h3]:text-lg [&_h3]:font-bold [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5";

const SIZES_WIDE = "(min-width: 1440px) 860px, (min-width: 1024px) 58vw, 100vw";
const SIZES_SMALL = "(min-width: 1024px) 576px, 100vw";

function Caption({ children }: { children: string }) {
  return children ? (
    <figcaption className="text-ink-mute mt-3 text-sm leading-relaxed">
      {children}
    </figcaption>
  ) : null;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Block({ block, title }: { block: NewsBlock; title: string }) {
  const t = useTranslations("News.blocks");
  switch (block.type) {
    case "paragraph":
      return (
        <div
          className={PROSE}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    case "image":
      return (
        <figure className={block.size === "text" ? SMALL : undefined}>
          <ArticleImage
            image={block.image}
            caption={block.caption}
            sizes={block.size === "text" ? SIZES_SMALL : SIZES_WIDE}
          />
          <Caption>{block.caption}</Caption>
        </figure>
      );
    case "gallery":
      return (
        <figure>
          {block.layout === "slider" ? (
            <WorkshopGallery
              images={block.images.map((g) => g.image.src)}
              captions={block.images.map((g) => g.caption)}
              name={block.caption || title}
              namespace="News.gallery"
            />
          ) : (
            <ArticleGallery
              images={block.images}
              columns={block.layout === "grid-2" ? 2 : 3}
            />
          )}
          <Caption>{block.caption}</Caption>
        </figure>
      );
    case "video":
      return (
        <figure className={block.size === "text" ? SMALL : undefined}>
          <ArticleVideo
            provider={block.provider}
            videoId={block.videoId}
            src={block.src}
            poster={block.poster}
            title={block.caption || title}
          />
          <Caption>{block.caption}</Caption>
        </figure>
      );
    case "image_text":
      return (
        <div className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
          <div className={cn(block.imagePosition === "right" && "md:order-2")}>
            <ArticleImage
              image={block.image}
              caption={block.heading}
              sizes="(min-width: 1024px) 420px, (min-width: 768px) 45vw, 100vw"
            />
          </div>
          <div>
            {block.heading ? (
              <h3 className="text-ink mb-4 text-xl leading-snug font-bold tracking-[-0.01em] md:text-2xl">
                {block.heading}
              </h3>
            ) : null}
            <div
              className={PROSE}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          </div>
        </div>
      );
    case "quote":
      return (
        <figure className="border-gold border-l-4 py-1 pl-6 md:pl-8">
          <blockquote className="text-ink text-xl leading-normal font-medium tracking-[-0.01em] md:text-2xl">
            <p>{block.quote}</p>
          </blockquote>
          {block.author || block.role ? (
            <figcaption className="mt-4 text-sm">
              {block.author ? (
                <span className="text-ink font-semibold">{block.author}</span>
              ) : null}
              {block.author && block.role ? (
                <span className="text-ink-mute">, </span>
              ) : null}
              {block.role ? (
                <span className="text-ink-mute">{block.role}</span>
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      );
    case "table":
      return (
        <figure>
          <div
            className="border-line max-w-full overflow-x-auto border"
            role="region"
            aria-label={block.caption || t("table")}
            tabIndex={0}
          >
            <table className="w-full min-w-[32rem] border-collapse text-left text-[15px] leading-relaxed">
              {block.columns.some(Boolean) ? (
                <thead className="bg-surface-stone text-ink">
                  <tr>
                    {block.columns.map((c, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-4 py-3 font-semibold"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody className="text-ink-soft [&_a]:text-forest [&_a]:underline">
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-line border-t">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="px-4 py-3 align-top [&_p]:m-0"
                        dangerouslySetInnerHTML={{ __html: cell }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Caption>{block.caption}</Caption>
        </figure>
      );
    case "button":
      return (
        <div>
          {block.url.startsWith("/") ? (
            <ButtonLink href={block.url}>{block.label}</ButtonLink>
          ) : (
            <a
              href={block.url}
              className={buttonLinkClass()}
              {...(/^https?:/.test(block.url)
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {block.label}
              <ButtonArrow />
            </a>
          )}
        </div>
      );
    case "file":
      return (
        <a
          href={block.file.url}
          download
          className={cn(
            "group border-line hover:border-ink flex items-center gap-4 border p-4 transition-colors sm:p-5",
          )}
        >
          <FileText
            aria-hidden="true"
            className="text-forest size-8 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate font-semibold">
              {block.label}
            </span>
            <span className="text-ink-mute text-sm uppercase">
              {block.file.extension}
              {block.file.size ? ` · ${formatSize(block.file.size)}` : ""}
            </span>
          </span>
          <span className="text-ink flex items-center gap-2 text-sm font-medium tracking-[.14em] uppercase">
            <span className="max-sm:sr-only">{t("download")}</span>
            <Download
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-y-0.5"
            />
          </span>
        </a>
      );
  }
}

export function NewsBody({
  blocks,
  title,
  className,
}: {
  blocks: NewsBlock[];
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-10 md:gap-12", className)}>
      {blocks.map((b) => (
        <Block key={b.id} block={b} title={title} />
      ))}
    </div>
  );
}
