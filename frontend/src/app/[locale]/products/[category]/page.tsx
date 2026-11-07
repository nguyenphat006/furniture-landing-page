import { Suspense } from "react";
import type { Metadata } from "next";
import { pageAlternates, withSeo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { Container, Section } from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { categories, categoryCover, type CategorySlug } from "@/data/catalog";
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

export function generateStaticParams() {
  return categories.map((category) => ({ category }));
}

export const dynamicParams = false;

const isCategory = (s: string): s is CategorySlug =>
  (categories as readonly string[]).includes(s);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}): Promise<Metadata> {
  const { locale, category } = await params;
  if (!isCategory(category)) return {};
  const tc = await getTranslations({ locale, namespace: "Common" });
  const th = await getTranslations({
    locale,
    namespace: "HomePage.products.items",
  });

  return {
    ...withSeo(
      { title: tc(`products.${category}`), description: th(category) },
      await getCategorySeo(category, locale),
    ),
    alternates: pageAlternates(`/products/${category}`, locale),
  };
}

export default async function ProductCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  if (!isCategory(category)) notFound();

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
      <main className="flex-1">
        <PageHeader
          parents={[{ label: tc("nav.products"), href: navHref.products }]}
          current={name}
          title={name}
          lede={th(category)}
          aside={
            <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
              <ImagePlaceholder
                label={cover}
                sizes="(min-width: 1280px) 608px, (min-width: 1024px) 448px, (min-width: 640px) 320px, 100vw"
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
