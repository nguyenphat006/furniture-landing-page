"""Tạo phân loại mới mà frontend đã khai báo nhưng CMS chưa có. Chạy mỗi lần deploy, sau migrate.

    python manage.py sync_taxonomy
    python manage.py sync_taxonomy --dry-run

Chỉ tạo mục còn thiếu (khớp theo slug), không sửa hay xoá mục đã có, nên không đè lên những gì
quản trị viên đã chỉnh. Nguồn: fixtures/mock_catalog.json (scripts/export_frontend_mock.mjs).
"""

import json
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from apps.catalog.services import sync_taxonomy

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "mock_catalog.json"


class DryRun(Exception):
    pass


class Command(BaseCommand):
    help = "Tạo nhóm, loại, chất liệu, tính năng mới từ khai báo của frontend (không ghi đè)"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
        parser.add_argument("--dry-run", action="store_true", help="Chỉ in ra, không ghi")

    def handle(self, *args: Any, **options: Any) -> None:
        file: Path = options["file"]
        if not file.is_file():
            raise CommandError(f"Không thấy file dữ liệu: {file}")
        data = json.loads(file.read_text("utf-8"))
        try:
            with transaction.atomic():
                result = sync_taxonomy(data)
                if options["dry_run"]:
                    raise DryRun
        except DryRun:
            self.stdout.write(self.style.WARNING("Chạy thử, không ghi gì."))
        for group, slugs in result.created.items():
            if slugs:
                self.stdout.write(f"Thêm {group}: {', '.join(slugs)}")
        if result.menu_created:
            self.stdout.write("Tạo menu vật liệu mặc định.")
        if not result.total and not result.menu_created:
            self.stdout.write(self.style.SUCCESS("Phân loại đã đủ, không có gì mới."))
