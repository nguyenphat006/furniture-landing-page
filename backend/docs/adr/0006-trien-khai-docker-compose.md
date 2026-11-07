# 0006. Triển khai bằng Docker Compose

Trạng thái: chấp nhận; bộ triển khai đã có ở `deploy/` (11/2026), chưa lên server thật

## Quyết định
- Giống ERP: server chạy Docker Compose gồm `cms` (image từ `backend/Dockerfile`), `postgres`, Nginx (TLS).
- Máy dev KHÔNG dùng Docker; Docker chỉ dùng trên server và CI.
- Biến môi trường truyền qua `env_file` của Compose, mẫu ở `.env.example`; không đưa bí mật vào image.
- Migration chạy bằng lệnh riêng khi deploy: `docker compose run --rm cms python manage.py migrate`.
- Image chạy user thường (uid 1000), healthcheck gọi `/healthz`; `/readyz` kiểm tra database.
- `media/` và `private/` là volume; `private/` (file đính kèm liên hệ) không phục vụ công khai.

## Bổ sung (11/2026): bộ triển khai trong `deploy/`
- Một server, một `docker-compose.yml`: `nginx`, `web` (Next.js standalone, `frontend/Dockerfile`), `cms`,
  `postgres`, `clamav`. Chỉ Nginx mở cổng 80/443. Web và CMS tách subdomain (`WEB_DOMAIN`, `CMS_DOMAIN`).
- HTTPS bằng certbot trên server (`/etc/letsencrypt`), lần đầu standalone, gia hạn webroot qua Nginx.
- Nginx phục vụ thẳng `/media/` từ volume; `private/` không gắn vào Nginx.
- Web build gọi CMS qua domain công khai để dựng sẵn trang, nên `deploy.sh` bật CMS (đã migrate, có dữ liệu)
  trước rồi mới build web. Lúc chạy web gọi CMS nội bộ `http://cms:8000`; `CMS_PUBLIC_URL` giữ link ảnh công khai.
- `deploy.sh --first` chỉ chạy một lần (bootstrap, import_site, sync_taxonomy, import_mock); mỗi lần deploy chỉ
  migrate + import_pages để không tạo lại mục admin đã xoá.
- Sao lưu `backup.sh` hằng ngày (pg_dump dạng custom + tar media/private, giữ `BACKUP_KEEP_DAYS` ngày), khôi phục
  `restore.sh`; chép ra ngoài server là việc bắt buộc của người vận hành. Cron mẫu ở `crontab.example`.
- CI: `frontend.yml` (type, lint, format, build, audit, build image), `deploy.yml` (compose config, `nginx -t`,
  shellcheck). Sổ tay vận hành: `deploy/README.md`.
