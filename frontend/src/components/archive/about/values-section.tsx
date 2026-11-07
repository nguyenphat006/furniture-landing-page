import { useTranslations } from "next-intl";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";

/*
 * "Điều chúng tôi giữ" của trang About (2026-11-05). TẠM ẨN (2026-11-06), thay bằng timeline lịch sử;
 * giữ code để dùng lại. Nền stone, tiêu đề chung, lưới 4 nguyên tắc: số 01-04 màu forest,
 * vạch mảnh phía trên mỗi ô, tên + mô tả.
 */

const VALUES = ["inhouse", "materials", "partner", "outdoor"] as const;

export function AboutValuesSection() {
  const t = useTranslations("AboutPage");

  return (
    <Section id="values" tone="stone">
      <Container>
        <SectionHeading
          eyebrow={t("values.kicker")}
          title={t("values.title")}
        />
        <ol className="grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4">
          {VALUES.map((v, i) => (
            <li key={v} className="border-ink/15 border-t pt-6">
              <span className="text-forest text-sm font-semibold tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-ink mt-4 text-xl font-semibold tracking-[-0.01em]">
                {t(`values.items.${v}.name`)}
              </h3>
              <p className="text-ink-soft mt-3 leading-relaxed">
                {t(`values.items.${v}.desc`)}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
