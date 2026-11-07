from __future__ import annotations

from django.db.models import Prefetch

from .models import NavItem, SiteSettings


def site_settings() -> SiteSettings:
    """Bản ghi duy nhất kèm ảnh, menu đang hiện, link footer, mạng xã hội. Chưa có thì tạo rỗng."""
    obj = SiteSettings.load()
    site: SiteSettings = (
        SiteSettings.objects.select_related("logo", "logo_on_dark", "favicon", "og_image")
        .prefetch_related(
            Prefetch("nav_items", queryset=NavItem.objects.filter(visible=True)),
            "footer_links",
            "social_links",
        )
        .get(pk=obj.pk)
    )
    return site
