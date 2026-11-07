import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { Link } from "@/i18n/navigation";

export function OemSection() {
  const t = useTranslations("CapabilitiesPage.oem");

  return (
    <section className="flex flex-col justify-center py-16 lg:min-h-[calc(100dvh-72px)] lg:py-24">
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-center gap-12 px-7">
        <div>
          <p className="text-ink-mute mb-3 text-xs font-medium tracking-[.16em] uppercase">
            {t("kicker")}
          </p>
          <h2 className="text-ink mb-4 text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
            {t("title")}
          </h2>
          <p className="text-ink mb-4 max-w-[46ch] text-[17px] leading-[1.8]">
            {t("p1")}
          </p>
          <p className="text-ink-soft mb-6 max-w-[52ch] text-base leading-[1.7]">
            {t("p2")}
          </p>
          <p className="text-ink-mute mb-8 text-sm">
            {t("samplingLabel")}{" "}
            <span className="opacity-50">{t("samplingValue")}</span>
          </p>
          <Link
            href="/contact"
            className="bg-ink hover:bg-forest inline-flex min-h-11 items-center justify-center rounded-[2px] px-8 py-4 text-[13px] font-medium tracking-[.08em] text-white uppercase transition-colors"
          >
            {t("cta")}
          </Link>
        </div>
        <div className="group relative aspect-[4/3] overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-600 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.03]">
            <ImagePlaceholder
              label={"Slideshow_Teak_5.JPG\nhand-finishing teak · 4:3"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
