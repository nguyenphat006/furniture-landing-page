import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  // "as-needed": locale mặc định (vi) không có prefix trên URL — "/" là tiếng Việt, "/en" là tiếng Anh
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
