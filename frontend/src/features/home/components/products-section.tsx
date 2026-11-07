import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  CardAction,
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { catalogHref, type CategoryEntry } from "@/data/catalog";

/*
 * Section Sản phẩm (2026-11-04): mỗi ô là một nhóm sản phẩm, chỉ hiện tên nhóm và "Xem thêm".
 * Layout bento 3 cột trên desktop: ô đầu 2×2, hai ô xếp bên phải, hàng dưới 3 ô đều.
 * Tham khảo: lưới danh mục của nghiason.com.vn (docs/design-research/tong-hop.html, layout L7).
 */
export function ProductsSection({
  categories,
}: {
  /** Nhóm theo thứ tự CMS (ô đầu là ô lớn), kèm ảnh bìa */
  categories: CategoryEntry[];
}) {
  const t = useTranslations("HomePage.products");

  return (
    <Section id="products">
      <Container>
        {/* Không dùng lede: các ô bento đã tự nói nội dung */}
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          action={<ButtonLink href="/products">{t("viewAll")}</ButtonLink>}
        />

        <ul className="grid gap-3 sm:grid-cols-2 lg:h-[clamp(720px,60vw,960px)] lg:grid-cols-3 lg:grid-rows-3">
          {categories.map((category, i) => (
            <BentoTile
              key={category.slug}
              category={category}
              featured={i === 0}
              last={i === categories.length - 1}
            />
          ))}
        </ul>
      </Container>
    </Section>
  );
}

function BentoTile({
  category,
  featured,
  last,
}: {
  category: CategoryEntry;
  featured: boolean;
  last: boolean;
}) {
  const t = useTranslations("HomePage.products");
  const tc = useTranslations("Common.products");

  return (
    <li
      className={cn(
        "min-w-0",
        featured && "sm:col-span-2 lg:row-span-2",
        // sm: 5 ô còn lại chia 2 cột thì ô cuối bị lẻ, cho nó trải 2 cột
        last && "sm:col-span-2 lg:col-span-1",
      )}
    >
      <Link
        href={catalogHref.category(category.slug)}
        className={cn(
          "group relative block h-full overflow-hidden bg-[#f2f2f2] text-white hover:no-underline",
          "focus-visible:outline-forest focus-visible:outline-2 focus-visible:outline-offset-2",
          featured ? "aspect-[4/5] sm:aspect-[16/10]" : "aspect-[4/3]",
          "lg:aspect-auto",
        )}
      >
        <div className="ease-out-soft absolute inset-0 transition-transform duration-(--duration-slow) group-hover:scale-[1.04]">
          <ImagePlaceholder
            label={category.cover}
            sizes={
              featured
                ? "(max-width: 1024px) 100vw, 66vw"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
          />
        </div>

        {/* Gradient từ đáy để chữ trắng đọc được; đậm thêm khi hover */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent opacity-85 transition-opacity duration-(--duration-slow) group-hover:opacity-100"
        />

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-end justify-between gap-4",
            featured ? "p-6 lg:p-8" : "p-5",
          )}
        >
          <div className="grid min-w-0 gap-1.5">
            <h3
              className={cn(
                "leading-[1.2] font-semibold tracking-[-0.01em] text-balance",
                featured
                  ? "text-[clamp(1.5rem,2.4vw,2.25rem)]"
                  : "text-[clamp(1.125rem,1.4vw,1.375rem)]",
              )}
            >
              {tc(category.slug)}
            </h3>
            {/* Ô nhỏ giới hạn 2 dòng để không đè lên ảnh quá nhiều */}
            <p
              className={cn(
                "leading-[1.55] text-white/80",
                featured
                  ? "max-w-[44ch] text-[15px]"
                  : "line-clamp-2 max-w-[36ch] text-[13px]",
              )}
            >
              {t(`items.${category.slug}`)}
            </p>
          </div>

          <CardAction label={t("viewMore")} />
        </div>
      </Link>
    </li>
  );
}
