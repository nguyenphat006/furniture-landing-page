"""Truy vấn đọc của app core."""

from dataclasses import dataclass

from django.conf import settings
from wagtail.models import Locale


@dataclass(frozen=True)
class LocaleInfo:
    code: str
    name: str
    is_default: bool


def locale_list() -> list[LocaleInfo]:
    """Ngôn ngữ nội dung đã bật (theo LANGUAGES), ngôn ngữ mặc định đứng đầu."""
    names = dict(settings.WAGTAIL_CONTENT_LANGUAGES)
    enabled = set(Locale.objects.values_list("language_code", flat=True))
    items = [
        LocaleInfo(code=code, name=names[code], is_default=code == settings.LANGUAGE_CODE)
        for code, _ in settings.WAGTAIL_CONTENT_LANGUAGES
        if code in enabled
    ]
    return sorted(items, key=lambda i: not i.is_default)
