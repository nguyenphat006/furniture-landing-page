import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageAlternates, withSeo } from "@/lib/seo";
import { getMaterials } from "@/data/catalog/materials";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { getHomePage } from "@/data/pages/home";
import { getSite } from "@/data/site";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
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
    ...(page.seo.ogImage
      ? {
          openGraph: {
            siteName: site.name,
            images: [{ url: page.seo.ogImage, width: 1200, height: 630 }],
          },
        }
      : {}),
    alternates: pageAlternates("/", locale),
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [page, materials, { categories }] = await Promise.all([
    getHomePage(locale),
    getMaterials(locale),
    getTaxonomy(locale),
  ]);

  return (
    <>
      <SiteHeader />
      <SectionDots anchors={homeAnchors(page.blocks)} />
      <main className="flex-1">
        <HomeBlocks
          blocks={page.blocks}
          categories={categories}
          materials={materials}
        />
      </main>
      <div id="contact" className="scroll-mt-[72px]">
        <SiteFooter crossKeys={["about", "capabilities", "contact"]} />
      </div>
    </>
  );
}
