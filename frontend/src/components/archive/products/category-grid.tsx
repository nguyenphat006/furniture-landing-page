import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import {
  catalogHref,
  categorySlugs as categories,
  categoryCover,
  typesInCategory,
  type CategorySlug,
} from "@/data/catalog";
import { mockProducts } from "@/data/catalog/products.mock";
import { Link } from "@/i18n/navigation";

// Component đang ẩn (archive): đếm theo mock, không gọi CMS
const mockCount = (c: CategorySlug) =>
  mockProducts.filter((p) => p.category === c).length;

/*
 * Trang tổng /products (2026-11-06): lưới 6 nhóm sản phẩm, 3 cột từ lg, 2 cột từ sm.
 * Mỗi thẻ: ảnh bìa nhóm 4:3 (zoom khi hover) → tên nhóm in hoa → mô tả ngắn (dùng chung
 * HomePage.products.items) → các loại trong nhóm + số mẫu → "Xem thêm" dạng chữ + mũi tên.
 * Cả thẻ là link tới /products/<nhóm>. Số mẫu đếm từ catalog mock.
 */
export function CategoryGrid() {
  const t = useTranslations("ProductsPage");
  const th = useTranslations("HomePage.products.items");
  const tc = useTranslations("Common");

  return (
    <Section id="categories" className="pt-0 lg:pt-0">
      <Container>
        <SectionHeading
          eyebrow={t("categories.eyebrow")}
          title={t("categories.title")}
        />
        <ul className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8">
          {categories.map((c) => (
            <li key={c}>
              <Link
                href={catalogHref.category(c)}
                className="group/cat focus-visible:outline-forest block hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
                  <ImagePlaceholder
                    label={categoryCover(c)}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/cat:scale-[1.04]"
                  />
                </div>
                <h2 className="text-ink mt-6 text-xl leading-tight font-medium tracking-[.06em] uppercase xl:text-2xl">
                  {tc(`products.${c}`)}
                </h2>
                <p className="text-ink-soft mt-3 leading-relaxed">{th(c)}</p>
                <p className="text-ink-mute mt-3 text-sm">
                  {typesInCategory(c)
                    .map((type) => tc(`productTypes.${type}`))
                    .join(" · ")}
                </p>
                <span className="mt-5 flex items-center justify-between gap-4">
                  <span className="text-ink-mute text-xs font-semibold tracking-[.14em] uppercase">
                    {t("modelCount", { count: mockCount(c) })}
                  </span>
                  <span className="text-ink group-hover/cat:text-forest inline-flex items-center gap-2 text-[13px] font-semibold tracking-[.14em] uppercase transition-colors duration-(--duration-base)">
                    {t("viewMore")}
                    <ArrowRight
                      aria-hidden="true"
                      strokeWidth={2.5}
                      className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-hover/cat:translate-x-1"
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
