# 0006. Triển khai bằng Docker Compose

Trạng thái: chấp nhận, CHƯA triển khai (dự án hiện chạy local)

## Quyết định
- Giống ERP: server chạy Docker Compose gồm `cms` (image từ `backend/Dockerfile`), `postgres`, Nginx (TLS).
- Máy dev KHÔNG dùng Docker; Docker chỉ dùng trên server và CI.
- Biến môi trường truyền qua `env_file` của Compose, mẫu ở `.env.example`; không đưa bí mật vào image.
- Migration chạy bằng lệnh riêng khi deploy: `docker compose run --rm cms python manage.py migrate`.
- Image chạy user thường (uid 1000), healthcheck gọi `/healthz`; `/readyz` kiểm tra database.
- `media/` và `private/` là volume; `private/` (file đính kèm liên hệ) không phục vụ công khai.
