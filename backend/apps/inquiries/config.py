"""Cài đặt vận hành của form Liên hệ, sửa trong admin: Cài đặt → Liên hệ (2026-11-07).

Chỉ chứa thứ nhân viên tự đổi được: email nhận thông báo, email cảm ơn người gửi, bật / tắt và
ngưỡng chống spam.
Cấu hình hạ tầng và bảo mật (khoá bí mật, máy quét virus, bắt buộc quét) vẫn ở biến môi trường,
để người có tài khoản admin không xem được khoá hay tắt được quét virus (docs/adr/0008).
"""

from __future__ import annotations

import re

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


# Email cảm ơn gửi cho khách, mặc định tiếng Anh (khách chủ yếu nước ngoài). Không lặp lại nội dung
# khách viết, để form không bị dùng gửi thư tuỳ ý tới địa chỉ người khác dưới tên BFC.
AUTO_REPLY_SUBJECT = "We have received your request | {company}"
AUTO_REPLY_BODY = (
    "Dear {name},\n"
    "\n"
    "Thank you for contacting {company}. We have received your request and our team will "
    "review it and reply to this email address.\n"
    "\n"
    "Your request\n"
    "Purpose: {purpose}\n"
    "Model codes: {model_codes}\n"
    "\n"
    "If you would like to add details or drawings, simply reply to this email.\n"
    "\n"
    "Best regards,\n"
    "{company}\n"
    "{website}\n"
)
AUTO_REPLY_PLACEHOLDERS = ("name", "company", "purpose", "model_codes", "website")


def validate_placeholders(value: str) -> None:
    """Chỉ cho các chỗ chèn đã biết, để gõ nhầm không gửi ra chữ {xyz} cho khách."""
    unknown = sorted(set(re.findall(r"\{(\w*)\}", value)) - set(AUTO_REPLY_PLACEHOLDERS))
    if unknown:
        raise ValidationError(
            _("Chỗ chèn không hỗ trợ: %(names)s. Dùng: %(allowed)s"),
            params={
                "names": ", ".join(f"{{{n}}}" for n in unknown),
                "allowed": ", ".join(f"{{{n}}}" for n in AUTO_REPLY_PLACEHOLDERS),
            },
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

    auto_reply = models.BooleanField(
        _("gửi email cảm ơn người gửi"),
        default=True,
        help_text=_("Gửi ngay sau khi nhận yêu cầu. Yêu cầu bị đánh dấu Rác thì không gửi."),
    )
    auto_reply_subject = models.CharField(
        _("tiêu đề"), max_length=200, default=AUTO_REPLY_SUBJECT, validators=[validate_placeholders]
    )
    auto_reply_body = models.TextField(
        _("nội dung"),
        default=AUTO_REPLY_BODY,
        validators=[validate_placeholders],
        help_text=_(
            "Chữ thuần. Chỗ chèn: {name} tên khách, {company} tên công ty (Thông tin chung), "
            "{purpose} mục đích, {model_codes} mã mẫu, {website} địa chỉ web. Khách bấm Trả lời "
            "thì thư về email công ty ở Thông tin chung."
        ),
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
                FieldPanel("auto_reply"),
                FieldPanel("auto_reply_subject"),
                FieldPanel("auto_reply_body"),
            ],
            heading=_("Email cảm ơn người gửi (tiếng Anh)"),
        ),
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
