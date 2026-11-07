"""Thao tác ghi của app core."""

from django.conf import settings
from django.db import transaction
from wagtail.models import Locale


@transaction.atomic
def ensure_locales() -> list[Locale]:
    """Tạo các Locale của Wagtail theo WAGTAIL_CONTENT_LANGUAGES (vi mặc định, en). Idempotent."""
    return [
        Locale.objects.get_or_create(language_code=code)[0]
        for code, _ in settings.WAGTAIL_CONTENT_LANGUAGES
    ]
