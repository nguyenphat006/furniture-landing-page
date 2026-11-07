import type { Metadata } from "next";
import { pageLinks } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { getMaterials } from "@/data/catalog/materials";
import { MaterialsGrid } from "@/features/materials";

/*
 * Trang Vật liệu (2026-11-05): đầu trang (tên trang + mô tả) → lưới thẻ vật liệu (stone) → footer.
 * Nội dung vật liệu đọc từ CMS (mock khi chưa nối), xem data/catalog/materials.ts.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "MaterialsPage" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(await pageLinks("/materials", locale)),
  };
}

export default async function MaterialsPage({
  params,
}: PageProps<"/[locale]/materials">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("MaterialsPage.hero");
  const tc = await getTranslations("Common");
  const materials = await getMaterials(locale);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PageHeader
          current={tc("nav.materials")}
          title={t("title")}
          lede={t("lede")}
        />
        <MaterialsGrid materials={materials} />
      </main>
      <SiteFooter crossKeys={["capabilities", "products", "contact"]} />
    </>
  );
}
