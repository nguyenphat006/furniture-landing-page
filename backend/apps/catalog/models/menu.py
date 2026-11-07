"""Menu con Vật liệu trên header (docs/adr/0012).

Menu Sản phẩm tự lấy Nhóm → Loại (ô "Hiện trong menu" ở từng nhóm, loại). Menu Vật liệu cần cách
gom riêng: nhóm "Kim loại" không phải một vật liệu, và có mục con chỉ là loại gỗ / kim loại (Teak,
Inox...) trỏ về trang vật liệu gần nhất. Mọi mục đều chọn vật liệu từ bảng Chất liệu, nên không
có link chết; tên để trống thì dùng tên vật liệu.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.admin.panels import FieldPanel, FieldRowPanel, InlinePanel
from wagtail.models import Orderable

from apps.core.models import TimeStampedModel

if TYPE_CHECKING:
    from .taxonomy import Material


class MenuLabelMixin(models.Model):
    name = models.CharField(
        _("tên (tiếng Việt)"),
        max_length=80,
        blank=True,
        help_text=_("Trống thì dùng tên vật liệu."),
    )
    name_en = models.CharField(_("tên (tiếng Anh)"), max_length=80, blank=True)

    class Meta:
        abstract = True

    material: models.ForeignKey[Material | None, Material | None]

    def label(self, language: str) -> str:
        own = self.name_en if language == "en" else self.name
        if own:
            return own
        return self.material.label(language) if self.material else self.name


class MaterialMenuGroup(MenuLabelMixin, ClusterableModel, TimeStampedModel):
    material = models.ForeignKey(
        "catalog.Material",
        verbose_name=_("trang vật liệu"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text=_("Trống: nhóm không có trang riêng (vd Kim loại), dẫn về mục con đầu tiên."),
    )
    sort_order = models.PositiveIntegerField(_("thứ tự"), default=0, db_index=True)
    show_in_menu = models.BooleanField(_("hiện trong menu"), default=True)

    panels = [
        FieldRowPanel([FieldPanel("name"), FieldPanel("name_en")]),
        FieldRowPanel([FieldPanel("material"), FieldPanel("sort_order")]),
        FieldPanel("show_in_menu"),
        InlinePanel("items", heading=_("Mục con"), label=_("mục con")),
    ]

    class Meta:
        verbose_name = _("nhóm menu vật liệu")
        verbose_name_plural = _("menu vật liệu")
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.label("vi") or str(_("(chưa đặt tên)"))

    def clean(self) -> None:
        super().clean()
        if self.material_id is None and not self.name:
            raise ValidationError({"name": _("Nhóm không chọn trang vật liệu thì cần có tên.")})


class MaterialMenuItem(MenuLabelMixin, Orderable):
    group = ParentalKey(MaterialMenuGroup, on_delete=models.CASCADE, related_name="items")
    material = models.ForeignKey(
        "catalog.Material",
        verbose_name=_("trang vật liệu"),
        on_delete=models.CASCADE,
        related_name="+",
    )

    panels = [
        FieldPanel("material"),
        FieldRowPanel([FieldPanel("name"), FieldPanel("name_en")]),
    ]

    class Meta(Orderable.Meta):
        verbose_name = _("mục con")

    def __str__(self) -> str:
        return self.label("vi")
