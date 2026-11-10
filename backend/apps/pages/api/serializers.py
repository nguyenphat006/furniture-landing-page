"""Serializer trang nội dung.

Thân trang trả dạng [{type, id, value}], đúng thứ tự trong admin. Section dùng chung được thay bằng
block bên trong nó, nên frontend vẽ bằng cùng component như section riêng (docs/adr/0013).
Các serializer *Block chỉ để mô tả schema OpenAPI (frontend sinh kiểu TypeScript từ đó).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema_field
from rest_framework import serializers
from wagtail.blocks import StreamValue, StructValue
from wagtail.images.models import AbstractImage
from wagtail.rich_text import RichText, expand_db_html

from apps.core.media_url import absolute_url

from ..blocks import CODED_SECTIONS, LABEL_SIDES, export_country_choices, parse_position
from ..models import ContentPage, SharedSection
from ..selectors import live_section

RENDITION_HERO = "max-2400x2400|format-webp|webpquality-80"
RENDITION_BACKGROUND = "max-1920x1920|format-webp|webpquality-70"
RENDITION_FEATURE = "max-1600x1600|format-webp|webpquality-80"
RENDITION_OG = "fill-1200x630|format-jpeg|jpegquality-85"


def _abs(context: Mapping[str, Any], url: str) -> str:
    return absolute_url(context, url)


def image_data(
    context: Mapping[str, Any], image: AbstractImage | None, spec: str
) -> dict[str, Any] | None:
    if image is None:
        return None
    rendition = image.get_rendition(spec)
    return {
        "url": _abs(context, rendition.url),
        "width": rendition.width,
        "height": rendition.height,
        "alt": "",
    }


def _text(value: StructValue, key: str) -> str:
    return str(value.get(key) or "")


def block_value(block_type: str, value: Any, context: Mapping[str, Any]) -> dict[str, Any]:
    if block_type == "hero":
        return {
            "slides": [
                data
                for image in value["slides"]
                if (data := image_data(context, image, RENDITION_HERO)) is not None
            ],
            "title": _text(value, "title"),
            "lede": _text(value, "lede"),
            "button_label": _text(value, "button_label"),
        }
    if block_type == "intro":
        return {k: _text(value, k) for k in ("heading", "quote", "body", "button_label")}
    if block_type == "cta":
        return {
            **{k: _text(value, k) for k in ("kicker", "title", "quote_label", "visit_label")},
            "image": image_data(context, value.get("image"), RENDITION_BACKGROUND),
        }
    if block_type == "export":
        return {
            "kicker": _text(value, "kicker"),
            "title": _text(value, "title"),
            "markets": [
                {
                    "code": m["country"],
                    "label": parse_position(m.get("position")),
                    "side": m.get("side") or "C",
                }
                for m in value["markets"]
            ],
            "stats": [
                {"value": _text(s, "value"), "label": _text(s, "label")} for s in value["stats"]
            ],
        }
    if block_type == "legal":
        body = value.get("body")
        return {
            "heading": _text(value, "heading"),
            "body": expand_db_html(body.source) if isinstance(body, RichText) else "",
        }
    if block_type == "factory":
        return {
            **{k: _text(value, k) for k in ("kicker", "title", "lede", "button_label")},
            "image": image_data(context, value.get("image"), RENDITION_FEATURE),
            "detail_image": image_data(context, value.get("detail_image"), RENDITION_FEATURE),
            "points": [str(p) for p in value["points"] if p],
        }
    if block_type == "faq":
        return {
            **{k: _text(value, k) for k in ("kicker", "title", "note", "button_label")},
            "items": [
                {"question": _text(i, "question"), "answer": _text(i, "answer")}
                for i in value["items"]
            ],
        }
    if block_type == "section":
        return {"section": _text(value, "section")}
    raise ValueError(f"Block lạ: {block_type}")


def section_data(section: SharedSection, context: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "type": inner.block_type,
            "id": inner.id,
            "value": block_value(inner.block_type, inner.value, context),
        }
        for inner in section.body
    ]


def body_data(body: StreamValue, context: Mapping[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for child in body:
        if child.block_type == "shared":
            section: SharedSection | None = live_section(child.value)
            # Đang xem trước section dùng chung: thay bằng bản đang sửa
            preview = context.get("preview_section")
            if (
                preview is not None
                and child.value is not None
                and child.value.translation_key == preview.translation_key
            ):
                section = preview
            if section is None:
                continue
            out.extend(section_data(section, context))
            continue
        out.append(
            {
                "type": child.block_type,
                "id": child.id,
                "value": block_value(child.block_type, child.value, context),
            }
        )
    return out


# ------------------------------------------------------------------ schema
class ImageDataSerializer(serializers.Serializer[object]):
    url = serializers.CharField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    alt = serializers.CharField()


class HeroValueSerializer(serializers.Serializer[object]):
    slides = ImageDataSerializer(many=True)
    title = serializers.CharField(help_text="Xuống dòng = ngắt dòng ở màn hình lớn")
    lede = serializers.CharField()
    button_label = serializers.CharField(help_text="Rỗng = nhãn mặc định trong messages")


class IntroValueSerializer(serializers.Serializer[object]):
    heading = serializers.CharField()
    quote = serializers.CharField()
    body = serializers.CharField()
    button_label = serializers.CharField()


class CtaValueSerializer(serializers.Serializer[object]):
    kicker = serializers.CharField()
    title = serializers.CharField()
    image = ImageDataSerializer(allow_null=True)
    quote_label = serializers.CharField()
    visit_label = serializers.CharField()


class ExportStatSerializer(serializers.Serializer[object]):
    value = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]


class ExportMarketSerializer(serializers.Serializer[object]):
    code = serializers.ChoiceField(
        choices=[code for code, _ in export_country_choices()], help_text="Mã ISO3"
    )
    label = serializers.ListField(  # type: ignore[assignment]
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        allow_null=True,
        help_text="Vị trí cờ [x, y] theo đơn vị bản đồ; null = ngay tại nước",
    )
    side = serializers.ChoiceField(choices=[key for key, _ in LABEL_SIDES])


class ExportValueSerializer(serializers.Serializer[object]):
    kicker = serializers.CharField()
    title = serializers.CharField()
    markets = ExportMarketSerializer(many=True)
    stats = ExportStatSerializer(many=True)


class FactoryValueSerializer(serializers.Serializer[object]):
    kicker = serializers.CharField()
    title = serializers.CharField()
    lede = serializers.CharField()
    image = ImageDataSerializer(allow_null=True)
    detail_image = ImageDataSerializer(allow_null=True)
    points = serializers.ListField(child=serializers.CharField())
    button_label = serializers.CharField()


class LegalValueSerializer(serializers.Serializer[object]):
    heading = serializers.CharField()
    body = serializers.CharField(
        help_text="HTML (đoạn văn, danh sách, link) từ trình soạn của admin"
    )


class FaqItemSerializer(serializers.Serializer[object]):
    question = serializers.CharField()
    answer = serializers.CharField()


class FaqValueSerializer(serializers.Serializer[object]):
    kicker = serializers.CharField()
    title = serializers.CharField()
    note = serializers.CharField()
    button_label = serializers.CharField(help_text="Rỗng = nhãn mặc định trong messages")
    items = FaqItemSerializer(many=True)


class SectionValueSerializer(serializers.Serializer[object]):
    section = serializers.ChoiceField(choices=[key for key, _ in CODED_SECTIONS])


def _block_serializer(name: str, value: serializers.Serializer[object]) -> type:
    return type(
        f"{name.capitalize()}PageBlockSerializer",
        (serializers.Serializer,),
        {
            "type": serializers.ChoiceField(choices=[name]),
            "id": serializers.CharField(),
            "value": value,
        },
    )


PAGE_BLOCK = PolymorphicProxySerializer(
    component_name="PageBlock",
    resource_type_field_name="type",
    serializers={
        "hero": _block_serializer("hero", HeroValueSerializer()),
        "intro": _block_serializer("intro", IntroValueSerializer()),
        "export": _block_serializer("export", ExportValueSerializer()),
        "factory": _block_serializer("factory", FactoryValueSerializer()),
        "cta": _block_serializer("cta", CtaValueSerializer()),
        "faq": _block_serializer("faq", FaqValueSerializer()),
        "section": _block_serializer("section", SectionValueSerializer()),
        "legal": _block_serializer("legal", LegalValueSerializer()),
    },
    many=True,
)


class ContentPageSeoSerializer(serializers.Serializer[object]):
    """Rỗng = frontend tự tạo từ nội dung, rồi tới SEO mặc định (docs/adr/0012)."""

    title = serializers.CharField()
    description = serializers.CharField()
    noindex = serializers.BooleanField()
    og_image = serializers.CharField(allow_null=True)


class ContentPageSerializer(serializers.Serializer[ContentPage]):
    title = serializers.CharField()
    is_fallback = serializers.SerializerMethodField()
    updated_on = serializers.SerializerMethodField()
    seo = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()

    def get_is_fallback(self, obj: ContentPage) -> bool:
        return bool(self.context.get("is_fallback"))

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_updated_on(self, obj: ContentPage) -> str | None:
        """Ngày cập nhật (chỉ trang pháp lý có)."""
        value = getattr(obj, "updated_on", None)
        return value.isoformat() if value else None

    @extend_schema_field(ContentPageSeoSerializer)
    def get_seo(self, obj: ContentPage) -> dict[str, Any]:
        og = image_data(self.context, obj.og_image, RENDITION_OG)
        return {
            "title": obj.seo_title,
            "description": obj.search_description,
            "noindex": obj.noindex,
            "og_image": og["url"] if og else None,
        }

    @extend_schema_field(PAGE_BLOCK)
    def get_body(self, obj: ContentPage) -> list[dict[str, Any]]:
        return body_data(obj.body, self.context)


class SectionSlotSerializer(serializers.Serializer[SharedSection]):
    """Section dùng chung ở một vị trí cố định (trang chưa có trong CMS)."""

    is_fallback = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()

    def get_is_fallback(self, obj: SharedSection) -> bool:
        return bool(self.context.get("is_fallback"))

    @extend_schema_field(PAGE_BLOCK)
    def get_body(self, obj: SharedSection) -> list[dict[str, Any]]:
        return section_data(obj, self.context)


class PreviewSerializer(serializers.Serializer[object]):
    """Bản nháp: data cùng định dạng API công khai (ContentPage, ProductDetail hoặc NewsDetail)."""

    kind = serializers.ChoiceField(choices=["page", "product", "news"])
    key = serializers.CharField(
        help_text="Khoá trang (home, privacy...) hoặc slug sản phẩm / bài tin tức"
    )
    locale = serializers.CharField()
    path = serializers.CharField(help_text="Đường dẫn trên web, đã có tiền tố ngôn ngữ")
    content = serializers.JSONField(source="payload")
