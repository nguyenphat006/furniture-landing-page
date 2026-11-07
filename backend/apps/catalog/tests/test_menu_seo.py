"""Menu con header lấy từ catalog, SEO riêng của trang, đồng bộ phân loại khi deploy (ADR 0012)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client
from rest_framework.test import APIClient

from apps.catalog.models import (
    Category,
    Material,
    MaterialMenuGroup,
    Product,
    ProductType,
)
from apps.catalog.services import ImportResult, import_catalog, sync_taxonomy

from .conftest import sample_data

MENU = [
    {"material": "wood", "name": "", "name_en": "", "items": [
        {"material": "wood", "name": "Gỗ teak", "name_en": "Teak"},
    ]},
    {"material": None, "name": "Kim loại", "name_en": "Metal", "items": [
        {"material": "aluminum", "name": "", "name_en": ""},
    ]},
]  # fmt: skip


def _get(client: APIClient, url: str, **params: Any) -> Any:
    res = client.get(url, params)
    assert res.status_code == 200, res.content
    return res.json()


@pytest.fixture
def with_menu(db: None, assets_dir: Path) -> ImportResult:
    return import_catalog({**sample_data(), "material_menu": MENU}, assets_dir=assets_dir)


@pytest.mark.usefixtures("with_menu")
def test_menu_lists_visible_categories_types_and_material_groups(api_client: APIClient) -> None:
    ProductType.objects.filter(slug="dining-sets").update(show_in_menu=False)
    Category.objects.filter(slug="sunloungers-daybeds").update(show_in_menu=False)

    en = _get(api_client, "/api/v1/catalog/menu", locale="en")

    assert en["products"] == [
        {
            "slug": "dining",
            "name": "Dining",
            "types": [{"slug": "dining-chairs", "name": "Dining chairs"}],
        }
    ]
    assert en["materials"] == [
        {"name": "Wood", "material": "wood", "items": [{"name": "Teak", "material": "wood"}]},
        {
            "name": "Metal",
            "material": None,
            "items": [{"name": "Aluminium", "material": "aluminum"}],
        },
    ]

    MaterialMenuGroup.objects.filter(material__isnull=True).update(show_in_menu=False)
    assert len(_get(api_client, "/api/v1/catalog/menu")["materials"]) == 1


def test_menu_group_without_material_needs_name(db: None) -> None:
    with pytest.raises(ValidationError):
        MaterialMenuGroup(name="").clean()
    MaterialMenuGroup(name="Kim loại").clean()
    assert str(MaterialMenuGroup(name="")) == "(chưa đặt tên)"


@pytest.mark.usefixtures("with_menu")
def test_seo_fields_in_api(api_client: APIClient) -> None:
    Material.objects.filter(slug="wood").update(
        seo_title="Gỗ teak FSC", seo_title_en="", seo_description_en="FSC teak", noindex=True
    )
    Category.objects.filter(slug="dining").update(seo_title_en="Outdoor dining")
    Product.objects.filter(slug="stack-chair").update(seo_title="Ghế xếp", noindex=True)

    vi = _get(api_client, "/api/v1/catalog/materials/wood")["seo"]
    en = _get(api_client, "/api/v1/catalog/materials/wood", locale="en")["seo"]
    # Trang tiếng Anh không lấy SEO tiếng Việt: trống thì frontend tự tạo
    assert vi == {"title": "Gỗ teak FSC", "description": "", "noindex": True}
    assert en == {"title": "", "description": "FSC teak", "noindex": True}
    assert _get(api_client, "/api/v1/catalog/materials")[0]["noindex"] is True

    taxonomy = _get(api_client, "/api/v1/catalog/taxonomy", locale="en")
    assert taxonomy["categories"][1]["seo"]["title"] == "Outdoor dining"

    product = _get(api_client, "/api/v1/catalog/products/stack-chair")
    assert product["seo"] == {"title": "Ghế xếp", "description": "", "noindex": True}
    listing = _get(api_client, "/api/v1/catalog/products")["results"]
    assert {p["slug"]: p["noindex"] for p in listing}["stack-chair"] is True


@pytest.mark.usefixtures("with_menu")
def test_sync_taxonomy_only_adds_missing(assets_dir: Path) -> None:
    Category.objects.filter(slug="dining").update(name="Đã sửa trong admin")
    data = sample_data()
    data["categories"].append(
        {"slug": "kids", "name": "Trẻ em", "name_en": "Kids", "description": "Bàn ghế nhỏ."}
    )
    data["types"].append(
        {
            "slug": "kids-chairs",
            "category": "kids",
            "is_set": False,
            "name": "Ghế",
            "name_en": "Chairs",
        }
    )
    data["materials"].append({"slug": "stone", "name": "Đá", "name_en": "Stone"})
    data["material_menu"] = [{"material": "stone", "items": []}]

    result = sync_taxonomy(data)

    assert result.created == {
        "categories": ["kids"],
        "types": ["kids-chairs"],
        "materials": ["stone"],
        "features": [],
    }
    assert result.total == 3
    # Không đè lên dữ liệu đã chỉnh, menu đã có thì giữ nguyên
    assert Category.objects.get(slug="dining").name == "Đã sửa trong admin"
    assert Category.objects.get(slug="kids").description == "Bàn ghế nhỏ."
    assert (
        Category.objects.get(slug="kids").sort_order
        > Category.objects.get(slug="dining").sort_order
    )
    assert result.menu_created is False
    assert MaterialMenuGroup.objects.count() == 2


def test_sync_taxonomy_creates_menu_on_empty_cms(db: None) -> None:
    data = {**sample_data(), "material_menu": MENU}
    result = sync_taxonomy(data)
    assert result.menu_created is True
    assert result.created["categories"] == ["sunloungers-daybeds", "dining"]
    assert sync_taxonomy(data).total == 0


def test_sync_taxonomy_command(db: None, tmp_path: Path) -> None:
    file = tmp_path / "data.json"
    file.write_text(json.dumps({**sample_data(), "material_menu": MENU}), encoding="utf-8")

    call_command("sync_taxonomy", file=file, dry_run=True)
    assert not Category.objects.exists()

    call_command("sync_taxonomy", file=file)
    assert Category.objects.count() == 2
    call_command("sync_taxonomy", file=file)
    assert Category.objects.count() == 2


def test_sync_taxonomy_reads_frontend_fixture(db: None) -> None:
    call_command("sync_taxonomy")
    assert MaterialMenuGroup.objects.filter(material__isnull=True).get().items.count() == 3


@pytest.mark.usefixtures("with_menu")
def test_menu_admin_pages_render(admin_client: Client) -> None:
    group = MaterialMenuGroup.objects.first()
    assert group is not None
    for url in (
        "/admin/snippets/catalog/materialmenugroup/",
        f"/admin/snippets/catalog/materialmenugroup/edit/{group.pk}/",
    ):
        assert admin_client.get(url).status_code == 200
