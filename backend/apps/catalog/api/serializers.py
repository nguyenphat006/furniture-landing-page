"""Serializer catalog. Chỉ đọc. Phân loại trả slug; nhãn lấy từ /catalog/taxonomy theo ngôn ngữ."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from wagtail.images.models import AbstractImage
from wagtail.rich_text import expand_db_html

from apps.catalog.models import (
    CONTAINER_TYPES,
    DIMENSION_FIELDS,
    Category,
    Material,
    MaterialMenuGroup,
    MaterialMenuItem,
    Product,
    SetItem,
)
from apps.catalog.models.taxonomy import TaxonomyBase, paragraphs
from apps.catalog.renditions import RENDITION_LARGE, RENDITION_THUMB
from apps.core.media_url import absolute_url


def _language(context: Mapping[str, Any]) -> str:
    return str(context["language"])


def _abs(context: Mapping[str, Any], url: str) -> str:
    return absolute_url(context, url)


def _number(value: Any) -> float | int:
    number = float(value)
    return int(number) if number.is_integer() else number


class ImageSerializer(serializers.Serializer[AbstractImage]):
    url = serializers.SerializerMethodField()
    thumb = serializers.SerializerMethodField()
    width = serializers.SerializerMethodField()
    height = serializers.SerializerMethodField()
    alt = serializers.SerializerMethodField()

    def _large(self, image: AbstractImage) -> Any:
        # Mỗi ảnh chỉ lấy rendition lớn một lần cho url / width / height
        cache: dict[int, Any] = self.__dict__.setdefault("_renditions", {})
        if image.pk not in cache:
            cache[image.pk] = image.get_rendition(RENDITION_LARGE)
        return cache[image.pk]

    def get_url(self, image: AbstractImage) -> str:
        return _abs(self.context, self._large(image).url)

    def get_thumb(self, image: AbstractImage) -> str:
        return _abs(self.context, image.get_rendition(RENDITION_THUMB).url)

    def get_width(self, image: AbstractImage) -> int:
        return int(self._large(image).width)

    def get_height(self, image: AbstractImage) -> int:
        return int(self._large(image).height)

    def get_alt(self, image: AbstractImage) -> str:
        return str(self.context.get("alt") or image.title)


class LabelledSerializer(serializers.Serializer[TaxonomyBase]):
    slug = serializers.CharField()
    name = serializers.SerializerMethodField()

    def get_name(self, obj: TaxonomyBase) -> str:
        return obj.label(_language(self.context))


class ProductTypeSerializer(LabelledSerializer):
    is_set = serializers.BooleanField()


class PageSeoSerializer(serializers.Serializer[object]):
    """SEO riêng của trang; chuỗi rỗng = frontend tự tạo từ nội dung (docs/adr/0012)."""

    title = serializers.CharField()
    description = serializers.CharField()
    noindex = serializers.BooleanField()


class CategorySerializer(LabelledSerializer):
    description = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    types = serializers.SerializerMethodField()
    seo = serializers.SerializerMethodField()

    @extend_schema_field(PageSeoSerializer)
    def get_seo(self, obj: Category) -> dict[str, object]:
        return obj.seo_for(_language(self.context))

    def get_description(self, obj: Category) -> str:
        return obj.description_for(_language(self.context))

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_cover(self, obj: Category) -> dict[str, Any] | None:
        if obj.cover is None:
            return None
        context = {**self.context, "alt": obj.label(_language(self.context))}
        return dict(ImageSerializer(obj.cover, context=context).data)

    @extend_schema_field(ProductTypeSerializer(many=True))
    def get_types(self, obj: Category) -> list[dict[str, Any]]:
        types: Any = obj.types.all()
        return list(ProductTypeSerializer(types, many=True, context=self.context).data)


class TaxonomySerializer(serializers.Serializer[object]):
    categories = CategorySerializer(many=True)
    materials = LabelledSerializer(many=True)
    features = LabelledSerializer(many=True)


# ------------------------------------------------------------------ trang vật liệu
def _image(
    context: Mapping[str, Any], image: AbstractImage | None, alt: str
) -> dict[str, Any] | None:
    if image is None:
        return None
    return dict(ImageSerializer(image, context={**context, "alt": alt}).data)


class MaterialSerializer(serializers.Serializer[Material]):
    """Thẻ vật liệu (trang Vật liệu, trang chủ, trang sản phẩm).

    `name` là tên trên trang (vd "Gỗ teak"), khác nhãn ngắn của bộ lọc. Bản tiếng Anh còn trống
    thì trả tiếng Việt, như tên phân loại.
    """

    slug = serializers.CharField()
    name = serializers.SerializerMethodField()
    lede = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    noindex = serializers.BooleanField()

    def get_name(self, obj: Material) -> str:
        return obj.heading_for(_language(self.context))

    def get_lede(self, obj: Material) -> str:
        return obj.text("lede", _language(self.context))

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_image(self, obj: Material) -> dict[str, Any] | None:
        return _image(self.context, obj.image, self.get_name(obj))


class MaterialDetailSerializer(MaterialSerializer):
    seo = serializers.SerializerMethodField()
    properties = serializers.SerializerMethodField(help_text="Các đoạn văn")
    craft = serializers.SerializerMethodField(help_text="Các đoạn văn")
    care = serializers.SerializerMethodField(help_text="Các đoạn văn")
    detail_image = serializers.SerializerMethodField()
    use_image = serializers.SerializerMethodField()
    craft_image = serializers.SerializerMethodField()

    @extend_schema_field(PageSeoSerializer)
    def get_seo(self, obj: Material) -> dict[str, object]:
        return obj.seo_for(_language(self.context))

    def _paragraphs(self, obj: Material, field: str) -> list[str]:
        return paragraphs(obj.text(field, _language(self.context)))

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_properties(self, obj: Material) -> list[str]:
        return self._paragraphs(obj, "properties")

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_craft(self, obj: Material) -> list[str]:
        return self._paragraphs(obj, "craft")

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_care(self, obj: Material) -> list[str]:
        return self._paragraphs(obj, "care")

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_detail_image(self, obj: Material) -> dict[str, Any] | None:
        return _image(self.context, obj.detail_image, self.get_name(obj))

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_use_image(self, obj: Material) -> dict[str, Any] | None:
        return _image(self.context, obj.use_image, self.get_name(obj))

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_craft_image(self, obj: Material) -> dict[str, Any] | None:
        return _image(self.context, obj.craft_image, self.get_name(obj))


# ------------------------------------------------------------------ quy cách
DIMENSIONS_SCHEMA = {
    "type": "object",
    "properties": {f: {"type": "number"} for f in DIMENSION_FIELDS},
    "description": "cm; trường nào trống thì không có",
}
LOADING_SCHEMA = {
    "type": "object",
    "properties": {c: {"type": "integer"} for c in CONTAINER_TYPES},
    "description": "Số pcs mỗi container; loại nào trống thì không có",
}


def _dims(obj: Any, prefix: str = "") -> dict[str, float | int] | None:
    values = {
        f: _number(v) for f in DIMENSION_FIELDS if (v := getattr(obj, f"{prefix}{f}")) is not None
    }
    return values or None


def _loading(obj: Any) -> dict[str, int] | None:
    values = {
        c: int(v)
        for c in CONTAINER_TYPES
        if (v := getattr(obj, f"loading_{c.lower()}")) is not None
    }
    return values or None


class SpecSerializerMixin(serializers.Serializer[Any]):
    dimensions = serializers.SerializerMethodField()
    assembly = serializers.SerializerMethodField()
    pcs_per_box = serializers.IntegerField(allow_null=True)
    carton = serializers.SerializerMethodField()
    loading = serializers.SerializerMethodField()
    materials = serializers.SerializerMethodField()
    features = serializers.SerializerMethodField()

    @extend_schema_field({**DIMENSIONS_SCHEMA, "nullable": True})
    def get_dimensions(self, obj: Any) -> dict[str, float | int] | None:
        return _dims(obj)

    @extend_schema_field({"type": "string", "enum": ["kd", "fa"], "nullable": True})
    def get_assembly(self, obj: Any) -> str | None:
        return obj.assembly or None

    @extend_schema_field({**DIMENSIONS_SCHEMA, "nullable": True})
    def get_carton(self, obj: Any) -> dict[str, float | int] | None:
        return _dims(obj, "carton_")

    @extend_schema_field({**LOADING_SCHEMA, "nullable": True})
    def get_loading(self, obj: Any) -> dict[str, int] | None:
        return _loading(obj)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_materials(self, obj: Any) -> list[str]:
        return [m.slug for m in obj.materials.all()]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_features(self, obj: Any) -> list[str]:
        return [f.slug for f in obj.features.all()]


class SetItemSerializer(SpecSerializerMixin):
    type = serializers.CharField(source="product_type.slug")
    qty = serializers.IntegerField()
    image = serializers.SerializerMethodField()

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_image(self, obj: SetItem) -> dict[str, Any] | None:
        if obj.image is None:
            return None
        return dict(ImageSerializer(obj.image, context=self.context).data)


class ProductBaseSerializer(serializers.Serializer[Product]):
    slug = serializers.CharField()
    name = serializers.CharField()
    code = serializers.CharField()
    type = serializers.CharField(source="product_type.slug")
    category = serializers.CharField(source="product_type.category.slug")
    materials = serializers.SerializerMethodField()
    features = serializers.SerializerMethodField()
    is_fallback = serializers.BooleanField(
        help_text="True: chưa có bản dịch ở ngôn ngữ được hỏi, đây là bản gốc."
    )
    noindex = serializers.BooleanField(help_text="Quản trị viên ẩn trang khỏi Google")

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_materials(self, obj: Product) -> list[str]:
        return [m.slug for m in obj.materials.all()]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_features(self, obj: Product) -> list[str]:
        return [f.slug for f in obj.features.all()]


class ProductListSerializer(ProductBaseSerializer):
    image = serializers.SerializerMethodField()

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_image(self, obj: Product) -> dict[str, Any] | None:
        first = next(iter(obj.images.all()), None)
        if first is None:
            return None
        return dict(ImageSerializer(first.image, context={**self.context, "alt": obj.name}).data)


class ProductDetailSerializer(ProductBaseSerializer, SpecSerializerMixin):
    description = serializers.SerializerMethodField(help_text="HTML; rỗng nếu chưa có")
    images = serializers.SerializerMethodField()
    set_items = SetItemSerializer(many=True)
    seo = serializers.SerializerMethodField()

    @extend_schema_field(PageSeoSerializer)
    def get_seo(self, obj: Product) -> dict[str, object]:
        return {
            "title": obj.seo_title,
            "description": obj.seo_description,
            "noindex": obj.noindex,
        }

    @extend_schema_field(ImageSerializer(many=True))
    def get_images(self, obj: Product) -> list[dict[str, Any]]:
        context = {**self.context, "alt": obj.name}
        return [dict(ImageSerializer(i.image, context=context).data) for i in obj.images.all()]

    def get_description(self, obj: Product) -> str:
        # Đổi link nội bộ của Wagtail (linktype=...) sang URL thật
        return expand_db_html(obj.description) if obj.description else ""


# ------------------------------------------------------------------ menu con header
class MenuTypeSerializer(LabelledSerializer):
    pass


class MenuCategorySerializer(LabelledSerializer):
    types = serializers.SerializerMethodField()

    @extend_schema_field(MenuTypeSerializer(many=True))
    def get_types(self, obj: Category) -> list[dict[str, Any]]:
        types: Any = obj.types.all()
        return list(MenuTypeSerializer(types, many=True, context=self.context).data)


class MenuMaterialItemSerializer(serializers.Serializer[MaterialMenuItem]):
    name = serializers.SerializerMethodField()
    material = serializers.CharField(source="material.slug", help_text="Slug trang vật liệu")

    def get_name(self, obj: MaterialMenuItem) -> str:
        return obj.label(_language(self.context))


class MenuMaterialGroupSerializer(serializers.Serializer[MaterialMenuGroup]):
    name = serializers.SerializerMethodField()
    material = serializers.SerializerMethodField(help_text="Slug trang vật liệu; null = không có")
    items = MenuMaterialItemSerializer(many=True)

    def get_name(self, obj: MaterialMenuGroup) -> str:
        return obj.label(_language(self.context))

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_material(self, obj: MaterialMenuGroup) -> str | None:
        return obj.material.slug if obj.material else None


class MenuSerializer(serializers.Serializer[object]):
    products = MenuCategorySerializer(many=True, help_text="Nhóm → loại đang hiện trong menu")
    materials = MenuMaterialGroupSerializer(many=True, help_text="Nhóm menu vật liệu → mục con")
