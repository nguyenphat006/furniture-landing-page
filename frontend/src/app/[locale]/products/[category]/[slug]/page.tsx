import type { Metadata } from "next";
import { metaText, pageLinks, withSeo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import type { Product } from "@/data/catalog";
import { getMaterials } from "@/data/catalog/materials";
import {
  getProduct,
  getProducts,
  getRelatedProducts,
} from "@/data/catalog/products";
import { routing } from "@/i18n/routing";
import { CtaSection } from "@/features/home";
import { ProductDetail, ProductHero } from "@/features/products";

/*
 * Trang chi tiết sản phẩm /products/<nhóm>/<slug> (làm lại 2026-11-06, học bố cục Gloster + Nghĩa Sơn):
 * ProductHero (breadcrumb chung, bộ ảnh trái + cột thông tin / báo giá phải) → ProductDetail (khối mở/đóng
 * Kích thước, Chất liệu, Tùy chỉnh; Cùng nhóm) → CTA → footer.
 * Slug lạ, hoặc slug đúng nhưng sai nhóm trong URL, trả 404.
 * Dữ liệu từ CMS (hoặc mock): sản phẩm có lúc build được dựng sẵn; sản phẩm mới xuất bản sau đó
 * được dựng khi có người mở lần đầu (dynamicParams). Mô tả chưa dịch sang ngôn ngữ đang xem: noindex.
 */

export async function generateStaticParams() {
  return (await getProducts(routing.defaultLocale)).map((p) => ({
    category: p.category,
    slug: p.slug,
  }));
}

export const dynamicParams = true;

async function resolve(
  category: string,
  slug: string,
  locale: string,
): Promise<Product | undefined> {
  const product = await getProduct(slug, locale);
  return product && product.category === category ? product : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, category, slug } = await params;
  const product = await resolve(category, slug, locale);
  if (!product) return {};
  const t = await getTranslations({
    locale,
    namespace: "ProductsPage.detail",
  });
  const tc = await getTranslations({ locale, namespace: "Common" });

  const auto = {
    title: t("metaTitle", {
      name: product.name,
      type: tc(`productTypes.${product.type}`),
    }),
    // Tự tạo từ mô tả sản phẩm; chưa có mô tả thì ghép tên, mã, loại, chất liệu với câu OEM chung
    // (trước đây chỉ câu OEM: 50 trang trùng mô tả, QC 09/11)
    description: product.descriptionHtml
      ? metaText(product.descriptionHtml)
      : t("metaDescription", {
          name: product.name,
          hasCode: product.code ? "yes" : "no",
          code: product.code ?? "",
          type: tc(`productTypes.${product.type}`).toLocaleLowerCase(locale),
          hasMaterials: product.materials.length ? "yes" : "no",
          materials: product.materials
            .map((m) => tc(`materials.${m}`).toLocaleLowerCase(locale))
            .join(", "),
        }),
  };
  // SEO riêng của bản gốc không dùng cho trang tiếng khác (chưa dịch)
  const seo = product.isFallback ? undefined : product.seo;

  return {
    ...withSeo(auto, seo),
    // Bản gốc có mô tả mà chưa dịch sang ngôn ngữ này: không cho index tới khi có bản dịch
    ...((product.isFallback && product.descriptionHtml) || product.seo?.noindex
      ? { robots: { index: false, follow: true } }
      : {}),
    ...(await pageLinks(
      `/products/${category}/${product.slug}`,
      locale,
      product.images[0],
    )),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; category: string; slug: string }>;
}) {
  const { locale, category, slug } = await params;
  setRequestLocale(locale);
  const product = await resolve(category, slug, locale);
  if (!product) notFound();
  // Carousel chuyển trang nên lấy nhiều hơn một hàng
  const related = await getRelatedProducts(product, locale, 18);
  const materials = (await getMaterials(locale)).filter((m) =>
    product.materials.includes(m.slug),
  );

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <ProductHero product={product} />
        <ProductDetail
          product={product}
          related={related}
          materials={materials}
        />
        <CtaSection />
      </main>
      <SiteFooter crossKeys={["capabilities", "materials", "contact"]} />
    </>
  );
}
