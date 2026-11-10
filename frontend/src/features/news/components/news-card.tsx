import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import type { NewsPost } from "@/data/news/types";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * Thẻ tin "Cuộc sống tại BFC" (2026-11-09). Cả thẻ là một link tới /news/<slug>.
 * - "card": ảnh 3:2 trên, ngày · loại, tiêu đề, tóm tắt 2 dòng, "Đọc tiếp →" ở đáy (lưới /news, Tin khác).
 * - "feature": thẻ lớn của trang chủ, ảnh 3:2 rộng, tiêu đề to hơn, tóm tắt 3 dòng.
 * - "row": ảnh 4:3 trái, chữ phải (2 tin nhỏ cạnh thẻ lớn ở trang chủ).
 * Thông báo có nhãn nền gold để nổi hơn tin thường. Dùng được ở server lẫn client component.
 */

export const newsHref = (slug: string) => `/news/${slug}`;

export function NewsMeta({
  post,
  className,
}: {
  post: Pick<NewsPost, "date" | "kind">;
  className?: string;
}) {
  const t = useTranslations("News");
  const format = useFormatter();
  return (
    <p
      className={cn(
        "text-ink-mute flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold tracking-[.14em] uppercase",
        className,
      )}
    >
      <time dateTime={post.date} className="tabular-nums">
        {format.dateTime(new Date(`${post.date}T00:00:00`), {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </time>
      <span
        className={cn(
          "rounded-[2px] px-2 py-0.5",
          post.kind === "notice"
            ? "bg-gold text-ink"
            : "bg-forest/10 text-forest",
        )}
      >
        {t(`kinds.${post.kind}`)}
      </span>
    </p>
  );
}

function ReadMore() {
  const t = useTranslations("News");
  return (
    <span className="text-ink group-hover/news:text-forest inline-flex items-center gap-2 text-xs font-semibold tracking-[.14em] uppercase transition-colors duration-(--duration-base)">
      {t("readMore")}
      <ArrowRight
        aria-hidden="true"
        strokeWidth={2.5}
        className="ease-out-soft size-3.5 transition-transform duration-(--duration-base) group-hover/news:translate-x-1"
      />
    </span>
  );
}

const LINK =
  "group/news focus-visible:outline-forest hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4";
const IMG_HOVER =
  "ease-out-soft transition-transform duration-(--duration-slow) group-hover/news:scale-[1.04]";
const TITLE =
  "text-ink group-hover/news:text-forest font-bold tracking-[-0.01em] text-balance transition-colors duration-(--duration-base)";

export function NewsCard({
  post,
  variant = "card",
  sizes,
  priority,
}: {
  post: NewsPost;
  variant?: "card" | "feature" | "row" | "compact";
  sizes?: string;
  priority?: boolean;
}) {
  // Gọn nhất: ảnh nhỏ + ngày · loại + tiêu đề (cột "Tin khác" cạnh nội dung bài)
  if (variant === "compact") {
    return (
      <Link
        href={newsHref(post.slug)}
        className={cn(
          LINK,
          "grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] lg:grid-cols-[6.5rem_minmax(0,1fr)] xl:grid-cols-[8rem_minmax(0,1fr)]",
        )}
      >
        <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
          <ImagePlaceholder
            label={post.cover}
            sizes={sizes ?? "144px"}
            className={IMG_HOVER}
          />
        </div>
        <div className="min-w-0">
          <NewsMeta post={post} className="text-[11px]" />
          <h3
            className={cn(TITLE, "mt-2 line-clamp-3 text-[15px] leading-snug")}
          >
            {post.title}
          </h3>
        </div>
      </Link>
    );
  }

  if (variant === "row") {
    return (
      <Link
        href={newsHref(post.slug)}
        className={cn(
          LINK,
          "grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-7 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]",
        )}
      >
        <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
          <ImagePlaceholder
            label={post.cover}
            sizes={sizes ?? "(min-width: 640px) 224px, 128px"}
            className={IMG_HOVER}
          />
        </div>
        <div className="flex h-full min-w-0 flex-col">
          <NewsMeta post={post} />
          <h3 className={cn(TITLE, "mt-2.5 text-base leading-snug sm:text-lg")}>
            {post.title}
          </h3>
          <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-relaxed max-sm:hidden">
            {post.excerpt}
          </p>
          <span className="mt-auto pt-3 max-sm:hidden">
            <ReadMore />
          </span>
        </div>
      </Link>
    );
  }

  const feature = variant === "feature";
  return (
    <Link
      href={newsHref(post.slug)}
      className={cn(LINK, "flex h-full flex-col")}
    >
      <div
        className={cn(
          "bg-surface-stone relative aspect-[3/2] overflow-hidden",
          // Thẻ lớn trang chủ: từ lg ảnh giãn theo chiều cao 3 tin cột phải để mép dưới hai cột thẳng nhau
          feature && "lg:aspect-auto lg:min-h-80 lg:flex-1",
        )}
      >
        <ImagePlaceholder
          label={post.cover}
          sizes={
            sizes ??
            (feature
              ? "(min-width: 1024px) 58vw, 100vw"
              : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw")
          }
          priority={priority}
          className={IMG_HOVER}
        />
      </div>
      <NewsMeta post={post} className={feature ? "mt-6" : "mt-5"} />
      <h3
        className={cn(
          TITLE,
          feature
            ? "mt-3 text-2xl leading-tight md:text-[1.75rem]"
            : "mt-2.5 text-lg leading-snug",
        )}
      >
        {post.title}
      </h3>
      <p
        className={cn(
          "text-ink-soft mt-3 leading-relaxed",
          feature ? "line-clamp-3 max-w-[60ch]" : "line-clamp-2 text-sm",
        )}
      >
        {post.excerpt}
      </p>
      <span className="mt-auto pt-5">
        <ReadMore />
      </span>
    </Link>
  );
}
