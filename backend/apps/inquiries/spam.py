"""Chống spam phía CMS (2026-11-07), lớp sau các lớp ở frontend (giới hạn IP, honeypot, captcha).

Lưu bằng database nên vẫn đúng khi khởi động lại hay chạy nhiều server Next. Bật / tắt và ngưỡng
sửa trong admin: Cài đặt → Liên hệ (config.InquirySettings).
- Gửi trùng: cùng email + cùng nội dung trong khoảng chặn → coi là bản đã có, không tạo mới.
- Giới hạn theo email: quá số yêu cầu mỗi giờ → từ chối (API trả 429, frontend báo
  "gửi quá nhiều lần").
- Nội dung giống spam quảng cáo (nhiều link, hoặc link trong họ tên / công ty) → vẫn lưu nhưng
  đánh dấu Rác và không gửi email báo; nhân viên vẫn xem lại được trong admin.
"""

from __future__ import annotations

import re
from datetime import timedelta

from django.utils import timezone

from .config import InquirySettings
from .models import Inquiry

EMAIL_WINDOW = timedelta(hours=1)

_LINK = re.compile(r"https?://|www\.|\b[\w-]+\.(?:com|net|org|ru|xyz|top|info|biz)\b/", re.I)


def find_duplicate(config: InquirySettings, email: str, message: str) -> Inquiry | None:
    if not config.duplicate_check:
        return None
    since = timezone.now() - timedelta(minutes=config.duplicate_minutes)
    return (
        Inquiry.objects.filter(email__iexact=email, message=message, created_at__gte=since)
        .order_by("-created_at")
        .first()
    )


def email_limit_reached(config: InquirySettings, email: str) -> bool:
    if not config.email_limit:
        return False
    since = timezone.now() - EMAIL_WINDOW
    recent = Inquiry.objects.filter(email__iexact=email, created_at__gte=since)
    return recent.count() >= config.max_per_email_per_hour


def looks_like_spam(config: InquirySettings, *, name: str, company: str, message: str) -> bool:
    if not config.link_filter:
        return False
    if _LINK.search(name) or _LINK.search(company):
        return True
    return len(_LINK.findall(message)) > config.max_links
