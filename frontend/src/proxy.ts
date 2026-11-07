import createProxy from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createProxy(routing);

export const config = {
  // Bỏ qua API routes, file nội bộ của Next và file tĩnh (có đuôi mở rộng)
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
