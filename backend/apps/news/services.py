"""Nhập bài tin tức mẫu (fixtures/news.json, do scripts/export_frontend_mock.mjs sinh) và gắn
section "Cuộc sống tại BFC" vào Trang chủ.

Bản tiếng Việt là bản gốc; bản tiếng Anh tạo qua wagtail-localize với chữ tiếng Anh có sẵn trong dữ
liệu, nên admin vẫn sửa bản dịch bằng màn "Dịch" như sản phẩm. Mặc định bài đã có (cùng slug) thì bỏ
qua để không ghi đè phần đã sửa trong admin; `force` ghi đè.
"""

from __future__ import annotations

import html
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from django.db import transaction
from wagtail.images.models import AbstractImage
from wagtail.models import Locale
from wagtail.rich_text import RichText

from apps.catalog.services import _resolve_asset, get_or_create_image, warm_renditions
from apps.core.services import ensure_locales
from apps.pages.models import HomePage
from apps.pages.services import translate

from .models import NewsPost

# Mỗi đoạn / tiêu đề phụ / mục danh sách là một chuỗi dịch trong wagtail-localize
_SEGMENT = re.compile(r"<(p|h2|h3|li)>(.*?)</\1>", re.S)


@dataclass
class NewsImportResult:
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    missing_images: list[str] = field(default_factory=list)
    home_section: bool = False


def compact_html(value: str) -> str:
    """Bỏ khoảng trắng / xuống dòng giữa các thẻ (định dạng rich text Wagtail lưu)."""
    return re.sub(r">\s+<", "><", value.strip())


def _segments(body: str) -> list[str]:
    return [html.unescape(m.group(2)).strip() for m in _SEGMENT.finditer(body)]


def body_pairs(vi: str, en: str) -> dict[str, str]:
    """Ghép từng đoạn tiếng Việt với đoạn tiếng Anh cùng vị trí (hai bản cùng cấu trúc)."""
    return dict(zip(_segments(vi), _segments(en), strict=True))


def _publish(post: NewsPost) -> None:
    post.full_clean(exclude=["translation_key"])
    post.save()
    post.save_revision().publish()


class _Assets:
    """Ảnh trong bài mẫu: tìm trong thư mục ảnh, tạo ảnh Wagtail một lần, ghi lại ảnh thiếu."""

    def __init__(self, assets_dir: Path, result: NewsImportResult) -> None:
        self.dir = assets_dir
        self.result = result

    def __call__(self, src: str, title: str) -> AbstractImage | None:
        if not src:
            return None
        path = _resolve_asset(self.dir, src)
        if not path.is_file():
            if src not in self.result.missing_images:
                self.result.missing_images.append(src)
            return None
        image, _ = get_or_create_image(path, title=title)
        warm_renditions(image)
        return image


def _table(block: dict[str, Any]) -> dict[str, Any]:
    return {
        "columns": [{"type": "text", "heading": h} for h in block["columns"]["vi"]],
        "rows": [{"values": list(row)} for row in block["rows"]["vi"]],
        "caption": block.get("caption", {}).get("vi", ""),
    }


