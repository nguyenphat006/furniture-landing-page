import type { Metadata } from "next";
import { pageLinks } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { AboutContent } from "@/features/about";

/*
 * Trang Về chúng tôi /about (2026-11-05): đầu trang chung → ảnh nhà máy → câu chuyện +
 * tóm tắt → nguyên tắc → con người → xuất khẩu → footer.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AboutPage" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(await pageLinks("/about", locale)),
  };
}

export default async function AboutPage({
  params,
}: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AboutPage.hero");
  const tc = await getTranslations("Common");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PageHeader
          current={tc("nav.about")}
          title={t("title")}
          lede={t("lede")}
        />
        <AboutContent />
      </main>
      <SiteFooter crossKeys={["capabilities", "materials", "contact"]} />
    </>
  );
}
