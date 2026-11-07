from django.apps import AppConfig


class SiteSettingsConfig(AppConfig):
    name = "apps.sitesettings"
    label = "sitesettings"
    verbose_name = "Thông tin chung"

    def ready(self) -> None:
        from auditlog.registry import auditlog

        from . import signals
        from .models import SiteSettings

        # Ai đổi số điện thoại, logo, menu... lúc nào (menu, footer, mạng xã hội lưu cùng bản ghi)
        auditlog.register(SiteSettings)
        signals.connect()
