"use client";

import { useLocale, useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { useSite } from "@/components/providers/site-provider";
import { FlagIcon } from "@/components/shared/flag-icon";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * Nút đổi ngôn ngữ (2026-11-10): thay dải VI / EN bằng dropdown có cờ để đủ chỗ cho 3 ngôn ngữ trở
 * lên. Danh sách, thứ tự, cờ, tên lấy từ CMS (Cài đặt → Thông tin chung → Ngôn ngữ).
 * Desktop: nút cờ + mã ngôn ngữ, bấm mở danh sách (Radix: mũi tên, Esc, focus đúng chuẩn menu).
 * Panel mobile dùng LanguageList bên dưới: liệt kê thẳng, không cần thêm một lớp mở.
 */

export function LanguageSwitcher({
  className,
  onOpen,
}: {
  className?: string;
  /** Mở danh sách: header đóng mega dropdown đang mở */
  onOpen?: () => void;
}) {
  const t = useTranslations("Common");
  const { languages } = useSite();
  const locale = useLocale();
  const pathname = usePathname();
  const current = languages.find((l) => l.code === locale) ?? languages[0];
  if (!current) return null;

  return (
    // modal={false}: không khoá cuộn trang (tránh thanh cuộn nhảy khi mở)
    <DropdownMenu.Root modal={false} onOpenChange={(o) => o && onOpen?.()}>
      <DropdownMenu.Trigger
        aria-label={`${t("languageLabel")}: ${current.label}`}
        className={cn(
          "text-ink group hover:text-forest data-[state=open]:text-forest flex min-h-11 cursor-pointer items-center gap-2 text-sm tracking-[.06em] uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-current",
          className,
        )}
      >
        <FlagIcon code={current.flag} />
        <span className="font-semibold">{current.code}</span>
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.75}
          className="ease-out-soft size-3.5 transition-transform duration-(--duration-base) group-data-[state=open]:rotate-180"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          // Trên header (z-60) và lớp mờ (z-55)
          className="border-line data-[state=open]:animate-in data-[state=open]:fade-in-0 z-[70] min-w-48 rounded-sm border bg-white py-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,.35)]"
        >
          {languages.map((l) => {
            const active = l.code === current.code;
            return (
              <DropdownMenu.Item key={l.code} asChild>
                <Link
                  href={pathname}
                  locale={l.code}
                  lang={l.code}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "text-ink-soft data-[highlighted]:bg-surface-stone data-[highlighted]:text-ink flex min-h-11 cursor-pointer items-center gap-3 px-4 text-[15px] outline-none hover:no-underline",
                    active && "text-ink font-semibold",
                  )}
                >
                  <FlagIcon code={l.flag} />
                  <span className="flex-1">{l.label}</span>
                  {active ? (
                    <Check
                      aria-hidden="true"
                      strokeWidth={2}
                      className="text-forest size-4"
                    />
                  ) : null}
                </Link>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Panel menu mobile: các ngôn ngữ xếp thẳng hàng, cờ + tên */
export function LanguageList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Common");
  const { languages } = useSite();
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="mt-6">
      <p className="text-ink-mute text-sm tracking-[.06em] uppercase">
        {t("languageLabel")}
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {languages.map((l) => {
          const active = l.code === locale;
          return (
            <li key={l.code}>
              {active ? (
                <span
                  aria-current="true"
                  lang={l.code}
                  className="text-ink flex min-h-11 items-center gap-2.5 text-[15px] font-semibold"
                >
                  <FlagIcon code={l.flag} />
                  {l.label}
                </span>
              ) : (
                <Link
                  href={pathname}
                  locale={l.code}
                  lang={l.code}
                  onClick={onNavigate}
                  className="text-ink-mute hover:text-ink flex min-h-11 items-center gap-2.5 text-[15px] hover:no-underline"
                >
                  <FlagIcon code={l.flag} />
                  {l.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
