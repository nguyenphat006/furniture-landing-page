"use client";

import { usePathname } from "next/navigation";
import { exitPreview } from "./actions";

/** Nút thoát xem trước, gửi kèm đường dẫn đang xem để ở lại đúng trang */
export function ExitPreviewForm({ label }: { label: string }) {
  const pathname = usePathname();
  return (
    <form action={exitPreview}>
      <input type="hidden" name="path" value={pathname} />
      <button
        type="submit"
        className="border-b border-white/60 font-semibold hover:border-white"
      >
        {label}
      </button>
    </form>
  );
}
