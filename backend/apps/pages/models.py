"""Trang nội dung (Trang chủ, trang pháp lý, sau này Năng lực...) và Section dùng chung.

Xem docs/adr/0013. Trang là trang Wagtail: có nháp, lịch sử, lên lịch, bản dịch (wagtail-localize).
Site công khai là Next.js nên CMS không render trang; frontend đọc qua /api/v1/pages/<key>.
"""

from __future__ import annotations

from typing import Any

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.http import HttpRequest, HttpResponse
from django.utils.translation import gettext_lazy as _
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.fields import StreamField
from wagtail.models import (
    DraftStateMixin,
    Page,
    PreviewableMixin,
    RevisionMixin,
    TranslatableMixin,
)
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField, TranslatableField

from .blocks import legal_blocks, page_blocks, section_blocks


class SharedSection(
    TranslatableMixin,
    DraftStateMixin,
    PreviewableMixin,
    RevisionMixin,
    index.Indexed,
    models.Model,
):
    """Một section chèn được vào nhiều trang; sửa một lần, mọi trang đang chèn cùng đổi."""

    name = models.CharField(
        _("tên"), max_length=120, help_text=_("Chỉ để chọn trong admin, không hiện trên web.")
    )
    body = StreamField(
        section_blocks(),
        min_num=1,
        max_num=1,
        verbose_name=_("nội dung"),
        help_text=_("Đúng một section."),
    )

    _revisions = GenericRelation("wagtailcore.Revision", related_query_name="shared_section")

    panels = [FieldPanel("name"), FieldPanel("body")]
    translatable_fields = [SynchronizedField("name"), TranslatableField("body")]
    search_fields = [index.SearchField("name"), index.AutocompleteField("name")]

    class Meta(TranslatableMixin.Meta):
        verbose_name = _("section dùng chung")
        verbose_name_plural = _("section dùng chung")

    def __str__(self) -> str:
        return self.name

    def serve_preview(self, request: HttpRequest, mode_name: str) -> HttpResponse:
        """Xem trước trên Trang chủ cùng ngôn ngữ, với section này thay bằng bản đang sửa."""
        from .api.serializers import ContentPageSerializer
        from .preview import preview_response
        from .rich_text import frontend_path

        home = HomePage.objects.filter(locale=self.locale).first()
        if home is None:
            return HttpResponse("Chưa có Trang chủ để xem trước section.")
        context = {"request": request, "is_fallback": False, "preview_section": self}
        return preview_response(
            request,
            kind="page",
            key="home",
            locale=self.locale.language_code,
            path=frontend_path(home) or "/",
            data=dict(ContentPageSerializer(home, context=context).data),
        )


class Preview(models.Model):
    """Bản nháp tạm cho nút Xem trước (apps/pages/preview.py), tự xoá khi hết hạn."""

    token = models.CharField(max_length=64, unique=True)
    kind = models.CharField(max_length=16)
    key = models.CharField(max_length=200)
    locale = models.CharField(max_length=8)
    path = models.CharField(max_length=300)
    payload = models.JSONField()
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name = _("bản xem trước")
        verbose_name_plural = _("bản xem trước")

    def __str__(self) -> str:
        return f"{self.kind}:{self.key} ({self.locale})"


class ContentPage(Page):
    """Gốc chung của trang nội dung: thân trang là các block, SEO ở tab Quảng bá."""

    body = StreamField(page_blocks(), blank=True, verbose_name=_("nội dung trang"))
    og_image = models.ForeignKey(
        "wagtailimages.Image",
        verbose_name=_("ảnh chia sẻ"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text=_("Ảnh khi chia sẻ lên Facebook, Zalo... Trống thì dùng ảnh chung của site."),
    )
    noindex = models.BooleanField(
        _("ẩn khỏi Google"),
        default=False,
        help_text=_("Trang vẫn mở được nhưng không xuất hiện trong kết quả tìm kiếm."),
    )

    content_panels = [*Page.content_panels, FieldPanel("body")]
    promote_panels = [
        MultiFieldPanel(
            [
                FieldPanel("seo_title"),
                FieldPanel("search_description"),
                FieldPanel("og_image"),
                FieldPanel("noindex"),
            ],
            heading=_("SEO"),
            help_text=_("Trống thì web tự tạo từ nội dung trang, rồi tới SEO mặc định ở Cài đặt."),
        ),
        FieldPanel("slug"),
    ]
    override_translatable_fields = [SynchronizedField("og_image"), SynchronizedField("noindex")]

    class Meta:
        abstract = True

    def serve_preview(self, request: HttpRequest, mode_name: str) -> HttpResponse:
        """Headless: chuyển sang web Next.js ở draft mode với bản đang sửa (preview.py)."""
        from .api.serializers import ContentPageSerializer
        from .preview import preview_response
        from .rich_text import frontend_path
        from .selectors import PAGE_MODELS

        key = next(k for k, model in PAGE_MODELS.items() if isinstance(self, model))
        context: dict[str, Any] = {"request": request, "is_fallback": False}
        return preview_response(
            request,
            kind="page",
            key=key,
            locale=self.locale.language_code,
            path=frontend_path(self) or "/",
            data=dict(ContentPageSerializer(self, context=context).data),
        )


class HomePage(ContentPage):
    """Trang chủ: một trang mỗi ngôn ngữ, nằm ngay dưới gốc."""

    parent_page_types = ["wagtailcore.Page"]
    subpage_types = ["pages.PrivacyPage", "pages.TermsPage"]

    class Meta:
        verbose_name = _("trang chủ")
        verbose_name_plural = _("trang chủ")


class LegalPage(ContentPage):
    """Trang pháp lý: các mục (tiêu đề + nội dung), ngày cập nhật. Web có đường dẫn cố định."""

    body = StreamField(legal_blocks(), blank=True, verbose_name=_("nội dung trang"))
    updated_on = models.DateField(
        _("ngày cập nhật"),
        null=True,
        blank=True,
        help_text=_("Hiện dưới tiêu đề trang. Đổi khi sửa nội dung chính sách."),
    )

    content_panels = [*Page.content_panels, FieldPanel("updated_on"), FieldPanel("body")]
    override_translatable_fields = [
        *ContentPage.override_translatable_fields,
        SynchronizedField("updated_on"),
    ]
    parent_page_types = ["pages.HomePage"]
    subpage_types: list[str] = []
    # Mỗi ngôn ngữ một trang (vi, en)
    max_count = 2

    class Meta:
        abstract = True


class PrivacyPage(LegalPage):
    class Meta:
        verbose_name = _("chính sách bảo mật")
        verbose_name_plural = _("chính sách bảo mật")


class TermsPage(LegalPage):
    class Meta:
        verbose_name = _("điều khoản sử dụng")
        verbose_name_plural = _("điều khoản sử dụng")
