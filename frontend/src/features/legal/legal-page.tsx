import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { Container, Section } from "@/components/shared/section";
import { legalHref, type LegalKey } from "@/config/navigation";
import { getLegalPage } from "@/data/pages/legal";
import { getSite } from "@/data/site";
import { pageLinks, withSeo } from "@/lib/seo";
import { LegalToc } from "./legal-toc";

/*
 * Trang pháp lý (2026-11-07): Chính sách bảo mật /privacy, Điều khoản sử dụng /terms.
 * Nội dung sửa trong CMS (Trang → Trang chủ → trang con), docs/adr/0013: các mục tiêu đề + nội dung
 * rich text, ngày cập nhật. Bố cục: đầu trang chung, mục lục dính bên trái (lg+, sáng theo mục đang
 * đọc: legal-toc.tsx), cột đọc bên phải.
 * Chưa có CMS hoặc CMS chưa có trang thì 404 (nội dung pháp lý chỉ có một nguồn là CMS).
 */

export async function legalMetadata(
  key: LegalKey,
  locale: string,
): Promise<Metadata> {
  const [page, site] = await Promise.all([
    getLegalPage(key, locale),
    getSite(locale),
  ]);
  if (!page) return {};
  return {
    ...withSeo(
      {
        title: `${page.title} | ${site.name}`,
        description: page.sections[0]?.text.slice(0, 160) ?? "",
      },
      {
        ...page.seo,
        // Bản tiếng Anh chưa dịch đang hiện tiếng Việt: không cho Google lập chỉ mục
        noindex: page.seo.noindex || page.isFallback,
      },
    ),
    ...(await pageLinks(legalHref[key], locale, page.seo.ogImage)),
  };
}

export async function LegalPage({
  pageKey,
  locale,
}: {
  pageKey: LegalKey;
  locale: string;
}) {
  setRequestLocale(locale);
  const page = await getLegalPage(pageKey, locale);
  if (!page) notFound();
  const t = await getTranslations("Legal");
  const updated = page.updatedOn
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
        new Date(`${page.updatedOn}T00:00:00`),
      )
    : null;
  const anchor = (i: number) => `muc-${i + 1}`;

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          current={page.title}
          title={page.title}
          lede={updated ? t("updated", { date: updated }) : undefined}
        />
        <Section spacing="none" className="pb-section">
          <Container className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
            {page.sections.length > 1 ? (
              <LegalToc
                label={t("contents")}
                items={page.sections.map((s, i) => ({
                  id: anchor(i),
                  heading: s.heading,
                }))}
              />
            ) : null}
            <article className="max-w-[760px] space-y-12">
              {page.sections.map((s, i) => (
                <section
                  key={s.id}
                  id={anchor(i)}
                  className="scroll-mt-28"
                  aria-labelledby={`${anchor(i)}-h`}
                >
                  <h2
                    id={`${anchor(i)}-h`}
                    className="text-ink text-xl font-bold tracking-[-0.01em] md:text-2xl"
                  >
                    {s.heading}
                  </h2>
                  <div
                    className="text-ink-soft [&_a]:text-forest [&_b]:text-ink [&_strong]:text-ink mt-4 space-y-4 text-[15px] leading-relaxed md:text-base [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5"
                    // Rich text từ trình soạn Wagtail (chỉ cho phép đậm, nghiêng, danh sách, link)
                    dangerouslySetInnerHTML={{ __html: s.html }}
                  />
                </section>
              ))}
            </article>
          </Container>
        </Section>
      </main>
      <SiteFooter crossKeys={["about", "capabilities", "contact"]} />
    </>
  );
}
