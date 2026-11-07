import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * Khai báo token tự định nghĩa trong globals.css (@theme) cho tailwind-merge.
 * Không khai báo thì "text-section" bị hiểu là màu chữ và bị xoá khi gặp "text-white".
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "h1", "section", "h2", "h3", "lede", "eyebrow"],
      spacing: ["gutter", "section", "band"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
