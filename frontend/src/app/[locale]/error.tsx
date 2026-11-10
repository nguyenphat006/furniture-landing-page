"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import {
  ButtonArrow,
  ButtonLink,
  buttonLinkClass,
} from "@/components/shared/button-link";
import { Container, SectionHeading } from "@/components/shared/section";
import { navHref } from "@/config/navigation";

/*
 * Trang lỗi (2026-11-07): hiện khi render trang ném lỗi, chủ yếu là CMS không trả lời được
 * (CmsError ở lib/cms/client.ts) lúc trang chưa có bản cache nào. Khi đã có bản cache, Next vẫn
 * phục vụ bản cũ và lần làm mới lỗi không ghi đè cache tốt, nên người xem thường không thấy trang này.
 * Bố cục giống 404: header + footer chung, khối căn giữa. Không hiện chi tiết lỗi (URL nội bộ, stack);
 * chi tiết nằm trong log server. digest là mã Next gắn vào lỗi, để đối chiếu với log.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
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
              <button
                type="button"
                onClick={reset}
                className={buttonLinkClass()}
              >
                {t("retry")}
                <ButtonArrow />
              </button>
              <ButtonLink href={navHref.contact}>{t("contact")}</ButtonLink>
            </div>
            {error.digest ? (
              <p className="text-ink-mute mt-10 text-center font-mono text-xs">
                {t("reference", { digest: error.digest })}
              </p>
            ) : null}
          </Container>
        </header>
      </main>
      <SiteFooter crossKeys={["capabilities", "materials", "contact"]} />
    </>
  );
}
