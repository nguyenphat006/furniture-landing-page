import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import type { CtaContent } from "@/data/pages/types";

/*
 * CTA cuối trang chủ (2026-11-06), ngay trên footer.
 * Dải nền forest (tone brand) có ảnh xưởng chìm phía sau (phủ forest đậm để chữ đọc rõ).
 * Tiêu đề theo pattern chung (subtitle có vạch + title in hoa), 2 nút khung viền bản sáng bên phải:
 * "Yêu cầu báo giá" và "Đặt lịch thăm nhà máy", mở thẳng form liên hệ đã chọn sẵn mục đích.
 */
/** Ảnh nền mặc định khi không có nội dung từ CMS (trang Sản phẩm, trang nhóm) */
const DEFAULT_IMAGE = "Slideshow_1_2.png";

/**
 * `content` từ CMS (Trang chủ; về sau là Section dùng chung). Không truyền thì dùng chữ trong messages,
 * như ở trang Sản phẩm và trang nhóm.
 */
export function CtaSection({ content }: { content?: CtaContent }) {
  const t = useTranslations("HomePage.cta");

  return (
    <Section id="cta" tone="brand" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <ImagePlaceholder
          label={content ? (content.image ?? undefined) : DEFAULT_IMAGE}
          sizes="100vw"
          quality={50}
          className="opacity-25 grayscale"
        />
        <div className="bg-forest/80 absolute inset-0" />
      </div>
      <Container>
        <SectionHeading
          tone="light"
          eyebrow={content?.kicker || t("kicker")}
          title={content?.title || t("title")}
          className="mb-0 lg:mb-0"
          action={
            <>
              <ButtonLink
                tone="light"
                href={{
                  pathname: navHref.contact,
                  query: { purpose: "quote" },
                  hash: "contact-form",
                }}
              >
                {content?.quoteLabel || t("quote")}
              </ButtonLink>
              <ButtonLink
                tone="light"
                href={{
                  pathname: navHref.contact,
                  query: { purpose: "visit" },
                  hash: "contact-form",
                }}
              >
                {content?.visitLabel || t("visit")}
              </ButtonLink>
            </>
          }
        />
      </Container>
    </Section>
  );
}
