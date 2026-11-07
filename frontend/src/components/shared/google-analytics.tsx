import { draftMode } from "next/headers";
import Script from "next/script";

/*
 * Google Analytics 4 (2026-11-07). Mã đo lường sửa ở CMS: Cài đặt → Thông tin chung → SEO. Gắn ở layout gốc
 * nên đo mọi trang, cả hai ngôn ngữ; chuyển trang trong site được GA4 tự ghi nhận (Enhanced measurement,
 * "Page changes based on browser history events"). Không gắn khi xem trước bản nháp để không tính lượt
 * của người sửa nội dung. Chỉ nhận mã đúng dạng G-XXXX vì mã được chèn vào script.
 */
const GA_ID = /^G-[A-Z0-9]{4,16}$/;

export async function GoogleAnalytics({ id }: { id: string | null }) {
  if (!id || !GA_ID.test(id)) return null;
  if ((await draftMode()).isEnabled) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}
