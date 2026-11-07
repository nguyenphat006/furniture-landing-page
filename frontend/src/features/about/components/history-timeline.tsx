"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { motion, useInView, useReducedMotion } from "motion/react";
import {
  Factory,
  Flag,
  PaintRoller,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { CircleNavButton } from "@/components/shared/circle-nav-button";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { cn } from "@/lib/utils";

/*
 * Lịch sử hình thành (2026-11-06), thay "Điều chúng tôi giữ" trên trang About.
 * Bản 3: 4 mốc nằm gọn một hàng (không carousel), KHÔNG dùng ảnh (người dùng chốt).
 * Màu và chiều sâu bằng hiệu ứng, bám bảng màu dự án (forest + gold):
 *   - nền forest (token chung) phủ gradient chéo ngả gold về góc phải dưới,
 *     thêm vầng sáng gold góc phải trên (2026-11-06: làm sáng section, bỏ vầng tối);
 *   - năm thành lập "2010" cỡ rất lớn dạng chữ viền mảnh chìm phía sau (watermark);
 *   - khi cuộn tới: đường kẻ gold tự vẽ từ trái sang phải, chấm mốc bật lên và nội dung từng mốc
 *     hiện dần lần lượt; hover một mốc thì chấm phát sáng. Tôn trọng prefers-reduced-motion.
 * Mỗi cột: năm cỡ lớn gold → chấm trên đường kẻ → tên mốc in hoa → mô tả.
 * Dưới lg: 2 cột rồi 1 cột, đường kẻ chung ẩn, mỗi mốc có vạch riêng.
 * Dữ liệu ở messages AboutPage.history.items (4 phần tử). Chỉ 2010 và mốc hiện tại là số thật;
 * 2016/2019 là DỮ LIỆU MẪU, phải thay bằng mốc BFC xác nhận.
 * (2026-11-06) Thêm cho phong phú: mỗi mốc một icon trong vòng tròn viền gold nằm trên đường kẻ
 *   (vòng không nền, viền gold, icon trắng; hover: nền gold, icon trắng; đường kẻ chia đoạn giữa các vòng), và lưới chấm mảnh mờ dần trên nền.
 *   Icon theo thứ tự mốc (ICONS), đổi mốc thì đổi icon tương ứng.
 * (2026-11-06) Số mốc do CMS quản lý: <= MAX_STATIC (4) mốc thì lưới tĩnh 4 cột; nhiều hơn thì
 *   chuyển sang slide ngang (scroll-snap, mỗi khung 4 mốc ở lg) + cặp nút tròn CircleNavButton ở giữa
 *   và đường kẻ tĩnh ra mép phải (giống carousel Vật liệu trang chủ). Icon lặp vòng theo ICONS.
 * year = "now" → hiển thị năm hiện tại (new Date().getFullYear()), tự lên năm, không phải sửa messages.
 */

type Milestone = { year: string; title: string; desc: string };

const EASE = [0.22, 1, 0.36, 1] as const; // khớp --ease-out-soft

// Thành lập, xưởng kim loại, sơn tĩnh điện, nhà máy hôm nay
const ICONS: LucideIcon[] = [Flag, Wrench, PaintRoller, Factory];

/** Quá số mốc này thì chuyển sang dạng slide */
const MAX_STATIC = 4;

export function HistoryTimeline() {
  const t = useTranslations("AboutPage.history");
  const currentYear = String(new Date().getFullYear());
  const items = (t.raw("items") as Milestone[]).map((m) =>
    m.year === "now" ? { ...m, year: currentYear } : m,
  );
  const listRef = useRef<HTMLOListElement>(null);
  const inView = useInView(listRef, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  const show = inView || reduce;
  const slider = items.length > MAX_STATIC;
  const [edge, setEdge] = useState({ start: true, end: false });

  const updateEdge = () => {
    const el = listRef.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  };

  const scrollByItem = (dir: 1 | -1) => {
    const el = listRef.current;
    const item = el?.querySelector("li");
    if (!el || !item) return;
    el.scrollBy({ left: dir * item.clientWidth, behavior: "smooth" });
  };

  return (
    <Section
      id="history"
      tone="brand"
      className="relative isolate overflow-hidden"
    >
      {/* Nền hiệu ứng: vầng sáng gold + vầng tối, và năm thành lập viền mảnh chìm phía sau */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute inset-0 bg-[linear-gradient(120deg,var(--color-forest)_55%,color-mix(in_oklab,var(--color-forest)_82%,var(--color-gold))_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(55%_70%_at_88%_0%,color-mix(in_oklab,var(--color-gold)_34%,transparent),transparent_70%)]" />
        {/* Lưới chấm mảnh, đậm ở trên và mờ dần xuống dưới */}
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.22)_1px,transparent_1.6px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] bg-size-[24px_24px]" />
        <span className="absolute -right-[0.06em] -bottom-[0.22em] text-[clamp(10rem,30vw,30rem)] leading-none font-semibold tracking-[-0.04em] text-transparent tabular-nums select-none [-webkit-text-stroke:1px_rgb(255_255_255/0.1)]">
          2010
        </span>
      </div>

      <Container>
        <SectionHeading tone="light" eyebrow={t("kicker")} title={t("title")} />

        <ol
          ref={listRef}
          style={
            { "--year-h": "clamp(3.5rem, 5.6vw, 5.5rem)" } as CSSProperties
          }
          onScroll={slider ? updateEdge : undefined}
          className={cn(
            "relative",
            slider
              ? "flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
              : "grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0",
          )}
        >
          {items.map((m, i) => {
            const Icon = ICONS[i % ICONS.length];
            const last = i === items.length - 1;
            return (
              <motion.li
                key={`${m.year}-${i}`}
                initial={false}
                animate={{ opacity: show ? 1 : 0, y: show ? 0 : 24 }}
                transition={{
                  duration: reduce ? 0 : 0.8,
                  delay: reduce ? 0 : 0.25 + Math.min(i, MAX_STATIC) * 0.22,
                  ease: EASE,
                }}
                className={cn(
                  "group/ms",
                  slider
                    ? "w-[78vw] shrink-0 snap-start pr-8 sm:w-1/2 lg:w-1/4 lg:pr-10"
                    : "lg:pr-10",
                )}
              >
                {/* Năm (bản 5, 2026-11-06, người dùng chọn style A): gold đặc, không viền,
                    bóng đổ mềm phía dưới để chữ tách khỏi nền xanh. */}
                <p className="text-gold h-(--year-h) text-[length:var(--year-h)] leading-none font-bold tracking-[-0.02em] tabular-nums [text-shadow:0_8px_24px_rgb(0_0_0/0.28)]">
                  {m.year}
                </p>

                {/* Icon mốc + đoạn kẻ nối sang mốc kế tiếp. Vòng icon KHÔNG nền (trong suốt) nên
                    đường kẻ chia đoạn: mỗi đoạn bắt đầu sau mép phải vòng tròn và dừng trước vòng
                    tròn kế tiếp (lg: li có pr-10, đoạn kéo tới hết li). Đoạn cuối mờ dần ra phải.
                    Nét gold trên mỗi đoạn tự vẽ lần lượt khi cuộn tới. */}
                <div className="relative my-8 h-12">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1/2 right-2 left-14 h-px -translate-y-1/2",
                      last
                        ? "bg-gradient-to-r from-white/20 to-transparent"
                        : "bg-white/20",
                    )}
                  />
                  <motion.span
                    aria-hidden="true"
                    initial={false}
                    animate={{ scaleX: show ? 1 : 0 }}
                    transition={{
                      duration: reduce ? 0 : 0.7,
                      delay: reduce ? 0 : 0.45 + Math.min(i, MAX_STATIC) * 0.22,
                      ease: EASE,
                    }}
                    className={cn(
                      "absolute top-1/2 right-2 left-14 h-px origin-left -translate-y-1/2",
                      last
                        ? "from-gold bg-gradient-to-r to-transparent"
                        : "from-gold bg-gradient-to-r to-white/40",
                    )}
                  />
                  {/* Mặc định: không nền, viền gold, icon trắng (đen đã thử, không hợp). Hover: nền gold, icon trắng. */}
                  <span
                    aria-hidden="true"
                    className="border-gold group-hover/ms:bg-gold ease-out-soft absolute top-0 left-0 flex size-12 items-center justify-center rounded-full border-[1.5px] text-white transition-[background-color,color,box-shadow] duration-(--duration-base) group-hover/ms:text-white group-hover/ms:shadow-[0_0_0_8px_color-mix(in_oklab,var(--color-gold)_20%,transparent)]"
                  >
                    <Icon strokeWidth={2.25} className="size-5" />
                  </span>
                </div>

                <h3 className="text-lg font-semibold tracking-[.04em] text-white uppercase">
                  {m.title}
                </h3>
                <p className="mt-3 max-w-[32ch] leading-relaxed text-white/85">
                  {m.desc}
                </p>
              </motion.li>
            );
          })}
        </ol>
      </Container>

      {/* Chỉ khi quá MAX_STATIC mốc: 2 nút tròn giữa màn hình, đường kẻ tĩnh ra mép phải */}
      {slider && (
        <div className="mt-14 flex items-center gap-5">
          <span aria-hidden="true" className="flex-1" />
          <CircleNavButton
            direction="prev"
            aria-label={t("prev")}
            disabled={edge.start}
            onClick={() => scrollByItem(-1)}
          />
          <CircleNavButton
            direction="next"
            aria-label={t("next")}
            disabled={edge.end}
            onClick={() => scrollByItem(1)}
          />
          <span aria-hidden="true" className="ml-3 h-px flex-1 bg-white/35" />
        </div>
      )}
    </Section>
  );
}
