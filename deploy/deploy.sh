#!/usr/bin/env bash
# Deploy website BFC trên server (deploy/README.md).
#
#   ./deploy.sh            # mỗi lần cập nhật code
#   ./deploy.sh --first    # lần đầu: thêm tạo locale, nhập thông tin chung, phân loại, 50 mẫu mock
#
# Thứ tự bắt buộc: CMS chạy và có dữ liệu TRƯỚC khi build web, vì lúc build Next.js gọi CMS qua
# https://<CMS_DOMAIN> để dựng sẵn trang (frontend/Dockerfile).
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env || ! -f .env.cms ]]; then
  echo "Thiếu deploy/.env hoặc deploy/.env.cms (sao chép từ .env.example, .env.cms.example)." >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

FIRST=0
[[ "${1:-}" == "--first" ]] && FIRST=1

dc() { docker compose "$@"; }
# Lệnh quản trị CMS, gắn frontend/public vào /frontend/public cho các lệnh nhập ảnh
manage() { dc run --rm -v "$(cd ../frontend && pwd)/public:/frontend/public:ro" cms python manage.py "$@"; }

echo "==> Build CMS"
dc build cms

echo "==> Postgres, ClamAV"
dc up -d postgres clamav

echo "==> Migrate"
manage migrate --noinput

if [[ $FIRST == 1 ]]; then
  echo "==> Lần đầu: locale, thông tin chung, phân loại, sản phẩm mock"
  manage bootstrap
  manage import_site
  # Chỉ lần đầu: phân loại do CMS quản lý, chạy lại sẽ tạo lại mục admin đã cố ý xoá
  manage sync_taxonomy
  manage import_mock
fi

echo "==> Trang nội dung còn thiếu (không ghi đè phần đã sửa trong admin)"
manage import_pages

echo "==> Bật CMS + Nginx"
dc up -d cms
dc up -d --no-deps nginx

echo "==> Chờ CMS sẵn sàng qua https://${CMS_DOMAIN}"
for i in $(seq 1 30); do
  if curl -fsS "https://${CMS_DOMAIN}/readyz" >/dev/null; then break; fi
  if [[ $i == 30 ]]; then echo "CMS chưa lên sau 60 giây, xem: docker compose logs cms" >&2; exit 1; fi
  sleep 2
done

echo "==> Build web (gọi CMS để dựng sẵn trang) rồi bật"
dc build web
dc up -d web

echo "==> Dọn image cũ không dùng"
docker image prune -f >/dev/null

dc ps
echo "Xong. Web: https://${WEB_DOMAIN}  CMS: https://${CMS_DOMAIN}/admin/"
