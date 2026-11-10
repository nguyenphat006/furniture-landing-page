"""Tin tức "Cuộc sống tại BFC" (2026-11-09).

Mỗi bài là snippet có nháp / xuất bản / lịch sử (DraftStateMixin, RevisionMixin), xem trước trên web
(PreviewableMixin) và bản dịch (TranslatableMixin, wagtail-localize). Chỉ chữ cần dịch (tiêu đề,
tóm tắt, chữ trong các khối nội dung, SEO); loại, ngày đăng, ảnh bìa đồng bộ nguyên từ bản
gốc sang bản dịch; slug riêng từng ngôn ngữ (fill_slug). Nội dung xếp từ khối (blocks.py): đoạn
văn, ảnh, gallery, video, bảng...
Frontend đọc qua /api/v1/news và /api/v1/news/<slug>.
"""

from __future__ import annotations

import datetime
from typing import Any

from django import forms
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.http import HttpRequest, HttpResponse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from wagtail.admin.panels import FieldPanel, FieldRowPanel, MultiFieldPanel
from wagtail.fields import StreamField
from wagtail.models import (
    DraftStateMixin,
    Locale,
    PreviewableMixin,
    RevisionMixin,
    TranslatableMixin,
)
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField, TranslatableField

from apps.catalog.models.seo import SeoFields
from apps.catalog.models.taxonomy import slug_validator
from apps.core.models.base import TimeStampedModel
from apps.core.text import slugify_text

from .blocks import news_blocks


def _today() -> datetime.date:
    return timezone.localdate()


