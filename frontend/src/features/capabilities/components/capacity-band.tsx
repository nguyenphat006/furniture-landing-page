import { useTranslations } from "next-intl";
import { CountUp } from "@/components/shared/count-up";
import { Container, Section } from "@/components/shared/section";
import { cn } from "@/lib/utils";
import { reveal } from "@/components/shared/reveal";

/*
 * Dải 4 con số năng lực (2026-11-04), anchor #capacity, ngay dưới đầu trang Năng lực.
 * Học Nghĩa Sơn "capability strip": mỗi ô có vạch nhấn 48×2px, con số lớn, nhãn in hoa, 1 câu mô tả.
 * Nền forest đậm để trang có màu thương hiệu ngay màn hình đầu; vạch nhấn dùng gold.
 * Số liệu: 2010, 370 nhân sự, 28.000 m² lấy từ nội dung About (giống dải số trang chủ đang ẩn);
 * công suất 100+ container/tháng do BFC cung cấp (2026-11-04).
 */

type Stat = {
  key: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
};

const STATS: Stat[] = [
  { key: "years", value: new Date().getFullYear() - 2010, suffix: "+" },
  { key: "area", value: 28000, suffix: " m²" },
  { key: "employees", value: 370 },
  { key: "containers", value: 100, suffix: "+" },
];

export function CapacityBand() {
  const t = useTranslations("CapabilitiesPage.capacity");

  return (
    <Section id="capacity" tone="brand" spacing="band" aria-label={t("aria")}>
      <Container>
        <dl
          {...reveal("stagger")}
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
        >
          {STATS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "flex flex-col py-8 sm:pr-8 xl:py-2",
                // Vạch nhấn gold 48×2px phía trên mỗi ô
                "before:bg-gold before:order-0 before:mb-6 before:block before:h-0.5 before:w-12 before:content-['']",
                // Đường kẻ mảnh giữa các ô
                "max-sm:border-t max-sm:border-white/15 max-sm:first:border-t-0",
                "sm:max-xl:border-white/15 sm:max-xl:[&:nth-child(n+3)]:border-t",
                i % 2 === 1 && "sm:border-l sm:border-white/15 sm:pl-8",
                i === 2 && "xl:border-l xl:border-white/15 xl:pl-8",
              )}
            >
              <dt className="text-eyebrow order-2 mt-4 font-semibold text-white/90 uppercase">
                {t(`items.${s.key}.label`)}
              </dt>
              <dd className="order-1 text-[clamp(2.5rem,3.5vw,3.5rem)] leading-none font-bold tracking-[-0.03em] tabular-nums">
                {s.value === null ? (
                  <span className="text-white/35">NULL</span>
                ) : (
                  <>
                    {s.prefix}
                    <CountUp value={s.value} />
                    {s.suffix}
                  </>
                )}
              </dd>
              <dd className="order-3 mt-2 max-w-[32ch] text-sm leading-relaxed text-white/90">
                {t(`items.${s.key}.desc`)}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}
