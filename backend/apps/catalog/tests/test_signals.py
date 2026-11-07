"""Xuất bản / gỡ / xoá sản phẩm và sửa phân loại thì hẹn gọi webhook revalidate sau commit."""

from collections.abc import Callable
from typing import Any
from unittest.mock import patch

from apps.catalog.models import Material, Product
from apps.catalog.services import ImportResult

Capture = Callable[..., Any]


def _calls(capture: Capture, action: Callable[[], object]) -> int:
    with patch("apps.core.revalidate.send_revalidate") as send, capture(execute=True):
        action()
    return send.call_count


def test_publish_unpublish_delete_trigger(
    catalog: ImportResult, django_capture_on_commit_callbacks: Capture
) -> None:
    product = Product.objects.get(slug="stack-chair")
    assert (
        _calls(django_capture_on_commit_callbacks, lambda: product.save_revision().publish()) >= 1
    )
    assert _calls(django_capture_on_commit_callbacks, product.unpublish) >= 1
    assert _calls(django_capture_on_commit_callbacks, product.delete) >= 1


def test_draft_save_does_not_trigger(
    catalog: ImportResult, django_capture_on_commit_callbacks: Capture
) -> None:
    product = Product.objects.get(slug="stack-chair")
    product.name = "Nháp"
    assert _calls(django_capture_on_commit_callbacks, product.save_revision) == 0


def test_taxonomy_change_triggers(
    catalog: ImportResult, django_capture_on_commit_callbacks: Capture
) -> None:
    wood = Material.objects.get(slug="wood")
    wood.name_en = "Teak wood"
    assert _calls(django_capture_on_commit_callbacks, wood.save) == 1
