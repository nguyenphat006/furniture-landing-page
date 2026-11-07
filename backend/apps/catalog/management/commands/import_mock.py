"""Nhập 50 sản phẩm mock (đã xuất từ frontend) vào CMS và xuất bản.

    python manage.py import_mock
    python manage.py import_mock --assets ../frontend/public --file other.json

Chạy lại được nhiều lần (khớp theo slug). Dữ liệu nguồn: scripts/export_frontend_mock.mjs.
"""

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.catalog.services import import_catalog

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "mock_catalog.json"
DEFAULT_ASSETS = settings.BASE_DIR.parent / "frontend" / "public"


class Command(BaseCommand):
    help = "Nhập sản phẩm mock của frontend vào CMS"

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

        result = import_catalog(json.loads(file.read_text("utf-8")), assets_dir=assets)
        self.stdout.write(
            self.style.SUCCESS(
                f"Sản phẩm: {result.created} mới, {result.updated} cập nhật. "
                f"Ảnh mới: {result.images}."
            )
        )
        for ref in result.missing_images:
            self.stdout.write(self.style.WARNING(f"Thiếu ảnh: {ref}"))
