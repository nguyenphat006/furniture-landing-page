"""Nhập 10 bài tin tức mẫu và gắn section "Cuộc sống tại BFC" vào Trang chủ.

    python manage.py import_news            # chỉ tạo bài chưa có (khớp theo slug)
    python manage.py import_news --force    # ghi đè bài mẫu đã sửa trong admin
    python manage.py import_news --no-home  # không đụng Trang chủ

Dữ liệu nguồn: fixtures/news.json do scripts/export_frontend_mock.mjs sinh từ
frontend/src/data/news/posts.mock.ts. Chạy một lần: chạy lại sẽ tạo lại bài mẫu admin đã xoá.
"""

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.news.services import import_news

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "news.json"
DEFAULT_ASSETS = settings.BASE_DIR.parent / "frontend" / "public"


class Command(BaseCommand):
    help = "Nhập bài tin tức mẫu và gắn section tin tức vào Trang chủ"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
        parser.add_argument(
            "--assets", type=Path, default=DEFAULT_ASSETS, help="Thư mục public/ của frontend"
        )
        parser.add_argument("--force", action="store_true", help="Ghi đè bài đã có")
        parser.add_argument(
            "--no-home", action="store_true", help="Không chèn section tin tức vào Trang chủ"
        )

    def handle(self, *args: Any, **options: Any) -> None:
        file: Path = options["file"]
        assets: Path = options["assets"]
        if not file.is_file():
            raise CommandError(f"Không thấy file dữ liệu: {file}")
        if not assets.is_dir():
            raise CommandError(f"Không thấy thư mục ảnh: {assets}")

        result = import_news(
            json.loads(file.read_text("utf-8")),
            assets_dir=assets,
            force=options["force"],
            home_section=not options["no_home"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Tin tức: {len(result.created)} mới, {len(result.updated)} ghi đè, "
                f"{len(result.skipped)} bỏ qua (đã có)."
            )
        )
        if result.home_section:
            self.stdout.write(self.style.SUCCESS("Đã chèn section tin tức vào Trang chủ."))
        for ref in result.missing_images:
            self.stdout.write(self.style.WARNING(f"Thiếu ảnh: {ref}"))
