"""Nhập nội dung trang từ frontend (fixtures/pages.json, do scripts/export_frontend_mock.mjs sinh).

Bản tiếng Việt là bản gốc; bản tiếng Anh tạo qua wagtail-localize (docs/adr/0003) với chữ tiếng Anh
lấy từ messages/en.json, nên trong admin vẫn sửa bản dịch bằng màn "Dịch" như sản phẩm.
Mặc định chỉ tạo khi CMS chưa có (chạy được mỗi lần deploy); `force` ghi đè nội dung đã sửa.
"""

from __future__ import annotations

import html
import json
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from django.db import transaction
from wagtail.models import Locale, Page, Site
from wagtail_localize.models import Translation, TranslationSource

from apps.catalog.services import get_or_create_image
from apps.core.services import ensure_locales

from .models import HomePage, PrivacyPage, SharedSection, TermsPage

ImageRef = Callable[[str | None], int | None]


@dataclass
class PagesImportResult:
    created: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    missing_images: list[str] = field(default_factory=list)


def _list(items: list[Any]) -> list[dict[str, Any]]:
    """ListBlock dạng mới (mỗi mục có id): wagtail-localize cần id để tách chuỗi dịch."""
    return [{"type": "item", "value": item, "id": str(uuid.uuid4())} for item in items]


def _raw_value(block_type: str, value: Any, image: ImageRef, shared: dict[str, int]) -> Any:
    if block_type == "hero":
        slides = [i for i in (image(ref) for ref in value.get("slides", [])) if i is not None]
        return {**value, "slides": _list(slides)}
    if block_type == "export":
        return {
            **value,
            "markets": _list(value.get("markets", [])),
            "stats": _list(value.get("stats", [])),
        }
    if block_type == "cta":
        return {**value, "image": image(value.get("image"))}
    if block_type == "factory":
        return {
            **value,
            "image": image(value.get("image")),
            "detail_image": image(value.get("detail_image")),
            "points": _list(value.get("points", [])),
        }
    if block_type == "faq":
        return {**value, "items": _list(value.get("items", []))}
    if block_type == "shared":
        return shared[value]
    if block_type == "legal":
        return {"heading": value["heading"], "body": legal_html(value["paragraphs"])}
    return value


def _raw_body(
    blocks: list[dict[str, Any]], image: ImageRef, shared: dict[str, int] | None = None
) -> str:
    return json.dumps(
        [
            {
                "type": b["type"],
                "value": _raw_value(b["type"], b["value"], image, shared or {}),
                "id": str(uuid.uuid4()),
            }
            for b in blocks
        ]
    )


def legal_html(paragraphs: list[str | list[str]]) -> str:
    """Đoạn văn (chuỗi) và danh sách (mảng chuỗi) → HTML rich text của Wagtail."""
    parts = []
    for item in paragraphs:
        if isinstance(item, list):
            items = "".join(f"<li>{html.escape(li, quote=False)}</li>" for li in item)
            parts.append(f"<ul>{items}</ul>")
        else:
            parts.append(f"<p>{html.escape(item, quote=False)}</p>")
    return "".join(parts)


def _strings(value: Any) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)


def string_pairs(vi: Any, en: Any) -> dict[str, str]:
    """Ghép chuỗi tiếng Việt với chuỗi tiếng Anh cùng vị trí (hai bản cùng cấu trúc)."""
    return {a: b for a, b in zip(_strings(vi), _strings(en), strict=True) if a and b}


def translate(instance: Any, locale: Locale, pairs: dict[str, str]) -> Any:
    """Tạo / cập nhật bản dịch qua wagtail-localize, điền sẵn chữ tiếng Anh rồi xuất bản."""
    source, created = TranslationSource.get_or_create_from_instance(instance)
    if not created:
        source.update_from_db()
    translation, _ = Translation.objects.get_or_create(
        source=source, target_locale=locale, defaults={"enabled": True}
    )
    po = translation.export_po()
    for entry in po:
        # Chuỗi trong wagtail-localize là HTML: ký tự đặc biệt đã escape, xuống dòng thành <br/>
        text = pairs.get(html.unescape(entry.msgid.replace("<br/>", "\n")))
        if text:
            entry.msgstr = html.escape(text, quote=False).replace("\n", "<br/>")
    translation.import_po(po)
    # save_target(publish=True) chỉ xuất bản sau khi transaction commit; lệnh nhập chạy trong một
    # transaction nên tự xuất bản ngay để bước sau (trang chèn section) thấy bản đã xuất bản
    source.create_or_update_translation(
        locale, publish=False, fallback=True, copy_parent_pages=True
    )
    target = instance.get_translation(locale)
    target.get_latest_revision().publish()
    return target


