import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Geist_Mono, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { SiteProvider } from "@/components/providers/site-provider";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { getSite } from "@/data/site";
import { siteUrl } from "@/lib/seo";
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
  const { seo, name, favicon, ogImage } = await getSite(locale);

  return {
    metadataBase: siteUrl(),
    title: seo.title || t("title"),
    description: seo.description || t("description"),
    ...(favicon ? { icons: { icon: favicon } } : {}),
    openGraph: {
      siteName: name,
      ...(ogImage
        ? { images: [{ url: ogImage, width: 1200, height: 630 }] }
        : {}),
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
            <ScrollToTop />
          </SiteProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
