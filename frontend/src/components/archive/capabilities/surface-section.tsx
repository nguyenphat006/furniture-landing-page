import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { stageKeys } from "@/features/capabilities/data";

export function SurfaceSection() {
  const t = useTranslations("CapabilitiesPage.surface");

  return (
    <section
      id="surface"
      className="flex scroll-mt-[72px] flex-col justify-center bg-[#FBF6EA] py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <p className="text-ink-soft mb-3 text-center text-xs font-medium tracking-[.16em] uppercase">
          {t("kicker")}
        </p>
        <h2 className="text-ink mx-auto mb-4 max-w-[26ch] text-center text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>
        <p className="text-ink mx-auto mb-20 max-w-[46ch] text-center text-[17px] leading-[1.8]">
          {t("lede")}
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
          {stageKeys.map((key, i) => (
            <div
              key={key}
              className="max-lg:grid max-lg:grid-cols-[36px_1fr] max-lg:gap-x-4 max-lg:gap-y-2 lg:text-center"
            >
              <div className="relative flex items-center max-lg:items-start lg:justify-center">
                <div
                  aria-hidden="true"
                  className={cn(
                    "bg-line absolute top-1/2 h-px max-lg:hidden",
                    i === 0 ? "left-1/2" : "left-0",
                    i === stageKeys.length - 1 ? "right-1/2" : "right-0",
                  )}
                />
                <span className="border-gold text-ink relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-[#FBF6EA] text-[13px] font-semibold">
                  {key}
                </span>
              </div>
              <h3 className="text-ink text-base leading-[1.4] font-semibold max-lg:col-start-2 max-lg:mt-2 lg:mt-5 lg:mb-2">
                {t(`stages.${key}.name`)}
              </h3>
              <p className="text-ink-soft text-sm leading-[1.6] max-lg:col-start-2 lg:mx-auto lg:max-w-[24ch]">
                {t(`stages.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>

        <p className="text-ink mx-auto mt-20 max-w-[52ch] text-center text-[17px] leading-[1.8]">
          {t("result")}
        </p>
        <div className="border-line mx-auto mt-16 max-w-[640px] border bg-white p-8">
          <p className="text-ink-soft mb-2 text-xs tracking-[.14em] uppercase">
            {t("warrantyLabel")}
          </p>
          <p className="text-ink text-base leading-[1.7]">{t("warranty")}</p>
        </div>
      </div>
    </section>
  );
}
