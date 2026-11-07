"""Cài đặt vận hành của form Liên hệ, sửa trong admin: Cài đặt → Liên hệ (2026-11-07).

Chỉ chứa thứ nhân viên tự đổi được: email nhận thông báo, bật / tắt và ngưỡng chống spam.
Cấu hình hạ tầng và bảo mật (khoá bí mật, máy quét virus, bắt buộc quét) vẫn ở biến môi trường,
để người có tài khoản admin không xem được khoá hay tắt được quét virus (docs/adr/0008).
"""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, validate_email
from django.db import models
from django.utils.translation import gettext_lazy as _
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.contrib.settings.models import BaseGenericSetting, register_setting


def parse_emails(value: str) -> list[str]:
    """Mỗi dòng (hoặc dấu phẩy) một email, bỏ trùng và dòng trống."""
    items = [part.strip() for line in value.splitlines() for part in line.split(",")]
    return list(dict.fromkeys(item for item in items if item))


def validate_email_list(value: str) -> None:
    invalid = []
    for email in parse_emails(value):
        try:
            validate_email(email)
        except ValidationError:
            invalid.append(email)
    if invalid:
        raise ValidationError(
            _("Email không hợp lệ: %(emails)s"), params={"emails": ", ".join(invalid)}
        )


@register_setting(icon="mail")
class InquirySettings(BaseGenericSetting):  # type: ignore[misc]  # wagtail.contrib.settings chưa có type
    notify_emails = models.TextField(
        _("email nhận thông báo"),
        blank=True,
        validators=[validate_email_list],
        help_text=_(
            "Mỗi dòng một email. Để trống thì dùng email trong cấu hình server "
            "(INQUIRY_NOTIFY_EMAILS); cả hai trống thì không gửi email, yêu cầu vẫn lưu."
        ),
    )

    duplicate_check = models.BooleanField(
        _("chặn gửi trùng"),
        default=True,
        help_text=_("Cùng email và cùng nội dung trong khoảng thời gian dưới đây: không tạo mới."),
    )
    duplicate_minutes = models.PositiveSmallIntegerField(
        _("khoảng chặn gửi trùng (phút)"),
        default=10,
        validators=[MinValueValidator(1), MaxValueValidator(1440)],
    )

    email_limit = models.BooleanField(
        _("giới hạn theo email"),
        default=True,
        help_text=_("Quá số yêu cầu mỗi giờ: khách được báo đã gửi quá nhiều lần."),
    )
    max_per_email_per_hour = models.PositiveSmallIntegerField(
        _("số yêu cầu tối đa mỗi email mỗi giờ"),
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )

    link_filter = models.BooleanField(
        _("tự đánh dấu Rác khi nhiều link"),
        default=True,
        help_text=_(
            "Nội dung có quá số link dưới đây, hoặc có link trong họ tên / công ty: lưu với "
            "trạng thái Rác và không gửi email báo."
        ),
    )
    max_links = models.PositiveSmallIntegerField(
        _("số link tối đa trong nội dung"),
        default=3,
        validators=[MaxValueValidator(50)],
    )

    panels = [
        FieldPanel("notify_emails"),
        MultiFieldPanel(
            [
                FieldPanel("duplicate_check"),
                FieldPanel("duplicate_minutes"),
                FieldPanel("email_limit"),
                FieldPanel("max_per_email_per_hour"),
                FieldPanel("link_filter"),
                FieldPanel("max_links"),
            ],
            heading=_("Chống spam"),
        ),
    ]

    class Meta:
        verbose_name = _("Liên hệ")

    def recipients(self) -> list[str]:
        return parse_emails(self.notify_emails) or list(settings.INQUIRY_NOTIFY_EMAILS)
