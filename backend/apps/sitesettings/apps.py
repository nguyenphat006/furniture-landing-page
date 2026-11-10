from django.apps import AppConfig


class SiteSettingsConfig(AppConfig):
    name = "apps.sitesettings"
    label = "sitesettings"
    verbose_name = "Thông tin chung"

    def ready(self) -> None:
        from auditlog.registry import auditlog

        from . import signals
        from .models import (
            FloatingAction,
            FooterLink,
            NavItem,
            SiteLanguage,
            SiteSettings,
            SocialLink,
        )

        # Ai đổi số điện thoại, logo... lúc nào. Menu, nút nổi, link footer, mạng xã hội là bản ghi
        # con (InlinePanel) nên đăng ký riêng để log có chi tiết từng mục (QC 09/11)
        auditlog.register(SiteSettings)
        for model in (NavItem, SiteLanguage, FloatingAction, FooterLink, SocialLink):
            auditlog.register(model)
        signals.connect()
