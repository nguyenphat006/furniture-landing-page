"""Dữ liệu từng khối nội dung bài tin tức cho frontend (apps/news/blocks.py).

Mỗi khối trả `{type, id, value}`. Chữ định dạng trả HTML đã đổi link nội bộ; ảnh trả rendition lớn
(mở lightbox được, alt là chú thích hoặc tiêu đề bài); video trả link nhúng hoặc link tệp;
bảng trả tên cột + ô dạng HTML.
"""

from __future__ import annotations

import html
from collections.abc import Mapping
from typing import Any

from drf_spectacular.utils import PolymorphicProxySerializer
from rest_framework import serializers
from wagtail.blocks import StreamValue, StructValue
from wagtail.documents.models import AbstractDocument
from wagtail.images.models import AbstractImage
from wagtail.rich_text import RichText, expand_db_html

from apps.catalog.renditions import RENDITION_LARGE
from apps.core.media_url import absolute_url
from apps.pages.api.serializers import ImageDataSerializer

from ..blocks import parse_video_url

EMBED_URLS = {
    "youtube": "https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0",
    "vimeo": "https://player.vimeo.com/video/{id}?autoplay=1",
}


def _text(value: StructValue, key: str) -> str:
    return str(value.get(key) or "")


def _rich(value: Any) -> str:
    source = value.source if isinstance(value, RichText) else str(value or "")
    return str(expand_db_html(source))


def _image(
    context: Mapping[str, Any], image: AbstractImage | None, alt: str = ""
) -> dict[str, Any] | None:
    if image is None:
        return None
    rendition = image.get_rendition(RENDITION_LARGE)
    return {
        "url": absolute_url(context, rendition.url),
        "width": rendition.width,
        "height": rendition.height,
        "alt": alt or str(context.get("alt") or ""),
    }


def _document(context: Mapping[str, Any], doc: AbstractDocument) -> dict[str, Any]:
    try:
        size = int(doc.file.size)
    except OSError:
        size = 0
    return {
        "url": absolute_url(context, doc.file.url),
        "title": str(doc.title),
        "extension": str(doc.file_extension).lower(),
        "size": size,
    }


def _video(value: StructValue, context: Mapping[str, Any]) -> dict[str, Any]:
    url, file = value.get("url"), value.get("file")
    provider, video_id, src = "file", "", ""
    parsed = parse_video_url(url) if url else None
    if parsed is not None:
        provider, video_id = parsed
        src = EMBED_URLS[provider].format(id=video_id)
    elif file is not None:
        src = absolute_url(context, file.file.url)
    return {
        "provider": provider,
        "video_id": video_id,
        "src": src,
        "poster": _image(context, value.get("poster"), _text(value, "caption")),
        "caption": _text(value, "caption"),
        "size": _text(value, "size") or "wide",
    }


def _table(value: Any) -> dict[str, Any]:
    columns = [str(c.get("heading") or "") for c in value.columns]
    rows: list[list[str]] = []
    for row in value.rows:
        cells: list[str] = []
        for cell in row:
            if cell is None:
                cells.append("")
            elif cell.block.name == "rich":
                cells.append(_rich(cell.value))
            else:
                cells.append(html.escape(str(cell.value or "")))
        rows.append(cells)
    return {"columns": columns, "rows": rows, "caption": str(getattr(value, "caption", "") or "")}


def news_block_value(block_type: str, value: Any, context: Mapping[str, Any]) -> dict[str, Any]:
    if block_type == "paragraph":
        return {"html": _rich(value)}
    if block_type == "image":
        return {
            "image": _image(context, value["image"], _text(value, "caption")),
            "caption": _text(value, "caption"),
            "size": _text(value, "size") or "text",
        }
    if block_type == "gallery":
        return {
            "layout": _text(value, "layout") or "grid-3",
            "images": [
                {"image": data, "caption": _text(item, "caption")}
                for item in value["images"]
                if (data := _image(context, item["image"], _text(item, "caption"))) is not None
            ],
            "caption": _text(value, "caption"),
        }
    if block_type == "video":
        return _video(value, context)
    if block_type == "image_text":
        return {
            "image": _image(context, value["image"], _text(value, "heading")),
            "image_position": _text(value, "image_position") or "left",
            "heading": _text(value, "heading"),
            "html": _rich(value.get("text")),
        }
    if block_type == "quote":
        return {k: _text(value, k) for k in ("quote", "author", "role")}
    if block_type == "table":
        return _table(value)
    if block_type == "button":
        return {"label": _text(value, "label"), "url": _text(value, "url")}
    if block_type == "file":
        doc = value.get("document")
        data = _document(context, doc) if doc is not None else None
        label = _text(value, "label") or (data["title"] if data else "")
        return {"file": data, "label": label}
    raise ValueError(f"Khối lạ: {block_type}")


