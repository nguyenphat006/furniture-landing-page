"""Ghi dữ liệu Liên hệ. View API và admin chỉ gọi các hàm ở đây."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.core.mail import EmailMessage
from django.db import transaction
from django.urls import reverse
from django.utils import timezone

from . import spam
from .config import InquirySettings
from .files import display_name
from .models import Inquiry
from .scanning import ScanResult, scan_bytes

if TYPE_CHECKING:
    from apps.accounts.models import User

log = structlog.get_logger(__name__)


class InquiryRateLimited(Exception):
    """Email này đã gửi quá nhiều yêu cầu trong khoảng thời gian gần đây (spam.py)."""


def create_inquiry(data: dict[str, Any], attachment: UploadedFile[Any] | None = None) -> Inquiry:
    """Lưu yêu cầu mới, hẹn gửi email báo nhân viên sau khi commit.

    `data` là dữ liệu đã kiểm tra (InquiryCreateSerializer). Không ghi log nội dung hay thông tin
    cá nhân, chỉ ghi mã công khai.

    Chống spam (spam.py): gửi trùng thì trả bản đã có; quá giới hạn theo email thì ném
    InquiryRateLimited; nội dung giống spam thì lưu với trạng thái Rác và không gửi email báo.
    """
    config = InquirySettings.load()
    duplicate = spam.find_duplicate(config, data["email"], data["message"])
    if duplicate is not None:
        log.info("inquiry_duplicate_ignored", inquiry=str(duplicate.public_id))
        return duplicate
    if spam.email_limit_reached(config, data["email"]):
        log.warning("inquiry_email_rate_limited")
        raise InquiryRateLimited

    inquiry = Inquiry(**data)
    if spam.looks_like_spam(
        config, name=inquiry.name, company=inquiry.company, message=inquiry.message
    ):
        inquiry.status = Inquiry.Status.SPAM
    if attachment is not None:
        inquiry.attachment_name = display_name(attachment.name or "")
        attachment.seek(0)
        result = scan_bytes(attachment.read())
        attachment.seek(0)
        _apply_scan(inquiry, result)
        # Tệp nhiễm virus không bao giờ chạm vào kho lưu
        if inquiry.scan_status != Inquiry.ScanStatus.INFECTED:
            inquiry.attachment.save(attachment.name or "attachment", attachment, save=False)
    inquiry.save()
    log.info(
        "inquiry_created",
        inquiry=str(inquiry.public_id),
        purpose=inquiry.purpose,
        scan=inquiry.scan_status,
        spam=inquiry.status == Inquiry.Status.SPAM,
    )
    if inquiry.status != Inquiry.Status.SPAM:
        transaction.on_commit(lambda: notify_staff(inquiry))
    return inquiry


def _apply_scan(inquiry: Inquiry, result: ScanResult | None) -> None:
    if result is None:
        inquiry.scan_status = Inquiry.ScanStatus.NOT_SCANNED
        inquiry.scan_detail = ""
        return
    inquiry.scan_status = result.status
    inquiry.scan_detail = result.signature
    inquiry.scanned_at = timezone.now()
    if result.status == "infected":
        log.warning(
            "inquiry_attachment_infected", inquiry=str(inquiry.public_id), virus=result.signature
        )
    elif result.status == "error":
        log.warning("inquiry_scan_failed", inquiry=str(inquiry.public_id), error=result.signature)


def rescan_attachment(inquiry: Inquiry) -> str:
    """Quét lại tệp đã lưu (chưa quét / quét lỗi). Nhiễm virus thì xoá tệp khỏi kho.

    Trả trạng thái mới. Chưa cấu hình máy quét thì không đổi gì.
    """
    if not inquiry.attachment:
        return str(inquiry.scan_status)
    with inquiry.attachment.open("rb") as f:
        result = scan_bytes(f.read())
    if result is None:
        return str(inquiry.scan_status)
    _apply_scan(inquiry, result)
    if inquiry.scan_status == Inquiry.ScanStatus.INFECTED:
        inquiry.attachment.delete(save=False)
    inquiry.save(
        update_fields=["attachment", "scan_status", "scan_detail", "scanned_at", "updated_at"]
    )
    return str(inquiry.scan_status)


def attachment_line(inquiry: Inquiry) -> str:
    if inquiry.scan_status == Inquiry.ScanStatus.NONE:
        return "Tệp đính kèm: không có"
    status = inquiry.get_scan_status_display()
    if inquiry.scan_status == Inquiry.ScanStatus.INFECTED:
        return f"Tệp đính kèm: {inquiry.attachment_name}: {status} ({inquiry.scan_detail})"
    return f"Tệp đính kèm: {inquiry.attachment_name} ({status}, tải trong admin)"


def notify_staff(inquiry: Inquiry) -> bool:
    """Email báo có yêu cầu mới tới email trong Cài đặt → Liên hệ (hoặc INQUIRY_NOTIFY_EMAILS).

    - Người nhận cố định trong settings; email khách chỉ nằm ở Reply-To.
    - Thư dạng text thuần, không đính kèm tệp (chỉ tải qua admin, sau khi quét sạch).
    - Lỗi gửi chỉ ghi log: yêu cầu đã lưu, nhân viên vẫn thấy trong admin.
    """
    recipients = InquirySettings.load().recipients()
    if not recipients:
        log.warning("inquiry_notify_skipped", reason="chưa cấu hình email nhận thông báo")
        return False

    admin_url = settings.WAGTAILADMIN_BASE_URL.rstrip("/") + reverse(
        "wagtailsnippets_inquiries_inquiry:edit", args=[inquiry.pk]
    )
    lines = [
        f"Mục đích: {inquiry.get_purpose_display()}",
        f"Họ tên: {inquiry.name}",
        f"Email: {inquiry.email}",
        f"Công ty: {inquiry.company or '-'}",
        f"Quốc gia: {inquiry.country or '-'}",
        f"Điện thoại: {inquiry.phone or '-'}",
        f"Mã mẫu: {inquiry.model_codes or '-'}",
        f"Ngôn ngữ trang: {inquiry.locale}",
        attachment_line(inquiry),
        "",
        inquiry.message,
        "",
        f"Xem và xử lý: {admin_url}",
    ]
    subject = f"[Website] Yêu cầu {inquiry.get_purpose_display().lower()}: {inquiry.name}"
    message = EmailMessage(
        subject=subject[:200],
        body="\n".join(lines),
        to=recipients,
        reply_to=[inquiry.email],
    )
    try:
        message.send()
    except OSError as exc:
        log.warning("inquiry_notify_failed", inquiry=str(inquiry.public_id), error=str(exc))
        return False
    return True


def assign_handler(inquiry: Inquiry, *, actor: User | Any | None) -> None:
    """Người xử lý = người sửa yêu cầu gần nhất trong admin. Gọi trước khi lưu, không tự lưu."""
    if actor is not None and getattr(actor, "is_authenticated", False):
        inquiry.handled_by = actor
