import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/shared/button-link";
import { Container, Section } from "@/components/shared/section";
import type { IntroContent } from "@/data/pages/types";
import { cn } from "@/lib/utils";

/*
 * Đoạn giới thiệu ngay dưới hero (2026-11-04): nền trắng (đã thử nền forest rồi bỏ), mọi thứ căn giữa.
 * Thứ tự: h2 ẩn (sr-only) → dấu ngoặc kép gold → câu tuyên ngôn → đoạn câu chuyện → nút viền.
 * Câu tuyên ngôn dùng cùng cỡ và độ đậm với tiêu đề SectionHeading (text-section, semibold).
 */
export function IntroSection({ content }: { content: IntroContent }) {
  const t = useTranslations("HomePage.intro");

  return (
    <Section
      id="intro"
      spacing="none"
      // Nền trắng liền với section Sản phẩm: chỉ chừa khoảng trên, khoảng dưới do padding-top của Sản phẩm lo
      className="pt-section"
    >
      <Container
        size="default"
        className="flex flex-col items-center text-center"
      >
        {/* Nhãn không hiển thị (2026-11-04), giữ h2 cho trình đọc màn hình và cấu trúc tiêu đề SEO */}
        <h2 className="sr-only">{content.heading}</h2>
        <QuoteMark className="text-gold mb-6 h-7 lg:mb-8 lg:h-9" />
        <blockquote className="text-section text-ink mb-8 max-w-[28ch] font-semibold tracking-[-0.015em] text-balance lg:mb-10">
          {content.quote}
        </blockquote>
        <p className="text-ink-soft mb-12 max-w-[62ch] text-base leading-[1.8] lg:text-[17px]">
          {content.body}
        </p>
        <ButtonLink href="/about">{content.buttonLabel || t("cta")}</ButtonLink>
      </Container>
    </Section>
  );
}

/** Dấu ngoặc kép mở dạng tròn (hình "66"): chấm tròn + đuôi cong đầu tròn, vẽ bằng SVG */
function QuoteMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 44 30"
      fill="currentColor"
      className={cn("w-auto", className)}
    >
      {[0, 24].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <circle cx="10" cy="20" r="9" />
          <path
            d="M2.5 18.5C2.5 10 7.5 4 15.5 2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}
