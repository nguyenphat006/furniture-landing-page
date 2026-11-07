import { useTranslations } from "next-intl";
import { ArrowLink } from "@/components/shared/arrow-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { Container, Section } from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import type { MaterialSummary } from "@/data/catalog";
import { Link } from "@/i18n/navigation";

/*
 * Lưới vật liệu (2026-11-05): dải nền màu, thẻ ngang nền trắng cao 360px, xếp 2 cột từ lg
 * (mỗi thẻ rộng ~628px ở 1440 như Gloster). Ảnh cận chất liệu rộng tối đa 360px bên trái (co lại khi thẻ hẹp),
 * khung thông tin phần còn lại bên phải: tên in hoa + nút viền "Xem thêm". Không có mô tả.
 * Mobile: ảnh 4:3 trên, chữ dưới.
 * Mỗi thẻ có id = slug để menu Vật liệu nhảy tới (/materials#wood...).
 * "Xem thêm" dẫn tới /materials/<slug> (trang chi tiết, làm ở bước sau).
 */
export function MaterialsGrid({ materials }: { materials: MaterialSummary[] }) {
  const t = useTranslations("MaterialsPage");

  return (
    <Section id="materials" tone="stone">
      <Container>
        <ul className="grid gap-6 lg:grid-cols-2">
          {materials.map(({ slug, name, image }) => {
            const href = `${navHref.materials}/${slug}`;
            return (
              <li
                key={slug}
                id={slug}
                className="group/mat grid scroll-mt-[calc(80px+1.5rem)] overflow-hidden rounded-[2px] bg-white sm:h-90 sm:grid-cols-[min(22.5rem,58%)_minmax(0,1fr)] lg:grid-cols-[min(22.5rem,50%)_minmax(0,1fr)] xl:grid-cols-[22.5rem_minmax(0,1fr)]"
              >
                <Link
                  href={href}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="bg-surface-stone relative block aspect-[4/3] overflow-hidden sm:aspect-auto"
                >
                  <ImagePlaceholder
                    label={image}
                    sizes="(min-width: 640px) 360px, 100vw"
                    className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/mat:scale-[1.04]"
                  />
                </Link>

                <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-6 xl:p-10">
                  <h2 className="text-ink text-xl leading-tight font-medium tracking-[.06em] uppercase xl:text-2xl">
                    {name}
                  </h2>
                  <ArrowLink href={href} className="mt-4 self-start">
                    {t("readMore")}
                    <span className="sr-only"> {name}</span>
                  </ArrowLink>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
