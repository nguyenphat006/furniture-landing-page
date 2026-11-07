"""Quét lại tệp đính kèm chưa quét hoặc quét lỗi (vd máy quét tạm ngừng lúc khách gửi).

python manage.py scan_attachments
Production: chạy định kỳ (cron 15 phút) trong container cms, xem docs/adr/0009.
"""

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from apps.inquiries.models import Inquiry
from apps.inquiries.scanning import scanner_configured
from apps.inquiries.services import rescan_attachment


class Command(BaseCommand):
    help = "Quét virus lại các tệp đính kèm chưa quét / quét lỗi."

    def handle(self, *args: Any, **options: Any) -> None:
        if not scanner_configured():
            raise CommandError("CLAMAV_URL chưa được đặt.")
        pending = Inquiry.objects.filter(
            scan_status__in=[Inquiry.ScanStatus.NOT_SCANNED, Inquiry.ScanStatus.ERROR]
        ).exclude(attachment="")
        counts: dict[str, int] = {}
        for inquiry in pending.iterator():
            status = rescan_attachment(inquiry)
            counts[status] = counts.get(status, 0) + 1
        summary = ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) or "không có tệp nào"
        self.stdout.write(self.style.SUCCESS(f"Đã quét lại: {summary}."))
