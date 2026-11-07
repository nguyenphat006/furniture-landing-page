from django.apps import AppConfig


class InquiriesConfig(AppConfig):
    name = "apps.inquiries"
    label = "inquiries"
    verbose_name = "Liên hệ"

    def ready(self) -> None:
        from auditlog.registry import auditlog

        from .models import Inquiry, InquirySettings

        # Chỉ ghi lịch sử phần nhân viên xử lý; nội dung khách gửi không đổi nên không cần,
        # và tránh nhân bản thông tin cá nhân sang bảng log.
        auditlog.register(Inquiry, include_fields=["status", "staff_note", "handled_by"])
        # Ai đổi email nhận thông báo hay ngưỡng chống spam, lúc nào
        auditlog.register(InquirySettings)
