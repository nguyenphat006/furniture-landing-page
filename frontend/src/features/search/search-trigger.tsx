"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { OPEN_SEARCH_EVENT } from "./types";

/*
 * Nút mở ô tìm nhanh (icon trên header, nút nổi Tìm kiếm). Là link tới /search để vẫn dùng được khi
 * chưa có JS; có JS thì mở modal tại chỗ (SearchDialog) thay vì chuyển trang.
 */
export function SearchTrigger({
  className,
  label,
  children,
}: {
  className?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/search"
      aria-label={label}
      aria-haspopup="dialog"
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
      }}
    >
      {children}
    </Link>
  );
}
