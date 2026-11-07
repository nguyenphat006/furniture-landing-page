# Website BFC

Landing page song ngữ (vi / en) của BFC kèm CMS để tự sửa nội dung.

| Phần | Thư mục | Công nghệ |
| --- | --- | --- |
| Website công khai | [`frontend/`](frontend/README.md) | Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui, next-intl |
| CMS (admin + API) | [`backend/`](backend/README.md) | Django 5.2 LTS, Wagtail 8, Django REST Framework, Postgres |
| Triển khai server | [`deploy/`](deploy/README.md) | Docker Compose, Nginx, Let's Encrypt, ClamAV |

## Tài liệu

| Cần làm gì | Đọc |
| --- | --- |
| Dựng server, cập nhật, sao lưu / khôi phục, theo dõi, bảo trì, xử lý sự cố | [deploy/README.md](deploy/README.md) |
| Sửa nội dung trong admin (sản phẩm, trang, menu, SEO, yêu cầu liên hệ) | [docs/huong-dan-quan-tri.md](docs/huong-dan-quan-tri.md) |
| Chạy CMS trên máy dev, lệnh kiểm tra, cấu trúc app | [backend/README.md](backend/README.md) |
| Chạy web trên máy dev, đa ngôn ngữ, cấu trúc thư mục | [frontend/README.md](frontend/README.md) |
| Vì sao làm như vậy (quyết định kiến trúc) | [backend/docs/adr/](backend/docs/adr) |
| Lộ trình và việc còn lại | [docs/cms-plan.md](docs/cms-plan.md) |

## Cách các phần nối với nhau

```
Khách ──► Nginx ──► web (Next.js) ──API nội bộ──► cms (Wagtail) ──► Postgres
Quản trị ──► Nginx ──────────────────────────────► cms /admin/
                     cms ──webhook khi xuất bản──► web (làm mới cache)
```

- Web đọc sản phẩm, vật liệu, trang, menu, cài đặt từ API của CMS (`/api/v1/`). Không cấu hình CMS thì web
  dùng dữ liệu mẫu trong `frontend/src/data`, đủ để làm giao diện.
- Xuất bản trong admin thì CMS gọi webhook ký HMAC, web làm mới đúng trang liên quan; sửa nội dung không cần
  deploy.
- Kiểu dữ liệu API: backend sinh `backend/openapi.yaml` (`poe schema`), frontend sinh
  `frontend/src/lib/cms/schema.d.ts` (`npm run cms:types`). CI báo lỗi khi hai bên lệch nhau.

## Chạy trên máy dev

Máy dev không dùng Docker (ADR 0006). Hai cửa sổ terminal:

```bash
# 1. CMS: http://127.0.0.1:9000/admin/   (cài lần đầu: backend/README.md)
cd backend
export UV_PROJECT_ENVIRONMENT="$LOCALAPPDATA/bfc-cms/venv"
python -m uv run poe dev

# 2. Web: http://localhost:4000
cd frontend
npm install
npm run dev
```

Nối web với CMS: `frontend/.env.local` đặt `CMS_API_URL=http://127.0.0.1:9000/api/v1` và `CMS_SHARED_SECRET`
trùng với `backend/.env` (chi tiết trong `frontend/.env.example`, `backend/.env.example`).

## Kiểm tra trước khi đẩy code

| Phần | Lệnh | CI |
| --- | --- | --- |
| Backend | `python -m uv run poe check` (lint, type, migration, test) | `.github/workflows/backend.yml` |
| Frontend | `npx tsc --noEmit`, `npx eslint src`, `npx prettier --check src messages`, `npm run build` | `.github/workflows/frontend.yml` |
| Bộ triển khai | (chỉ chạy trên CI) | `.github/workflows/deploy.yml` |

## Quy ước

- Ghim phiên bản chính xác cho thư viện và image, chỉ dùng bản đã phát hành ít nhất 2 tuần (ADR 0001).
- Không commit bí mật: `backend/.env`, `frontend/.env.local`, `deploy/.env`, `deploy/.env.cms`.
- Không bịa số liệu trong nội dung; chỗ chưa có để "NULL" cho BFC điền.
