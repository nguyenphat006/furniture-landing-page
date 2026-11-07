import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/shared/button-link";
import { Container, SectionHeading } from "@/components/shared/section";
import { navHref } from "@/config/navigation";
// Section gợi ý đang ẩn: @/components/archive/not-found/suggestions-section

/*
 * Trang 404 (2026-11-05). Hiện khi gọi notFound() trong [locale] (vd /materials/xyz) hoặc khi URL
 * không khớp route nào (bắt bởi [locale]/[...rest]/page.tsx). Giữ header và footer chung;
 * khối 404 căn giữa, không breadcrumb, cao gần hết màn hình để footer không bị kéo lên.
 */

export async function generateMetadata() {
  const t = await getTranslations("NotFound");
  // Next tự chèn noindex cho trang trả 404
  return { title: t("metaTitle") };
}

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Không dùng PageHeader chung vì trang này không nằm trong cây điều hướng.
            Tiêu đề theo pattern SectionHeading (subtitle có vạch + title in hoa). */}
        <header className="flex min-h-[min(80svh,720px)] items-center bg-white pt-[calc(72px+4rem)] pb-20 xl:pt-[calc(80px+4rem)]">
          <Container>
            <SectionHeading
              as="h1"
              align="center"
              eyebrow={t("kicker")}
              title={t("title")}
              lede={t("lede")}
              className="mb-10 lg:mb-10"
            />
            <div className="flex flex-wrap justify-center gap-4">
              <ButtonLink href="/">{t("home")}</ButtonLink>
              <ButtonLink href={navHref.contact}>{t("contact")}</ButtonLink>
            </div>
          </Container>
        </header>
        {/* Section gợi ý tạm ẩn (2026-11-05), giữ component: <NotFoundSuggestions /> */}
      </main>
      <SiteFooter crossKeys={["capabilities", "materials", "contact"]} />
    </>
  );
}
