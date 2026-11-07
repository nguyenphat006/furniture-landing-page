"""URL gốc.

- /admin/          Wagtail admin (nơi quản trị viên làm việc hằng ngày)
- /django-admin/   Django admin, chỉ superuser: xem nhật ký audit (auditlog) và log đăng nhập (axes)
- /api/v1/         API nội bộ cho Next.js (config/api.py)
- /healthz /readyz kiểm tra sống / sẵn sàng
Không phục vụ trang HTML công khai: site công khai là Next.js (headless).
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls

from apps.core.views import healthz, readyz

urlpatterns = [
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    path("admin/", include(wagtailadmin_urls)),
    path("django-admin/", admin.site.urls),
    path("documents/", include(wagtaildocs_urls)),
    path("api/v1/", include("config.api")),
]

if settings.DEBUG:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="api-docs"),
        *static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT),
    ]
