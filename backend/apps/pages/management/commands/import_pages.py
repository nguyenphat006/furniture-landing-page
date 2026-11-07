"""Nhập nội dung trang (Trang chủ, Section dùng chung, trang pháp lý) vào CMS.

    python manage.py import_pages            # chỉ tạo phần CMS chưa có (chạy mỗi lần deploy được)
    python manage.py import_pages --force    # ghi đè nội dung đã sửa trong admin

Dữ liệu nguồn: fixtures/pages.json do scripts/export_frontend_mock.mjs sinh (từ messages và
src/features/home/page-content.ts) và fixtures/legal.json (Chính sách bảo mật, Điều khoản; viết
tay).
"""

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.pages.services import import_pages

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
DEFAULT_FILE = FIXTURES / "pages.json"
LEGAL_FILE = FIXTURES / "legal.json"
DEFAULT_ASSETS = settings.BASE_DIR.parent / "frontend" / "public"


class Command(BaseCommand):
    help = "Nhập Trang chủ, Section dùng chung và trang pháp lý vào CMS"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
        parser.add_argument("--legal", type=Path, default=LEGAL_FILE)
        parser.add_argument(
            "--assets", type=Path, default=DEFAULT_ASSETS, help="Thư mục public/ của frontend"
        )
        parser.add_argument(
            "--force", action="store_true", help="Ghi đè nội dung đã có (mất phần đã sửa)"
        )

    def handle(self, *args: Any, **options: Any) -> None:
        file: Path = options["file"]
        assets: Path = options["assets"]
        if not file.is_file():
            raise CommandError(f"Không thấy file dữ liệu: {file}")
        if not assets.is_dir():
            raise CommandError(f"Không thấy thư mục ảnh: {assets}")
        data = json.loads(file.read_text("utf-8"))
        legal: Path = options["legal"]
        if legal.is_file():
            data["legal"] = json.loads(legal.read_text("utf-8"))
        result = import_pages(data, assets_dir=assets, force=options["force"])
        for item in result.created:
            self.stdout.write(self.style.SUCCESS(f"Đã tạo: {item}"))
        for item in result.skipped:
            self.stdout.write(f"Đã có, bỏ qua: {item}")
        for ref in result.missing_images:
            self.stdout.write(self.style.WARNING(f"Thiếu ảnh: {ref}"))
