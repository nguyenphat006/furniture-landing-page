import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Geist_Mono, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { SiteProvider } from "@/components/providers/site-provider";
import { FloatingActions } from "@/components/layout/floating-actions";
import { GoogleAnalytics } from "@/components/shared/google-analytics";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PreviewBanner } from "@/features/preview/preview-banner";
import { getSite } from "@/data/site";
import { DEFAULT_OG_IMAGE, siteUrl } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "vietnamese"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  // SEO mặc định, tên site, favicon, ảnh chia sẻ: sửa ở CMS (Cài đặt → Thông tin chung)
  const { seo, name, favicon, ogImage, verification } = await getSite(locale);

  return {
    metadataBase: siteUrl(),
    title: seo.title || t("title"),
    description: seo.description || t("description"),
    ...(favicon ? { icons: { icon: favicon } } : {}),
    // Thẻ meta xác minh Search Console / Bing (Cài đặt → Thông tin chung → SEO)
    verification: {
      ...(verification.google ? { google: verification.google } : {}),
      ...(verification.bing
        ? { other: { "msvalidate.01": verification.bing } }
        : {}),
    },
    openGraph: {
      type: "website",
      siteName: name,
      locale: locale === "vi" ? "vi_VN" : "en_US",
      images: [{ url: ogImage || DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Cho phép static rendering với generateStaticParams
  setRequestLocale(locale);
  const site = await getSite(locale);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteProvider site={site}>
            {children}
            <FloatingActions items={site.floating} />
            <ScrollToTop />
            <PreviewBanner />
          </SiteProvider>
        </NextIntlClientProvider>
        <GoogleAnalytics id={site.gaMeasurementId} />
      </body>
    </html>
  );
}
