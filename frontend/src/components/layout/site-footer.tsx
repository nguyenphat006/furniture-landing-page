"use client";

import { useTranslations } from "next-intl";
import { useSite } from "@/components/providers/site-provider";
import { legalHref, navHref, type NavKey } from "@/config/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { CertBadge } from "@/components/shared/cert-badge";
import { Container } from "@/components/shared/section";
import { confirmedCertifications } from "@/data/certifications";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type SiteFooterProps = {
  /** Các trang gợi ý ở dải cross-link phía trên footer; [] để ẩn dải này */
  crossKeys?: NavKey[];
};

/*
 * Footer DÙNG CHUNG, giống hệt nhau ở mọi trang (kể cả bản đồ, dù trang Liên hệ đã có bản đồ lớn).
 * Không thêm tuỳ chọn ẩn/bớt khối theo từng trang; chỉ dải cross-link phía trên được đổi đích.
 * Nội dung (giới thiệu, địa chỉ, liên hệ, bản đồ, mạng xã hội, link cuối) sửa ở CMS: Cài đặt → Thông tin chung.
 */

const socialNames = {
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
} as const;
export function SiteFooter({
  crossKeys = ["materials", "products", "contact"],
}: SiteFooterProps) {
  const t = useTranslations("Common");
  const tf = useTranslations("Footer");
  const site = useSite();

  return (
    <div className="bg-ink">
      {crossKeys.length > 0 ? (
        <Container className="grid border-b border-white/15 lg:grid-cols-3">
          {crossKeys.map((key, i) => (
            <Link
              key={key}
              href={navHref[key]}
              className={cn(
                "py-[clamp(3rem,6vw,5rem)] text-white transition-colors hover:bg-white/5 lg:px-7 lg:first:pl-0",
                "max-lg:border-t max-lg:border-white/15 max-lg:first:border-t-0",
                i > 0 && "lg:border-l lg:border-white/15",
              )}
            >
              <p className="text-gold mb-2.5 text-xs tracking-[.16em] uppercase">
                {t(`nav.${key}`)}
              </p>
              <span className="text-lg leading-[1.4] font-semibold">
                {tf(`cross.${key}`)}
                {"  →"}
              </span>
            </Link>
          ))}
        </Container>
      ) : null}

      <footer className="py-[clamp(4rem,10vw,8rem)] pb-12">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr_1.05fr] lg:gap-16">
            <div>
              <BrandLogo tone="light" />
              <p className="mt-5 max-w-[32ch] text-sm leading-[1.6] text-white/70">
                {site.footer.blurb}
              </p>
              <p className="mt-3 text-sm leading-[1.6] text-white/70">
                {site.legalName}
              </p>
            </div>

            <div>
              <div className="text-gold text-xs tracking-[.14em] uppercase">
                {tf("contactTitle")}
              </div>
              <div className="mt-5 grid gap-5">
                <p className="max-w-[32ch] text-sm leading-[1.7] text-white/85">
                  {site.address}
                </p>
                <div className="grid gap-2.5">
                  {site.phone ? (
                    <a
                      href={site.phoneHref}
                      className="text-sm text-white/85 hover:text-white hover:underline"
                    >
                      {site.phone}
                    </a>
                  ) : null}
                  {site.email ? (
                    <a
                      href={site.emailHref}
                      className="text-sm text-white/85 hover:text-white hover:underline"
                    >
                      {site.email}
                    </a>
                  ) : null}
                  {site.mapsUrl ? (
                    <a
                      href={site.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/85 hover:text-white hover:underline"
                    >
                      {tf("mapsLink")} →
                    </a>
                  ) : null}
                  {site.social.length > 0 ? (
                    <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                      {site.social.map((s) => (
                        <li key={s.url}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs tracking-[.14em] text-white/70 uppercase hover:text-white"
                          >
                            {socialNames[s.network] ?? s.network}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Bản đồ nhà máy — nhúng dạng output=embed, không cần API key. Chưa có link thì để trống ô */}
            <div className="relative min-h-[260px] overflow-hidden rounded-[2px] border border-white/15">
              {site.mapsEmbedUrl ? (
                <iframe
                  src={site.mapsEmbedUrl}
                  title={`${site.name} - ${tf("mapsLink")}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 h-full w-full border-0 grayscale-[.15]"
                />
              ) : null}
            </div>
          </div>

          <div className="mt-24 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-white/15 pt-8">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <span className="text-xs text-white/50">
                © {new Date().getFullYear()} {site.name}
              </span>
              {/* Dải chứng nhận nhỏ: chỉ mục đã xác nhận, bấm để xem chi tiết ở trang Năng lực */}
              {confirmedCertifications.length > 0 ? (
                <div className="flex items-center gap-3">
                  <span className="text-[11px] tracking-[.14em] text-white/40 uppercase">
                    {tf("certsLabel")}
                  </span>
                  {confirmedCertifications.map((c) => (
                    <Link
                      key={c.key}
                      href={`${navHref.capabilities}#certifications`}
                      aria-label={tf("certsAria", { name: c.short })}
                      title={c.short}
                      className="opacity-70 transition-opacity hover:opacity-100"
                    >
                      <CertBadge cert={c} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex gap-6">
              {/* Trang pháp lý luôn có; link thêm ở Cài đặt → Footer (bỏ link trùng đường dẫn) */}
              {(["privacy", "terms"] as const).map((k) => (
                <Link
                  key={k}
                  href={legalHref[k]}
                  className="text-xs text-white/50 hover:text-white"
                >
                  {tf(k)}
                </Link>
              ))}
              {site.footer.links
                .filter(
                  (l) =>
                    !(Object.values(legalHref) as string[]).includes(l.href),
                )
                .map((l) =>
                  l.href.startsWith("/") ? (
                    <Link
                      key={`${l.href}-${l.label}`}
                      href={l.href}
                      className="text-xs text-white/50 hover:text-white"
                    >
                      {l.label}
                    </Link>
                  ) : (
                    <a
                      key={`${l.href}-${l.label}`}
                      href={l.href}
                      className="text-xs text-white/50 hover:text-white"
                    >
                      {l.label}
                    </a>
                  ),
                )}
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
