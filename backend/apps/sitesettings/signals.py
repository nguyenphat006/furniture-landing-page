"""Thông tin chung đổi thì báo frontend làm mới cache (apps/core/revalidate.py).

Admin lưu bản ghi cùng menu, footer, mạng xã hội trong một transaction (ATOMIC_REQUESTS), webhook
gửi sau commit nên frontend đọc được bản đã lưu đủ.
"""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_save

from apps.core.revalidate import revalidate_on_commit

from .models import SiteSettings


def _changed(sender: type, **kwargs: Any) -> None:
    revalidate_on_commit()


def connect() -> None:
    post_save.connect(_changed, sender=SiteSettings, dispatch_uid="sitesettings_saved")
