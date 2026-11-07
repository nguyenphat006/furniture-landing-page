from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
    verbose_name = "Lõi"

    def ready(self) -> None:
        from django.contrib import admin
        from django.http import HttpRequest

        # Django admin (/django-admin/) chỉ cho superuser: dùng để xem audit log và log đăng nhập.
        # Quản trị nội dung hằng ngày ở Wagtail admin (/admin/).
        def superuser_only(request: HttpRequest) -> bool:
            user = request.user
            return bool(user.is_active and user.is_superuser)

        admin.site.has_permission = superuser_only  # type: ignore[method-assign]
        admin.site.site_header = "BFC CMS: nhật ký hệ thống"
        admin.site.site_title = "BFC CMS"
