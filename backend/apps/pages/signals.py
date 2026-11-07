"""Trang hoặc section dùng chung được xuất bản / gỡ thì báo frontend làm mới cache.

Section dùng chung có thể nằm ở nhiều trang; frontend dùng một tag cache chung (CMS_TAG) nên mọi
trang đang chèn đều được làm mới cùng lúc.
"""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete
from wagtail.signals import page_published, page_unpublished, published, unpublished

from apps.core.revalidate import revalidate_on_commit

from .models import SharedSection
from .selectors import PAGE_MODELS


def _changed(sender: type, **kwargs: Any) -> None:
    revalidate_on_commit()


def connect() -> None:
    # Mọi loại trang có API (Trang chủ, trang pháp lý...)
    for model in PAGE_MODELS.values():
        uid = f"pages_{model._meta.model_name}"
        page_published.connect(_changed, sender=model, dispatch_uid=f"{uid}_published")
        page_unpublished.connect(_changed, sender=model, dispatch_uid=f"{uid}_unpublished")
        post_delete.connect(_changed, sender=model, dispatch_uid=f"{uid}_deleted")
    published.connect(_changed, sender=SharedSection, dispatch_uid="pages_shared_published")
    unpublished.connect(_changed, sender=SharedSection, dispatch_uid="pages_shared_unpublished")
    post_delete.connect(_changed, sender=SharedSection, dispatch_uid="pages_shared_deleted")
