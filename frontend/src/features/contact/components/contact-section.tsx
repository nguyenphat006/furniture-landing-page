import { useLocale, useTranslations } from "next-intl";
import { Container, Section } from "@/components/shared/section";
import { countryOptions } from "../countries";
import type { Purpose } from "../inquiry";
import { ContactForm } from "./contact-form";

/*
 * Form liên hệ (2026-11-05, bản 2). Bản 1 có cột thông tin bên trái; người dùng muốn
 * MỘT FORM DỌC LIỀN ở giữa, thông tin liên hệ chuyển xuống thẻ trên bản đồ (visit-section.tsx).
 * Nền trắng, không padding trên (đầu trang đã có khoảng dưới) để form sát tiêu đề (bản 3 bỏ nền stone). Anchor #contact-form cho các nút chọn sẵn mục đích.
 */
export function ContactSection({
  defaultPurpose,
  defaultModel,
}: {
  defaultPurpose: Purpose;
  defaultModel?: string;
}) {
  const t = useTranslations("ContactPage.form");
  const locale = useLocale();

  return (
    <Section id="contact-form" className="pt-0 pb-16 lg:pt-0 lg:pb-20">
      <Container size="narrow">
        <div className="border-line rounded-[2px] border bg-white p-6 sm:p-10 lg:p-12">
          <h2 className="text-h2 text-ink mb-8 font-semibold">{t("title")}</h2>
          <ContactForm
            defaultPurpose={defaultPurpose}
            defaultModel={defaultModel}
            countries={countryOptions(locale)}
          />
        </div>
      </Container>
    </Section>
  );
}
