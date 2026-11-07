"""Nội dung catalog đổi thì báo frontend làm mới cache (apps/core/revalidate.py)."""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete, post_save
from wagtail.signals import published, unpublished

from apps.core.revalidate import revalidate_on_commit

from .models import Category, Feature, Material, MaterialMenuGroup, Product, ProductType


def _changed(sender: type, **kwargs: Any) -> None:
    revalidate_on_commit()


def connect() -> None:
    # Sản phẩm: chỉ khi xuất bản / gỡ / xoá (lưu nháp không đổi gì trên web)
    published.connect(_changed, sender=Product, dispatch_uid="catalog_product_published")
    unpublished.connect(_changed, sender=Product, dispatch_uid="catalog_product_unpublished")
    post_delete.connect(_changed, sender=Product, dispatch_uid="catalog_product_deleted")
    # Phân loại không có nháp: lưu là có hiệu lực ngay
    for model in (Category, ProductType, Material, Feature, MaterialMenuGroup):
        uid = f"catalog_{model._meta.model_name}"
        post_save.connect(_changed, sender=model, dispatch_uid=f"{uid}_saved")
        post_delete.connect(_changed, sender=model, dispatch_uid=f"{uid}_deleted")
