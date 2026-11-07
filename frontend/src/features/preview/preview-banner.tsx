import { draftMode } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ExitPreviewForm } from "./exit-preview-form";

/*
 * Dải báo đang xem bản nháp (2026-11-07), chỉ hiện khi draft mode bật (vào từ nút Xem trước của CMS).
 * Cố định đáy màn hình, không đổi bố cục trang.
 */
export async function PreviewBanner() {
  if (!(await draftMode()).isEnabled) return null;
  const t = await getTranslations("Preview");
  return (
    <aside
      role="status"
      className="bg-ink fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs text-white shadow-[0_-4px_20px_rgb(0_0_0/0.25)] sm:text-sm"
    >
      <span>
        <b className="text-gold font-semibold">{t("label")}</b> {t("note")}
      </span>
      <ExitPreviewForm label={t("exit")} />
    </aside>
  );
}
