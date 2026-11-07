"""Xem trước bản nháp (docs/adr/0014): link sang frontend có chữ ký, API bản nháp chỉ nhận ký."""

from __future__ import annotations

import time
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from wagtail.models import Locale

from apps.core.revalidate import sign
from apps.pages.models import HomePage, Preview, SharedSection
from apps.pages.preview import preview_signature
from apps.pages.services import _raw_body

from .test_pages import assets, imported  # noqa: F401 - fixture dùng chung

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.usefixtures("imported"),
]

SECRET = "preview-secret"
preview_settings = override_settings(FRONTEND_URL="http://front.test", CMS_SHARED_SECRET=SECRET)


def _signed_get(client: APIClient, url: str) -> Any:
    timestamp = str(int(time.time()))
    return client.get(
        url,
        HTTP_X_BFC_TIMESTAMP=timestamp,
        HTTP_X_BFC_SIGNATURE=sign(SECRET, timestamp, b""),
    )


def _follow(response: HttpResponse) -> dict[str, str]:
    assert response.status_code == 302
    url = urlparse(response["Location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "http://front.test/api/draft"
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert query["sig"] == preview_signature(query["token"], query["path"], query["ts"])
    return query


@preview_settings
def test_page_preview_uses_unsaved_changes(api_client: APIClient) -> None:
    home = HomePage.objects.get(locale=Locale.get_default())
    home.title = "Bản nháp chưa lưu"
    request = RequestFactory().get("/admin/")
    query = _follow(home.serve_preview(request, ""))
    assert query["path"] == "/"

    res = _signed_get(api_client, f"/api/v1/pages/preview/{query['token']}")
    assert res.status_code == 200
    body = res.json()
    assert body["kind"] == "page"
    assert body["key"] == "home"
    assert body["locale"] == "vi"
    assert body["content"]["title"] == "Bản nháp chưa lưu"
    # Bản công khai không đổi
    assert api_client.get("/api/v1/pages/home").json()["title"] == "Trang chủ"

    en = HomePage.objects.get(locale__language_code="en")
    assert _follow(en.serve_preview(request, ""))["path"] == "/en"


@preview_settings
def test_preview_api_requires_signature_and_expires(api_client: APIClient) -> None:
    home = HomePage.objects.get(locale=Locale.get_default())
    token = _follow(home.serve_preview(RequestFactory().get("/admin/"), ""))["token"]
    url = f"/api/v1/pages/preview/{token}"
    assert api_client.get(url).status_code == 403
    assert _signed_get(api_client, "/api/v1/pages/preview/khong-co").status_code == 404
    Preview.objects.filter(token=token).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert _signed_get(api_client, url).status_code == 404
    # Tạo bản mới thì dọn bản đã hết hạn
    _follow(home.serve_preview(RequestFactory().get("/admin/"), ""))
    assert not Preview.objects.filter(token=token).exists()


@preview_settings
def test_shared_section_preview_on_home(api_client: APIClient, assets: Path) -> None:  # noqa: F811
    section = SharedSection.objects.get(locale=Locale.get_default())
    section.body = _raw_body(
        [
            {
                "type": "cta",
                "value": {
                    "kicker": "Nháp",
                    "title": "CTA đang sửa",
                    "image": None,
                    "quote_label": "",
                    "visit_label": "",
                },
            }
        ],
        lambda _ref: None,
    )
    query = _follow(section.serve_preview(RequestFactory().get("/admin/"), ""))
    content = _signed_get(api_client, f"/api/v1/pages/preview/{query['token']}").json()["content"]
    assert content["body"][-1]["value"]["title"] == "CTA đang sửa"


@override_settings(FRONTEND_URL="", CMS_SHARED_SECRET="")
def test_preview_not_configured() -> None:
    home = HomePage.objects.get(locale=Locale.get_default())
    res = home.serve_preview(RequestFactory().get("/admin/"), "")
    assert res.status_code == 200
    assert "FRONTEND_URL" in res.content.decode()
    assert not Preview.objects.exists()
