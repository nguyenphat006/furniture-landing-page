import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { cmsEnabled } from "@/lib/cms/client";
import { fetchFaqSlot } from "@/lib/cms/pages";
import type { FaqContent } from "./types";

/*
 * FAQ trang Năng lực (CHỈ phía server, 2026-11-09). Nguồn: Section dùng chung chọn ở CMS → Cài đặt →
 * Section trên trang. Tắt CMS, chưa chọn hoặc chưa xuất bản thì dùng câu hỏi mặc định trong messages.
 */

const MOCK_ITEMS = ["moq", "sample", "drawing", "inspection"] as const;

async function mockFaq(locale: string): Promise<FaqContent> {
  const t = await getTranslations({
    locale,
    namespace: "CapabilitiesPage.faq",
  });
  return {
    kicker: t("kicker"),
    title: t("title"),
    note: t("more"),
    buttonLabel: "",
    items: MOCK_ITEMS.map((k) => ({
      question: t(`items.${k}.q`),
      answer: t(`items.${k}.a`),
    })),
  };
}

export const getCapabilitiesFaq = cache(
  async (locale: string): Promise<FaqContent> =>
    (cmsEnabled() ? await fetchFaqSlot("capabilities-faq", locale) : null) ??
    mockFaq(locale),
);
