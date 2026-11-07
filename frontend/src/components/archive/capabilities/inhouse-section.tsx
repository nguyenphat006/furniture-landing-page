import { useTranslations } from "next-intl";
import { boughtInItems } from "@/features/capabilities/data";

export function InhouseSection() {
  const t = useTranslations("CapabilitiesPage.inhouse");
  const madeItems = t.raw("madeItems") as string[];

  return (
    <section
      id="inhouse"
      className="flex scroll-mt-[72px] flex-col justify-center bg-[#EDF2EE] py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <h2 className="text-ink mx-auto mb-4 max-w-[24ch] text-center text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h2>
        <p className="text-ink mx-auto mb-20 max-w-[46ch] text-center text-[17px] leading-[1.8]">
          {t("lede")}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="lg:pr-[clamp(28px,5vw,64px)]">
            <p className="text-ink-soft mb-6 text-xs font-medium tracking-[.14em] uppercase">
              {t("inhouseLabel")}
            </p>
            <div>
              {madeItems.map((item) => (
                <div
                  key={item}
                  className="grid grid-cols-[28px_1fr] items-baseline gap-3 border-b border-[#cfdbd2] py-3.5"
                >
                  <span className="text-forest text-sm font-semibold">✓</span>
                  <span className="text-ink text-base leading-[1.6]">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="max-lg:mt-8 max-lg:border-t max-lg:border-[#cfdbd2] max-lg:pt-8 lg:border-l lg:border-[#cfdbd2] lg:pl-[clamp(28px,5vw,64px)]">
            <p className="text-ink-soft mb-6 text-xs font-medium tracking-[.14em] uppercase">
              {t("boughtLabel")}
            </p>
            <div>
              {boughtInItems.map((item) => (
                <div
                  key={item.key}
                  className="grid grid-cols-[28px_1fr] items-baseline gap-3 border-b border-[#cfdbd2] py-3.5"
                >
                  <span className="text-ink-soft text-sm">·</span>
                  <span className="text-ink text-base leading-[1.6]">
                    {t(`boughtItems.${item.key}`)}
                    {item.unconfirmed ? (
                      <span className="text-ink-soft text-xs tracking-[.06em] opacity-60">
                        {"  "}
                        {t("unconfirmedTag")}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-[720px] border border-[#cfdbd2] bg-white px-8 py-7">
          <p className="text-ink-soft mb-2 text-xs tracking-[.14em] uppercase">
            {t("unclassifiedLabel")}
          </p>
          <p className="text-ink-soft text-sm leading-[1.7]">
            {t("unclassified")}
          </p>
        </div>
      </div>
    </section>
  );
}
