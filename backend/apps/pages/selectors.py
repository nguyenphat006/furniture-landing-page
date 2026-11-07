"""Đọc trang nội dung cho API."""

from __future__ import annotations

from dataclasses import dataclass

from wagtail.models import Locale

from .models import ContentPage, HomePage, PrivacyPage, SharedSection, TermsPage

# Khoá trong URL /api/v1/pages/<key> → loại trang (mỗi ngôn ngữ một trang)
PAGE_MODELS: dict[str, type[ContentPage]] = {
    "home": HomePage,
    "privacy": PrivacyPage,
    "terms": TermsPage,
}


@dataclass(frozen=True)
class FoundPage:
    page: ContentPage
    # Chưa có bản dịch đã xuất bản: trả bản tiếng Việt (frontend gắn noindex, docs/adr/0003)
    is_fallback: bool


def live_page(key: str, language: str) -> FoundPage | None:
    model = PAGE_MODELS.get(key)
    if model is None:
        return None
    pages = model.objects.live().select_related("og_image")
    page = pages.filter(locale__language_code=language).first()
    if page is not None:
        return FoundPage(page, is_fallback=False)
    page = pages.filter(locale=Locale.get_default()).first()
    return FoundPage(page, is_fallback=True) if page is not None else None


def live_section(section: SharedSection | None) -> SharedSection | None:
    """Section đang xuất bản; bản dịch chưa xuất bản thì dùng bản gốc nếu bản gốc đang xuất bản."""
    if section is None:
        return None
    if section.live:
        return section
    return SharedSection.objects.filter(
        translation_key=section.translation_key, locale=Locale.get_default(), live=True
    ).first()
