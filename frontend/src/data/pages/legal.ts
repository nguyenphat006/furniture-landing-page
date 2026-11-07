import "server-only";
import { cache } from "react";
import type { LegalKey } from "@/config/navigation";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchLegalPage } from "@/lib/cms/pages";
import type { LegalPage } from "./types";

/*
 * Trang pháp lý (CHỈ phía server), nguồn duy nhất là CMS (Trang → Trang chủ → Chính sách bảo mật /
 * Điều khoản sử dụng; nội dung ban đầu từ backend/apps/pages/fixtures/legal.json qua import_pages).
 * Tắt CMS hoặc CMS chưa có trang: null → trang 404.
 */
export const getLegalPage = cache(
  async (key: LegalKey, locale: string): Promise<LegalPage | null> =>
    cmsEnabled() ? fetchLegalPage(key, locale) : null,
);
