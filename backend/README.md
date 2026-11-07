# BFC CMS (backend)

CMS cho landing page BFC: Django 5.2 LTS + Wagtail 8.0, API DRF cho Next.js (`frontend/`).
Triển khai server và vận hành: [../deploy/README.md](../deploy/README.md). Quyết định kiến trúc: [docs/adr](docs/adr). Kế hoạch tổng: [../docs/cms-plan.md](../docs/cms-plan.md).

## Cài đặt lần đầu (Windows, Git Bash)

Yêu cầu: Python 3.12, `uv` 0.13.5 (`python -m pip install --user uv==0.13.5`).

Máy công ty chặn chạy file `.exe` trong thư mục Documents (lỗi `os error 1260`), nên đặt virtualenv
ra ngoài repo và gọi uv qua `python -m uv`:

```bash
cd backend
export UV_PROJECT_ENVIRONMENT="$LOCALAPPDATA/bfc-cms/venv"   # nên thêm vào ~/.bashrc
python -m uv sync                       # cài thư viện đúng uv.lock
cp .env.example .env                    # tuỳ chọn, local chạy được không cần .env
python -m uv run poe bootstrap          # migrate + locale vi/en + nhóm "Quản trị"
python -m uv run python manage.py import_mock   # nhập 50 sản phẩm mock + ảnh từ frontend/public
python -m uv run python manage.py createsuperuser
python -m uv run poe dev                # http://127.0.0.1:9000/admin/
```

| Địa chỉ | Nội dung |
| --- | --- |
| `/admin/` | Admin Wagtail (giao diện BFC). Cổng 9000 để không trùng ERP (8000) |
| `/django-admin/` | Admin Django, chỉ superuser |
| `/api/v1/` | API cho frontend: `catalog/taxonomy`, `catalog/products`, `catalog/products/<slug>` (thêm `?locale=en`) |
| `/api/docs/` | Tài liệu API (Swagger), chỉ khi DEBUG |
| `/healthz`, `/readyz` | Kiểm tra sống / sẵn sàng (có database) |

## Nối với frontend (Next.js)

Frontend đọc sản phẩm từ CMS khi có `CMS_API_URL`; bỏ trống thì dùng dữ liệu mock.

| File | Biến |
| --- | --- |
| `frontend/.env.local` | `CMS_API_URL=http://127.0.0.1:9000/api/v1`, `CMS_REVALIDATE_SECRET=<bí mật>` |
| `backend/.env` | `CMS_SHARED_SECRET=<cùng bí mật>`, `FRONTEND_REVALIDATE_URL=http://localhost:4000/api/revalidate` |

Xuất bản / gỡ sản phẩm hoặc sửa phân loại trong admin thì CMS gọi webhook (ký HMAC) để web làm mới
cache; webhook lỗi thì web vẫn tự làm mới sau tối đa 1 giờ. Đổi `CMS_API_URL` thì khởi động lại
`next dev` để nạp lại cấu hình ảnh.

## Lệnh hằng ngày (`python -m uv run poe <lệnh>`)

| Lệnh | Việc |
| --- | --- |
| `dev` | Chạy server dev |
| `check` | Lint + type + migration + test, giống CI |
| `test` | pytest + coverage (tối thiểu 85%) |
| `format` | Tự sửa lint và format |
| `schema` | Sinh lại `openapi.yaml` sau khi đổi API |

Hook trước commit: `python -m uv run pre-commit install` (cấu hình ở `../.pre-commit-config.yaml`).

## Cấu trúc

```
config/            settings (base, dev, test, prod), urls, logging
apps/core/         model nền (thời gian, người tạo, UUID, lưu trữ), API chung, giao diện admin
apps/accounts/     User, nhóm "Quản trị", nhật ký thay đổi, chặn dò mật khẩu
apps/catalog/      Sản phẩm (nháp / xuất bản / bản dịch), ảnh, món trong bộ, phân loại, API catalog
scripts/           export_frontend_mock.mjs: xuất mock frontend ra apps/catalog/fixtures/
```

Mỗi app: `models/` · `services.py` (ghi) · `selectors.py` (đọc) · `api/` · `tests/` (xem ADR 0002).

## Production

Docker Compose trên server, image từ `Dockerfile`, settings `config/settings/prod.py` (ADR 0006). Cách dựng,
cập nhật, sao lưu, xử lý sự cố: [../deploy/README.md](../deploy/README.md). Máy dev không dùng Docker.

| Lệnh quản trị (`python manage.py <lệnh>`) | Việc |
| --- | --- |
| `bootstrap` | Locale vi/en, nhóm Quản trị (lần đầu) |
| `import_site` | Thông tin chung, menu, footer từ dữ liệu frontend (lần đầu) |
| `sync_taxonomy` | Tạo nhóm / loại / chất liệu / tính năng từ dữ liệu frontend (lần đầu, không ghi đè) |
| `import_mock` | 50 sản phẩm mẫu + ảnh (lần đầu) |
| `import_pages` | Tạo trang nội dung còn thiếu, không ghi đè trang đã sửa (mỗi lần deploy) |
| `publish_scheduled` | Xuất bản / gỡ nội dung hẹn giờ (cron 5 phút) |
| `scan_attachments` | Quét virus lại tệp đính kèm chưa quét được (cron 15 phút) |

`CMS_PUBLIC_URL` (production: `https://<CMS_DOMAIN>`) làm link ảnh trong API là địa chỉ công khai, kể cả khi
web gọi API qua địa chỉ nội bộ `http://cms:8000`.
