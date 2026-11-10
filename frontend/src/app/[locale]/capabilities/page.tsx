import type { Metadata } from "next";
import { pageLinks } from "@/lib/seo";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { getCapabilitiesFaq } from "@/data/pages/capabilities";
import {
  CapacityBand,
  // Section đang ẩn nằm ở @/components/archive/capabilities (xem README trong đó).
  QualitySection,
  CertificationsSection,
  OemProcessSection,
  FaqSection,
  WorkshopsScroll,
  SurfaceFinishSection,
} from "@/features/capabilities";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "CapabilitiesPage" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(await pageLinks("/capabilities", locale)),
  };
}

function CapabilitiesHero() {
  const t = useTranslations("CapabilitiesPage.hero");
  const tc = useTranslations("Common");

  return (
    // Bỏ hero ảnh nền (2026-11-04), dùng đầu trang gọn như các site tham khảo
    <PageHeader
      current={tc("nav.capabilities")}
      title={t("title")}
      lede={t("lede")}
    />
  );
}

export default async function CapabilitiesPage({
  params,
}: PageProps<"/[locale]/capabilities">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const faq = await getCapabilitiesFaq(locale);

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <CapabilitiesHero />
        <CapacityBand />
        {/* Tạm ẩn (2026-11-04): section ghế 3D tách rời. Giữ code, không xoá */}
        {/* <ExplodedChair /> */}
        {/* Bản cũ WorkshopsFlow tạm ẩn (2026-11-04), thay bằng WorkshopsScroll */}
        {/* <WorkshopsFlow /> */}
        <WorkshopsScroll />
        {/* Xử lý bề mặt bản mới (2026-11-05), thay SurfaceSection cũ đang ẩn bên dưới */}
        <SurfaceFinishSection />
        {/* QC (nền trắng) + chứng nhận + quy trình OEM (nền forest), 2026-11-05 */}
        <QualitySection />
        <CertificationsSection />
        <OemProcessSection />
        {/* FAQ từ CMS: Section dùng chung chọn ở Cài đặt → Section trên trang (2026-11-09) */}
        <FaqSection content={faq} />
        {/*
          Tạm ẩn (2026-11-04) mọi section sau khối Xưởng để làm lại từng section
          (màu sắc và điểm nhấn chưa đạt). Giữ code, không xoá.
          <SurfaceSection />
          <InhouseSection />
          <ProcessDetailSection />
          QcSection cũ đã thay bằng QualitySection nền tối + chứng nhận:
          <QcSection />
          <OemSection />
        */}
      </main>
      <SiteFooter crossKeys={["materials", "products", "contact"]} />
    </>
  );
}
