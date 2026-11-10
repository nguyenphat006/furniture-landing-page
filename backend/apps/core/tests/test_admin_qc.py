"""Lỗi tìm được ở QC vòng 1 phía admin (07/11/2026): màn Dịch lưu chuỗi, trang khoá đăng nhập."""

from __future__ import annotations

import pytest
from django.test import Client
from django.urls import reverse
from wagtail.models import Locale, Page
from wagtail_localize.models import (
    StringSegment,
    StringTranslation,
    Translation,
    TranslationSource,
)

from apps.accounts.tests.factories import create_user
from apps.pages.models import PrivacyPage

pytestmark = pytest.mark.django_db


def test_translation_editor_saves_multipart_string(client: Client) -> None:
    # JS của màn Dịch gửi PUT multipart; DRF chỉ nhận JSON thì báo 415, không lưu được (QC 07/11)
    admin = create_user(is_superuser=True, is_staff=True)
    page = Page.objects.get(depth=1).add_child(instance=PrivacyPage(title="Chính sách", slug="cs"))
    source, _ = TranslationSource.get_or_create_from_instance(page)
    en = Locale.objects.get_or_create(language_code="en")[0]
    # Như khi bấm "Dịch": có bản sao tiếng Anh + bản ghi Translation, chuỗi chưa dịch
    page.copy_for_translation(en)
    translation = Translation.objects.create(source=source, target_locale=en)
    segment = StringSegment.objects.filter(source=source).first()
    assert segment is not None

    client.force_login(admin)
    url = reverse(
        "wagtail_localize:edit_string_translation",
        kwargs={"translation_id": translation.id, "string_segment_id": segment.id},
    )
    boundary = "qcboundary"
    crlf = "\r\n"
    body = (
        f"--{boundary}{crlf}"
        f'Content-Disposition: form-data; name="value"{crlf}{crlf}About{crlf}'
        f"--{boundary}--{crlf}"
    )
    res = client.put(url, data=body, content_type=f"multipart/form-data; boundary={boundary}")

    assert res.status_code in (200, 201), res.content
    assert StringTranslation.objects.get(translation_of_id=segment.string_id).data == "About"


def test_lockout_page_is_vietnamese(client: Client) -> None:
    create_user(username="khoa")
    for _ in range(5):
        res = client.post("/admin/login/", {"username": "khoa", "password": "sai"})

    assert res.status_code == 429
    text = res.content.decode()
    assert "Tạm khoá đăng nhập" in text
    assert "khoa" in text
