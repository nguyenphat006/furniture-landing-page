from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"
    verbose_name = "Tài khoản"

    def ready(self) -> None:
        from auditlog.registry import auditlog

        from .models import User

        # Ghi lịch sử thay đổi tài khoản (không bao giờ ghi mật khẩu)
        auditlog.register(User, exclude_fields=["password", "last_login"], m2m_fields={"groups"})
