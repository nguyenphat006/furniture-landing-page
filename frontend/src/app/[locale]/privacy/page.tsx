import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/features/legal/legal-page";

/* Chính sách bảo mật /privacy (2026-11-07): nội dung trong CMS, xem features/legal/legal-page.tsx */

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata("privacy", locale);
}

export default async function PrivacyPage({
  params,
}: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  return <LegalPage pageKey="privacy" locale={locale} />;
}
