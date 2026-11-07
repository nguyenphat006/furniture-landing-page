from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from wagtail.images import get_image_model

from apps.catalog.models import Category, Product, ProductType, SetItem
from apps.catalog.services import ImportResult, import_catalog

from .conftest import sample_data


def test_import_creates_taxonomy_products_and_images(catalog: ImportResult) -> None:
    assert (catalog.created, catalog.updated) == (3, 0)
    assert catalog.images == 6
    assert catalog.missing_images == ["missing-craft.png", "/products/missing.png"]

    assert list(Category.objects.values_list("slug", flat=True)) == [
        "sunloungers-daybeds",
        "dining",
    ]
    assert ProductType.objects.get(slug="dining-sets").is_set is True
    assert Category.objects.get(slug="sunloungers-daybeds").cover is not None

    atlas = Product.objects.get(slug="atlas-sunlounger")
    assert atlas.live is True
    assert atlas.latest_revision is not None
    assert [i.image.title for i in atlas.images.all()] == ["Atlas Sunlounger"] * 2
    assert float(atlas.width or 0) == 77.5
    assert atlas.loading_40hc == 60
    assert atlas.carton_height == 40


def test_set_items_keep_order_and_specs(catalog: ImportResult) -> None:
    items = list(Product.objects.get(slug="dining-set-1551").set_items.order_by("sort_order"))
    assert [(i.product_type.slug, i.qty) for i in items] == [
        ("dining-chairs", 4),
        ("dining-chairs", 1),
    ]
    first = items[0]
    assert [m.slug for m in first.materials.all()] == ["rope"]
    assert [f.slug for f in first.features.all()] == ["stackable"]
    assert (first.assembly, first.pcs_per_box, first.height) == ("kd", 2, 80)


@pytest.mark.django_db
def test_import_is_idempotent(assets_dir: Path) -> None:
    import_catalog(sample_data(), assets_dir=assets_dir)
    data = sample_data()
    data["products"][0]["name"] = "Atlas Sunlounger II"
    data["products"][2]["setItems"].pop()
    second = import_catalog(data, assets_dir=assets_dir)

    assert (second.created, second.updated, second.images) == (0, 3, 0)
    assert Product.objects.count() == 3
    assert get_image_model().objects.count() == 6
    assert Product.objects.get(slug="atlas-sunlounger").name == "Atlas Sunlounger II"
    assert SetItem.objects.count() == 1


@pytest.mark.django_db
def test_import_mock_command_reads_frontend_fixture(tmp_path: Path) -> None:
    # Fixture thật của frontend, ảnh trỏ vào thư mục rỗng: chỉ kiểm tra đọc file + nhập dữ liệu
    call_command("import_mock", assets=tmp_path)
    assert Product.objects.filter(live=True).count() == 50
    assert ProductType.objects.filter(is_set=True).count() == 2


def test_import_mock_command_validates_paths(tmp_path: Path) -> None:
    with pytest.raises(CommandError):
        call_command("import_mock", file=tmp_path / "none.json")
    with pytest.raises(CommandError):
        call_command("import_mock", assets=tmp_path / "none")
