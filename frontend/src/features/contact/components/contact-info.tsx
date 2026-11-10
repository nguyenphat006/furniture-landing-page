"use client";

import { useTranslations } from "next-intl";
import { useSite } from "@/components/providers/site-provider";
import { ButtonLink } from "@/components/shared/button-link";
import { navHref } from "@/config/navigation";

/*
 * Thông tin liên hệ + bản đồ (2026-11-05, bản 3; 2026-11-09 bản 4: thành cột phải cạnh form trong
 * ContactSection, khối thông tin trên, bản đồ dưới, không còn là section riêng). Khối thông tin chứa
 * kênh liên hệ (điện thoại, email, WhatsApp/Zalo, giờ làm việc, địa chỉ + chỉ đường)
 * và lời mời thăm nhà máy. Thông tin lấy từ CMS (Cài đặt → Thông tin chung); mục trống thì ẩn.
 * Nút "Đặt lịch" về lại form với mục đích "Thăm nhà máy" chọn sẵn (?purpose=visit#contact-form).
 */

type Channel = { key: string; label: string; value: string; href?: string };

export function ContactInfo() {
  const t = useTranslations("ContactPage");
  const site = useSite();

  const channels: Channel[] = [];
  if (site.phone) {
    channels.push({
      key: "phone",
      label: t("channels.phone"),
      value: site.phone,
      href: site.phoneHref,
    });
  }
  if (site.email) {
    channels.push({
      key: "email",
      label: t("channels.email"),
      value: site.email,
      href: site.emailHref,
    });
  }
  if (site.whatsappUrl) {
    channels.push({
      key: "whatsapp",
      label: t("channels.whatsapp"),
      value: site.phone,
      href: site.whatsappUrl,
    });
  }
  if (site.zaloUrl) {
    channels.push({
      key: "zalo",
      label: t("channels.zalo"),
      value: site.phone,
      href: site.zaloUrl,
    });
  }
  if (site.hours) {
    channels.push({
      key: "hours",
      label: t("channels.hours"),
      value: site.hours,
    });
  }

  return (
    <div id="visit" className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
      <div className="border-line rounded-[2px] border bg-white p-6 sm:p-8">
        <h2 className="text-h3 text-ink font-bold">{t("channels.title")}</h2>

        <dl className="mt-5">
          {channels.map((c) => (
            <div
              key={c.key}
              className="border-line grid gap-x-4 gap-y-1 border-t py-3 sm:grid-cols-[7rem_minmax(0,1fr)]"
            >
              <dt className="text-eyebrow text-ink-mute pt-0.5 font-semibold uppercase">
                {c.label}
              </dt>
              <dd className="text-ink font-medium break-words">
                {c.href ? (
                  <a
                    href={c.href}
                    {...(c.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="hover:text-forest underline-offset-4 transition-colors hover:underline"
                  >
                    {c.value}
                  </a>
                ) : (
                  c.value
                )}
              </dd>
            </div>
          ))}
          <div className="border-line grid gap-x-4 gap-y-1 border-y py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="text-eyebrow text-ink-mute pt-0.5 font-semibold uppercase">
              {t("channels.address")}
            </dt>
            <dd className="text-ink text-sm leading-relaxed">
              {site.address}
              <a
                href={site.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-forest mt-1.5 block font-medium underline-offset-4 hover:underline"
              >
                {t("channels.directions")} →
              </a>
            </dd>
          </div>
        </dl>

        {/* Lời mời thăm nhà máy */}
        <div className="mt-6">
          <p className="text-eyebrow text-forest font-bold uppercase">
            {t("visit.kicker")}
          </p>
          <p className="text-ink-soft mt-2 text-sm leading-relaxed">
            {t("visit.body")}
          </p>
          <ButtonLink
            href={{
              pathname: navHref.contact,
              query: { purpose: "visit" },
              hash: "contact-form",
            }}
            className="mt-5 max-sm:h-auto max-sm:min-h-12 max-sm:w-full max-sm:justify-between max-sm:px-5 max-sm:py-3 max-sm:text-left max-sm:whitespace-normal"
          >
            {t("visit.cta")}
          </ButtonLink>
        </div>
      </div>

      {/* Bản đồ dưới khối thông tin */}
      <div className="border-line bg-surface-stone relative aspect-[4/3] overflow-hidden rounded-[2px] border md:aspect-auto md:min-h-80 xl:aspect-[4/3]">
        {site.mapsEmbedUrl ? (
          <iframe
            src={site.mapsEmbedUrl}
            title={t("visit.mapTitle")}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : null}
      </div>
    </div>
  );
}
