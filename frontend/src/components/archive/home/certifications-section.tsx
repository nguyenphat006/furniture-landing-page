import { useTranslations } from "next-intl";
import { ArrowLink } from "@/components/shared/arrow-link";
import { cn } from "@/lib/utils";
import { certifications } from "@/features/home/data";

export function CertificationsSection() {
  const t = useTranslations("HomePage.certifications");

  return (
    <section
      id="certifications"
      className="flex scroll-mt-[72px] flex-col justify-center bg-[#EDF2EE] py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1100px] px-7">
        <div className="mb-16 max-w-[52ch]">
          <h2 className="text-ink text-[clamp(2rem,3.2vw,3rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
            {t("title")}
          </h2>
          <p className="text-ink mt-4 text-[17px] leading-[1.8]">{t("lede")}</p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-8 gap-y-12">
          {certifications.map((c, i) => (
            <div key={i} className="text-center">
              <div className="border-line flex h-14 items-center justify-center border bg-white">
                <span
                  className={cn(
                    "text-sm font-semibold tracking-[.1em]",
                    c.pending ? "text-ink-mute opacity-50" : "text-ink",
                  )}
                >
                  {c.name}
                </span>
              </div>
              <p
                className={cn(
                  "text-ink-soft mx-auto mt-4 max-w-[32ch] text-xs leading-[1.6]",
                  c.pending && "opacity-50",
                )}
              >
                {c.pending ? t("pendingNote") : t("fscNote")}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16">
          <ArrowLink href="/about#certifications">{t("cta")}</ArrowLink>
        </div>
      </div>
    </section>
  );
}
