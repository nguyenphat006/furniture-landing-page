"""Thao tác ghi của thông tin chung."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from django.db import transaction

from apps.catalog.services import get_or_create_image

from .models import FloatingAction, NavItem, SiteSettings

TEXT_FIELDS = (
    "name",
    "tagline",
    "tagline_en",
    "legal_name",
    "legal_name_en",
    "tax_code",
    "address",
    "address_en",
    "phone",
    "email",
    "whatsapp_url",
    "zalo_url",
    "hours",
    "hours_en",
    "maps_url",
    "maps_embed_url",
    "footer_blurb",
    "footer_blurb_en",
    "seo_title",
    "seo_title_en",
    "seo_description",
    "seo_description_en",
)
IMAGE_FIELDS = ("logo", "logo_on_dark", "favicon", "og_image")

# Cụm nút nổi mặc định khi chưa có nút nào (link lấy từ tab Liên hệ)
DEFAULT_FLOATING = ("search", "phone", "whatsapp", "zalo", "email")
# Có sẵn nhưng tắt Hiện, admin bật khi cần (user 09/11: chỉ giữ Tìm kiếm, Gọi điện, Email)
DEFAULT_FLOATING_OFF = ("whatsapp", "zalo")


def ensure_default_floating(obj: SiteSettings) -> None:
    """Tạo cụm nút nổi mặc định nếu admin chưa có nút nào. Không đụng nút đã có."""
    if obj.pk and obj.floating_actions.exists():
        return
    obj.floating_actions.set(
        [
            FloatingAction(kind=kind, sort_order=order, visible=kind not in DEFAULT_FLOATING_OFF)
            for order, kind in enumerate(DEFAULT_FLOATING)
        ]
    )


@transaction.atomic
def import_site(data: dict[str, Any], *, assets_dir: Path) -> list[str]:
    """Ghi thông tin chung từ dữ liệu frontend (site.json). Trả về danh sách ảnh không tìm thấy.

    Chạy lại được: ghi đè các trường có trong dữ liệu; menu được thay bằng menu trong dữ liệu.
    """
    obj = SiteSettings.load()
    missing: list[str] = []
    for field in TEXT_FIELDS:
        if field in data:
            setattr(obj, field, data[field] or "")
    for field in IMAGE_FIELDS:
        ref = data.get(field)
        if not ref:
            continue
        path = assets_dir / str(ref).lstrip("/")
        if not path.is_file():
            missing.append(ref)
            continue
        image, _ = get_or_create_image(path, title=f"{obj.name} {field}")
        setattr(obj, field, image)
    obj.full_clean()
    if "nav" in data:
        obj.nav_items.set(
            [
                NavItem(
                    target=item["target"],
                    url=item.get("url", ""),
                    label=item.get("label", ""),
                    label_en=item.get("label_en", ""),
                    visible=item.get("visible", True),
                    sort_order=order,
                )
                for order, item in enumerate(data["nav"])
            ]
        )
    ensure_default_floating(obj)
    obj.save()
    return missing
