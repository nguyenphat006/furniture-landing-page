"""URL ảnh trong API: CMS_PUBLIC_URL thay host nội bộ (apps/core/media_url.py)."""

from django.test import RequestFactory, override_settings

from apps.core.media_url import absolute_url


def test_uses_request_host_by_default() -> None:
    request = RequestFactory(HTTP_HOST="testserver").get("/api/v1/site")
    assert absolute_url({"request": request}, "/media/a.webp") == "http://testserver/media/a.webp"
    assert absolute_url({}, "/media/a.webp") == "/media/a.webp"


@override_settings(CMS_PUBLIC_URL="https://cms.example.com/")
def test_public_url_overrides_internal_host() -> None:
    request = RequestFactory(HTTP_HOST="testserver").get("/api/v1/site")
    assert (
        absolute_url({"request": request}, "/media/a.webp")
        == "https://cms.example.com/media/a.webp"
    )
    # URL đã tuyệt đối (lưu trữ ngoài) giữ nguyên
    assert absolute_url({"request": request}, "https://cdn.example.com/a.webp").startswith(
        "https://cdn.example.com"
    )
