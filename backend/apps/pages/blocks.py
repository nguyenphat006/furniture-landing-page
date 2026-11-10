"""Block StreamField của trang nội dung (docs/adr/0013).

Mỗi block khớp 1-1 với một section đang có ở frontend: quản trị viên sửa chữ, ảnh, thứ tự, thêm /
bớt section; bố cục và design system nằm ở frontend, admin không đổi được.
Chữ trên nút để trống thì frontend dùng nhãn mặc định trong messages.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

from django import forms
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from wagtail import blocks
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock

from apps.core.blocks import LineTextBlock

BUTTON_HELP = _("Trống thì dùng chữ mặc định của web.")


class HeroBlock(blocks.StructBlock):
    slides = blocks.ListBlock(
        ImageChooserBlock(),
        min_num=1,
        max_num=8,
        label=_("Ảnh trình chiếu"),
        help_text=_("Ảnh ngang, rộng từ 2000px. Ảnh đầu tiên hiện trước."),
    )
    title = LineTextBlock(
        label=_("Tiêu đề"),
        help_text=_("Xuống dòng để ngắt dòng ở màn hình lớn (điện thoại tự xuống dòng)."),
    )
    lede = LineTextBlock(label=_("Mô tả"), required=False)
    button_label = blocks.CharBlock(
        label=_("Chữ trên nút báo giá"), required=False, help_text=BUTTON_HELP
    )

    class Meta:
        icon = "image"
        label = _("Ảnh lớn đầu trang (hero)")


class IntroBlock(blocks.StructBlock):
    heading = blocks.CharBlock(
        label=_("Tiêu đề ẩn"),
        help_text=_("Không hiện trên trang; dùng cho trình đọc màn hình và Google."),
    )
    quote = LineTextBlock(label=_("Câu trích dẫn"))
    body = LineTextBlock(label=_("Đoạn giới thiệu"))
    button_label = blocks.CharBlock(
        label=_("Chữ trên nút (dẫn tới Về chúng tôi)"), required=False, help_text=BUTTON_HELP
    )

    class Meta:
        icon = "openquote"
        label = _("Giới thiệu (câu trích dẫn)")


class CtaBlock(blocks.StructBlock):
    kicker = blocks.CharBlock(label=_("Dòng nhỏ phía trên"))
    title = blocks.CharBlock(label=_("Tiêu đề"))
    image = ImageChooserBlock(
        label=_("Ảnh nền"), required=False, help_text=_("Hiện mờ dưới lớp màu xanh.")
    )
    quote_label = blocks.CharBlock(
        label=_("Chữ nút báo giá"), required=False, help_text=BUTTON_HELP
    )
    visit_label = blocks.CharBlock(
        label=_("Chữ nút đặt lịch thăm nhà máy"), required=False, help_text=BUTTON_HELP
    )

    class Meta:
        icon = "mail"
        label = _("Kêu gọi liên hệ (CTA)")


# Nước vẽ được trên bản đồ xuất khẩu: sinh cùng frontend/src/features/home/world-dots.ts
# (toạ độ chấm nước, kích thước bản đồ), dùng cho danh sách chọn và bộ chọn vị trí trong admin.
EXPORT_COUNTRIES_FILE = Path(__file__).parent / "static" / "pages" / "export-countries.json"


@cache
def export_map() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(EXPORT_COUNTRIES_FILE.read_text(encoding="utf-8"))
    return data


def export_country_choices() -> list[tuple[str, str]]:
    return [(c["code"], c["vi"]) for c in export_map()["countries"]]


class MapPositionWidget(forms.TextInput):
    """Ô "x,y" (đơn vị bản đồ) kèm ảnh bản đồ: bấm lên bản đồ để đặt vị trí cờ."""

    template_name = "pages/widgets/map_position.html"

    class Media:
        js = ("pages/map-position.js",)
        css = {"all": ("pages/map-position.css",)}

    def get_context(self, name: str, value: Any, attrs: dict[str, Any] | None) -> dict[str, Any]:
        context = super().get_context(name, value, attrs)
        data = export_map()
        context["map"] = {"width": data["width"], "height": data["height"]}
        return context


def parse_position(value: str | None) -> list[float] | None:
    """ "x,y" → [x, y] trong khung bản đồ; trống hoặc sai thì None (cờ đặt ngay tại nước)."""
    try:
        x, y = (float(v) for v in (value or "").split(","))
    except ValueError:
        return None
    data = export_map()
    if not (0 <= x <= data["width"] and 0 <= y <= data["height"]):
        return None
    return [round(x, 1), round(y, 1)]


class MapPositionBlock(blocks.FieldBlock):
    # Không kế thừa CharBlock: wagtail-localize bỏ qua block này (vị trí dùng chung mọi ngôn ngữ)
    def __init__(self, required: bool = False, **kwargs: Any) -> None:
        self.field = forms.CharField(required=required, widget=MapPositionWidget())
        super().__init__(**kwargs)

    def clean(self, value: Any) -> Any:
        value = super().clean(value)
        if value and parse_position(value) is None:
            raise ValidationError(_("Vị trí không hợp lệ, bấm lại lên bản đồ."))
        return value


LABEL_SIDES = [("C", _("Giữa điểm")), ("L", _("Bên trái điểm")), ("R", _("Bên phải điểm"))]


class ExportMarketBlock(blocks.StructBlock):
    country = blocks.ChoiceBlock(choices=export_country_choices, label=_("Nước"))
    position = MapPositionBlock(
        label=_("Vị trí cờ"),
        help_text=_(
            "Bấm lên bản đồ để đặt cờ (có que nối về nước). Trống thì cờ nằm ngay trên nước. "
            "Chấm vàng: nước đang chọn; chấm trắng: các nước khác trong danh sách."
        ),
    )
    side = blocks.ChoiceBlock(
        choices=LABEL_SIDES, default="C", label=_("Cờ nằm ở"), help_text=_("So với điểm vừa bấm.")
    )

    class Meta:
        icon = "site"
        label = _("Nước")


class ExportStatBlock(blocks.StructBlock):
    value = blocks.CharBlock(label=_("Con số"), max_length=12, help_text=_("Ví dụ: 20+, 2010."))
    label = blocks.CharBlock(label=_("Chú thích"))

    class Meta:
        icon = "order"


class ExportBlock(blocks.StructBlock):
    kicker = blocks.CharBlock(label=_("Dòng nhỏ phía trên"))
    title = blocks.CharBlock(label=_("Tiêu đề"))
    markets = blocks.ListBlock(ExportMarketBlock(), min_num=1, label=_("Thị trường trên bản đồ"))
    stats = blocks.ListBlock(ExportStatBlock(), max_num=4, label=_("Số liệu"))

    class Meta:
        icon = "site"
        label = _("Xuất khẩu (bản đồ thị trường)")


class FactoryBlock(blocks.StructBlock):
    kicker = blocks.CharBlock(label=_("Dòng nhỏ phía trên"))
    title = blocks.CharBlock(label=_("Tiêu đề"))
    lede = LineTextBlock(label=_("Mô tả"), required=False)
    image = ImageChooserBlock(label=_("Ảnh lớn"), help_text=_("Ảnh ngang, tràn mép trái."))
    detail_image = ImageChooserBlock(
        label=_("Ảnh chi tiết"), help_text=_("Ảnh dọc nhỏ, đè góc dưới ảnh lớn.")
    )
    points = blocks.ListBlock(blocks.CharBlock(), max_num=5, label=_("Điểm nổi bật"))
    button_label = blocks.CharBlock(
        label=_("Chữ trên nút (dẫn tới Năng lực)"), required=False, help_text=BUTTON_HELP
    )

    class Meta:
        icon = "home"
        label = _("Nhà máy")


class FaqItemBlock(blocks.StructBlock):
    question = blocks.CharBlock(label=_("Câu hỏi"), max_length=200)
    answer = LineTextBlock(label=_("Trả lời"))

    class Meta:
        icon = "help"
        label = _("Câu hỏi")


class FaqBlock(blocks.StructBlock):
    """Câu hỏi thường gặp (2026-11-09): trái tiêu đề + nút liên hệ, phải các câu hỏi mở ra được."""

    kicker = blocks.CharBlock(label=_("Dòng nhỏ phía trên"))
    title = blocks.CharBlock(label=_("Tiêu đề"))
    note = blocks.CharBlock(
        label=_("Dòng dưới tiêu đề"),
        required=False,
        help_text=_("Ví dụ: Chưa thấy câu trả lời bạn cần?"),
    )
    button_label = blocks.CharBlock(
        label=_("Chữ trên nút (dẫn tới Liên hệ)"), required=False, help_text=BUTTON_HELP
    )
    items = blocks.ListBlock(FaqItemBlock(), min_num=1, label=_("Câu hỏi"))

    class Meta:
        icon = "help"
        label = _("Câu hỏi thường gặp")


class LegalSectionBlock(blocks.StructBlock):
    """Một mục của trang pháp lý: tiêu đề + nội dung (đoạn văn, danh sách, link)."""

    heading = blocks.CharBlock(label=_("Tiêu đề mục"))
    body = blocks.RichTextBlock(
        features=["bold", "italic", "ol", "ul", "link"], label=_("Nội dung")
    )

    class Meta:
        icon = "doc-full"
        label = _("Mục")


def legal_blocks() -> list[tuple[str, blocks.Block]]:
    return [("legal", LegalSectionBlock())]


# Section lấy nội dung từ catalog (chữ tiêu đề trong web): admin chỉ đặt vị trí hoặc bỏ khỏi trang.
# Sửa nội dung ở Sản phẩm → Nhóm / Chất liệu (user chốt 07/11/2026).
CODED_SECTIONS = [
    ("products", _("Nhóm sản phẩm (lấy từ Sản phẩm → Nhóm)")),
    ("materials", _("Vật liệu, dạng carousel (lấy từ Sản phẩm → Chất liệu)")),
    ("news", _("Cuộc sống tại BFC: 4 tin mới nhất (lấy từ Tin tức)")),
]


class CodedSectionBlock(blocks.StructBlock):
    section = blocks.ChoiceBlock(choices=CODED_SECTIONS, label=_("Section"))

    class Meta:
        icon = "code"
        label = _("Section lấy từ Sản phẩm / Tin tức")
        help_text = _("Nội dung lấy từ Sản phẩm hoặc Tin tức; ở đây chỉ chọn vị trí trên trang.")


def section_blocks() -> list[tuple[str, blocks.Block]]:
    """Block dùng được cả trong trang lẫn trong Section dùng chung."""
    return [
        ("intro", IntroBlock()),
        ("export", ExportBlock()),
        ("factory", FactoryBlock()),
        ("cta", CtaBlock()),
        ("faq", FaqBlock()),
        ("section", CodedSectionBlock()),
    ]


def page_blocks() -> list[tuple[str, blocks.Block]]:
    return [
        ("hero", HeroBlock()),
        *section_blocks(),
        (
            "shared",
            SnippetChooserBlock(
                "pages.SharedSection",
                icon="link",
                label=_("Section dùng chung"),
                help_text=_("Sửa ở Nội dung → Section dùng chung: mọi trang đang chèn đều đổi."),
            ),
        ),
    ]
