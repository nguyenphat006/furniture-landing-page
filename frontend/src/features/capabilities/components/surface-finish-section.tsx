import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { stageKeys } from "../data";
import { reveal } from "@/components/shared/reveal";

/*
 * Xử lý bề mặt (2026-11-05), thay SurfaceSection (file cũ giữ nguyên, không render).
 * Media-text kiểu Gloster: trái là tiêu đề + 6 bước tiền xử lý (lưới 3×2, số gold lớn, vạch trên)
 * + câu kết quả; phải là ảnh cận bề mặt sau sơn, dính khi cuộn.
 * Nền trắng vì section Xưởng phía trên nền stone.
 * Ảnh tạm: Slideshow_Alu_1 (khung nhôm sơn đen). Cần ảnh thật dây chuyền tiền xử lý.
 */
export function SurfaceFinishSection() {
  const t = useTranslations("CapabilitiesPage.surface");

  return (
    <Section id="surface">
      <Container className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-7">
          <SectionHeading eyebrow={t("kicker")} title={t("title")} />

          <ol
            {...reveal("stagger")}
            className="grid grid-cols-2 gap-x-5 sm:gap-x-8 xl:grid-cols-3"
          >
            {stageKeys.map((key) => (
              <li key={key} className="border-line border-t pt-5 pb-8">
                <span
                  aria-hidden="true"
                  className="text-gold block text-[28px] leading-none font-bold tracking-[-0.03em] tabular-nums"
                >
                  {key.padStart(2, "0")}
                </span>
                <h3 className="text-ink mt-4 font-bold">
                  {t(`stages.${key}.name`)}
                </h3>
                <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">
                  {t(`stages.${key}.desc`)}
                </p>
              </li>
            ))}
          </ol>

          <p className="text-ink mt-4 max-w-[56ch] text-lg leading-relaxed font-medium">
            {t("result")}
          </p>
          {/* Khối bảo hành đã bỏ (2026-11-05); text vẫn trong messages */}
        </div>

        {/* Ảnh cận bề mặt hoàn thiện */}
        <div className="lg:col-span-5 lg:col-start-8">
          <figure className="lg:sticky lg:top-[calc(80px+2.5rem)]">
            <div className="bg-surface-stone relative aspect-[4/5] overflow-hidden rounded-[2px]">
              <ImagePlaceholder
                label="Slideshow_Alu_1.png"
                sizes="(min-width: 1024px) 40vw, 100vw"
              />
            </div>
            <figcaption className="text-ink-mute mt-3 text-xs tracking-[.14em] uppercase">
              {t("imageCaption")}
            </figcaption>
          </figure>
        </div>
      </Container>
    </Section>
  );
}
