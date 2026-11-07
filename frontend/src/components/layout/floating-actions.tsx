import type { ReactNode } from "react";
import {
  FileText,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  Search,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { navHref } from "@/config/navigation";
import type { FloatingAction, FloatingKind } from "@/data/site/types";
import { Link } from "@/i18n/navigation";

/*
 * Cụm nút nổi (2026-11-07): dính sát mép phải màn hình, ngay dưới header, giống nhau ở mọi trang
 * (tách riêng nút lên đầu trang ở góc dưới). Danh sách, thứ tự, chữ do CMS quản lý: Cài đặt → Thông tin
 * chung → Nút nổi; link gọi điện / WhatsApp / Zalo / email lấy từ tab Liên hệ. Rê chuột hoặc focus bàn
 * phím thì chữ hiện bên trái nút.
 * Tìm kiếm chưa có trang (plan B7) nên chưa hiện; làm xong B7 thì bỏ khỏi HIDDEN_UNTIL_READY.
 */
const HIDDEN_UNTIL_READY: FloatingKind[] = ["search"];

function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-[18px]"
      fill="currentColor"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.24 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}

function ZaloIcon() {
  return (
    <span
      aria-hidden
      className="text-[10px] leading-none font-bold tracking-tight"
    >
      Zalo
    </span>
  );
}

const ICONS: Record<FloatingKind, ReactNode> = {
  search: <Search className="size-[18px]" aria-hidden />,
  phone: <Phone className="size-[18px]" aria-hidden />,
  whatsapp: <WhatsAppIcon />,
  zalo: <ZaloIcon />,
  email: <Mail className="size-[18px]" aria-hidden />,
  messenger: <MessageCircle className="size-[18px]" aria-hidden />,
  quote: <FileText className="size-[18px]" aria-hidden />,
  link: <Link2 className="size-[18px]" aria-hidden />,
};

// Vàng thương hiệu, chữ tối. Rê chuột / focus: chữ trượt ra bên trái, cùng một khối với ô icon.
const ITEM =
  "group bg-gold text-ink flex h-9 items-center rounded-l-md shadow-[0_6px_18px_rgb(20_20_20/0.16)] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset sm:h-10";
const LABEL =
  "max-w-0 overflow-hidden text-xs font-semibold whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-56 group-hover:opacity-100 group-focus-visible:max-w-56 group-focus-visible:opacity-100 motion-reduce:transition-none sm:text-[13px]";

export async function FloatingActions({ items }: { items: FloatingAction[] }) {
  const visible = items.filter((i) => !HIDDEN_UNTIL_READY.includes(i.kind));
  if (!visible.length) return null;
  const t = await getTranslations("FloatingActions");

  return (
    <nav
      aria-label={t("label")}
      className="fixed top-[calc(72px+4.5rem)] right-0 z-50 flex flex-col items-end gap-px xl:top-[calc(80px+4.5rem)]"
    >
      {visible.map((item, i) => {
        const label = item.label || t(item.kind);
        const content = (
          <>
            <span className={LABEL}>
              <span className="block pl-3.5">{label}</span>
            </span>
            <span className="flex size-9 shrink-0 items-center justify-center sm:size-10">
              {ICONS[item.kind]}
            </span>
          </>
        );
        const href =
          item.kind === "quote"
            ? `${navHref.contact}?purpose=quote#contact-form`
            : item.href;
        if (href.startsWith("/")) {
          return (
            <Link key={i} href={href} aria-label={label} className={ITEM}>
              {content}
            </Link>
          );
        }
        const external = href.startsWith("http");
        return (
          <a
            key={i}
            href={href}
            aria-label={label}
            className={ITEM}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {content}
          </a>
        );
      })}
    </nav>
  );
}
