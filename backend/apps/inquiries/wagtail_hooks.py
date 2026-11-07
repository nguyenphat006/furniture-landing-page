"""Màn hình admin "Liên hệ": danh sách yêu cầu, lọc theo trạng thái / mục đích, xử lý từng yêu cầu.

- Không có nút Thêm: yêu cầu chỉ đến từ website (InquiryPermissionPolicy chặn "add").
- Phần khách gửi là chỉ đọc; nhân viên sửa trạng thái và ghi chú nội bộ.
- Tệp đính kèm tải qua view có kiểm tra quyền (views.py), không có URL công khai.
"""

from __future__ import annotations

from typing import Any

from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from wagtail import hooks
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, ObjectList, Panel, TabbedInterface
from wagtail.admin.ui.tables import Column, DateColumn
from wagtail.permission_policies import ModelPermissionPolicy
from wagtail.permissions import register_permission_policy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import EditView, SnippetViewSet

from . import services, views
from .models import Inquiry


class InquiryPermissionPolicy(ModelPermissionPolicy):
    def user_has_permission(self, user: Any, action: str) -> bool:
        if action == "add":
            return False
        return bool(super().user_has_permission(user, action))


register_permission_policy(Inquiry, InquiryPermissionPolicy(Inquiry))


class AttachmentPanel(Panel):
    """Tệp đính kèm + kết quả quét virus (kho riêng tư nên không dùng FieldPanel được)."""

    class BoundPanel(Panel.BoundPanel):
        def render_html(self, parent_context: Any = None) -> str:
            inquiry = self.instance
            scan = Inquiry.ScanStatus
            status = inquiry.scan_status
            if status == scan.NONE:
                return str(_("Không có tệp đính kèm."))
            if status == scan.INFECTED:
                return format_html(
                    '<p class="error-message">{}: <strong>{}</strong></p><p class="help">{}</p>',
                    inquiry.attachment_name,
                    _("phát hiện virus, tệp đã bị xoá"),
                    inquiry.scan_detail,
                )
            notes = {
                scan.CLEAN: _("Đã quét virus: sạch."),
                scan.NOT_SCANNED: _(
                    "CHƯA quét virus (chưa cấu hình máy quét). Chỉ mở bằng phần mềm đã cập nhật."
                ),
                scan.ERROR: _("Quét virus bị lỗi, đang chờ quét lại: {detail}").format(
                    detail=inquiry.scan_detail
                ),
            }
            if not inquiry.attachment_downloadable:
                return format_html(
                    '<p>{}</p><p class="help">{} {}</p>',
                    inquiry.attachment_name,
                    notes[status],
                    _("Chưa tải được cho tới khi quét sạch."),
                )
            url = reverse("inquiries_attachment", args=[inquiry.public_id])
            return format_html(
                '<p><a class="button button-secondary" href="{}">{} {}</a></p>'
                '<p class="help">{}</p>',
                url,
                _("Tải"),
                inquiry.attachment_name,
                notes[status],
            )


class HandlerPanel(Panel):
    """Người xử lý gần nhất (FieldPanel chỉ đọc hiện chữ "None" khi trống)."""

    class BoundPanel(Panel.BoundPanel):
        def render_html(self, parent_context: Any = None) -> str:
            user = self.instance.handled_by
            if user is None:
                return str(_("Chưa có ai xử lý."))
            return format_html("<p>{}</p>", user.get_full_name() or user.get_username())


def _read_only(name: str) -> FieldPanel:
    return FieldPanel(name, read_only=True)


class InquiryEditView(EditView):
    def save_instance(self) -> Any:
        services.assign_handler(self.form.instance, actor=self.request.user)
        return super().save_instance()


class InquiryViewSet(SnippetViewSet):
    model = Inquiry
    icon = "mail"
    menu_label = _("Liên hệ")
    menu_name = "inquiries"
    menu_order = 300
    add_to_admin_menu = True
    edit_view_class = InquiryEditView
    # Danh sách chỉ hiện thông tin chính; đầy đủ (liên hệ, nội dung, tệp) ở trang chi tiết.
    # Cột đầu là link mở trang chi tiết (Wagtail chỉ gắn link cho cột đầu), nên phải là tên khách.
    list_display = [
        "name",
        Column("company", label=_("Công ty")),
        Column("get_purpose_display", label=_("Mục đích")),
        DateColumn("created_at", label=_("Ngày gửi")),
        Column("get_status_display", label=_("Trạng thái")),
    ]
    list_filter = ["status", "purpose", "locale", "scan_status"]
    list_per_page = 50
    ordering = ["-created_at", "-id"]
    edit_handler = TabbedInterface(
        [
            ObjectList(
                [
                    MultiFieldPanel(
                        [
                            _read_only("purpose"),
                            _read_only("name"),
                            _read_only("email"),
                            _read_only("company"),
                            _read_only("country"),
                            _read_only("phone"),
                            _read_only("model_codes"),
                            _read_only("locale"),
                            _read_only("message"),
                        ],
                        heading=_("Khách gửi"),
                    ),
                    AttachmentPanel(heading=_("Tệp đính kèm")),
                    MultiFieldPanel(
                        [
                            FieldPanel("status"),
                            FieldPanel("staff_note"),
                            HandlerPanel(heading=_("Người xử lý")),
                        ],
                        heading=_("Xử lý"),
                    ),
                ],
                heading=_("Yêu cầu"),
            ),
        ]
    )


register_snippet(InquiryViewSet)


@hooks.register("register_admin_urls")
def register_admin_urls() -> list[Any]:
    return [
        path(
            "inquiries/<uuid:public_id>/attachment",
            views.download_attachment,
            name="inquiries_attachment",
        )
    ]
