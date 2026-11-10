"""Danh sách admin của model có bản dịch (TranslatableMixin): mỗi bản ghi một dòng (09/11/2026).

Mặc định Wagtail liệt kê cả bản tiếng Việt lẫn bản tiếng Anh thành hai dòng trùng tên. Mixin này chỉ
hiện bản gốc (ngôn ngữ mặc định) kèm cột "Bản tiếng Anh" (bản dịch đã xuất bản chưa). Bản dịch
mở từ nút chuyển ngôn ngữ trong màn sửa; chọn ngôn ngữ ở bộ lọc (?locale=en) thì vẫn xem được riêng.
Trạng thái tính sẵn trong câu truy vấn (Exists), không thêm truy vấn cho từng dòng.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Exists, OuterRef, QuerySet
from django.http import HttpRequest
from django.utils.translation import gettext_lazy as _
from wagtail.admin.ui.tables import Column
from wagtail.models import Locale


class TranslationStatusColumn(Column):  # type: ignore[misc]
    def __init__(self, **kwargs: Any) -> None:
        super().__init__("translation_status", label=_("Bản tiếng Anh"), **kwargs)

    def get_value(self, instance: Any) -> str:
        if getattr(instance, "_translation_live", None):
            return str(_("Đã xuất bản"))
        if getattr(instance, "_translation_exists", None):
            return str(_("Chưa xuất bản (web dùng bản tiếng Việt)"))
        return str(_("Chưa dịch"))


class SourceLocaleListingMixin:
    """Đặt trước SnippetViewSet: class XViewSet(SourceLocaleListingMixin, SnippetViewSet)."""

    model: Any

    def get_queryset(self, request: HttpRequest) -> QuerySet[Any]:
        qs: QuerySet[Any] = self.model._default_manager.all()
        if request.GET.get("locale"):
            return qs
        others = self.model._default_manager.filter(
            translation_key=OuterRef("translation_key")
        ).exclude(locale_id=OuterRef("locale_id"))
        annotations: dict[str, Any] = {"_translation_exists": Exists(others)}
        if hasattr(self.model, "live"):
            annotations["_translation_live"] = Exists(others.filter(live=True))
        source: QuerySet[Any] = qs.filter(locale=Locale.get_default()).annotate(**annotations)
        return source
