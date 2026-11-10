import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/shared/button-link";
import { reveal } from "@/components/shared/reveal";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import type { NewsPost } from "@/data/news/types";
import { NewsCard } from "./news-card";

/*
 * Section "Cuộc sống tại BFC" cuối trang chủ, ngay trước CTA (2026-11-09).
 * SectionHeading trái + nút "Xem tất cả tin tức" phải; 4 tin mới nhất: tin mới nhất là thẻ lớn bên
 * trái (7/12 từ xl, 6/12 ở lg cho cột phải đủ rộng), 3 tin sau xếp dọc bên phải dạng ảnh nhỏ + chữ,
 * dàn đều theo chiều cao để mép dưới thẳng với thẻ lớn (user yêu cầu cột phải đủ tin, 09/11).
 * Dưới lg xếp một cột.
 * Nền stone để tách khỏi section Nhà máy (trắng) phía trên và dải CTA ảnh phía dưới.
 * Chưa có tin nào thì không vẽ section.
 */

export function NewsSection({ posts }: { posts: NewsPost[] }) {
  const t = useTranslations("HomePage.news");
  if (posts.length === 0) return null;
  const [first, ...rest] = posts;

  return (
    <Section id="news" tone="stone">
      <Container>
        <SectionHeading
          eyebrow={t("kicker")}
          title={t("title")}
          action={<ButtonLink href={navHref.news}>{t("viewAll")}</ButtonLink>}
        />
        <div
          {...reveal("stagger")}
          className="grid gap-12 lg:grid-cols-12 lg:gap-10 xl:gap-14"
        >
          <div className="lg:col-span-6 xl:col-span-7">
            <NewsCard post={first} variant="feature" />
          </div>
          {rest.length ? (
            <ul className="divide-line grid content-start gap-8 lg:col-span-6 lg:flex lg:flex-col lg:justify-between lg:gap-0 lg:divide-y xl:col-span-5">
              {rest.map((p) => (
                <li key={p.slug} className="lg:py-7 lg:first:pt-0 lg:last:pb-0">
                  <NewsCard
                    post={p}
                    variant="row"
                    sizes="(min-width: 1024px) 200px, (min-width: 640px) 224px, 128px"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Container>
    </Section>
  );
}
