"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Site } from "@/data/site/types";

/*
 * Thông tin chung cho mọi component (header, footer, logo, trang Liên hệ). Layout đọc một lần
 * (getSite) rồi bọc trang trong SiteProvider; component gọi useSite().
 */

const SiteContext = createContext<Site | null>(null);

export function SiteProvider({
  site,
  children,
}: {
  site: Site;
  children: ReactNode;
}) {
  return <SiteContext value={site}>{children}</SiteContext>;
}

export function useSite(): Site {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useSite() phải nằm trong <SiteProvider>");
  return site;
}

/** Thứ tự phân loại theo CMS (client component; server component dùng getTaxonomy) */
export function useTaxonomy() {
  return useSite().taxonomy;
}
