import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";

type PageHeroProps = {
  /** Tên trang hiện tại hiển thị trong breadcrumb */
  current: string;
  title: string;
  kicker?: string;
  /** Đường dẫn ảnh nền thật trong public/ */
  image?: string;
  /** Ghi chú ảnh placeholder (chỉ hiện khi chưa có ảnh thật) */
  imageNote?: string;
};

/** Hero chung cho các trang con: ảnh nền + breadcrumb + tiêu đề */
export function PageHero({
  current,
  title,
  kicker,
  image,
  imageNote,
}: PageHeroProps) {
  const t = useTranslations("Common");

  return (
    <section
      data-hero
      className="relative flex min-h-[48vh] items-end overflow-hidden"
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      ) : (
        <ImagePlaceholder
          tone={{ base: "#6f6f6f", stripeA: "#6a6a6a", stripeB: "#757575" }}
        />
      )}
      {!image && imageNote ? (
        <div aria-hidden="true" className="absolute top-5 right-7">
          <span className="font-mono text-[11px] tracking-[.1em] text-white/75 uppercase">
            {imageNote}
          </span>
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,20,20,.25),rgba(20,20,20,.6))]"
      />
      <div className="relative mx-auto w-full max-w-[1100px] px-7 pt-24 pb-14">
        <nav
          aria-label="Breadcrumb"
          className="mb-4 text-xs tracking-[.16em] uppercase"
        >
          <Link href="/" className="text-white/70 hover:text-white">
            {t("breadcrumbHome")}
          </Link>
          <span className="text-white/40" aria-hidden="true">
            {" / "}
          </span>
          <span className="text-white">{current}</span>
        </nav>
        {kicker ? (
          <p className="mb-3 text-xs font-medium tracking-[.16em] text-white/92 uppercase">
            {kicker}
          </p>
        ) : null}
        <h1 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-white">
          {title}
        </h1>
      </div>
    </section>
  );
}
