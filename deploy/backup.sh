#!/usr/bin/env bash
# Sao lưu website BFC: database Postgres + ảnh (media) + tệp đính kèm form Liên hệ (private).
# Chạy hằng ngày bằng cron (deploy/crontab.example). Giữ BACKUP_KEEP_DAYS ngày, xoá bản cũ hơn.
#
#   ./backup.sh
#
# Kết quả: $BACKUP_DIR/<YYYYmmdd-HHMMSS>/{db.dump, media.tar.gz, private.tar.gz}
# Bản sao lưu nằm trên cùng server: NÊN chép thêm ra nơi khác (README, mục Backup).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
source .env

BACKUP_DIR="${BACKUP_DIR:-/var/backups/bfc-web}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/$STAMP"
mkdir -p "$TARGET"
chmod 700 "$BACKUP_DIR"

echo "==> Database"
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-bfc}" -d "${POSTGRES_DB:-bfc_cms}" --format=custom --no-owner \
  > "$TARGET/db.dump"

echo "==> Ảnh và tệp đính kèm"
docker compose exec -T cms tar -C /app -czf - media > "$TARGET/media.tar.gz"
docker compose exec -T cms tar -C /app -czf - private > "$TARGET/private.tar.gz"

# Kiểm tra nhanh: bản dump đọc được
docker compose exec -T postgres pg_restore --list < "$TARGET/db.dump" >/dev/null

echo "==> Xoá bản sao lưu cũ hơn $KEEP_DAYS ngày"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -r -- {} +

du -sh "$TARGET"
echo "Xong: $TARGET"
