import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const qcKeys = ["1", "2", "3"] as const;

export function QcSection() {
  const t = useTranslations("CapabilitiesPage.qc");

  return (
    <section className="flex flex-col justify-center bg-[#FBF6EA] py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24">
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <h2 className="text-ink mb-16 max-w-[26ch] text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3">
          {qcKeys.map((key, i) => (
            <div
              key={key}
              className={cn(
                "max-lg:border-line max-lg:border-t max-lg:py-6 max-lg:first:border-t-0",
                i === 0 && "lg:pr-8",
                i === 1 && "lg:border-line lg:border-l lg:px-8",
                i === 2 && "lg:border-line lg:border-l lg:pl-8",
              )}
            >
              <p className="text-ink-soft mb-2 text-xs tracking-[.14em] uppercase">
                0{i + 1}
              </p>
              <h3 className="text-ink mb-2 text-lg leading-[1.4] font-semibold">
                {t(`items.${key}.name`)}
              </h3>
              <p className="text-ink-soft max-w-[32ch] text-sm leading-[1.6]">
                {t(`items.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>

        <div className="border-line mt-16 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-12 border-t pt-12">
          <div>
            <h3 className="text-ink mb-2 text-lg leading-[1.4] font-semibold">
              {t("customTitle")}
            </h3>
            <p className="text-ink-soft max-w-[46ch] text-sm leading-[1.6]">
              {t("customDesc")}
            </p>
          </div>
          <div>
            <h3 className="text-ink mb-2 text-lg leading-[1.4] font-semibold">
              {t("thirdPartyTitle")}
            </h3>
            <p className="text-ink-soft max-w-[46ch] text-sm leading-[1.6]">
              {t("thirdPartyDesc")}{" "}
              <span className="opacity-50">{t("agencies")}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
