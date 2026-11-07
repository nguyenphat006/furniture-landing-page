import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref, type NavKey } from "@/config/navigation";
import { Link } from "@/i18n/navigation";

/*
 * "Có thể bạn đang tìm" của trang 404 (2026-11-05). TẠM ẨN theo yêu cầu người dùng, giữ code để dùng lại.
 * Nền stone, tiêu đề căn giữa, 4 thẻ trắng liền nhau (gap 1px) dẫn tới các trang đã có thật,
 * mỗi thẻ: tên trang in hoa + mô tả lấy từ Footer.cross + mũi tên trượt khi hover.
 */

const SUGGESTIONS: NavKey[] = ["about", "capabilities", "materials", "contact"];

export function NotFoundSuggestions() {
  const t = useTranslations("NotFound");
  const tc = useTranslations("Common");
  const tf = useTranslations("Footer");

  return (
    <Section id="suggestions" tone="stone">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={t("linksKicker")}
          title={t("linksTitle")}
        />
        <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {SUGGESTIONS.map((key) => (
            <li key={key}>
              <Link
                href={navHref[key]}
                className="group flex h-full flex-col justify-between gap-10 bg-white p-6 hover:no-underline lg:p-8"
              >
                <span>
                  <span className="text-ink block text-xl font-semibold tracking-[.02em] uppercase">
                    {tc(`nav.${key}`)}
                  </span>
                  <span className="text-ink-soft mt-3 block leading-relaxed">
                    {tf(`cross.${key}`)}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  strokeWidth={2}
                  className="text-ink group-hover:text-forest ease-out-soft size-5 transition-[color,transform] duration-(--duration-base) group-hover:translate-x-1"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
