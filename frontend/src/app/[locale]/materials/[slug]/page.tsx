import type { Metadata } from "next";
import { pageAlternates, withSeo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { navHref } from "@/config/navigation";
import { materialSlugs } from "@/data/catalog";
import { getMaterial } from "@/data/catalog/materials";
import { getCategoriesUsingMaterial } from "@/data/catalog/products";
import { MaterialDetail } from "@/features/materials";

/*
 * Trang chi tiết vật liệu /materials/<slug> (2026-11-05): đầu trang chung (breadcrumb
 * Trang chủ / Vật liệu / <tên>, tên + mô tả) → Đặc tính → Gia công → Bảo quản →
 * Sản phẩm dùng vật liệu → footer. Slug lạ trả 404.
 */

export function generateStaticParams() {
  return materialSlugs.map((slug) => ({ slug }));
}

export const dynamicParams = false;

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
    alternates: pageAlternates(`/materials/${material.slug}`, locale),
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
  const categories = await getCategoriesUsingMaterial(material.slug, locale);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
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
              />
            </div>
          }
        />
        <MaterialDetail material={material} categories={categories} />
      </main>
      <SiteFooter crossKeys={["capabilities", "products", "contact"]} />
    </>
  );
}
