"use client";

import { useEffect, useRef } from "react";

/*
 * Widget captcha Cloudflare Turnstile (2026-11-05), render tường minh để reset được sau mỗi lần gửi
 * (token chỉ dùng một lần). Widget tự chèn input ẩn "cf-turnstile-response" vào form.
 * Không có NEXT_PUBLIC_TURNSTILE_SITE_KEY thì component không hiện gì (server cũng bỏ qua khi dev).
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function Turnstile({
  language,
  resetKey,
}: {
  language: string;
  /** Đổi giá trị (vd object state sau mỗi lần gửi) để lấy token mới */
  resetKey: unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: turnstileSiteKey,
          language,
          theme: "light",
        });
      })
      .catch(() => {
        /* Mạng chặn Cloudflare: server sẽ báo lỗi captcha khi gửi */
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
      widgetId.current = null;
    };
  }, [language]);

  useEffect(() => {
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!turnstileSiteKey) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
