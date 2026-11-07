"""Xem trước sản phẩm (docs/adr/0014): bản đang sửa đi qua bảng Preview tới frontend."""

from __future__ import annotations

import time
from urllib.parse import parse_qs, urlparse

import pytest
from django.test import RequestFactory, override_settings
from rest_framework.test import APIClient
from wagtail.models import Locale

from apps.catalog.models import Product
from apps.catalog.services import ImportResult
from apps.core.revalidate import sign

SECRET = "preview-secret"


@pytest.mark.django_db
@override_settings(FRONTEND_URL="http://front.test", CMS_SHARED_SECRET=SECRET)
def test_product_preview(catalog: ImportResult, api_client: APIClient) -> None:
    product = Product.objects.filter(locale=Locale.get_default()).first()
    assert product is not None
    product.name = "Tên đang sửa"
    res = product.serve_preview(RequestFactory().get("/admin/"), "")
    assert res.status_code == 302
    query = {k: v[0] for k, v in parse_qs(urlparse(res["Location"]).query).items()}
    category = product.product_type.category.slug
    assert query["path"] == f"/products/{category}/{product.slug}"

    timestamp = str(int(time.time()))
    data = api_client.get(
        f"/api/v1/pages/preview/{query['token']}",
        HTTP_X_BFC_TIMESTAMP=timestamp,
        HTTP_X_BFC_SIGNATURE=sign(SECRET, timestamp, b""),
    ).json()
    assert data["kind"] == "product"
    assert data["key"] == product.slug
    assert data["content"]["name"] == "Tên đang sửa"
    assert data["content"]["is_fallback"] is False
