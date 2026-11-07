"""Nhập thông tin chung hiện có của frontend (công ty, liên hệ, logo, menu, SEO) vào CMS.

    python manage.py import_site
    python manage.py import_site --assets ../frontend/public --file other.json

Dữ liệu nguồn: scripts/export_frontend_mock.mjs (từ src/config/site.ts và messages). Ghi đè những
gì đã sửa trong admin, nên chỉ chạy lúc khởi tạo.
"""

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.sitesettings.services import import_site

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "site.json"
DEFAULT_ASSETS = settings.BASE_DIR.parent / "frontend" / "public"


class Command(BaseCommand):
    help = "Nhập thông tin chung của frontend vào Cài đặt → Thông tin chung"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
        parser.add_argument(
            "--assets", type=Path, default=DEFAULT_ASSETS, help="Thư mục public/ của frontend"
        )

    def handle(self, *args: Any, **options: Any) -> None:
        file: Path = options["file"]
        assets: Path = options["assets"]
        if not file.is_file():
            raise CommandError(f"Không thấy file dữ liệu: {file}")
        if not assets.is_dir():
            raise CommandError(f"Không thấy thư mục ảnh: {assets}")
        missing = import_site(json.loads(file.read_text("utf-8")), assets_dir=assets)
        self.stdout.write(self.style.SUCCESS("Đã nhập thông tin chung."))
        for ref in missing:
            self.stdout.write(self.style.WARNING(f"Thiếu ảnh: {ref}"))
