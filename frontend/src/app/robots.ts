import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/** robots.txt: cho phép mọi trang, trừ route nội bộ; trỏ tới sitemap */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dev", "/en/dev"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
