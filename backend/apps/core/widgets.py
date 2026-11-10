"""Ô chọn có hình cho admin (10/11): gọn như select, bấm mới thả danh sách hình + tên xuống.

Thẻ <select> không hiện được SVG, nên dựng bằng <details> bọc nhóm radio: form gửi như radio bình
thường, không JS vẫn dùng được (bấm mở / đóng), bàn phím chọn bằng mũi tên. JS chung
(static/core/js/visual-picker.js) cập nhật dòng đang chọn, đóng khi chọn, bấm ra ngoài hoặc Esc.
Lớp con cho hình từng lựa chọn qua visual(value) (HTML an toàn: SVG/IMG do repo sinh ra).
"""

from __future__ import annotations

from typing import Any

from django import forms
from django.utils.safestring import SafeString


class VisualRadioSelect(forms.RadioSelect):
    template_name = "core/widgets/visual_picker.html"
    #: Tên của lựa chọn trống (trường blank=True), vd "Theo loại"
    empty_label = "Mặc định"

    def visual(self, value: str) -> SafeString | str:
        return ""

    def get_context(self, name: str, value: Any, attrs: dict[str, Any] | None) -> dict[str, Any]:
        context = super().get_context(name, value, attrs)
        current = None
        for _group, options, _index in context["widget"]["optgroups"]:
            # Trường bắt buộc: bỏ lựa chọn trống "---------" Django tự thêm
            options[:] = [o for o in options if o["value"] or not self.is_required]
            for option in options:
                if option["value"]:
                    option["visual"] = self.visual(str(option["value"]))
                else:
                    option["visual"] = ""
                    option["label"] = self.empty_label
                if option["selected"]:
                    current = option
        context["widget"]["current"] = current
        return context
