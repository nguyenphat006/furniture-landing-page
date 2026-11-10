"""Block dùng chung cho các StreamField."""

from __future__ import annotations

from typing import Any

from wagtail import blocks


def normalize_newlines(value: Any) -> Any:
    """Xuống dòng về một kiểu "\n" (ô nhiều dòng của trình duyệt gửi "\r\n")."""
    if isinstance(value, str):
        return value.replace("\r\n", "\n").replace("\r", "\n")
    return value


class LineTextBlock(blocks.TextBlock):
    """Ô chữ nhiều dòng, xuống dòng luôn lưu và đọc là "\n" (10/11).

    Lý do: dữ liệu nhập bằng lệnh dùng "\n", lưu trong admin thì thành "\r\n". wagtail-localize coi
    đó là chuỗi mới chưa dịch, bản tiếng Anh tụt về chữ tiếng Việt (tiêu đề hero 10/11). Đọc cũng
    chuẩn hoá nên dữ liệu đã lưu "\r\n" khớp lại bản dịch cũ mà không cần migration.
    """

    def to_python(self, value: Any) -> Any:
        return normalize_newlines(super().to_python(value))

    def clean(self, value: Any) -> Any:
        return normalize_newlines(super().clean(value))