def news_body_data(
    body: StreamValue, context: Mapping[str, Any], title: str
) -> list[dict[str, Any]]:
    """Ảnh không có chú thích dùng tiêu đề bài làm alt (cùng ngôn ngữ với bài)."""
    context = {**context, "alt": title}
    return [
        {
            "type": child.block_type,
            "id": child.id,
            "value": news_block_value(child.block_type, child.value, context),
        }
        for child in body
    ]


# --- Schema OpenAPI cho frontend (npm run cms:types) ---


class ParagraphValueSerializer(serializers.Serializer[object]):
    html = serializers.CharField()


class ImageValueSerializer(serializers.Serializer[object]):
    image = ImageDataSerializer(allow_null=True)
    caption = serializers.CharField()
    size = serializers.ChoiceField(choices=["text", "wide"])


class GalleryItemSerializer(serializers.Serializer[object]):
    image = ImageDataSerializer()
    caption = serializers.CharField()


class GalleryValueSerializer(serializers.Serializer[object]):
    layout = serializers.ChoiceField(choices=["grid-2", "grid-3", "slider"])
    images = GalleryItemSerializer(many=True)
    caption = serializers.CharField()


class VideoValueSerializer(serializers.Serializer[object]):
    provider = serializers.ChoiceField(choices=["youtube", "vimeo", "file"])
    video_id = serializers.CharField(help_text="Mã video YouTube / Vimeo, trống với tệp")
    src = serializers.CharField(help_text="Link nhúng (iframe) hoặc link tệp MP4 / WebM")
    poster = ImageDataSerializer(allow_null=True)
    caption = serializers.CharField()
    size = serializers.ChoiceField(choices=["text", "wide"])


class ImageTextValueSerializer(serializers.Serializer[object]):
    image = ImageDataSerializer(allow_null=True)
    image_position = serializers.ChoiceField(choices=["left", "right"])
    heading = serializers.CharField()
    html = serializers.CharField()


class QuoteValueSerializer(serializers.Serializer[object]):
    quote = serializers.CharField()
    author = serializers.CharField()
    role = serializers.CharField()


class TableValueSerializer(serializers.Serializer[object]):
    columns = serializers.ListField(child=serializers.CharField())
    rows = serializers.ListField(
        child=serializers.ListField(child=serializers.CharField()), help_text="Ô dạng HTML"
    )
    caption = serializers.CharField()


class ButtonValueSerializer(serializers.Serializer[object]):
    label = serializers.CharField()  # type: ignore[assignment]
    url = serializers.CharField()


class DocumentDataSerializer(serializers.Serializer[object]):
    url = serializers.CharField()
    title = serializers.CharField()
    extension = serializers.CharField()
    size = serializers.IntegerField(help_text="Byte")


class FileValueSerializer(serializers.Serializer[object]):
    file = DocumentDataSerializer(allow_null=True)
    label = serializers.CharField()  # type: ignore[assignment]


def _block(name: str, value: serializers.Serializer[object]) -> type:
    component = "".join(part.capitalize() for part in name.split("_"))
    return type(
        f"{component}NewsBlockSerializer",
        (serializers.Serializer,),
        {
            "type": serializers.ChoiceField(choices=[name]),
            "id": serializers.CharField(),
            "value": value,
        },
    )


NEWS_BLOCK = PolymorphicProxySerializer(
    component_name="NewsBlock",
    resource_type_field_name="type",
    serializers={
        "paragraph": _block("paragraph", ParagraphValueSerializer()),
        "image": _block("image", ImageValueSerializer()),
        "gallery": _block("gallery", GalleryValueSerializer()),
        "video": _block("video", VideoValueSerializer()),
        "image_text": _block("image_text", ImageTextValueSerializer()),
        "quote": _block("quote", QuoteValueSerializer()),
        "table": _block("table", TableValueSerializer()),
        "button": _block("button", ButtonValueSerializer()),
        "file": _block("file", FileValueSerializer()),
    },
    many=True,
)
