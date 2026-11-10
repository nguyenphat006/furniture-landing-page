import { useLocale, useTranslations } from "next-intl";
import { Container, Section } from "@/components/shared/section";
import { countryOptions } from "../countries";
import type { Purpose } from "../inquiry";
import { ContactForm } from "./contact-form";
import { ContactInfo } from "./contact-info";

/*
 * Form liên hệ + thông tin + bản đồ chung một hàng (2026-11-09, bản 4, user yêu cầu).
 * Từ xl: cột trái 5/12 là khối thông tin liên hệ rồi bản đồ (contact-info.tsx), dính theo màn hình
 * khi cuộn form dài; form cột phải 7/12 (user đổi 09/11). Trong DOM form vẫn đứng trước (xl:order)
 * để điện thoại và thứ tự Tab gặp form trước. Dưới xl (1024px cột phải quá hẹp, email bị ngắt giữa
 * chữ): form cả hàng, bên dưới thông tin và bản đồ cạnh nhau (từ md), điện thoại xếp dọc.
 * Nền trắng, không padding trên (đầu trang đã có khoảng dưới) để form sát tiêu đề. Anchor
 * #contact-form cho các nút chọn sẵn mục đích.
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
      <Container>
        <div className="grid items-start gap-6 xl:grid-cols-12 xl:gap-8">
          <div className="border-line rounded-[2px] border bg-white p-6 sm:p-10 xl:order-2 xl:col-span-7 xl:p-12">
            <h2 className="text-h2 text-ink mb-8 font-bold tracking-[-0.03em]">
              {t("title")}
            </h2>
            <ContactForm
              defaultPurpose={defaultPurpose}
              defaultModel={defaultModel}
              countries={countryOptions(locale)}
            />
          </div>
          <div className="xl:sticky xl:top-[calc(80px+1.5rem)] xl:order-1 xl:col-span-5">
            <ContactInfo />
          </div>
        </div>
      </Container>
    </Section>
  );
}