class NewsPost(
    TranslatableMixin,
    DraftStateMixin,
    PreviewableMixin,
    RevisionMixin,
    index.Indexed,
    SeoFields,
    TimeStampedModel,
):
    class Kind(models.TextChoices):
        NEWS = "news", _("Tin tức")
        NOTICE = "notice", _("Thông báo")

    title = models.CharField(_("tiêu đề"), max_length=200)
    slug = models.CharField(
        _("slug"),
        max_length=120,
        blank=True,
        validators=[slug_validator],
        help_text=_(
            "Đường dẫn /news/<slug>, tự điền từ tiêu đề khi gõ; để trống cũng tự tạo từ tiêu đề. "
            "Bản dịch có slug riêng theo tiêu đề đã dịch."
        ),
    )
    kind = models.CharField(
        _("loại"),
        max_length=16,
        choices=Kind.choices,
        default=Kind.NEWS,
        help_text=_("Thông báo có nhãn vàng trên web để nổi hơn tin thường."),
    )
    date = models.DateField(
        _("ngày đăng"),
        default=_today,
        db_index=True,
        help_text=_("Hiện trên bài và dùng để xếp thứ tự, mới nhất trước."),
    )
    cover = models.ForeignKey(
        "wagtailimages.Image",
        verbose_name=_("ảnh bìa"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text=_("Ảnh ngang, nên từ 1600px chiều rộng. Dùng cho thẻ tin và đầu bài viết."),
    )
    excerpt = models.TextField(
        _("tóm tắt"),
        max_length=300,
        help_text=_(
            "1 đến 2 câu, hiện trên thẻ tin và dưới tiêu đề bài. Trống mô tả SEO thì dùng đoạn này."
        ),
    )
    body = StreamField(
        news_blocks(),
        verbose_name=_("nội dung"),
        help_text=_(
            "Xếp bài từ các khối: đoạn văn, ảnh, gallery, video, ảnh + chữ, trích dẫn, bảng, nút, "
            "tệp. Kéo để đổi thứ tự."
        ),
    )

    _revisions = GenericRelation("wagtailcore.Revision", related_query_name="news_post")

    panels = [
        FieldPanel("title"),
        FieldRowPanel(
            [
                FieldPanel("slug", widget=forms.TextInput(attrs={"data-slug-from": "title"})),
                FieldPanel("kind"),
                FieldPanel("date"),
            ]
        ),
        FieldPanel("cover"),
        FieldPanel("excerpt"),
        FieldPanel("body"),
        MultiFieldPanel(SeoFields.seo_panels(), heading=_("SEO"), classname="collapsed"),
    ]

    translatable_fields = [
        TranslatableField("title"),
        TranslatableField("excerpt"),
        TranslatableField("body"),
        TranslatableField("seo_title"),
        TranslatableField("seo_description"),
        # Đồng bộ nhưng ghi đè được ở màn Dịch; còn trùng bản gốc thì tự tạo theo tiêu đề đã dịch
        # (fill_slug), nên mỗi ngôn ngữ một slug
        SynchronizedField("slug", overridable=True),
        SynchronizedField("kind"),
        SynchronizedField("date"),
        SynchronizedField("cover"),
        SynchronizedField("noindex"),
    ]

    search_fields = [
        index.SearchField("title"),
        index.AutocompleteField("title"),
        index.FilterField("locale_id"),
        index.FilterField("live"),
        index.FilterField("kind"),
    ]

    class Meta(TranslatableMixin.Meta):
        verbose_name = _("bài tin tức")
        verbose_name_plural = _("tin tức")
        ordering = ["-date", "-id"]
        constraints = [
            # Slug riêng từng ngôn ngữ, không trùng trong cùng một ngôn ngữ
            models.UniqueConstraint(fields=["slug", "locale"], name="news_post_slug_locale"),
        ]

    def __str__(self) -> str:
        return self.title

    def _unique_slug(self, base: str) -> str:
        """Slug chưa bài nào cùng ngôn ngữ dùng; trùng thì thêm -2, -3..."""
        base = base or "bai-viet"
        others = NewsPost.objects.filter(locale_id=self.locale_id).exclude(pk=self.pk)
        slug, n = base, 2
        while others.filter(slug=slug).exists():
            slug = f"{base[: 120 - len(str(n)) - 1]}-{n}"
            n += 1
        return slug

    def fill_slug(self) -> None:
        """Slug theo ngôn ngữ (10/11).

        - Trống: tạo từ tiêu đề.
        - Bản dịch: wagtail-localize đồng bộ slug của bản gốc sang; còn trùng slug bản gốc (người
          dịch chưa ghi đè ở màn Dịch) mà tiêu đề đã dịch khác thì tạo slug từ tiêu đề đã dịch.
          Tiêu đề dịch không đổi thì slug không đổi giữa các lần đồng bộ.
        """
        if not self.slug:
            self.slug = self._unique_slug(slugify_text(self.title))
            return
        if self.locale_id is None or self.locale_id == Locale.get_default().pk:
            return
        source = (
            NewsPost.objects.filter(
                translation_key=self.translation_key, locale=Locale.get_default()
            )
            .only("slug", "title")
            .first()
        )
        if source and self.slug == source.slug and self.title != source.title:
            self.slug = self._unique_slug(slugify_text(self.title))

    def clean(self) -> None:
        self.fill_slug()
        super().clean()

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.fill_slug()
        super().save(*args, **kwargs)

    def serve_preview(self, request: HttpRequest, mode_name: str) -> HttpResponse:
        """Xem trước trang bài viết trên web Next.js với bản đang sửa (apps/pages/preview.py)."""
        from django.conf import settings

        from apps.pages.preview import preview_response

        from .api.serializers import NewsDetailSerializer

        language = self.locale.language_code
        prefix = "" if language == settings.LANGUAGE_CODE else f"/{language}"
        # Thuộc tính annotate ở selectors.live_posts; bản đang sửa luôn là bản của chính nó
        self.__dict__["is_fallback"] = False
        context = {"request": request}
        return preview_response(
            request,
            kind="news",
            key=self.slug,
            locale=language,
            path=f"{prefix}/news/{self.slug}",
            data=dict(NewsDetailSerializer(self, context=context).data),
        )
