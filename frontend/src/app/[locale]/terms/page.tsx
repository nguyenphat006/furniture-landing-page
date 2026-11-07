import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/features/legal/legal-page";

/* Điều khoản sử dụng /terms (2026-11-07): nội dung trong CMS, xem features/legal/legal-page.tsx */

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata("terms", locale);
}

export default async function TermsPage({
  params,
}: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  return <LegalPage pageKey="terms" locale={locale} />;
}
