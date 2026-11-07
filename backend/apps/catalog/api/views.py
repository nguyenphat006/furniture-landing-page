"""API catalog (chỉ đọc, công khai). View mỏng: đọc tham số, gọi selector, trả serializer."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import selectors
from apps.catalog.models import Product

from .serializers import (
    MaterialDetailSerializer,
    MaterialSerializer,
    MenuSerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    TaxonomySerializer,
)

LOCALE_PARAM = OpenApiParameter(
    "locale",
    str,
    enum=[code for code, _ in settings.WAGTAIL_CONTENT_LANGUAGES],
    description="Ngôn ngữ nội dung, mặc định tiếng Việt",
)


class LocaleQuerySerializer(serializers.Serializer[Any]):
    locale = serializers.ChoiceField(
        choices=[code for code, _ in settings.WAGTAIL_CONTENT_LANGUAGES], required=False
    )


class ProductQuerySerializer(LocaleQuerySerializer):
    category = serializers.SlugField(required=False)
    type = serializers.SlugField(required=False)
    material = serializers.ListField(child=serializers.SlugField(), required=False)
    feature = serializers.ListField(child=serializers.SlugField(), required=False)


def _context(request: Request) -> dict[str, Any]:
    params = LocaleQuerySerializer(data=request.query_params)
    params.is_valid(raise_exception=True)
    locale = selectors.resolve_locale(params.validated_data.get("locale"))
    return {"request": request, "locale": locale, "language": locale.language_code}


class TaxonomyView(APIView):
    """Nhóm (kèm loại), chất liệu, tính năng với tên theo ngôn ngữ."""

    @extend_schema(
        parameters=[LOCALE_PARAM], responses=TaxonomySerializer, operation_id="catalog_taxonomy"
    )
    def get(self, request: Request) -> Response:
        context = _context(request)
        data = {
            "categories": selectors.categories_with_types(),
            "materials": selectors.materials(),
            "features": selectors.features(),
        }
        return Response(TaxonomySerializer(data, context=context).data)


class ProductListView(ListAPIView[Any]):
    """Sản phẩm đang xuất bản.

    Lọc nhiều chất liệu / tính năng: lặp tham số (?material=a&material=b), sản phẩm phải có đủ.
    """

    serializer_class = ProductListSerializer

    def get_serializer_context(self) -> dict[str, Any]:
        if getattr(self, "swagger_fake_view", False):
            return {**super().get_serializer_context()}
        return {**super().get_serializer_context(), **_context(self.request)}

    def get_queryset(self) -> Any:
        # drf-spectacular dựng schema bằng view giả: không truy vấn database (CI chạy trên DB trống)
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        params = ProductQuerySerializer(
            data={
                **self.request.query_params.dict(),
                "material": self.request.query_params.getlist("material"),
                "feature": self.request.query_params.getlist("feature"),
            }
        )
        params.is_valid(raise_exception=True)
        data = params.validated_data
        filters = selectors.ProductFilters(
            category=data.get("category"),
            type=data.get("type"),
            materials=tuple(data.get("material", [])),
            features=tuple(data.get("feature", [])),
        )
        return selectors.product_list(selectors.resolve_locale(data.get("locale")), filters)

    @extend_schema(
        parameters=[
            LOCALE_PARAM,
            OpenApiParameter("category", str, description="Slug nhóm"),
            OpenApiParameter("type", str, description="Slug loại"),
            OpenApiParameter("material", str, many=True, description="Slug chất liệu, lặp được"),
            OpenApiParameter("feature", str, many=True, description="Slug tính năng, lặp được"),
        ],
        operation_id="catalog_products_list",
    )
    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().get(request, *args, **kwargs)


class ProductDetailView(APIView):
    @extend_schema(
        parameters=[
            LOCALE_PARAM,
            OpenApiParameter("slug", OpenApiTypes.STR, OpenApiParameter.PATH),
        ],
        responses=ProductDetailSerializer,
        operation_id="catalog_products_retrieve",
    )
    def get(self, request: Request, slug: str) -> Response:
        context = _context(request)
        product = selectors.product_detail(context["locale"], slug)
        if product is None:
            raise NotFound
        return Response(ProductDetailSerializer(product, context=context).data)


class MaterialListView(APIView):
    """Chất liệu theo thứ tự trong CMS (trang Vật liệu). Không phân trang: ít mục."""

    @extend_schema(
        parameters=[LOCALE_PARAM],
        responses=MaterialSerializer(many=True),
        operation_id="catalog_materials_list",
    )
    def get(self, request: Request) -> Response:
        context = _context(request)
        return Response(
            MaterialSerializer(
                selectors.material_pages(),  # type: ignore[arg-type]  # many=True nhận queryset
                many=True,
                context=context,
            ).data
        )


class MaterialDetailView(APIView):
    @extend_schema(
        parameters=[
            LOCALE_PARAM,
            OpenApiParameter("slug", OpenApiTypes.STR, OpenApiParameter.PATH),
        ],
        responses=MaterialDetailSerializer,
        operation_id="catalog_materials_retrieve",
    )
    def get(self, request: Request, slug: str) -> Response:
        context = _context(request)
        material = selectors.material_page(slug)
        if material is None:
            raise NotFound
        return Response(MaterialDetailSerializer(material, context=context).data)


class MenuView(APIView):
    """Menu con của header: Sản phẩm (nhóm → loại) và Vật liệu (nhóm menu → mục con)."""

    @extend_schema(parameters=[LOCALE_PARAM], responses=MenuSerializer, operation_id="catalog_menu")
    def get(self, request: Request) -> Response:
        data = {"products": selectors.menu_categories(), "materials": selectors.material_menu()}
        return Response(MenuSerializer(data, context=_context(request)).data)
