import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * Breadcrumb chung (2026-11-06, tách từ PageHeader để trang chi tiết sản phẩm dùng y hệt):
 * Trang chủ / <các cấp cha> / <trang hiện tại>. Chữ nhỏ in hoa, cấp cha xám, dấu "/" đen,
 * trang hiện tại đen đậm vừa (semibold).
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
        "text-ink-mute mb-6 text-xs tracking-[.16em] uppercase xl:mb-8",
        className,
      )}
    >
      <Link href="/" className="hover:text-ink transition-colors">
        {t("breadcrumbHome")}
      </Link>
      <span className="text-ink mx-2" aria-hidden="true">
        /
      </span>
      {parents.map((p) => (
        <span key={p.href}>
          <Link href={p.href} className="hover:text-ink transition-colors">
            {p.label}
          </Link>
          <span className="text-ink mx-2" aria-hidden="true">
            /
          </span>
        </span>
      ))}
      <span className="text-ink font-semibold" aria-current="page">
        {current}
      </span>
    </nav>
  );
}
