import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { navHref } from "@/config/navigation";
import type { FactoryContent } from "@/data/pages/types";

/*
 * Section cuối trang chủ (2026-11-04), dẫn sang /capabilities.
 * Bố cục "offset composition" học từ Gloster:
 * - Ảnh xưởng lớn tràn ra mép trái màn hình, chiếm ~7/12 bề ngang.
 * - Một ảnh chi tiết nhỏ hơn đặt lệch, đè lên góc dưới phải của ảnh lớn.
 * - Khối chữ bên phải lệch xuống thấp hơn mép trên ảnh: nhãn, tiêu đề, đoạn mô tả,
 *   3 điểm tin cậy dạng danh sách mảnh, CTA nút khung viền chung (ButtonLink, đồng nhất 2026-11-05; LineLink giữ trong code).
 * Mobile: ảnh lớn tràn hai mép, ảnh nhỏ đè góc dưới phải, chữ xếp bên dưới.
 * Phương án bento kiểu Nghĩa Sơn trước đó giữ ở factory-bento-section.tsx (không render).
 * Chữ là bản nháp của BFC; ảnh tạm lấy từ slideshow nhà máy.
 */

/** Khoảng từ mép trái màn hình tới mép trái container chung */
const BLEED_LEFT =
  "max(var(--spacing-gutter), calc((100vw - var(--container-content)) / 2))";

/** Nội dung từ CMS (block Nhà máy) hoặc mock dựng từ messages (data/pages/home.ts) */
export function FactorySection({ content }: { content: FactoryContent }) {
  const t = useTranslations("HomePage.factory");

  return (
    <Section
      id="factory"
      spacing="none"
      // (2026-11-06) Phía trên giờ là section Xuất khẩu nền xanh nên có thêm khoảng trên
      className="pt-section pb-section overflow-x-clip"
    >
      <Container className="grid gap-y-16 lg:grid-cols-12 lg:gap-x-8">
        {/* Cụm ảnh: ảnh lớn tràn mép trái + ảnh chi tiết đè góc */}
        <div
          className="-mx-gutter relative mb-10 lg:col-span-7 lg:mr-0 lg:mb-24 lg:ml-[calc(-1*var(--bleed))]"
          style={{ ["--bleed" as string]: BLEED_LEFT }}
        >
          <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden lg:aspect-auto lg:h-[min(72vh,640px)]">
            <ImagePlaceholder
              label={content.image ?? undefined}
              sizes="(min-width: 1024px) 60vw, 100vw"
            />
          </div>
          <div className="bg-surface-stone right-gutter absolute -bottom-10 aspect-[4/5] w-[42%] overflow-hidden shadow-[0_24px_48px_-24px_rgba(0,0,0,.35)] lg:-right-[12%] lg:-bottom-24 lg:w-[38%]">
            <ImagePlaceholder
              label={content.detailImage ?? undefined}
              sizes="(min-width: 1024px) 24vw, 42vw"
            />
          </div>
        </div>

        {/* Khối chữ: lệch xuống so với mép trên ảnh */}
        <div className="lg:col-span-4 lg:col-start-9 lg:self-center lg:pt-24">
          {/* Cụm tiêu đề chung (2026-11-05): subtitle có vạch + title in hoa như mọi section */}
          <SectionHeading
            eyebrow={content.kicker}
            title={content.title}
            className="mb-6 lg:mb-6"
          />
          {content.lede ? (
            <p className="text-lede text-ink-soft mb-8">{content.lede}</p>
          ) : null}

          <ul className="border-line mb-10 border-t">
            {content.points.map((point) => (
              <li
                key={point}
                className="border-line text-ink flex items-center gap-3 border-b py-3.5 text-[15px]"
              >
                <Check
                  aria-hidden="true"
                  strokeWidth={2}
                  className="text-forest size-4 shrink-0"
                />
                {point}
              </li>
            ))}
          </ul>

          <ButtonLink href={navHref.capabilities}>
            {content.buttonLabel || t("feature.cta")}
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
