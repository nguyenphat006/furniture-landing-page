import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { cn } from "@/lib/utils";

/*
 * Quy trình hợp tác OEM (2026-11-05). Gộp OemSection + ProcessDetailSection cũ (giữ file, không render).
 * Nền forest đậm (brand) để ngắt chuỗi 3 section trắng phía trên (Bề mặt, QC, Chứng nhận).
 *   1. Tiêu đề + nút "Gửi yêu cầu làm mẫu".
 *   2. 3 thẻ GIAI ĐOẠN nền trắng (xl: 3 cột; md đến xl: thẻ nằm ngang ảnh trái; mobile: dọc) (bản 2, thay 6 bước xếp ngang): ảnh thật + tên giai đoạn
 *      + 2 bước bên trong, mỗi bước gắn nhãn ai thực hiện (Bạn / BFC).
 *   FAQ đã tách thành section riêng nền trắng (faq-section.tsx).
 * Ảnh tạm: Teak_8 (CNC, thẩm định kỹ thuật), 1_4_2 (phòng chụp mẫu), Teak_5 (xưởng teak).
 */

type Owner = "you" | "bfc";

const PHASES: {
  key: "quote" | "sample" | "production";
  img: string;
  steps: { key: string; owner: Owner }[];
}[] = [
  {
    key: "quote",
    img: "Slideshow_Teak_8.JPG",
    steps: [
      { key: "1", owner: "you" },
      { key: "2", owner: "bfc" },
    ],
  },
  {
    key: "sample",
    img: "Slideshow_1_4_2.jpg",
    steps: [
      { key: "3", owner: "bfc" },
      { key: "4", owner: "you" },
    ],
  },
  {
    key: "production",
    img: "Slideshow_Teak_5.JPG",
    steps: [
      { key: "5", owner: "bfc" },
      { key: "6", owner: "bfc" },
    ],
  },
];

export function OemProcessSection() {
  const t = useTranslations("CapabilitiesPage.oemProcess");

  return (
    <Section id="oem" tone="brand">
      <Container>
        <SectionHeading
          tone="light"
          eyebrow={t("kicker")}
          title={t("title")}
          action={
            <ButtonLink
              href={{
                pathname: navHref.contact,
                query: { purpose: "oem" },
                hash: "contact-form",
              }}
              tone="light"
            >
              {t("cta")}
            </ButtonLink>
          }
        />

        <ol className="grid gap-5 lg:gap-6 xl:grid-cols-3">
          {PHASES.map((phase, i) => (
            <li
              key={phase.key}
              className="group/phase text-ink flex flex-col overflow-hidden rounded-[2px] bg-white md:max-xl:grid md:max-xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
            >
              <div className="bg-surface-stone relative aspect-[3/2] overflow-hidden md:max-xl:aspect-auto md:max-xl:min-h-full">
                <ImagePlaceholder
                  label={phase.img}
                  sizes="(min-width: 1280px) 33vw, (min-width: 768px) 40vw, 100vw"
                  className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/phase:scale-[1.04]"
                />
              </div>

              <div className="flex flex-1 flex-col p-6 lg:p-8">
                <p className="text-gold-ink text-eyebrow font-semibold uppercase">
                  {t("phaseLabel")} 0{i + 1}
                </p>
                <h3 className="text-h3 mt-2 font-semibold">
                  {t(`phases.${phase.key}`)}
                </h3>

                <ol className="mt-6">
                  {phase.steps.map(({ key, owner }) => (
                    <li
                      key={key}
                      className="border-line grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t py-5 last:pb-0"
                    >
                      <span className="text-gold pt-0.5 text-sm font-semibold tabular-nums">
                        0{key}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <h4 className="font-semibold">
                            {t(`steps.${key}.name`)}
                          </h4>
                          <span
                            title={t(`ownerAria.${owner}`)}
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[.08em] uppercase",
                              owner === "you"
                                ? "border-gold text-gold-ink border"
                                : "bg-forest text-white",
                            )}
                          >
                            <span className="sr-only">
                              {t(`ownerAria.${owner}`)}
                            </span>
                            <span aria-hidden="true">
                              {t(`owner.${owner}`)}
                            </span>
                          </span>
                        </div>
                        <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">
                          {t(`steps.${key}.desc`)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
