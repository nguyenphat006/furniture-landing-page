import { notFound } from "next/navigation";

/*
 * Bắt mọi URL không khớp route nào trong [locale] để hiện trang 404 có header/footer
 * ([locale]/not-found.tsx), thay vì trang 404 mặc định của Next (cách next-intl khuyến nghị).
 */
export default function CatchAllPage() {
  notFound();
}
