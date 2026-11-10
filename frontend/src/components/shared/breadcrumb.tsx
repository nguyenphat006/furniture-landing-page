import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * Breadcrumb chung (2026-11-06, tách từ PageHeader để trang chi tiết sản phẩm dùng y hệt):
 * Trang chủ / <các cấp cha> / <trang hiện tại>. Chữ nhỏ in hoa, cấp cha xám, dấu "/" đen,
 * trang hiện tại đen đậm vừa (semibold).
 * (2026-11-09) Luôn một dòng: trang hiện tại dài (tên bài tin tức, tên sản phẩm) bị cắt "..." theo
 * chỗ còn lại (tối đa ~48 ký tự ở màn lớn), tên đầy đủ hiện khi rê chuột (title); cấp cha không cắt.
 */
export function Breadcrumb({
  current,
  parents = [],
  className,
}: {
  current: string;
  parents?: { label: string; href: string }[];
  className?: string;
}) {
  const t = useTranslations("Common");

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "text-ink-mute mb-6 flex min-w-0 items-baseline text-xs tracking-[.16em] whitespace-nowrap uppercase xl:mb-8",
        className,
      )}
    >
      <Link href="/" className="hover:text-ink shrink-0 transition-colors">
        {t("breadcrumbHome")}
      </Link>
      <span className="text-ink mx-2" aria-hidden="true">
        /
      </span>
      {parents.map((p) => (
        <span key={p.href} className="shrink-0">
          <Link href={p.href} className="hover:text-ink transition-colors">
            {p.label}
          </Link>
          <span className="text-ink mx-2" aria-hidden="true">
            /
          </span>
        </span>
      ))}
      <span
        className="text-ink max-w-[48ch] min-w-0 truncate font-semibold"
        aria-current="page"
        title={current}
      >
        {current}
      </span>
    </nav>
  );
}
