"""Gom route của API /api/v1/. Mỗi app khai báo apps/<app>/api/urls.py rồi include ở đây."""

from django.urls import include, path

app_name = "api"

urlpatterns = [
    path("", include("apps.core.api.urls")),
    path("", include("apps.catalog.api.urls")),
    path("", include("apps.inquiries.api.urls")),
    path("", include("apps.sitesettings.api.urls")),
    path("", include("apps.pages.api.urls")),
    path("", include("apps.news.api.urls")),
]
