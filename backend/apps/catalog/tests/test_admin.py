"""Màn hình admin catalog mở được (danh sách, sửa, thêm) với tài khoản quản trị."""

import pytest
from django.db.models import Model
from django.test import Client
from django.urls import reverse

from apps.accounts.tests.factories import create_user
from apps.catalog.models import Category, Feature, Material, Product, ProductType
from apps.catalog.services import ImportResult


@pytest.fixture
def admin_client(catalog: ImportResult, client: Client) -> Client:
    client.force_login(create_user(is_superuser=True, is_staff=True))
    return client


@pytest.mark.parametrize("model", [Product, Category, ProductType, Material, Feature])
def test_listing_and_add_pages_render(admin_client: Client, model: type[Model]) -> None:
    opts = model._meta
    base = f"wagtailsnippets_{opts.app_label}_{opts.model_name}"
    assert admin_client.get(reverse(f"{base}:list")).status_code == 200
    assert admin_client.get(reverse(f"{base}:add")).status_code == 200
    obj = model._default_manager.first()
    assert obj is not None
    assert admin_client.get(reverse(f"{base}:edit", args=[obj.pk])).status_code == 200


def test_product_listing_search_and_filter(admin_client: Client) -> None:
    url = reverse("wagtailsnippets_catalog_product:list")
    res = admin_client.get(url, {"q": "2BFC2756"})
    assert res.status_code == 200
    assert b"Atlas Sunlounger" in res.content
    assert b"Stack Chair" not in res.content
