#!/usr/bin/env bash
# Khôi phục website BFC từ một bản sao lưu của backup.sh. GHI ĐÈ toàn bộ dữ liệu hiện tại.
#
#   ./restore.sh /var/backups/bfc-web/20261107-020000
#
# Thử khôi phục định kỳ trên staging để chắc bản sao lưu dùng được (README, mục Backup).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
source .env

SRC="${1:?Cách dùng: ./restore.sh <thư mục bản sao lưu>}"
for f in db.dump media.tar.gz private.tar.gz; do
  [[ -f "$SRC/$f" ]] || { echo "Thiếu $SRC/$f" >&2; exit 1; }
done

read -r -p "Ghi đè database, ảnh và tệp đính kèm bằng $SRC? Gõ 'khoi phuc' để tiếp tục: " answer
[[ "$answer" == "khoi phuc" ]] || { echo "Đã huỷ."; exit 1; }

echo "==> Tạm dừng web và CMS"
docker compose stop web cms

echo "==> Database"
docker compose up -d postgres
docker compose exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-bfc}" -d "${POSTGRES_DB:-bfc_cms}" --clean --if-exists --no-owner \
  < "$SRC/db.dump"

echo "==> Ảnh và tệp đính kèm"
for part in media private; do
  docker compose run --rm --no-deps -T --entrypoint sh cms \
    -c "find /app/$part -mindepth 1 -delete && tar -C /app -xzf -" < "$SRC/$part.tar.gz"
done

echo "==> Chạy lại"
docker compose up -d cms web
echo "Xong. Kiểm tra web và admin; nếu dữ liệu khác bản đang build của web, chạy ./deploy.sh để dựng lại trang."
