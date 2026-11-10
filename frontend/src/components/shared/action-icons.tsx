import { BRAND_ICONS, LINE_ICONS } from "@/config/action-icons";
import { cn } from "@/lib/utils";

/** Icon chọn trong CMS (danh sách ở config/action-icons.ts); tên lạ (icon đã bỏ khỏi danh sách) thì không hiện gì */
export function ActionIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Line = LINE_ICONS[name];
  if (Line) {
    return <Line aria-hidden="true" className={cn("size-[18px]", className)} />;
  }
  const brand = BRAND_ICONS[name];
  if (!brand) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={cn("size-[18px]", className)}
    >
      <path d={brand.path} />
    </svg>
  );
}
