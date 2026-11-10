"""Bài tin tức xuất bản / gỡ / xoá thì báo frontend làm mới cache (apps/core/revalidate.py)."""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete
from wagtail.signals import published, unpublished

from apps.core.revalidate import revalidate_on_commit

from .models import NewsPost


def _changed(sender: type, **kwargs: Any) -> None:
    revalidate_on_commit()


def connect() -> None:
    # Lưu nháp không đổi gì trên web nên không báo
    published.connect(_changed, sender=NewsPost, dispatch_uid="news_post_published")
    unpublished.connect(_changed, sender=NewsPost, dispatch_uid="news_post_unpublished")
    post_delete.connect(_changed, sender=NewsPost, dispatch_uid="news_post_deleted")
