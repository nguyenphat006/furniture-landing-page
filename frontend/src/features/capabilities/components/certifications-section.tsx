import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { certifications, type Certification } from "@/data/certifications";
import { cn } from "@/lib/utils";
import { reveal } from "@/components/shared/reveal";

/*
 * Chứng nhận (2026-11-05), tách khỏi section QC nền tối theo yêu cầu, nền trắng.
 * Mỗi chứng nhận là một "tờ giấy" minh hoạ (logo + tên), dưới ghi phạm vi. Không ghi số hiệu
 * hay tên công ty để không thành giấy chứng nhận giả; khi có scan/PDF thật thì tờ giấy thành link tải.
 * Mục mẫu (ISO) có nhãn "Mẫu". Anchor #certifications (logo ở footer dẫn về đây).
 */
export function CertificationsSection() {
  const t = useTranslations("CapabilitiesPage.qc.certs");

  return (
    <Section id="certifications">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={t("kicker")}
          title={t("heading")}
        />
        <ul
          {...reveal("stagger")}
          className="mx-auto grid max-w-[960px] grid-cols-2 gap-6 sm:grid-cols-3 lg:gap-10"
        >
          {certifications.map((c) => (
            <CertPaper key={c.key} cert={c} />
          ))}
        </ul>
      </Container>
    </Section>
  );
}

function CertPaper({ cert }: { cert: Certification }) {
  const t = useTranslations("CapabilitiesPage.qc.certs");
  const Wrapper = cert.file ? "a" : "div";

  return (
    <li className="max-sm:last:col-span-2 max-sm:last:mx-auto max-sm:last:w-1/2">
      <Wrapper
        {...(cert.file ? { href: cert.file, download: true } : {})}
        className="group/paper block hover:no-underline"
      >
        <div className="border-line ease-out-soft relative flex aspect-[3/4] flex-col items-center rounded-[2px] border bg-white px-[10%] pt-[14%] shadow-[0_20px_40px_-24px_rgba(20,20,20,.28)] transition-[transform,box-shadow] duration-(--duration-base) group-hover/paper:-translate-y-1.5 group-hover/paper:shadow-[0_28px_48px_-24px_rgba(20,20,20,.35)]">
          {/* Viền trong như giấy chứng nhận */}
          <span
            aria-hidden="true"
            className="border-gold/40 pointer-events-none absolute inset-[5%] border"
          />
          {cert.logo ? (
            <Image
              src={cert.logo}
              alt=""
              width={96}
              height={96}
              unoptimized
              className="h-[34%] w-auto object-contain"
            />
          ) : null}
          <p className="text-ink mt-[10%] text-center text-[clamp(.95rem,1.4vw,1.25rem)] font-bold tracking-[.04em]">
            {cert.short}
          </p>
          {/* Dòng chữ giả trang trí */}
          <span aria-hidden="true" className="mt-[8%] grid w-3/4 gap-2">
            <span className="bg-ink/10 h-1 rounded-full" />
            <span className="bg-ink/10 mx-auto h-1 w-4/5 rounded-full" />
            <span className="bg-ink/10 mx-auto h-1 w-3/5 rounded-full" />
          </span>
          {cert.sample ? (
            <span className="bg-gold text-ink absolute top-[7%] right-[7%] rounded-[2px] px-2 py-0.5 text-[10px] font-semibold tracking-[.12em] uppercase">
              {t("sample")}
            </span>
          ) : null}
        </div>
        {/* Tên đã có trên tờ giấy; dưới chỉ ghi phạm vi */}
        <span className="sr-only">{t(`items.${cert.key}.name`)}</span>
        <p
          className={cn(
            "text-ink-soft mt-4 text-center text-sm",
            cert.sample && "text-ink-mute",
          )}
        >
          {t(`items.${cert.key}.scope`)}
        </p>
      </Wrapper>
    </li>
  );
}
