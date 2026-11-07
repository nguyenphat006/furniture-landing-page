from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient
from wagtail.models import Locale

from apps.catalog.models import Product
from apps.catalog.services import ImportResult

pytestmark = pytest.mark.usefixtures("catalog")


def _get(client: APIClient, url: str, status: int = 200, **params: Any) -> Any:
    res = client.get(url, params)
    assert res.status_code == status, res.content
    return res.json()


def _slugs(data: dict[str, Any]) -> list[str]:
    return [p["slug"] for p in data["results"]]


def translate(product: Product, language: str, description: str) -> Product:
    """Tạo + xuất bản bản dịch như wagtail-localize: bản sao đồng bộ, chỉ đổi phần cần dịch."""
    translated: Product = product.copy_for_translation(Locale.objects.get(language_code=language))
    translated.description = description
    translated.save()
    translated.save_revision().publish()
    return translated


def test_taxonomy_labels_follow_locale(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/catalog/taxonomy")
    en = _get(api_client, "/api/v1/catalog/taxonomy", locale="en")

    assert [c["slug"] for c in vi["categories"]] == ["sunloungers-daybeds", "dining"]
    assert vi["categories"][0]["name"] == "Ghế nằm"
    assert en["categories"][0]["name"] == "Sunloungers"
    assert en["categories"][0]["cover"]["alt"] == "Sunloungers"
    assert en["categories"][1]["cover"] is None
    assert vi["categories"][0]["description"] == "Khung nhôm, đan tay."
    assert en["categories"][0]["description"] == "Aluminium frames, hand woven."
    # Mô tả là nội dung: bản tiếng Anh trống thì dùng tiếng Việt
    assert en["categories"][1]["description"] == ""
    assert en["categories"][1]["types"] == [
        {"slug": "dining-chairs", "name": "Dining chairs", "is_set": False},
        {"slug": "dining-sets", "name": "Dining sets", "is_set": True},
    ]
    assert [m["name"] for m in en["materials"]] == ["Wood", "Aluminium", "Rope"]
    assert [f["slug"] for f in en["features"]] == ["stackable", "adjustable"]


def test_product_list_and_filters(api_client: APIClient) -> None:
    url = "/api/v1/catalog/products"
    data = _get(api_client, url)
    assert data["count"] == 3
    assert _slugs(data) == ["atlas-sunlounger", "stack-chair", "dining-set-1551"]

    first = data["results"][0]
    assert first["category"] == "sunloungers-daybeds"
    assert first["image"]["url"].startswith("http://testserver/media/images/")
    assert first["image"]["url"].endswith(".webp")
    assert first["image"]["alt"] == "Atlas Sunlounger"
    assert first["is_fallback"] is False

    assert _slugs(_get(api_client, url, category="dining")) == ["stack-chair", "dining-set-1551"]
    assert _slugs(_get(api_client, url, type="dining-sets")) == ["dining-set-1551"]
    assert _slugs(_get(api_client, url, material=["wood", "rope"])) == ["dining-set-1551"]
    assert _slugs(_get(api_client, url, feature="stackable", category="dining")) == [
        "stack-chair",
        "dining-set-1551",
    ]
    paged = _get(api_client, url, page_size=2, page=2)
    assert (paged["total_pages"], _slugs(paged)) == (2, ["dining-set-1551"])


def test_product_detail_specs_and_set_items(api_client: APIClient) -> None:
    atlas = _get(api_client, "/api/v1/catalog/products/atlas-sunlounger")
    assert atlas["dimensions"] == {"length": 221, "width": 77.5, "height": 33}
    assert atlas["carton"] == {"length": 225, "width": 80, "height": 40}
    assert atlas["loading"] == {"40HC": 60}
    assert (atlas["assembly"], atlas["pcs_per_box"]) == ("fa", 1)
    assert len(atlas["images"]) == 2
    assert "image" not in atlas
    assert atlas["set_items"] == []

    chair = _get(api_client, "/api/v1/catalog/products/stack-chair")
    assert (chair["dimensions"], chair["assembly"], chair["loading"]) == (None, None, None)

    dining = _get(api_client, "/api/v1/catalog/products/dining-set-1551")
    assert dining["set_items"][0] == {
        "type": "dining-chairs",
        "qty": 4,
        "dimensions": {"height": 80},
        "assembly": "kd",
        "pcs_per_box": 2,
        "carton": None,
        "loading": None,
        "materials": ["rope"],
        "features": ["stackable"],
        "image": None,
    }


def test_errors(api_client: APIClient) -> None:
    assert _get(api_client, "/api/v1/catalog/products/nope", 404)["error"]["code"] == "not_found"
    bad = _get(api_client, "/api/v1/catalog/products", 400, locale="fr")
    assert "locale" in bad["error"]["details"]


def test_draft_and_unpublished_products_are_hidden(api_client: APIClient) -> None:
    Product.objects.get(slug="stack-chair").unpublish()
    _get(api_client, "/api/v1/catalog/products/stack-chair", 404)
    assert "stack-chair" not in _slugs(_get(api_client, "/api/v1/catalog/products"))


def test_english_falls_back_to_source_until_translated(api_client: APIClient) -> None:
    url = "/api/v1/catalog/products/atlas-sunlounger"
    before = _get(api_client, url, locale="en")
    assert before["is_fallback"] is True

    source = Product.objects.get(slug="atlas-sunlounger")
    source.description = "<p>Ghế tắm nắng</p>"
    source.save_revision().publish()
    translate(source, "en", "<p>Sun lounger</p>")

    after = _get(api_client, url, locale="en")
    assert after["is_fallback"] is False
    assert after["description"] == "<p>Sun lounger</p>"
    assert _get(api_client, url)["description"] == "<p>Ghế tắm nắng</p>"
    # Không bị trùng: bản gốc không xuất hiện thêm trong danh sách tiếng Anh
    en_list = _get(api_client, "/api/v1/catalog/products", locale="en")
    assert en_list["count"] == 3
    assert [p["is_fallback"] for p in en_list["results"]] == [False, True, True]


def test_translation_copies_synchronised_fields(catalog: ImportResult) -> None:
    source = Product.objects.get(slug="dining-set-1551")
    translated = translate(source, "en", "")
    translated.refresh_from_db()
    assert (translated.slug, translated.code, translated.product_type_id) == (
        source.slug,
        source.code,
        source.product_type_id,
    )
    assert sorted(m.slug for m in translated.materials.all()) == ["rope", "wood"]
    items = list(translated.set_items.order_by("sort_order"))
    assert [i.qty for i in items] == [4, 1]
    assert [m.slug for m in items[0].materials.all()] == ["rope"]
