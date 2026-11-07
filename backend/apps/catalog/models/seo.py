"""Trường SEO riêng cho trang sản phẩm, nhóm, vật liệu (docs/adr/0012).

Trống thì frontend tự tạo từ nội dung (tên, mô tả), rồi tới SEO mặc định ở
Cài đặt → Thông tin chung.
`noindex`: trang vẫn xem được nhưng Google không đưa vào kết quả tìm kiếm và sitemap bỏ qua.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _
from wagtail.admin.panels import FieldPanel, FieldRowPanel, MultiFieldPanel

TITLE_HELP = _("Khoảng 50 đến 60 ký tự. Trống thì web tự tạo từ tên.")
DESCRIPTION_HELP = _("Khoảng 120 đến 160 ký tự. Trống thì web tự tạo từ mô tả.")


class SeoFields(models.Model):
    seo_title = models.CharField(_("tiêu đề SEO"), max_length=120, blank=True, help_text=TITLE_HELP)
    seo_description = models.TextField(
        _("mô tả SEO"), max_length=300, blank=True, help_text=DESCRIPTION_HELP
    )
    noindex = models.BooleanField(
        _("ẩn khỏi Google"),
        default=False,
        help_text=_("Trang vẫn xem được bằng link, nhưng không lên kết quả tìm kiếm và sitemap."),
    )

    class Meta:
        abstract = True

    @staticmethod
    def seo_panels() -> list[FieldPanel]:
        return [FieldPanel("seo_title"), FieldPanel("seo_description"), FieldPanel("noindex")]


class BilingualSeoFields(SeoFields):
    """SEO song ngữ theo cột `_en` (phân loại, vật liệu)."""

    seo_title_en = models.CharField(
        _("tiêu đề SEO (tiếng Anh)"), max_length=120, blank=True, help_text=TITLE_HELP
    )
    seo_description_en = models.TextField(
        _("mô tả SEO (tiếng Anh)"), max_length=300, blank=True, help_text=DESCRIPTION_HELP
    )

    class Meta:
        abstract = True

    @staticmethod
    def bilingual_seo_panel() -> MultiFieldPanel:
        return MultiFieldPanel(
            [
                FieldRowPanel([FieldPanel("seo_title"), FieldPanel("seo_title_en")]),
                FieldRowPanel([FieldPanel("seo_description"), FieldPanel("seo_description_en")]),
                FieldPanel("noindex"),
            ],
            heading=_("SEO"),
            classname="collapsed",
        )

    def seo_for(self, language: str) -> dict[str, object]:
        # Không lấy tiếng Việt cho trang tiếng Anh: để trống thì frontend tự tạo bằng tiếng Anh
        def pick(field: str) -> str:
            return str(getattr(self, f"{field}_en" if language == "en" else field))

        return {
            "title": pick("seo_title"),
            "description": pick("seo_description"),
            "noindex": self.noindex,
        }
