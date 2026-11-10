import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import type { FaqContent } from "@/data/pages/types";

/*
 * Câu hỏi thường gặp (2026-11-05), tách khỏi section Quy trình OEM thành section riêng nền trắng,
 * nằm giữa OEM (forest) và footer (tối).
 * Trái: tiêu đề + link liên hệ (dính khi cuộn). Phải: danh sách <details> (chạy không cần JS).
 * Chưa có số thật cho MOQ / thời gian mẫu nên câu trả lời không nêu con số; khi BFC xác nhận thì bổ sung.
 * (2026-11-09) Nội dung từ CMS: Section dùng chung loại "Câu hỏi thường gặp" (data/pages/capabilities.ts),
 * chèn được cả ở Trang chủ; chữ nút trống thì dùng nhãn mặc định.
 */

export function FaqSection({ content }: { content: FaqContent }) {
  const t = useTranslations("CapabilitiesPage.faq");

  return (
    <Section id="faq">
      <Container className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(80px+2.5rem)]">
            <SectionHeading
              eyebrow={content.kicker}
              title={content.title}
              className="mb-6"
            />
            {content.note ? (
              <p className="text-ink-soft text-sm">{content.note}</p>
            ) : null}
            <ButtonLink href={navHref.contact} className="mt-6">
              {content.buttonLabel || t("contact")}
            </ButtonLink>
          </div>
        </div>

        <div className="border-line border-t lg:col-span-8">
          {content.items.map((item, i) => (
            <details key={i} className="group border-line border-b">
              <summary className="text-ink hover:text-forest flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold transition-colors [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="border-line group-open:bg-forest group-open:border-forest ease-out-soft flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--duration-base) group-open:text-white"
                >
                  <Plus
                    strokeWidth={2}
                    className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-open:rotate-45"
                  />
                </span>
              </summary>
              <p className="text-ink-soft max-w-[62ch] pr-14 pb-7 leading-relaxed whitespace-pre-line">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
