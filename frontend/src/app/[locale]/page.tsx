import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageLinks, withSeo } from "@/lib/seo";
import { getMaterials } from "@/data/catalog/materials";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { getLatestNews } from "@/data/news";
import { getHomePage } from "@/data/pages/home";
import { getSite } from "@/data/site";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { OrganizationJsonLd } from "@/components/shared/organization-json-ld";
// Section đang ẩn nằm ở @/components/archive/home (xem README trong đó), import thẳng từ đó khi dùng lại.
import { HomeBlocks, homeAnchors, SectionDots } from "@/features/home";

/*
 * Trang chủ: thân trang là danh sách block do CMS quyết định (Trang → Trang chủ: thứ tự, chữ, ảnh,
 * bỏ section; CTA cuối trang là Section dùng chung), xem data/pages/home.ts. Chưa có CMS thì dùng
 * bố cục mặc định ở features/home/page-content.ts với chữ trong messages.
 * Các section đã ẩn trước đây (dải số liệu, Dự án, Về chúng tôi, Năng lực...) vẫn ở archive.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [page, site] = await Promise.all([
    getHomePage(locale),
    getSite(locale),
  ]);
  // SEO riêng của trang chủ (tab Quảng bá) → SEO mặc định ở Cài đặt (layout) → messages
  const auto = {
    title:
      site.seo.title ||
      (await getTranslations({ locale, namespace: "Metadata" }))("title"),
    description: site.seo.description,
  };
  return {
    ...withSeo(auto, {
      ...page.seo,
      // Bản tiếng Anh chưa dịch đang hiện tiếng Việt: không cho Google lập chỉ mục
      noindex: page.seo.noindex || page.isFallback,
    }),
    ...(await pageLinks("/", locale, page.seo.ogImage)),
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [page, materials, { categories }, site, news] = await Promise.all([
    getHomePage(locale),
    getMaterials(locale),
    getTaxonomy(locale),
    getSite(locale),
    getLatestNews(locale, 4),
  ]);

  return (
    <>
      <OrganizationJsonLd site={site} locale={locale} />
      <SiteHeader />
      <SectionDots anchors={homeAnchors(page.blocks)} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <HomeBlocks
          blocks={page.blocks}
          categories={categories}
          materials={materials}
          news={news}
        />
      </main>
      <div id="contact" className="scroll-mt-[72px]">
        <SiteFooter crossKeys={["about", "capabilities", "contact"]} />
      </div>
    </>
  );
}
