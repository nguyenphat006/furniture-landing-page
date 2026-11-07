"""Truy vấn đọc của catalog cho API.

Ngôn ngữ: sản phẩm chưa có bản dịch ở ngôn ngữ được hỏi thì trả bản gốc (ngôn ngữ mặc định) kèm
`is_fallback = True`, để frontend vẫn hiện sản phẩm và đặt noindex cho trang đó (docs/adr/0003).
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db.models import BooleanField, Case, Prefetch, Q, QuerySet, Value, When
from wagtail.models import Locale

from .models import (
    Category,
    Feature,
    Material,
    MaterialMenuGroup,
    MaterialMenuItem,
    Product,
    ProductImage,
    ProductType,
    SetItem,
)


@dataclass(frozen=True)
class ProductFilters:
    category: str | None = None
    type: str | None = None
    materials: tuple[str, ...] = ()
    features: tuple[str, ...] = ()


def resolve_locale(code: str | None) -> Locale:
    """Locale theo mã; mã rỗng hoặc chưa bật thì dùng ngôn ngữ mặc định."""
    if code:
        locale = Locale.objects.filter(language_code=code).first()
        if locale is not None:
            return locale
    return Locale.get_default()


def categories_with_types() -> QuerySet[Category]:
    return Category.objects.select_related("cover").prefetch_related(
        Prefetch("types", queryset=ProductType.objects.order_by("sort_order", "id"))
    )


def materials() -> QuerySet[Material]:
    return Material.objects.all()


def material_pages() -> QuerySet[Material]:
    """Chất liệu kèm ảnh, cho trang Vật liệu và trang /materials/<slug>."""
    return Material.objects.select_related("image", "detail_image", "use_image", "craft_image")


def material_page(slug: str) -> Material | None:
    return material_pages().filter(slug=slug).first()


def features() -> QuerySet[Feature]:
    return Feature.objects.all()


def live_products(locale: Locale) -> QuerySet[Product]:
    """Sản phẩm đang xuất bản ở `locale`, cộng bản gốc của sản phẩm chưa dịch sang `locale`."""
    default = Locale.get_default()
    qs = Product.objects.filter(live=True)
    if locale.pk == default.pk:
        return qs.filter(locale=locale).annotate(
            is_fallback=Value(False, output_field=BooleanField())
        )
    translated = Product.objects.filter(live=True, locale=locale).values("translation_key")
    return qs.filter(
        Q(locale=locale) | Q(locale=default) & ~Q(translation_key__in=translated)
    ).annotate(
        is_fallback=Case(
            When(locale=locale, then=Value(False)),
            default=Value(True),
            output_field=BooleanField(),
        )
    )


def _with_relations(qs: QuerySet[Product]) -> QuerySet[Product]:
    return qs.select_related("product_type__category").prefetch_related(
        "materials",
        "features",
        Prefetch(
            "images",
            queryset=ProductImage.objects.select_related("image").order_by("sort_order", "id"),
        ),
    )


def product_list(locale: Locale, filters: ProductFilters) -> QuerySet[Product]:
    qs = live_products(locale)
    if filters.category:
        qs = qs.filter(product_type__category__slug=filters.category)
    if filters.type:
        qs = qs.filter(product_type__slug=filters.type)
    # Nhiều chất liệu / tính năng: sản phẩm phải có đủ tất cả (lọc AND)
    for slug in filters.materials:
        qs = qs.filter(materials__slug=slug)
    for slug in filters.features:
        qs = qs.filter(features__slug=slug)
    return _with_relations(qs).order_by("product_type__category__sort_order", "sort_order", "id")


def product_detail(locale: Locale, slug: str) -> Product | None:
    qs = _with_relations(live_products(locale).filter(slug=slug)).prefetch_related(
        Prefetch(
            "set_items",
            queryset=SetItem.objects.select_related("product_type", "image")
            .prefetch_related("materials", "features")
            .order_by("sort_order", "id"),
        )
    )
    return qs.first()


def menu_categories() -> QuerySet[Category]:
    """Nhóm và loại đang bật "hiện trong menu", theo thứ tự trong CMS."""
    return Category.objects.filter(show_in_menu=True).prefetch_related(
        Prefetch(
            "types",
            queryset=ProductType.objects.filter(show_in_menu=True).order_by("sort_order", "id"),
        )
    )


def material_menu() -> QuerySet[MaterialMenuGroup]:
    return (
        MaterialMenuGroup.objects.filter(show_in_menu=True)
        .select_related("material")
        .prefetch_related(
            Prefetch(
                "items",
                queryset=MaterialMenuItem.objects.select_related("material").order_by(
                    "sort_order", "id"
                ),
            )
        )
    )
