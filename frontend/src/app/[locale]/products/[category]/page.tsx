import { Suspense } from "react";
import type { Metadata } from "next";
import { pageLinks, withSeo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { Container, Section } from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { categoryCover } from "@/data/catalog";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { getCategorySeo, getProductsInCategory } from "@/data/catalog/products";
import { CtaSection } from "@/features/home";
import { ProductBrowser, ProductGrid } from "@/features/products";

/*
 * Trang nhóm sản phẩm /products/<nhóm> (2026-11-06): đầu trang chung (breadcrumb Trang chủ / Sản phẩm /
 * <nhóm>, tên nhóm + mô tả, ảnh bìa nhóm bên phải) → danh sách mẫu (ProductBrowser facet="type": lọc Loại +
 * Chất liệu, phân trang, xem lưới / danh sách) → CTA → footer.
 * ?type=<loại> (link menu, catalogHref.type) chọn sẵn bộ lọc loại. Nhóm lạ trả 404.
 * (2026-11-06) Bỏ heading section "Mẫu tham khảo" theo yêu cầu: danh sách nằm ngay dưới đầu trang.
 */

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return (await getTaxonomy(params.locale)).categories.map((c) => ({
    category: c.slug,
  }));
}

// Nhóm thêm trong CMS sau khi build vẫn có trang; nhóm lạ trả 404
export const dynamicParams = true;

async function isCategory(slug: string, locale: string): Promise<boolean> {
  return (await getTaxonomy(locale)).categories.some((c) => c.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}): Promise<Metadata> {
  const { locale, category } = await params;
  if (!(await isCategory(category, locale))) return {};
  const tc = await getTranslations({ locale, namespace: "Common" });
  const th = await getTranslations({
    locale,
    namespace: "HomePage.products.items",
  });
  const tp = await getTranslations({ locale, namespace: "ProductsPage" });
  // Câu mô tả nhóm chỉ 30 đến 49 ký tự (QC 09/11): thêm câu chung về nơi sản xuất
  const intro = th.has(category) ? th(category) : "";

  return {
    ...withSeo(
      {
        title: tc(`products.${category}`),
        description: [intro, tp("categoryMetaSuffix")]
          .filter(Boolean)
          .join(" "),
      },
      await getCategorySeo(category, locale),
    ),
    ...(await pageLinks(
      `/products/${category}`,
      locale,
      (await getTaxonomy(locale)).categories.find((c) => c.slug === category)
        ?.cover,
    )),
  };
}

export default async function ProductCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  if (!(await isCategory(category, locale))) notFound();

  const tc = await getTranslations("Common");
  const th = await getTranslations("HomePage.products.items");
  const name = tc(`products.${category}`);
  const [products, taxonomy] = await Promise.all([
    getProductsInCategory(category, locale),
    getTaxonomy(locale),
  ]);
  const cover =
    taxonomy.categories.find((c) => c.slug === category)?.cover ??
    categoryCover(category);

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          parents={[{ label: tc("nav.products"), href: navHref.products }]}
          current={name}
          title={name}
          lede={th.has(category) ? th(category) : undefined}
          aside={
            <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
              <ImagePlaceholder
                label={cover}
                sizes="(min-width: 1280px) 608px, (min-width: 1024px) 448px, (min-width: 640px) 320px, 100vw"
                priority
              />
            </div>
          }
        />
        <Section id="models" className="pt-0 lg:pt-0">
          <Container>
            <Suspense fallback={<ProductGrid products={products} />}>
              <ProductBrowser products={products} facet="type" />
            </Suspense>
          </Container>
        </Section>
        <CtaSection />
      </main>
      <SiteFooter crossKeys={["capabilities", "materials", "contact"]} />
    </>
  );
}
