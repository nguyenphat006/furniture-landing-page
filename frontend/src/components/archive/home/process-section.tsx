import { useTranslations } from "next-intl";
import { ArrowLink } from "@/components/shared/arrow-link";
import { processSteps } from "@/features/home/data";

export function ProcessSection() {
  const t = useTranslations("HomePage.process");

  return (
    <section
      id="process"
      className="flex scroll-mt-[72px] flex-col justify-center py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <h2 className="text-ink mb-4 text-center text-[clamp(2rem,3.2vw,3rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>
        <p className="text-ink mx-auto mb-20 max-w-[46ch] text-center text-[17px] leading-[1.8]">
          {t("lede")}
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-6 gap-y-12">
          {processSteps.map((s, i) => (
            <div key={s.key}>
              <div className="flex items-center">
                <span className="border-ink text-ink inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border bg-white text-sm font-semibold">
                  {i + 1}
                </span>
                <span aria-hidden="true" className="bg-line ml-4 h-px flex-1" />
              </div>
              <h3 className="text-ink mt-6 mb-2 text-lg leading-[1.4] font-semibold">
                {t(`steps.${s.key}.name`)}
              </h3>
              <p className="text-ink-mute mb-2 max-w-[52ch] text-sm leading-[1.6]">
                {t(`steps.${s.key}.desc`)}
              </p>
              {s.hasLead ? (
                <p className="text-ink-mute text-xs tracking-[.08em] uppercase opacity-50">
                  {t(`steps.${s.key}.lead`)}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-20 text-center">
          <ArrowLink href="/capabilities#process">{t("cta")}</ArrowLink>
        </div>
      </div>
    </section>
  );
}
