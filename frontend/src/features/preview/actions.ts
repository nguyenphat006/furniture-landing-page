"use server";

import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { PREVIEW_COOKIE, safePreviewPath } from "@/lib/cms/preview";

/** Thoát xem trước: tắt draft mode, xoá token, ở lại trang đang xem (bản đã xuất bản) */
export async function exitPreview(formData: FormData) {
  (await draftMode()).disable();
  (await cookies()).delete(PREVIEW_COOKIE);
  const path = String(formData.get("path") ?? "/");
  redirect(safePreviewPath(path) ? path : "/");
}
