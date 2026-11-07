# BFC Landing Page — Frontend

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui + next-intl.

## Chạy dự án

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build production
npm run lint       # kiểm tra ESLint
npm run format     # format code bằng Prettier
```

## Đa ngôn ngữ (next-intl)

- Locale hỗ trợ: `vi` (mặc định, không có prefix URL) và `en` (`/en`).
- Chuỗi dịch đặt tại `messages/vi.json` và `messages/en.json`, nhóm theo namespace (vd. `HomePage`, `Common`).
- Cấu hình routing tại `src/i18n/routing.ts`; thêm locale mới chỉ cần sửa file này + thêm file messages tương ứng.
- **Luôn** import `Link`, `useRouter`, `usePathname`, `redirect` từ `@/i18n/navigation` (không dùng `next/link` / `next/navigation` trực tiếp) để URL giữ đúng locale.

## Cấu trúc thư mục

```
src/
├── app/
│   ├── [locale]/          # Mọi route nằm dưới segment locale
│   │   ├── layout.tsx     # Root layout: html/body, fonts, NextIntlClientProvider
│   │   └── page.tsx       # Trang chủ — chỉ compose các section từ features/
│   └── globals.css        # Tailwind v4 + design tokens của shadcn/ui
├── components/
│   ├── ui/                # Component shadcn/ui (thêm bằng: npx shadcn add <name>)
│   ├── layout/            # Header, footer, locale switcher — dùng chung toàn site
│   └── shared/            # Component tái sử dụng không thuộc feature nào
├── features/              # Module hóa theo tính năng/section
│   └── home/              # Ví dụ: section của trang chủ
│       ├── components/    # Component riêng của feature
│       └── index.ts       # Public API của module — nơi khác chỉ import từ đây
├── i18n/                  # routing.ts, request.ts, navigation.ts (next-intl)
├── config/                # siteConfig và các hằng số toàn cục
├── hooks/                 # Custom hooks dùng chung
├── lib/                   # Utilities (cn, helpers...)
├── types/                 # Type/interface dùng chung
└── proxy.ts               # Proxy (thay middleware ở Next 16) — xử lý locale routing
messages/                  # File dịch vi.json / en.json
```

## Quy ước module hóa

- Mỗi feature (hero, about, products, contact...) là một folder trong `src/features/`, có `index.ts` làm public API — code ngoài feature chỉ import qua `@/features/<name>`.
- Page trong `app/[locale]/` giữ mỏng: chỉ compose section từ features, không chứa logic/UI chi tiết.
- Component thuần UI dùng chung đặt ở `components/shared/`; component gắn với nghiệp vụ đặt trong feature tương ứng.
- Form dùng `react-hook-form` + `zod` (schema đặt cạnh form trong feature).
- Animation dùng `motion` (framer-motion): import từ `motion/react`.
