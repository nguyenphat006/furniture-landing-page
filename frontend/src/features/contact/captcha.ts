/*
 * Xác minh captcha Cloudflare Turnstile ở server (2026-11-05). Chỉ import từ actions.ts.
 * Biến môi trường:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  khoá công khai, hiển thị widget ở form
 *   TURNSTILE_SECRET_KEY            khoá bí mật, chỉ ở server
 * Chưa cấu hình: dev bỏ qua (để thử form), production từ chối (không mở cửa cho bot).
 * Khoá thử của Cloudflare (luôn qua): site 1x00000000000000000000AA,
 * secret 1x0000000000000000000000000000000AA.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaResult = "ok" | "failed" | "misconfigured";

export async function verifyCaptcha(
  token: FormDataEntryValue | null,
  ip: string,
): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV === "production" ? "misconfigured" : "ok";
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return "failed";
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? "ok" : "failed";
  } catch {
    return "failed";
  }
}
