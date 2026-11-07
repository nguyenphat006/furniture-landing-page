import { useTranslations } from "next-intl";
import { processStepDefs } from "@/features/capabilities/data";

export function ProcessDetailSection() {
  const t = useTranslations("CapabilitiesPage.process");

  return (
    <section
      id="process"
      className="flex scroll-mt-[72px] flex-col justify-center py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <h2 className="text-ink mb-4 max-w-[24ch] text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>
        <p className="text-ink mb-16 max-w-[46ch] text-[17px] leading-[1.8]">
          {t("lede")}
        </p>

        <div className="border-line border-t">
          {processStepDefs.map((s, i) => (
            <div
              key={s.key}
              className="border-line grid grid-cols-[56px_1fr] items-baseline gap-x-6 gap-y-4 border-b py-7 lg:grid-cols-[56px_minmax(200px,1.1fr)_minmax(240px,1.6fr)_110px]"
            >
              <span className="text-gold text-xs font-semibold tracking-[.16em]">
                0{i + 1}
              </span>
              <h3 className="text-ink text-lg leading-[1.4] font-semibold">
                {t(`steps.${s.key}.name`)}
              </h3>
              <div className="max-lg:col-start-2">
                {s.hasNeeds ? (
                  <p className="text-ink-soft text-sm leading-[1.6]">
                    <span className="text-ink-mute text-xs tracking-[.1em] uppercase">
                      {t("prepareLabel")}
                      {"  "}
                    </span>
                    {t(`steps.${s.key}.needs`)}
                  </p>
                ) : (
                  <p className="text-ink-mute text-sm leading-[1.6]">-</p>
                )}
              </div>
              <span className="text-ink-mute text-sm tabular-nums opacity-50 max-lg:col-start-2 lg:text-right">
                {s.hasTime ? t(`steps.${s.key}.time`) : "-"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
