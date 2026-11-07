"""Nội dung trang vật liệu: nhập từ mock, API danh sách / chi tiết, chia đoạn văn."""

from __future__ import annotations

from typing import Any

import pytest
from django.test import Client
from rest_framework.test import APIClient

from apps.catalog.models import Material
from apps.catalog.models.taxonomy import paragraphs
from apps.catalog.services import ImportResult


def _get(client: APIClient, url: str, status: int = 200, **params: Any) -> Any:
    res = client.get(url, params)
    assert res.status_code == status, res.content
    return res.json()


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("", []),
        ("Một đoạn.", ["Một đoạn."]),
        ("Dòng một\ndòng hai.\n\nĐoạn hai.", ["Dòng một dòng hai.", "Đoạn hai."]),
        ("A.\r\n\r\n  \r\nB.\n", ["A.", "B."]),
    ],
)
def test_paragraphs_split_on_blank_lines(value: str, expected: list[str]) -> None:
    assert paragraphs(value) == expected


def test_import_sets_material_content_and_images(catalog: ImportResult) -> None:
    wood = Material.objects.get(slug="wood")
    assert wood.heading == "Gỗ teak"
    assert wood.image is not None
    assert wood.image.title == "Gỗ teak"
    assert wood.craft_image is None
    assert "missing-craft.png" in catalog.missing_images
    # Vật liệu không có nội dung trang vẫn nhập được
    assert Material.objects.get(slug="rope").lede == ""


@pytest.mark.usefixtures("catalog")
def test_material_list_follows_locale_and_order(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/catalog/materials")
    en = _get(api_client, "/api/v1/catalog/materials", locale="en")

    assert [m["slug"] for m in vi] == ["wood", "aluminum", "rope"]
    assert vi[0]["name"] == "Gỗ teak"
    assert en[0]["name"] == "Teak"
    assert en[0]["lede"] == "FSC teak."
    assert en[0]["image"]["alt"] == "Teak"
    # Chưa có tên trang thì dùng nhãn bộ lọc theo ngôn ngữ
    assert en[1] == {
        "slug": "aluminum",
        "name": "Aluminium",
        "lede": "",
        "image": None,
        "noindex": False,
    }


@pytest.mark.usefixtures("catalog")
def test_material_detail_paragraphs_and_fallback(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/catalog/materials/wood")
    en = _get(api_client, "/api/v1/catalog/materials/wood", locale="en")

    assert vi["properties"] == ["Nhiều dầu. Ít cong vênh.", "Chuyển màu bạc."]
    assert en["properties"] == ["Rich in oils.", "Weathers to silver."]
    # Bản tiếng Anh còn trống thì trả tiếng Việt
    assert en["craft"] == ["Sấy và CNC."]
    assert en["care"] == ["Không sơn."]
    assert en["image"]["url"].startswith("http://testserver/")
    assert en["detail_image"]["url"].startswith("http://testserver/")
    assert en["use_image"] is None
    assert en["craft_image"] is None


@pytest.mark.usefixtures("catalog")
def test_material_detail_unknown_slug(api_client: APIClient) -> None:
    _get(api_client, "/api/v1/catalog/materials/marble", status=404)


@pytest.mark.usefixtures("catalog")
def test_material_edit_page_renders(admin_client: Client) -> None:
    wood = Material.objects.get(slug="wood")
    res = admin_client.get(f"/admin/snippets/catalog/material/edit/{wood.pk}/")
    assert res.status_code == 200
    assert "Trang vật liệu" in res.content.decode()
