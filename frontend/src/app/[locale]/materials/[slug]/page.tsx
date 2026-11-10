import type { Metadata } from "next";
import { pageLinks, withSeo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { navHref } from "@/config/navigation";
import { getMaterial, getMaterials } from "@/data/catalog/materials";
import { getProductsWithMaterial } from "@/data/catalog/products";
import { MaterialDetail } from "@/features/materials";

/*
 * Trang chi tiết vật liệu /materials/<slug> (2026-11-05): đầu trang chung (breadcrumb
 * Trang chủ / Vật liệu / <tên>, tên + mô tả) → Đặc tính → Gia công → Bảo quản →
 * Sản phẩm dùng vật liệu → footer. Danh sách vật liệu theo CMS (thêm trong admin là có trang),
 * slug lạ trả 404.
 */

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return (await getMaterials(params.locale)).map((m) => ({ slug: m.slug }));
}

// Vật liệu thêm trong CMS sau khi build vẫn có trang (dựng lần đầu có người mở); slug lạ trả 404
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const material = await getMaterial(slug, locale);
  if (!material) return {};
  const t = await getTranslations({ locale, namespace: "MaterialDetail" });

  return {
    ...withSeo(
      {
        title: t("metaTitle", { name: material.name }),
        description: material.lede,
      },
      material.seo,
    ),
    ...(await pageLinks(`/materials/${material.slug}`, locale, material.image)),
  };
}

export default async function MaterialDetailPage({
  params,
}: PageProps<"/[locale]/materials/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const material = await getMaterial(slug, locale);
  if (!material) notFound();

  const tc = await getTranslations("Common");
  const { name } = material;
  const products = await getProductsWithMaterial(material.slug, locale);

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          parents={[{ label: tc("nav.materials"), href: navHref.materials }]}
          current={name}
          title={name}
          lede={material.lede}
          aside={
            <div className="bg-surface-stone relative aspect-square overflow-hidden">
              <ImagePlaceholder
                label={material.image}
                sizes="(min-width: 1280px) 608px, (min-width: 1024px) 448px, (min-width: 640px) 320px, 100vw"
                priority
              />
            </div>
          }
        />
        <MaterialDetail material={material} products={products} />
      </main>
      <SiteFooter crossKeys={["capabilities", "products", "contact"]} />
    </>
  );
}
