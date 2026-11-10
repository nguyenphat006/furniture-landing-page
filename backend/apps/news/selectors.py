"""Đọc tin tức cho API."""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.db.models import BooleanField, Case, Q, QuerySet, Value, When
from wagtail.models import Locale

from .models import NewsPost


def live_posts(locale: Locale) -> QuerySet[NewsPost]:
    """Bài đang xuất bản ở `locale`, cộng bản gốc của bài chưa dịch (hoặc bản dịch chưa xuất bản).

    `is_fallback` = True với bài trả bản gốc (frontend gắn noindex cho trang đó).
    """
    default = Locale.get_default()
    qs = NewsPost.objects.filter(live=True).select_related("cover")
    if locale.pk == default.pk:
        return qs.filter(locale=locale).annotate(
            is_fallback=Value(False, output_field=BooleanField())
        )
    translated = NewsPost.objects.filter(live=True, locale=locale).values("translation_key")
    return qs.filter(
        Q(locale=locale) | Q(locale=default) & ~Q(translation_key__in=translated)
    ).annotate(
        is_fallback=Case(
            When(locale=locale, then=Value(False)),
            default=Value(True),
            output_field=BooleanField(),
        )
    )


def post_list(locale: Locale, kind: str | None = None) -> QuerySet[NewsPost]:
    qs = live_posts(locale)
    if kind:
        qs = qs.filter(kind=kind)
    return qs.order_by("-date", "-id")


def post_detail(locale: Locale, slug: str) -> NewsPost | None:
    """Bài theo slug ở `locale`.

    Slug của bài đó ở ngôn ngữ khác cũng được (mỗi ngôn ngữ một slug: bấm đổi ngôn ngữ trên trang
    bài, link cũ): trả bản ở `locale`, frontend chuyển sang slug đúng.
    """
    posts = live_posts(locale)
    post = posts.filter(slug=slug).first()
    if post is not None:
        return post
    other = (
        NewsPost.objects.filter(slug=slug, live=True)
        .values_list("translation_key", flat=True)
        .first()
    )
    return posts.filter(translation_key=other).first() if other else None


def slugs_by_key(keys: Iterable[UUID]) -> dict[UUID, dict[str, str]]:
    """Slug của các bản đang xuất bản theo ngôn ngữ: {translation_key: {"vi": ..., "en": ...}}."""
    out: dict[UUID, dict[str, str]] = {}
    rows = NewsPost.objects.filter(translation_key__in=list(keys), live=True).values_list(
        "translation_key", "locale__language_code", "slug"
    )
    for key, language, slug in rows:
        out.setdefault(key, {})[language] = slug
    return out
