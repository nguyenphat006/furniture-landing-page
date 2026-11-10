"""Serializer tin tức. Chỉ đọc."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.api.serializers import ImageSerializer, PageSeoSerializer

from .. import selectors
from ..models import NewsPost
from .blocks import NEWS_BLOCK, news_body_data


class NewsListSerializer(serializers.Serializer[NewsPost]):
    slug = serializers.CharField()
    kind = serializers.ChoiceField(choices=NewsPost.Kind.choices)
    date = serializers.DateField()
    title = serializers.CharField()
    excerpt = serializers.CharField()
    cover = serializers.SerializerMethodField()
    is_fallback = serializers.BooleanField(
        help_text="True: chưa có bản dịch ở ngôn ngữ được hỏi, đây là bản gốc."
    )
    noindex = serializers.BooleanField(help_text="Quản trị viên ẩn trang khỏi Google")
    updated = serializers.DateTimeField(
        source="last_published_at",
        allow_null=True,
        read_only=True,
        help_text="Lần xuất bản gần nhất, dùng cho lastmod trong sitemap",
    )

    slugs = serializers.SerializerMethodField(
        help_text="Slug của bản đang xuất bản theo từng ngôn ngữ (đổi ngôn ngữ, hreflang)"
    )

    @extend_schema_field(serializers.DictField(child=serializers.CharField()))
    def get_slugs(self, obj: NewsPost) -> dict[str, str]:
        known: dict[Any, dict[str, str]] | None = self.context.get("slugs")
        if known is None:
            known = selectors.slugs_by_key([obj.translation_key])
        return known.get(obj.translation_key, {})

    @extend_schema_field(ImageSerializer(allow_null=True))
    def get_cover(self, obj: NewsPost) -> dict[str, Any] | None:
        if obj.cover is None:
            return None
        return dict(ImageSerializer(obj.cover, context={**self.context, "alt": obj.title}).data)


class NewsDetailSerializer(NewsListSerializer):
    body = serializers.SerializerMethodField(help_text="Các khối nội dung theo thứ tự")
    seo = serializers.SerializerMethodField()

    @extend_schema_field(NEWS_BLOCK)
    def get_body(self, obj: NewsPost) -> list[dict[str, Any]]:
        return news_body_data(obj.body, self.context, obj.title)

    @extend_schema_field(PageSeoSerializer)
    def get_seo(self, obj: NewsPost) -> dict[str, object]:
        return {
            "title": obj.seo_title,
            "description": obj.seo_description,
            "noindex": obj.noindex,
        }
