"""API tin tức (chỉ đọc, công khai). View mỏng: đọc tham số, gọi selector, trả serializer."""

from __future__ import annotations

from typing import Any

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.api.views import LOCALE_PARAM, LocaleQuerySerializer
from apps.catalog.selectors import resolve_locale

from .. import selectors
from ..models import NewsPost
from .serializers import NewsDetailSerializer, NewsListSerializer


class NewsQuerySerializer(LocaleQuerySerializer):
    kind = serializers.ChoiceField(choices=NewsPost.Kind.values, required=False)


class NewsListView(ListAPIView[Any]):
    """Bài đang xuất bản, mới nhất trước (?page=&page_size=). Bài chưa dịch trả bản gốc."""

    serializer_class = NewsListSerializer

    def get_queryset(self) -> Any:
        # drf-spectacular dựng schema bằng view giả: không truy vấn database
        if getattr(self, "swagger_fake_view", False):
            return NewsPost.objects.none()
        params = NewsQuerySerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        return selectors.post_list(resolve_locale(data.get("locale")), data.get("kind"))

    def paginate_queryset(self, queryset: Any) -> Any:
        page = super().paginate_queryset(queryset)
        # Slug theo ngôn ngữ của cả trang lấy một lần (không truy vấn theo từng bài)
        self.slugs = selectors.slugs_by_key(p.translation_key for p in (page or []))
        return page

    def get_serializer_context(self) -> dict[str, Any]:
        return {**super().get_serializer_context(), "slugs": getattr(self, "slugs", None)}

    @extend_schema(
        parameters=[
            LOCALE_PARAM,
            OpenApiParameter("kind", str, enum=NewsPost.Kind.values, description="Loại bài"),
        ],
        operation_id="news_list",
    )
    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().get(request, *args, **kwargs)


class NewsDetailView(APIView):
    @extend_schema(
        parameters=[
            LOCALE_PARAM,
            OpenApiParameter("slug", OpenApiTypes.STR, OpenApiParameter.PATH),
        ],
        responses=NewsDetailSerializer,
        operation_id="news_retrieve",
    )
    def get(self, request: Request, slug: str) -> Response:
        params = LocaleQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        post = selectors.post_detail(resolve_locale(params.validated_data.get("locale")), slug)
        if post is None:
            raise NotFound
        return Response(NewsDetailSerializer(post, context={"request": request}).data)
