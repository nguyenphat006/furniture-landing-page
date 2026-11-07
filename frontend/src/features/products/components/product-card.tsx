import { useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { ArrowRight } from "lucide-react";
import { catalogHref, categoryOf, type Product } from "@/data/catalog";
import { Link } from "@/i18n/navigation";

/*
 * Thẻ sản phẩm (2026-11-06) dùng ở trang nhóm và mục "Cùng nhóm" của trang chi tiết.
 * Ảnh vuông 1:1 nền stone (2026-11-06: 4:5 cao quá ở lưới 6 cột) (zoom nhẹ khi hover) → loại (chữ nhỏ in hoa, xám) → tên mẫu chữ thường (2026-11-06: bỏ in hoa theo yêu cầu)
 * (2026-11-06: bỏ dòng chất liệu trên thẻ theo yêu cầu; kiểu xem Danh sách vẫn hiện) → "Xem thêm" + mũi tên ở đáy thẻ.
 * Cả thẻ là một link tới /products/<nhóm>/<slug>. Tên "NULL" là placeholder có chủ đích (mock).
 * Dùng được ở cả server lẫn client component (chỉ dùng useTranslations).
 * ProductRow: bản dạng danh sách (kiểu xem List ở trang Sản phẩm): ảnh 4:3 trái, thông tin phải.
 */
export function ProductCard({
  product,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
}: {
  product: Product;
  sizes?: string;
}) {
  const tc = useTranslations("Common");
  const t = useTranslations("ProductsPage");

  return (
    <Link
      href={catalogHref.product(product)}
      className="group/card focus-visible:outline-forest flex h-full flex-col hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <div className="bg-surface-stone relative aspect-square overflow-hidden">
        <ImagePlaceholder
          label={product.images[0]}
          sizes={sizes}
          className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/card:scale-[1.04]"
        />
      </div>
      <p className="text-ink-mute mt-4 text-xs font-semibold tracking-[.14em] uppercase">
        {tc(`productTypes.${product.type}`)}
      </p>
      <h3 className="text-ink group-hover/card:text-forest mt-1.5 text-lg leading-snug font-medium transition-colors duration-(--duration-base)">
        {product.name}
      </h3>
      {/* Nút gọn chữ + mũi tên (cả thẻ là link), đẩy xuống đáy để các thẻ cùng hàng thẳng nhau */}
      <span className="text-ink group-hover/card:text-forest mt-auto inline-flex items-center gap-2 pt-4 text-xs font-semibold tracking-[.14em] uppercase transition-colors duration-(--duration-base)">
        {t("viewMore")}
        <ArrowRight
          aria-hidden="true"
          strokeWidth={2.5}
          className="ease-out-soft size-3.5 transition-transform duration-(--duration-base) group-hover/card:translate-x-1"
        />
      </span>
    </Link>
  );
}

export function ProductRow({ product }: { product: Product }) {
  const tc = useTranslations("Common");
  const t = useTranslations("ProductsPage");
  const info: [string, string][] = [
    [t("detail.category"), tc(`products.${categoryOf(product.type)}`)],
    [
      t("detail.materials"),
      product.materials.map((m) => tc(`materials.${m}`)).join(" · ") ||
        t("detail.none"),
    ],
    [
      t("detail.features"),
      product.features.map((f) => tc(`features.${f}`)).join(" · ") ||
        t("detail.none"),
    ],
  ];

  return (
    <Link
      href={catalogHref.product(product)}
      className="group/row focus-visible:outline-forest grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-5 py-6 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8 lg:grid-cols-[15rem_minmax(0,1fr)_auto]"
    >
      <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
        <ImagePlaceholder
          label={product.images[0]}
          sizes="(min-width: 1024px) 240px, (min-width: 640px) 208px, 120px"
          className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/row:scale-[1.04]"
        />
      </div>
      <div className="min-w-0">
        <p className="text-ink-mute text-xs font-semibold tracking-[.14em] uppercase">
          {tc(`productTypes.${product.type}`)}
        </p>
        <h3 className="text-ink group-hover/row:text-forest mt-1.5 text-lg leading-snug font-medium transition-colors duration-(--duration-base) sm:text-xl">
          {product.name}
        </h3>
        <dl className="mt-3 hidden gap-x-8 gap-y-1 text-sm sm:flex sm:flex-wrap">
          {info.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-ink-mute">{k}:</dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <span className="text-ink group-hover/row:text-forest hidden items-center gap-2 text-[13px] font-semibold tracking-[.14em] whitespace-nowrap uppercase transition-colors duration-(--duration-base) lg:inline-flex">
        {t("browser.viewDetail")}
        <ArrowRight
          aria-hidden="true"
          strokeWidth={2.5}
          className="ease-out-soft size-4 transition-transform duration-(--duration-base) group-hover/row:translate-x-1"
        />
      </span>
    </Link>
  );
}
