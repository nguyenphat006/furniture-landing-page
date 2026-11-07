import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { HistoryTimeline } from "./history-timeline";

/*
 * Nội dung trang Về chúng tôi (2026-11-05), bám trang About của Gloster:
 *   1. Ảnh nhà máy lớn hết container ngay dưới đầu trang
 *   2. Câu chuyện: đoạn dẫn đậm + các đoạn văn (cột trái), cột phải là bảng tóm tắt dính khi cuộn
 *   3. Lịch sử hình thành (nền stone): timeline ngang theo năm (thay "Điều chúng tôi giữ", đang ẩn)
 *   4. Con người tại xưởng: ảnh lớn trái, chữ phải
 *   5. Xuất khẩu: chữ trái, ảnh lớn phải, nút sang trang Năng lực
 * Số liệu chỉ dùng số đã có trên site (2010, 28.000 m², 370 nhân sự, 6 xưởng).
 */

const FACTS = [
  "founded",
  "location",
  "area",
  "employees",
  "workshops",
] as const;

const bodyText = "text-ink-soft space-y-5 leading-relaxed";

export function AboutContent() {
  const t = useTranslations("AboutPage");
  const paras = (key: string) => t.raw(key) as string[];

  return (
    <>
      {/* 1. Ảnh nhà máy */}
      <Section id="factory" spacing="none">
        <Container>
          <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden sm:aspect-[16/9] lg:aspect-[21/9]">
            <ImagePlaceholder
              label="Slideshow_1_7.jpg"
              sizes="(min-width: 1440px) 1350px, 100vw"
            />
          </div>
        </Container>
      </Section>

      {/* 2. Câu chuyện */}
      <Section id="story">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <SectionHeading
                eyebrow={t("story.kicker")}
                title={t("story.title")}
                className="mb-0 lg:mb-0"
              />
              <p className="text-ink mt-8 text-lg leading-relaxed font-medium lg:text-xl">
                {t("story.lead")}
              </p>
              <div className={`${bodyText} mt-6`}>
                {paras("story.paragraphs").map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
            <aside className="lg:col-span-4 lg:col-start-9">
              <dl
                aria-label={t("story.factsAria")}
                className="border-line border-t lg:sticky lg:top-[calc(80px+2rem)]"
              >
                {FACTS.map((f) => (
                  <div
                    key={f}
                    className="border-line flex items-baseline justify-between gap-6 border-b py-5"
                  >
                    <dt className="text-ink-mute text-xs font-semibold tracking-[.14em] uppercase">
                      {t(`story.facts.${f}.label`)}
                    </dt>
                    <dd className="text-ink text-right text-xl font-semibold tracking-[-0.01em] tabular-nums">
                      {t(`story.facts.${f}.value`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </Container>
      </Section>

      {/* 3. Lịch sử hình thành: timeline ngang (2026-11-06).
          "Điều chúng tôi giữ" đang ẩn, code giữ ở components/archive */}
      <HistoryTimeline />

      {/* 4. Con người tại xưởng */}
      <Section id="people">
        <Container>
          <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-8">
            <div className="bg-surface-stone relative aspect-[3/2] overflow-hidden lg:col-span-7">
              <ImagePlaceholder
                label="Slideshow_1_3.jpg"
                sizes="(min-width: 1024px) 58vw, 100vw"
              />
            </div>
            <div className="lg:col-span-4 lg:col-start-9">
              <SectionHeading
                eyebrow={t("people.kicker")}
                title={t("people.title")}
                className="mb-0 lg:mb-0"
              />
              <div className={`${bodyText} mt-6`}>
                {paras("people.body").map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* 5. Xuất khẩu */}
      <Section id="export" className="pt-0 lg:pt-0">
        <Container>
          <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4 lg:row-start-1">
              <SectionHeading
                eyebrow={t("export.kicker")}
                title={t("export.title")}
                className="mb-0 lg:mb-0"
              />
              <div className={`${bodyText} mt-6`}>
                {paras("export.body").map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
              <ButtonLink href={navHref.capabilities} className="mt-8">
                {t("export.cta")}
              </ButtonLink>
            </div>
            <div className="bg-surface-stone relative aspect-[3/2] overflow-hidden max-lg:row-start-1 lg:col-span-7 lg:col-start-6">
              <ImagePlaceholder
                label="Landing.jpg"
                sizes="(min-width: 1024px) 58vw, 100vw"
              />
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
