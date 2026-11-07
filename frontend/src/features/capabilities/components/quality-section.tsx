import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";

/*
 * Kiểm soát chất lượng (2026-11-05, bản 5). Thay QcSection (file cũ giữ, không render).
 * Lịch sử: bản 3 thẻ ảnh nền tối, bản 4 bậc thang nền tối, cả hai người dùng chưa ưng.
 * Bản 5: NỀN TRẮNG, bố cục chia đôi.
 *   Trái (dính khi cuộn): eyebrow + tiêu đề + 2 cam kết (tiêu chuẩn khách, bên thứ ba).
 *   Phải: 3 bước dạng hàng, mỗi hàng = số gold | tên + mô tả | ảnh nhỏ 4:3; vạch kẻ giữa hàng.
 * Ảnh tạm từ slideshow nhà máy (cần ảnh chụp đúng khâu QC khi có):
 *   1 kiểm tra vật tư: Slideshow_Teak_2 (công nhân kiểm phôi gỗ)
 *   2 trong quá trình: Slideshow_1_3 (kiểm khung ghế teak trong xưởng)
 *   3 kiểm tra cuối:   Slideshow_1_2 (thùng hàng cạnh container)
 * Chứng nhận ở section riêng ngay sau (certifications-section.tsx). Anchor #quality.
 */

const CHECKS = [
  { key: "1", img: "Slideshow_Teak_2.jpg" },
  { key: "2", img: "Slideshow_1_3.jpg" },
  { key: "3", img: "Slideshow_1_2.png" },
] as const;

export function QualitySection() {
  const t = useTranslations("CapabilitiesPage.qc");

  return (
    <Section id="quality" className="border-line border-t">
      <Container className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(80px+2.5rem)]">
            <SectionHeading
              eyebrow={t("kicker")}
              title={t("title")}
              className="mb-8 lg:mb-10"
            />
            <ul className="grid gap-3">
              {(["custom", "thirdParty"] as const).map((k) => (
                <li
                  key={k}
                  className="text-ink-soft flex items-start gap-3 text-[15px] leading-snug"
                >
                  <span
                    aria-hidden="true"
                    className="bg-forest mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                  >
                    <Check strokeWidth={3} className="size-3" />
                  </span>
                  {t(`chips.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ol className="border-line border-b lg:col-span-8">
          {CHECKS.map(({ key, img }, i) => (
            <li
              key={key}
              className="group/qc border-line grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-6 border-t py-8 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-x-8 lg:py-10 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,18rem)]"
            >
              <span className="text-gold w-[2ch] text-[clamp(2.5rem,3.5vw,3.25rem)] leading-none font-semibold tabular-nums">
                0{i + 1}
              </span>

              <div>
                <h3 className="text-h3 text-ink font-semibold">
                  {t(`items.${key}.name`)}
                </h3>
                <p className="text-ink-soft mt-2.5 max-w-[46ch] leading-relaxed">
                  {t(`items.${key}.desc`)}
                </p>
              </div>

              <div className="bg-surface-stone relative col-span-2 aspect-[4/3] overflow-hidden rounded-[2px] sm:col-span-1">
                <ImagePlaceholder
                  label={img}
                  sizes="(min-width: 640px) 18rem, 100vw"
                  className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/qc:scale-[1.04]"
                />
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