def stream_blocks(
    blocks: list[dict[str, Any]], image: Callable[[str, str], AbstractImage | None], title: str
) -> tuple[list[tuple[str, Any]], dict[str, str]]:
    """Khối song ngữ của bài mẫu -> (giá trị StreamField bản tiếng Việt, cặp chuỗi vi -> en).

    Khối có ảnh mà ảnh không tìm thấy thì bỏ qua cả khối (gallery bỏ ảnh đó).
    """
    stream: list[tuple[str, Any]] = []
    pairs: dict[str, str] = {}

    def text(value: dict[str, str] | None) -> str:
        if not value or not value.get("vi"):
            return ""
        pairs[value["vi"]] = value["en"]
        return value["vi"]

    for block in blocks:
        kind = block["type"]
        if kind == "paragraph":
            pairs.update(body_pairs(block["html"]["vi"], block["html"]["en"]))
            stream.append(("paragraph", RichText(compact_html(block["html"]["vi"]))))
        elif kind == "image":
            img = image(block["image"], title)
            if img is not None:
                value = {"image": img, "caption": text(block.get("caption")), "size": block["size"]}
                stream.append(("image", value))
        elif kind == "gallery":
            items = [
                {"image": img, "caption": text(item.get("caption"))}
                for item in block["images"]
                if (img := image(item["image"], title)) is not None
            ]
            if len(items) >= 2:
                caption = text(block.get("caption"))
                value = {"layout": block["layout"], "images": items, "caption": caption}
                stream.append(("gallery", value))
        elif kind == "image_text":
            img = image(block["image"], title)
            if img is not None:
                pairs.update(body_pairs(block["html"]["vi"], block["html"]["en"]))
                value = {
                    "image": img,
                    "image_position": block["imagePosition"],
                    "heading": text(block.get("heading")),
                    "text": RichText(compact_html(block["html"]["vi"])),
                }
                stream.append(("image_text", value))
        elif kind == "quote":
            value = {
                "quote": text(block["quote"]),
                "author": block.get("author", ""),
                "role": text(block.get("role")),
            }
            stream.append(("quote", value))
        elif kind == "table":
            for lang_vi, lang_en in zip(
                block["columns"]["vi"], block["columns"]["en"], strict=True
            ):
                pairs[lang_vi] = lang_en
            for row_vi, row_en in zip(block["rows"]["vi"], block["rows"]["en"], strict=True):
                pairs.update(zip(row_vi, row_en, strict=True))
            text(block.get("caption"))
            stream.append(("table", _table(block)))
        elif kind == "button":
            stream.append(("button", {"label": text(block["label"]), "url": block["url"]}))
        else:
            raise ValueError(f"Khối lạ trong bài mẫu: {kind}")
    return stream, pairs


@transaction.atomic
def import_news(
    data: dict[str, Any], *, assets_dir: Path, force: bool = False, home_section: bool = True
) -> NewsImportResult:
    vi, en = ensure_locales()[:2]
    result = NewsImportResult()
    image = _Assets(assets_dir, result)

    for item in data["posts"]:
        slug = item["slug"]
        post = NewsPost.objects.filter(slug=slug, locale=vi).first()
        if post is not None and not force:
            result.skipped.append(slug)
            continue
        is_new = post is None
        if post is None:
            post = NewsPost(slug=slug, locale=vi)
        text_vi, text_en = item["vi"], item["en"]
        post.title = text_vi["title"]
        post.excerpt = text_vi["excerpt"]
        post.kind = item["kind"]
        post.date = item["date"]
        post.cover = image(item.get("cover", ""), text_vi["title"])
        stream, body = stream_blocks(item["blocks"], image, text_vi["title"])
        post.body = stream
        _publish(post)

        pairs = {text_vi["title"]: text_en["title"], text_vi["excerpt"]: text_en["excerpt"], **body}
        translate(post, en, pairs)
        (result.created if is_new else result.updated).append(slug)

    if home_section:
        result.home_section = add_home_section(vi, en)
    return result


def add_home_section(vi: Locale, en: Locale) -> bool:
    """Chèn section "Cuộc sống tại BFC" ngay trước CTA cuối Trang chủ nếu chưa có.

    Trả True khi vừa chèn. Bản tiếng Anh được đồng bộ lại qua wagtail-localize (chữ đã dịch giữ
    nguyên).
    """
    home: HomePage | None = HomePage.objects.filter(locale=vi).first()
    if home is None:
        return False
    if any(b.block_type == "section" and b.value["section"] == "news" for b in home.body):
        return False
    blocks = list(home.body)
    # CTA cuối trang là block "cta" hoặc Section dùng chung chèn ở cuối
    last = len(blocks)
    while last > 0 and blocks[last - 1].block_type in ("cta", "shared"):
        last -= 1
    home.body.insert(last, ("section", {"section": "news"}))
    home.save_revision().publish()
    if home.has_translation(en):
        translate(home, en, {})
    return True
