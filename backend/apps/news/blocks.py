"""Khối nội dung của bài tin tức (2026-11-09).

Admin xếp bài từ các khối: đoạn văn, ảnh, gallery, video, ảnh + chữ, trích dẫn, bảng, nút liên
kết, tệp đính kèm. Chữ trong khối được dịch qua wagtail-localize; ảnh, video, tệp dùng chung hai
ngôn ngữ.
Frontend vẽ từng khối theo `type` (xem api/serializers.py).
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any
from urllib.parse import parse_qs, urlparse

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from wagtail import blocks
from wagtail.blocks.struct_block import StructBlockValidationError
from wagtail.contrib.typed_table_block.blocks import TypedTable, TypedTableBlock
from wagtail.documents.blocks import DocumentChooserBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.rich_text import RichText
from wagtail_localize.segments import StringSegmentValue, TemplateSegmentValue
from wagtail_localize.segments.ingest import organise_template_segments
from wagtail_localize.strings import extract_strings, restore_strings

from apps.core.blocks import LineTextBlock

TEXT_FEATURES = ["h2", "h3", "bold", "italic", "ol", "ul", "link"]
INLINE_FEATURES = ["bold", "italic", "link"]

VIDEO_EXTENSIONS = (".mp4", ".webm")
VIDEO_MAX_BYTES = 50 * 1024 * 1024

SIZE_CHOICES = [("text", _("Nhỏ, căn giữa")), ("wide", _("Rộng hết cột"))]


def parse_video_url(url: str) -> tuple[str, str] | None:
    """(nhà cung cấp, mã video) của link YouTube / Vimeo; link khác thì None."""
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    path = parsed.path.strip("/")
    if host in ("youtube.com", "youtube-nocookie.com"):
        if path == "watch":
            video = parse_qs(parsed.query).get("v", [""])[0]
        else:
            parts = path.split("/")
            video = parts[1] if len(parts) > 1 and parts[0] in ("embed", "shorts", "live") else ""
        return ("youtube", video) if re.fullmatch(r"[\w-]{11}", video) else None
    if host == "youtu.be":
        video = path.split("/")[0]
        return ("youtube", video) if re.fullmatch(r"[\w-]{11}", video) else None
    if host in ("vimeo.com", "player.vimeo.com"):
        video = next((p for p in path.split("/") if p.isdigit()), "")
        return ("vimeo", video) if video else None
    return None


class ParagraphBlock(blocks.RichTextBlock):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(features=TEXT_FEATURES, **kwargs)

    class Meta:
        icon = "pilcrow"
        label = _("Đoạn văn")


class ImageBlock(blocks.StructBlock):
    image = ImageChooserBlock(label=_("ảnh"))
    caption = blocks.CharBlock(label=_("chú thích"), required=False, max_length=200)
    size = blocks.ChoiceBlock(choices=SIZE_CHOICES, default="text", label=_("cỡ"))

    class Meta:
        icon = "image"
        label = _("Ảnh")
        help_text = _("Bấm vào ảnh trên web để xem lớn.")


class GalleryImageBlock(blocks.StructBlock):
    image = ImageChooserBlock(label=_("ảnh"))
    caption = blocks.CharBlock(label=_("chú thích"), required=False, max_length=200)


class GalleryBlock(blocks.StructBlock):
    layout = blocks.ChoiceBlock(
        choices=[
            ("grid-2", _("Lưới 2 cột")),
            ("grid-3", _("Lưới 3 cột")),
            ("slider", _("Slider tự chạy")),
        ],
        default="grid-3",
        label=_("kiểu"),
    )
    images = blocks.ListBlock(GalleryImageBlock(), min_num=2, label=_("ảnh"))
    caption = blocks.CharBlock(label=_("chú thích chung"), required=False, max_length=200)

    class Meta:
        icon = "image"
        label = _("Gallery")
        help_text = _("Từ 2 ảnh. Bấm ảnh trên web để xem lớn, lướt qua lại được.")


class VideoBlock(blocks.StructBlock):
    url = blocks.URLBlock(
        label=_("link YouTube / Vimeo"),
        required=False,
        help_text=_("Dán link video, ví dụ https://www.youtube.com/watch?v=..."),
    )
    file = DocumentChooserBlock(
        label=_("hoặc tệp video"),
        required=False,
        help_text=_("MP4 hoặc WebM, tối đa 50 MB. Video dài nên đưa lên YouTube rồi dán link."),
    )
    poster = ImageChooserBlock(
        label=_("ảnh bìa"),
        required=False,
        help_text=_("Hiện trước khi bấm phát. Trống: YouTube dùng ảnh của video."),
    )
    caption = blocks.CharBlock(label=_("chú thích"), required=False, max_length=200)
    size = blocks.ChoiceBlock(choices=SIZE_CHOICES, default="wide", label=_("cỡ"))

    class Meta:
        icon = "media"
        label = _("Video")

    def clean(self, value: Any) -> Any:
        value = super().clean(value)
        url, file = value.get("url"), value.get("file")
        errors: dict[str, ValidationError] = {}
        if bool(url) == bool(file):
            errors["url"] = ValidationError(_("Chọn một trong hai: link hoặc tệp video."))
        elif url and parse_video_url(url) is None:
            errors["url"] = ValidationError(_("Chỉ nhận link YouTube hoặc Vimeo."))
        elif file:
            name = file.file.name.lower()
            if not name.endswith(VIDEO_EXTENSIONS):
                errors["file"] = ValidationError(_("Tệp video phải là MP4 hoặc WebM."))
            elif file.file.size > VIDEO_MAX_BYTES:
                errors["file"] = ValidationError(_("Tệp video tối đa 50 MB."))
        if errors:
            raise StructBlockValidationError(block_errors=errors)
        return value


class ImageTextBlock(blocks.StructBlock):
    image = ImageChooserBlock(label=_("ảnh"))
    image_position = blocks.ChoiceBlock(
        choices=[("left", _("Ảnh bên trái")), ("right", _("Ảnh bên phải"))],
        default="left",
        label=_("vị trí ảnh"),
    )
    heading = blocks.CharBlock(label=_("tiêu đề"), required=False, max_length=150)
    text = blocks.RichTextBlock(features=["bold", "italic", "ul", "ol", "link"], label=_("chữ"))

    class Meta:
        icon = "doc-full"
        label = _("Ảnh + chữ")


class QuoteBlock(blocks.StructBlock):
    quote = LineTextBlock(label=_("câu trích"))
    author = blocks.CharBlock(label=_("người nói"), required=False, max_length=100)
    role = blocks.CharBlock(label=_("chức vụ"), required=False, max_length=150)

    class Meta:
        icon = "openquote"
        label = _("Trích dẫn")


class TableBlock(TypedTableBlock):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            [
                ("text", blocks.CharBlock(label=_("Chữ"), required=False)),
                ("rich", blocks.RichTextBlock(features=INLINE_FEATURES, label=_("Chữ định dạng"))),
            ],
            **kwargs,
        )

    class Meta:
        icon = "table"
        label = _("Bảng")
        help_text = _("Thêm cột (tên cột ở hàng đầu), rồi thêm hàng. Có ô chú thích dưới bảng.")

    # wagtail-localize không biết TypedTableBlock: tự tách tên cột, từng ô, chú thích thành chuỗi
    # dịch (đường dẫn theo vị trí; bản dịch giữ nguyên số hàng / cột của bản gốc).

    def get_translatable_segments(self, value: TypedTable) -> list[Any]:
        segments: list[Any] = []
        for i, column in enumerate(value.columns):
            if column["heading"]:
                segments.append(StringSegmentValue(f"heading.{i}", column["heading"]))
        for r, row in enumerate(value.row_data):
            for c, (column, cell) in enumerate(zip(value.columns, row["values"], strict=False)):
                path = f"cell.{r}.{c}"
                if isinstance(cell, RichText):
                    template, strings = extract_strings(cell.source)
                    segments.append(TemplateSegmentValue(path, "html", template, len(strings)))
                    segments.extend(StringSegmentValue(path, s, attrs=a) for s, a in strings)
                elif cell and column["block"].name == "text":
                    segments.append(StringSegmentValue(path, cell))
        if value.caption:
            segments.append(StringSegmentValue("caption", value.caption))
        return segments

    def restore_translated_segments(self, value: TypedTable, segments: list[Any]) -> TypedTable:
        grouped: dict[str, list[Any]] = defaultdict(list)
        for segment in segments:
            grouped[segment.path].append(segment)
        columns = [dict(column) for column in value.columns]
        rows = [{"values": list(row["values"])} for row in value.row_data]
        caption = value.caption
        for path, items in grouped.items():
            kind, *index = path.split(".")
            if kind == "caption":
                caption = items[0].render_text()
            elif kind == "heading":
                columns[int(index[0])]["heading"] = items[0].render_text()
            elif kind == "cell":
                r, c = int(index[0]), int(index[1])
                if isinstance(rows[r]["values"][c], RichText):
                    _format, template, strings = organise_template_segments(items)
                    rows[r]["values"][c] = RichText(restore_strings(template, strings))
                else:
                    rows[r]["values"][c] = items[0].render_text()
        return TypedTable(columns=columns, row_data=rows, caption=caption)


def _validate_link(value: str) -> None:
    if not re.match(r"^(https?://|mailto:|tel:|/)", value or ""):
        raise ValidationError(
            _("Link bắt đầu bằng https://, mailto:, tel: hoặc / (trang trong site, vd /contact).")
        )


class ButtonBlock(blocks.StructBlock):
    label = blocks.CharBlock(label=_("chữ trên nút"), max_length=60)
    url = blocks.CharBlock(
        label=_("link"),
        max_length=500,
        validators=[_validate_link],
        help_text=_("Trang trong site (/contact, /products...) hoặc link ngoài https://..."),
    )

    class Meta:
        icon = "link"
        label = _("Nút liên kết")


class FileBlock(blocks.StructBlock):
    document = DocumentChooserBlock(label=_("tệp"))
    label = blocks.CharBlock(
        label=_("tên hiện trên web"),
        required=False,
        max_length=150,
        help_text=_("Trống thì dùng tên tệp trong thư viện."),
    )

    class Meta:
        icon = "doc-full-inverse"
        label = _("Tệp đính kèm")


def news_blocks() -> list[tuple[str, blocks.Block]]:
    return [
        ("paragraph", ParagraphBlock()),
        ("image", ImageBlock()),
        ("gallery", GalleryBlock()),
        ("video", VideoBlock()),
        ("image_text", ImageTextBlock()),
        ("quote", QuoteBlock()),
        ("table", TableBlock()),
        ("button", ButtonBlock()),
        ("file", FileBlock()),
    ]