def _remove_welcome_page(home: HomePage) -> None:
    """Đặt trang chủ làm gốc site, xoá trang mẫu "Welcome" Wagtail tạo lúc cài (nếu còn)."""
    Site.objects.update(root_page=home)
    for page in Page.objects.filter(depth=2).exclude(pk=home.pk):
        if type(page.specific) is Page and not page.get_children().exists():
            page.delete()


@transaction.atomic
def import_pages(
    data: dict[str, Any], *, assets_dir: Path, force: bool = False
) -> PagesImportResult:
    ensure_locales()
    vi = Locale.get_default()
    en = Locale.objects.exclude(pk=vi.pk).get(language_code="en")
    result = PagesImportResult()

    def image(ref: str | None) -> int | None:
        if not ref:
            return None
        path = assets_dir / ref.lstrip("/")
        if not path.is_file():
            result.missing_images.append(ref)
            return None
        img, _ = get_or_create_image(path, title=path.stem.replace("_", " "))
        return int(img.pk)

    shared: dict[str, int] = {}
    for key, item in data.get("shared", {}).items():
        section = SharedSection.objects.filter(locale=vi, name=item["name"]).first()
        if section is not None and not force:
            shared[key] = section.pk
            result.skipped.append(f"shared:{key}")
            continue
        section = section or SharedSection(locale=vi, name=item["name"])
        section.body = _raw_body([item["vi"]], image)
        section.save()
        section.save_revision().publish()
        translate(section, en, string_pairs(item["vi"], item["en"]))
        shared[key] = section.pk
        result.created.append(f"shared:{key}")

    _assign_slots(data.get("slots", {}), shared, force, result)
    home = _import_home(data["home"], image, shared, vi, en, force, result)
    for key, item in data.get("legal", {}).items():
        _import_legal(key, item, home, en, force, result)
    return result


def _assign_slots(
    slots: dict[str, str], shared: dict[str, int], force: bool, result: PagesImportResult
) -> None:
    """Gắn Section dùng chung vào ô ở Cài đặt (vd FAQ trang Năng lực) nếu ô còn trống."""
    from apps.sitesettings.models import SiteSettings

    settings_obj = SiteSettings.load()
    changed = False
    for field_name, key in slots.items():
        if key not in shared:
            continue
        if getattr(settings_obj, f"{field_name}_id") is not None and not force:
            result.skipped.append(f"slot:{field_name}")
            continue
        setattr(settings_obj, f"{field_name}_id", shared[key])
        changed = True
        result.created.append(f"slot:{field_name}")
    if changed:
        settings_obj.save()


def _import_legal(
    key: str,
    item: dict[str, Any],
    home: HomePage,
    en: Locale,
    force: bool,
    result: PagesImportResult,
) -> None:
    model = {"privacy": PrivacyPage, "terms": TermsPage}[key]
    page = model.objects.filter(locale=home.locale).first()
    if page is not None and not force:
        result.skipped.append(key)
        return
    if page is None:
        page = model(title=item["title"], slug=item["slug"], locale=home.locale)
        home.add_child(instance=page)
    page.title = item["title"]
    page.body = _raw_body(item["vi"]["body"], lambda _ref: None)
    page.save_revision().publish()
    pairs = string_pairs(item["vi"], item["en"])
    pairs[item["title"]] = item["title_en"]
    translate(page, en, pairs)
    result.created.append(key)


def _import_home(
    home_data: dict[str, Any],
    image: ImageRef,
    shared: dict[str, int],
    vi: Locale,
    en: Locale,
    force: bool,
    result: PagesImportResult,
) -> HomePage:
    home: HomePage | None = HomePage.objects.filter(locale=vi).first()
    if home is not None and not force:
        result.skipped.append("home")
        return home
    if home is None:
        home = HomePage(title=home_data["title"], slug="trang-chu", locale=vi)
        Page.get_first_root_node().add_child(instance=home)
    home.title = home_data["title"]
    home.body = _raw_body(home_data["vi"]["body"], image, shared)
    home.save_revision().publish()
    _remove_welcome_page(home)
    pairs = string_pairs(home_data["vi"], home_data["en"])
    pairs[home_data["title"]] = home_data["title_en"]
    translate(home, en, pairs)
    result.created.append("home")
    return home
