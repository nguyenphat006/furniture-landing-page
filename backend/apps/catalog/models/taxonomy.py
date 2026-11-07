"""Phân loại sản phẩm: Nhóm → Loại, cùng Chất liệu và Tính năng (bộ lọc).

Slug giữ đúng như frontend/src/data/catalog/taxonomy.ts để URL không đổi. Slug là khoá ổn định:
chữ thường ASCII nối bằng "-", tiếng Anh, giống nhau ở mọi ngôn ngữ; đã public thì không đổi.

Tên hiển thị có 2 cột vi / en nhập tay (ít mục, cần chuẩn thuật ngữ), không qua wagtail-localize:
xem docs/adr/0007.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from wagtail.admin.panels import FieldPanel, FieldRowPanel, MultiFieldPanel
from wagtail.search import index

from apps.core.models import TimeStampedModel

from .seo import BilingualSeoFields

if TYPE_CHECKING:
    from django_stubs_ext import StrOrPromise

slug_validator = RegexValidator(
    r"^[a-z0-9]+(-[a-z0-9]+)*$",
    _("Chỉ dùng chữ thường không dấu, số và dấu gạch ngang, ví dụ: dining-chairs."),
)


class TaxonomyBase(TimeStampedModel):
    slug = models.CharField(
        _("slug"),
        max_length=80,
        unique=True,
        validators=[slug_validator],
        help_text=_("Dùng trong URL và bộ lọc. Đã public thì không đổi."),
    )
    name = models.CharField(_("tên (tiếng Việt)"), max_length=120)
    name_en = models.CharField(_("tên (tiếng Anh)"), max_length=120)
    sort_order = models.PositiveIntegerField(_("thứ tự"), default=0, db_index=True)

    panels = [
        FieldRowPanel([FieldPanel("name"), FieldPanel("name_en")]),
        FieldRowPanel([FieldPanel("slug"), FieldPanel("sort_order")]),
    ]

    search_fields = [
        index.SearchField("name"),
        index.SearchField("name_en"),
        index.AutocompleteField("name"),
        index.FilterField("slug"),
    ]

    class Meta:
        abstract = True
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.name

    def label(self, language: str) -> str:
        """Tên theo ngôn ngữ; ngôn ngữ khác tiếng Anh dùng tiếng Việt."""
        return self.name_en if language == "en" else self.name


class Category(index.Indexed, BilingualSeoFields, TaxonomyBase):
    """Tầng 1: nhóm theo không gian dùng (trang /products/<nhóm>)."""

    show_in_menu = models.BooleanField(_("hiện trong menu"), default=True)
    description = models.TextField(
        _("mô tả ngắn (tiếng Việt)"),
        blank=True,
        help_text=_("Một câu dưới tên nhóm: ô nhóm ở trang chủ, đầu trang nhóm, mô tả Google."),
    )
    description_en = models.TextField(
        _("mô tả ngắn (tiếng Anh)"),
        blank=True,
        help_text=_("Trống thì trang tiếng Anh dùng bản tiếng Việt."),
    )

    cover = models.ForeignKey(
        "wagtailimages.Image",
        verbose_name=_("ảnh bìa"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    panels = [
        *TaxonomyBase.panels,
        FieldRowPanel([FieldPanel("description"), FieldPanel("description_en")]),
        FieldRowPanel([FieldPanel("cover"), FieldPanel("show_in_menu")]),
        BilingualSeoFields.bilingual_seo_panel(),
    ]

    class Meta(TaxonomyBase.Meta):
        verbose_name = _("nhóm sản phẩm")
        verbose_name_plural = _("nhóm sản phẩm")

    def description_for(self, language: str) -> str:
        """Mô tả theo ngôn ngữ; bản tiếng Anh trống thì dùng tiếng Việt (nội dung, khác SEO)."""
        if language == "en" and self.description_en:
            return self.description_en
        return self.description


class ProductType(index.Indexed, TaxonomyBase):
    """Tầng 2: loại sản phẩm, thuộc đúng một nhóm (bộ lọc ?type= trong trang nhóm)."""

    category = models.ForeignKey(
        Category,
        verbose_name=_("nhóm"),
        on_delete=models.PROTECT,
        related_name="types",
    )
    is_set = models.BooleanField(
        _("là bộ"),
        default=False,
        help_text=_("Sản phẩm thuộc loại này là một bộ nhiều món và khai báo từng món con."),
    )
    show_in_menu = models.BooleanField(_("hiện trong menu"), default=True)

    panels = [
        *TaxonomyBase.panels,
        FieldRowPanel([FieldPanel("category"), FieldPanel("is_set")]),
        FieldPanel("show_in_menu"),
    ]

    class Meta(TaxonomyBase.Meta):
        verbose_name = _("loại sản phẩm")
        verbose_name_plural = _("loại sản phẩm")
        ordering = ["category__sort_order", "sort_order", "id"]


def paragraphs(value: str) -> list[str]:
    """Đoạn văn cách nhau bằng một dòng trống; dòng xuống trong cùng đoạn nối bằng dấu cách."""
    blocks = re.split(r"\n\s*\n", value.replace("\r\n", "\n"))
    joined = (" ".join(line.strip() for line in b.splitlines() if line.strip()) for b in blocks)
    return [p for p in joined if p]


PARAGRAPHS_HELP = _("Mỗi đoạn cách nhau bằng một dòng trống.")


def _image_fk(verbose_name: StrOrPromise, help_text: StrOrPromise) -> models.ForeignKey[Any, Any]:
    return models.ForeignKey(
        "wagtailimages.Image",
        verbose_name=verbose_name,
        help_text=help_text,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )


def _text(verbose_name: StrOrPromise) -> models.TextField[Any, Any]:
    return models.TextField(verbose_name, blank=True, help_text=PARAGRAPHS_HELP)


class Material(index.Indexed, BilingualSeoFields, TaxonomyBase):
    """Chất liệu: bộ lọc sản phẩm, đồng thời là nội dung trang /materials/<slug> (docs/adr/0010).

    `name` là nhãn ngắn trong bộ lọc ("Gỗ"); `heading` là tên trên trang Vật liệu ("Gỗ teak"),
    để trống thì dùng `name`. Chữ song ngữ theo cột `_en`, giống tên phân loại (docs/adr/0007).
    """

    heading = models.CharField(
        _("tên trên trang Vật liệu (tiếng Việt)"),
        max_length=120,
        blank=True,
        help_text=_("Để trống thì dùng tên ở trên."),
    )
    heading_en = models.CharField(
        _("tên trên trang Vật liệu (tiếng Anh)"), max_length=120, blank=True
    )
    lede = models.TextField(_("mô tả ngắn (tiếng Việt)"), blank=True)
    lede_en = models.TextField(_("mô tả ngắn (tiếng Anh)"), blank=True)
    properties = _text(_("đặc tính (tiếng Việt)"))
    properties_en = _text(_("đặc tính (tiếng Anh)"))
    craft = _text(_("gia công tại BFC (tiếng Việt)"))
    craft_en = _text(_("gia công tại BFC (tiếng Anh)"))
    care = _text(_("bảo quản (tiếng Việt)"))
    care_en = _text(_("bảo quản (tiếng Anh)"))
    image = _image_fk(
        _("ảnh đại diện"),
        _(
            "Thumbnail ở trang Vật liệu, trang chủ, trang sản phẩm và ảnh trên cùng của "
            "trang chi tiết."
        ),
    )
    detail_image = _image_fk(_("ảnh cận bề mặt"), _("Ảnh dọc ở mục Đặc tính, khác ảnh đại diện."))
    use_image = _image_fk(_("ảnh ứng dụng"), _("Ảnh sản phẩm dùng vật liệu, ở mục Đặc tính."))
    craft_image = _image_fk(_("ảnh gia công"), _("Ảnh xưởng, ở mục Gia công tại BFC."))

    panels = [
        MultiFieldPanel(TaxonomyBase.panels, heading=_("Phân loại")),
        MultiFieldPanel(
            [
                FieldRowPanel([FieldPanel("heading"), FieldPanel("heading_en")]),
                FieldRowPanel([FieldPanel("lede"), FieldPanel("lede_en")]),
                FieldRowPanel([FieldPanel("properties"), FieldPanel("properties_en")]),
                FieldRowPanel([FieldPanel("craft"), FieldPanel("craft_en")]),
                FieldRowPanel([FieldPanel("care"), FieldPanel("care_en")]),
            ],
            heading=_("Trang vật liệu"),
        ),
        MultiFieldPanel(
            [
                FieldRowPanel([FieldPanel("image"), FieldPanel("detail_image")]),
                FieldRowPanel([FieldPanel("use_image"), FieldPanel("craft_image")]),
            ],
            heading=_("Ảnh"),
        ),
        BilingualSeoFields.bilingual_seo_panel(),
    ]

    class Meta(TaxonomyBase.Meta):
        verbose_name = _("chất liệu")
        verbose_name_plural = _("chất liệu")

    def text(self, field: str, language: str) -> str:
        """Chữ theo ngôn ngữ; bản tiếng Anh còn trống thì dùng tiếng Việt."""
        value: str = getattr(self, f"{field}_en") if language == "en" else ""
        return value or str(getattr(self, field))

    def heading_for(self, language: str) -> str:
        value = self.heading_en if language == "en" else self.heading
        return value or self.label(language)


class Feature(index.Indexed, TaxonomyBase):
    """Tính năng: xoay, bập bênh, xếp chồng... (bộ lọc, không phải loại)."""

    class Meta(TaxonomyBase.Meta):
        verbose_name = _("tính năng")
        verbose_name_plural = _("tính năng")
