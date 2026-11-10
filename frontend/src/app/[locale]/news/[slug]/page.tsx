import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { Container, EYEBROW, Section } from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import {
  getAllNews,
  getLatestNews,
  getNewsArticle,
  newsSlugs,
  type NewsPost,
} from "@/data/news";
import { NewsBody, NewsCard, NewsMeta, newsHref } from "@/features/news";
import { routing } from "@/i18n/routing";
import { localePath, pageLinks, siteUrl, withSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";

/*
 * Trang bài viết /news/<slug> (2026-11-09): đầu trang chung (breadcrumb Trang chủ / Tin tức / <tên>,
 * tiêu đề, tóm tắt, ngày · loại) → cột trái: ảnh bìa → nội dung theo khối (NewsBody: rộng hết cột, thẳng mép ảnh bìa) → nút về danh
 * sách. "Tin khác" (5 bài mới nhất khác bài đang xem) là cột phải ngang hàng ảnh bìa, dính khi cuộn
 * (user yêu cầu 09/11); dưới lg nằm sau nội dung. Có JSON-LD NewsArticle.
 * Nguồn: CMS (Tin tức) hoặc bài mẫu (data/news). Bài chưa dịch sang ngôn ngữ đang xem hiện bản tiếng
 * Việt và tự noindex. Mỗi ngôn ngữ một slug (10/11): mở bằng slug của ngôn ngữ khác (nút đổi ngôn ngữ giữ
 * nguyên đường dẫn) thì chuyển hướng 308 sang slug đúng; hreflang theo slug từng ngôn ngữ. Bài thêm trong CMS sau khi build vẫn có trang (dựng lần đầu có người mở).
 */

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Đường dẫn bài ở từng ngôn ngữ (mỗi ngôn ngữ một slug), cho canonical + hreflang */
function newsPaths(post: NewsPost) {
  return Object.fromEntries(
    Object.entries(newsSlugs(post)).map(([l, s]) => [l, newsHref(s)]),
  );
}

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return (await getAllNews(params.locale)).map((p) => ({ slug: p.slug }));
}

export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getNewsArticle(slug, locale);
  if (!post) return {};
  return {
    ...withSeo(
      { title: post.title, description: post.excerpt },
      {
        title: post.seo?.title ?? "",
        description: post.seo?.description ?? "",
        // Bản tiếng Anh chưa dịch đang hiện tiếng Việt: không cho Google lập chỉ mục
        noindex: Boolean(post.seo?.noindex || post.noindex || post.isFallback),
      },
    ),
    ...(await pageLinks(newsPaths(post), locale, post.cover || null)),
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getNewsArticle(slug, locale);
  if (!post) notFound();
  // Mở bằng slug của ngôn ngữ khác (bấm đổi ngôn ngữ, link cũ): chuyển sang slug đúng
  if (post.slug !== slug)
    permanentRedirect(localePath(newsHref(post.slug), locale));
  const [t, tc, more] = await Promise.all([
    getTranslations("News"),
    getTranslations("Common"),
    getLatestNews(locale, 5, slug),
  ]);

  const url = new URL(localePath(newsHref(slug), locale), siteUrl()).toString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    ...(post.cover
      ? { image: [new URL(post.cover, siteUrl()).toString()] }
      : {}),
    mainEntityOfPage: url,
    inLanguage: post.isFallback ? routing.defaultLocale : locale,
    publisher: { "@type": "Organization", name: "BFC" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          parents={[{ label: tc("nav.news"), href: navHref.news }]}
          current={post.title}
          title={post.title}
          lede={post.excerpt}
        >
          <NewsMeta post={post} />
        </PageHeader>

        <Section spacing="none" className="pb-section">
          <Container>
            <div className="grid gap-16 lg:grid-cols-12 lg:gap-10 xl:gap-16">
              <div className="min-w-0 lg:col-span-7 xl:col-span-8">
                <div className="bg-surface-stone relative aspect-[3/2] overflow-hidden">
                  <ImagePlaceholder
                    label={post.cover}
                    sizes="(min-width: 1440px) 860px, (min-width: 1024px) 58vw, 100vw"
                    priority
                  />
                </div>
                <article className="mt-12 md:mt-14">
                  <NewsBody blocks={post.blocks} title={post.title} />
                </article>
                <div className="border-line mt-14 border-t pt-10">
                  <ButtonLink href={navHref.news}>{t("back")}</ButtonLink>
                </div>
              </div>

              {more.length ? (
                <aside
                  aria-labelledby="more-news"
                  className="lg:sticky lg:top-[calc(72px+2rem)] lg:col-span-5 lg:self-start xl:top-[calc(80px+2rem)] xl:col-span-4"
                >
                  <div className="bg-surface-stone p-6 sm:p-8">
                    <h2
                      id="more-news"
                      className={cn(EYEBROW, "text-forest mb-6")}
                    >
                      {t("more")}
                    </h2>
                    <ul className="divide-line grid divide-y">
                      {more.map((p) => (
                        <li key={p.slug} className="py-5 first:pt-0 last:pb-0">
                          <NewsCard post={p} variant="compact" />
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              ) : null}
            </div>
          </Container>
        </Section>
      </main>
      <SiteFooter crossKeys={["about", "capabilities", "contact"]} />
    </>
  );
}
