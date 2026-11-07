"""Yêu cầu liên hệ gửi từ form trang Liên hệ của website (G2, 2026-11-07).

Bản ghi chỉ sinh ra qua API (Next.js server gọi, có ký HMAC); quản trị viên không tạo tay,
chỉ xem, đổi trạng thái và ghi chú. Phần khách gửi là chỉ đọc trong admin.

Tệp đính kèm lưu ở kho riêng tư (STORAGES["private"], không có URL công khai), chỉ tải qua
view admin có kiểm tra quyền (views.py). Tệp được quét virus bằng ClamAV khi nhận (scanning.py,
docs/adr/0009); tệp nhiễm virus không được lưu.
"""

from __future__ import annotations

from django.conf import settings
from django.core.files.storage import Storage, storages
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.models.base import PublicIdModel, TimeStampedModel


def private_storage() -> Storage:
    return storages["private"]


def attachment_path(instance: Inquiry, filename: str) -> str:
    # Đường dẫn theo mã công khai, không theo tên tệp của khách (tên đã làm sạch ở frontend
    # và chỉ giữ lại để hiển thị).
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"inquiries/{timezone.now():%Y/%m}/{instance.public_id}.{suffix}"


class Inquiry(PublicIdModel, TimeStampedModel):
    class Purpose(models.TextChoices):
        QUOTE = "quote", _("Báo giá")
        OEM = "oem", _("OEM / ODM")
        VISIT = "visit", _("Thăm nhà máy")
        OTHER = "other", _("Khác")

    class ScanStatus(models.TextChoices):
        NONE = "none", _("Không có tệp")
        NOT_SCANNED = "not_scanned", _("Chưa quét")
        CLEAN = "clean", _("Sạch")
        INFECTED = "infected", _("Nhiễm virus, đã xoá tệp")
        ERROR = "error", _("Lỗi khi quét, chờ quét lại")

    class Status(models.TextChoices):
        NEW = "new", _("Mới")
        IN_PROGRESS = "in_progress", _("Đang xử lý")
        DONE = "done", _("Đã xong")
        SPAM = "spam", _("Rác")

    # --- Khách gửi (chỉ đọc trong admin)
    purpose = models.CharField(_("mục đích"), max_length=16, choices=Purpose.choices)
    name = models.CharField(_("họ tên"), max_length=120)
    email = models.EmailField(_("email"), max_length=200)
    company = models.CharField(_("công ty"), max_length=200, blank=True)
    country = models.CharField(_("quốc gia"), max_length=2, blank=True, help_text=_("Mã ISO"))
    phone = models.CharField(_("điện thoại"), max_length=50, blank=True)
    model_codes = models.CharField(_("mã mẫu quan tâm"), max_length=200, blank=True)
    message = models.TextField(_("nội dung"), max_length=5000)
    locale = models.CharField(
        _("ngôn ngữ trang"), max_length=8, choices=settings.LANGUAGES, default="vi"
    )
    attachment = models.FileField(
        _("tệp đính kèm"),
        storage=private_storage,
        upload_to=attachment_path,
        max_length=255,
        blank=True,
    )
    attachment_name = models.CharField(_("tên tệp gốc"), max_length=120, blank=True)
    scan_status = models.CharField(
        _("quét virus"), max_length=16, choices=ScanStatus.choices, default=ScanStatus.NONE
    )
    scan_detail = models.CharField(
        _("kết quả quét"), max_length=200, blank=True, help_text=_("Tên virus hoặc lỗi máy quét")
    )
    scanned_at = models.DateTimeField(_("quét lúc"), null=True, blank=True)

    # --- Nhân viên xử lý
    status = models.CharField(
        _("trạng thái"), max_length=16, choices=Status.choices, default=Status.NEW, db_index=True
    )
    staff_note = models.TextField(_("ghi chú nội bộ"), blank=True)
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("người xử lý"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = _("yêu cầu liên hệ")
        verbose_name_plural = _("yêu cầu liên hệ")
        ordering = ["-created_at", "-id"]

    @property
    def attachment_downloadable(self) -> bool:
        """Được tải tệp không: sạch, hoặc chưa quét / quét lỗi khi môi trường cho phép."""
        if not self.attachment:
            return False
        if self.scan_status == self.ScanStatus.CLEAN:
            return True
        return not settings.ATTACHMENT_SCAN_REQUIRED and self.scan_status in (
            self.ScanStatus.NOT_SCANNED,
            self.ScanStatus.ERROR,
        )

    def __str__(self) -> str:
        who = f"{self.name} ({self.company})" if self.company else self.name
        return f"{who} · {self.get_purpose_display()}"


# Model cài đặt nằm ở config.py; import ở đây để Django nạp cùng app (migration, admin)
from .config import InquirySettings  # noqa: E402

__all__ = ["Inquiry", "InquirySettings"]
