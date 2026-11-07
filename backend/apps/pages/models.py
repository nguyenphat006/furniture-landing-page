"""Trang nội dung (Trang chủ, trang pháp lý, sau này Năng lực...) và Section dùng chung.

Xem docs/adr/0013. Trang là trang Wagtail: có nháp, lịch sử, lên lịch, bản dịch (wagtail-localize).
Site công khai là Next.js nên CMS không render trang; frontend đọc qua /api/v1/pages/<key>.
"""

from __future__ import annotations

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.utils.translation import gettext_lazy as _
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.fields import StreamField
from wagtail.models import DraftStateMixin, Page, RevisionMixin, TranslatableMixin
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField, TranslatableField

from .blocks import legal_blocks, page_blocks, section_blocks


class SharedSection(TranslatableMixin, DraftStateMixin, RevisionMixin, index.Indexed, models.Model):
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

    # Không có giao diện HTML phía CMS (headless); xem trước bằng draft mode ở bước sau
    preview_modes: list[tuple[str, str]] = []

    class Meta:
        abstract = True


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
