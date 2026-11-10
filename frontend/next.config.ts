import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Ảnh sản phẩm từ CMS (backend/, /media/...): cho next/image tối ưu đúng nguồn CMS đã khai báo
const cmsApi = process.env.CMS_API_URL
  ? new URL(process.env.CMS_API_URL)
  : null;
const cmsIsLocal =
  cmsApi !== null && ["127.0.0.1", "localhost"].includes(cmsApi.hostname);

/*
 * Khung Xem trước trong admin CMS nhúng trang web (iframe): cho phép nguồn CMS qua CSP
 * frame-ancestors (thay X-Frame-Options, vốn chỉ cho cùng nguồn). Nguồn admin lấy từ
 * CMS_ADMIN_ORIGIN (có thể nhiều, ngăn bởi dấu phẩy), mặc định là gốc của CMS_API_URL;
 * khi dev thêm cả bản localhost / 127.0.0.1 của nguồn đó.
 */
function frameAncestors(): string {
  const origins = new Set<string>(["'self'"]);
  const configured = (process.env.CMS_ADMIN_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of configured) origins.add(origin);
  if (cmsApi) {
    origins.add(cmsApi.origin);
    if (cmsIsLocal) {
      for (const host of ["localhost", "127.0.0.1"])
        origins.add(`${cmsApi.protocol}//${host}:${cmsApi.port}`);
    }
  }
  return [...origins].join(" ");
}

const nextConfig: NextConfig = {
  // Build gọn để đóng image Docker (frontend/Dockerfile, deploy/): chỉ chép .next/standalone
  output: "standalone",
  // Không quảng cáo framework qua header X-Powered-By (QC 07/11)
  poweredByHeader: false,
  // sharp (nén ảnh /_next/image) nạp thư viện libvips nằm cạnh file .node; trace chỉ chép file .node
  // nên bản standalone không nạp được sharp và trả nguyên ảnh gốc (QC 09/11: PNG 477 KB thay vì
  // WebP 31 KB). Chép cả thư mục @img (Linux trong Docker là sharp-linux-x64 + sharp-libvips-linux-x64)
  outputFileTracingIncludes: { "/*": ["./node_modules/@img/**/*"] },
  images: {
    // Chất lượng nén được phép: 75 mặc định, 60 cho ảnh hero, 50 cho ảnh nền mờ (QC 07/11)
    qualities: [50, 60, 75],
    // CMS ở máy local: cho cả localhost và 127.0.0.1, vì bản xem trước dựng URL ảnh theo host
    // mà admin đang mở, có thể khác host trong CMS_API_URL
    remotePatterns: cmsApi
      ? (cmsIsLocal ? ["localhost", "127.0.0.1"] : [cmsApi.hostname]).map(
          (hostname) => ({
            protocol: cmsApi.protocol.replace(":", "") as "http" | "https",
            hostname,
            port: cmsApi.port,
            pathname: "/media/**",
          }),
        )
      : [],
    // Next 16 chặn tối ưu ảnh từ IP nội bộ; chỉ mở khi CMS ở chính máy này (dev, hoặc build production
    // trên máy dev để QC). Server thật build với domain CMS công khai nên luôn tắt.
    dangerouslyAllowLocalIP: cmsIsLocal,
  },
  experimental: {
    serverActions: {
      // Form Liên hệ cho đính kèm bản vẽ tối đa 10 MB (+ phần dư multipart)
      bodySizeLimit: "11mb",
    },
    // proxy.ts chạy trên /contact nên Next đệm body trước, mặc định chỉ 10 MB: tệp sát 10 MB làm
    // form hỏng không báo (QC 07/11). Để bằng giới hạn server action.
    proxyClientMaxBodySize: "11mb",
  },
  // Header bảo mật cơ bản cho toàn site (2026-11-05)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors()}`,
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
