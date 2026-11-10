"use client";

import { useEffect } from "react";
import { REVEAL_SCRIPT } from "./reveal";

/*
 * Script hiện dần (reveal.tsx), đặt đầu <body>, trước nội dung.
 * React 19 báo lỗi console khi chính nó TẠO thẻ <script> phía trình duyệt (script tạo kiểu đó không bao
 * giờ chạy), chuyện này xảy ra khi layout được dựng lại phía client (vd đổi ngôn ngữ). Lần tải đầu
 * thẻ có sẵn trong HTML từ server và React chỉ hydrate nên không sao. Vì vậy: lần render đầu (server +
 * hydrate) trả thẻ <script> để khớp HTML; sau khi hydrate xong, script đã chạy rồi, các lần mount sau
 * trả null. Không dùng next/script beforeInteractive: Next dời script tới lúc JS tải xong, nội dung
 * sẽ hiện rồi mới bị ẩn (nháy).
 * Trang lỗi khi render phía server (vd trang bài lỗi, CMS không trả lời): HTML không có thẻ script nên
 * script chưa từng chạy; effect chạy nó (script tự quét phần tử đã có), nếu không class "js" làm mọi
 * phần tử hiện dần bị ẩn mãi (lỗi chữ trắng trang lỗi 09/11).
 */

let hydrated = false;

export function RevealScript() {
  useEffect(() => {
    hydrated = true;
    if (!(window as { __bfcReveal?: number }).__bfcReveal) {
      new Function(REVEAL_SCRIPT)();
      return;
    }
    // Layout dựng lại phía client (đổi ngôn ngữ) đặt lại className của <html>, mất class "js" /
    // "reveal-off" script đã gắn: gắn lại cho khớp, nếu không phần tử dưới màn hình hiện sẵn rồi nháy
    // mờ khi cuộn tới. Observer của script vẫn chạy nên không cần chạy lại script.
    const html = document.documentElement;
    if (html.classList.contains("js")) return;
    html.classList.add("js");
    if (
      !("IntersectionObserver" in window) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      html.classList.add("reveal-off");
  }, []);
  if (hydrated) return null;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }}
      suppressHydrationWarning
    />
  );
}
