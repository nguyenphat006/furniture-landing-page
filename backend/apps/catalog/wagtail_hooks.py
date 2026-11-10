"""Màn hình admin của catalog: menu "Sản phẩm" gồm Sản phẩm và các bảng phân loại."""

from django.utils.translation import gettext_lazy as _
from wagtail.admin.ui.tables import BooleanColumn, Column, LiveStatusTagColumn, UpdatedAtColumn
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet, SnippetViewSetGroup

from apps.core.admin_translations import SourceLocaleListingMixin, TranslationStatusColumn

from .models import Category, Feature, Material, MaterialMenuGroup, Product, ProductType


class ProductViewSet(SourceLocaleListingMixin, SnippetViewSet):
    model = Product
    icon = "doc-full-inverse"
    menu_label = _("Sản phẩm")
    menu_order = 100
    list_display = [
        "name",
        Column("code", label=_("Mã mẫu")),
        Column("product_type", label=_("Loại")),
        LiveStatusTagColumn(),
        TranslationStatusColumn(),
        UpdatedAtColumn(),
    ]
    list_filter = ["product_type__category", "product_type", "materials", "live"]
    list_per_page = 50
    # Tìm theo search_fields của model (tên, mã). Không đặt search_fields ở đây:
    # backend tìm kiếm SQLite không hỗ trợ giới hạn cột.
    ordering = ["product_type__category__sort_order", "sort_order", "id"]


class CategoryViewSet(SnippetViewSet):
    model = Category
    icon = "folder-open-inverse"
    menu_label = _("Nhóm")
    list_display = ["name", "name_en", "slug", "sort_order"]
    ordering = ["sort_order", "id"]


class ProductTypeViewSet(SnippetViewSet):
    model = ProductType
    icon = "tag"
    menu_label = _("Loại")
    list_display = [
        "name",
        "name_en",
        "slug",
        "category",
        BooleanColumn("is_set", label=_("Là bộ")),
    ]
    list_filter = ["category", "is_set"]
    ordering = ["category__sort_order", "sort_order", "id"]


class MaterialViewSet(SnippetViewSet):
    model = Material
    icon = "image"
    menu_label = _("Chất liệu")
    list_display = ["name", "name_en", "slug", "sort_order"]
    ordering = ["sort_order", "id"]


class MaterialMenuViewSet(SnippetViewSet):
    model = MaterialMenuGroup
    icon = "list-ul"
    menu_label = _("Menu vật liệu")
    list_display = ["__str__", "material", "sort_order", "show_in_menu"]
    ordering = ["sort_order", "id"]


class FeatureViewSet(SnippetViewSet):
    model = Feature
    icon = "cog"
    menu_label = _("Tính năng")
    list_display = ["name", "name_en", "slug", "sort_order"]
    ordering = ["sort_order", "id"]


class CatalogGroup(SnippetViewSetGroup):
    menu_label = _("Sản phẩm")
    menu_icon = "doc-full-inverse"
    menu_order = 200
    items = (
        ProductViewSet,
        CategoryViewSet,
        ProductTypeViewSet,
        MaterialViewSet,
        MaterialMenuViewSet,
        FeatureViewSet,
    )


register_snippet(CatalogGroup)
