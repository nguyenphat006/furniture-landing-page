import { Suspense } from "react";
import type { Metadata } from "next";
import { pageLinks } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { Container, Section } from "@/components/shared/section";
import { getProducts } from "@/data/catalog/products";
import { CtaSection } from "@/features/home";
import { ProductBrowser, ProductGrid } from "@/features/products";

/*
 * Trang Sản phẩm /products (2026-11-06): đầu trang chung → TẤT CẢ sản phẩm (ProductBrowser facet="category":
 * lọc Nhóm + Chất liệu, phân trang, xem lưới 5 cột / danh sách) → CTA báo giá → footer.
 * (2026-11-06) Bản đầu là lưới 6 nhóm, người dùng muốn hiện thẳng sản phẩm; lưới nhóm chuyển vào
 * @/components/archive/products/category-grid.tsx.
 * Trang nhóm /products/<nhóm> và chi tiết /products/<nhóm>/<slug> nằm trong [category].
 * (2026-11-06) Bỏ heading section "Mẫu tham khảo" theo yêu cầu: danh sách nằm ngay dưới đầu trang.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ProductsPage" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(await pageLinks("/products", locale)),
  };
}

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ProductsPage");
  const tc = await getTranslations("Common");
  const products = await getProducts(locale);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PageHeader
          current={tc("nav.products")}
          title={t("hero.title")}
          lede={t("hero.lede")}
        />
        <Section id="models" className="pt-0 lg:pt-0">
          <Container>
            <Suspense
              fallback={<ProductGrid products={products.slice(0, 12)} />}
            >
              <ProductBrowser products={products} facet="category" />
            </Suspense>
          </Container>
        </Section>
        <CtaSection />
      </main>
      <SiteFooter crossKeys={["capabilities", "materials", "contact"]} />
    </>
  );
}
