import type { Metadata } from "next";
import { pageLinks } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { ContactSection, isPurpose, sanitizeModel } from "@/features/contact";

/*
 * Trang Liên hệ (2026-11-05): đầu trang (tên trang + mô tả) → form dọc (stone)
 * → thông tin liên hệ + bản đồ + mời thăm nhà máy (trắng) → footer dùng chung (giữ nguyên, kể cả bản đồ).
 * ?purpose=quote|oem|visit|other chọn sẵn mục đích trong form.
 * ?model=<mã mẫu> (nút "Yêu cầu báo giá" ở trang chi tiết sản phẩm) điền sẵn ô Mã mẫu, đã làm sạch (sanitizeModel).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ContactPage" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(await pageLinks("/contact", locale)),
  };
}

export default async function ContactPage({
  params,
  searchParams,
}: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { purpose, model } = await searchParams;
  const t = await getTranslations("ContactPage.hero");
  const tc = await getTranslations("Common");

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          current={tc("nav.contact")}
          title={t("title")}
          lede={t("lede")}
        />
        <ContactSection
          defaultPurpose={isPurpose(purpose) ? purpose : "quote"}
          defaultModel={sanitizeModel(model)}
        />
      </main>
      <SiteFooter crossKeys={["capabilities", "products", "materials"]} />
    </>
  );
}
