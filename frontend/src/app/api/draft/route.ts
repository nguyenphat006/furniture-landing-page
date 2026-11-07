import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import {
  PREVIEW_COOKIE,
  safePreviewPath,
  validPreviewLink,
} from "@/lib/cms/preview";
import { routing } from "@/i18n/routing";

/*
 * Vào chế độ xem trước từ nút Xem trước của CMS (lib/cms/preview.ts). GET vì CMS mở link này trong
 * khung xem trước / tab mới. Link ký HMAC, hết hạn sau 5 phút; sai chữ ký trả 401.
 */

/** Cùng cách Next đặt cookie draft mode: dev "lax", còn lại "none" + secure (nhúng trong admin) */
const isDev = process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token") ?? "";
  const path = params.get("path") ?? "";
  const ts = params.get("ts") ?? "";
  const sig = params.get("sig") ?? "";
  if (
    !token ||
    !safePreviewPath(path) ||
    !validPreviewLink(token, path, ts, sig)
  ) {
    return new Response("Link xem trước không hợp lệ hoặc đã hết hạn.", {
      status: 401,
    });
  }

  (await draftMode()).enable();
  (await cookies()).set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: isDev ? "lax" : "none",
    secure: !isDev,
    maxAge: 30 * 60,
  });
  // Ghi ngôn ngữ của path vào cookie của next-intl, để trình duyệt khác ngôn ngữ (hay cookie cũ)
  // không bị chuyển sang /en (hoặc ngược lại) rồi lệch khỏi bản nháp đang xem
  const first = path.split("/")[1] ?? "";
  const locale = (routing.locales as readonly string[]).includes(first)
    ? first
    : routing.defaultLocale;
  (await cookies()).set("NEXT_LOCALE", locale, {
    path: "/",
    sameSite: isDev ? "lax" : "none",
    secure: !isDev,
  });
  redirect(path);
}
