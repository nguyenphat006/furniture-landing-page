"""Dịch máy Google Translate v2 cho màn Dịch của wagtail-localize."""

from __future__ import annotations

import io
import json
import urllib.error
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from django.test import Client, override_settings
from django.urls import reverse
from PIL import Image as PILImage
from wagtail.models import Locale
from wagtail_localize.models import StringTranslation, Translation, TranslationSource

from apps.accounts.tests.factories import create_user
from apps.core.machine_translation import (
    MAX_STRINGS,
    GoogleTranslateV2,
    MachineTranslationError,
    _batches,
)
from apps.news.models import NewsPost
from apps.news.services import import_news

TRANSLATOR = {
    "CLASS": "apps.core.machine_translation.GoogleTranslateV2",
    "OPTIONS": {"API_KEY": "test-key"},
}


class _S:
    def __init__(self, data: str) -> None:
        self.data = data


def _response(texts: list[str]) -> MagicMock:
    body = json.dumps({"data": {"translations": [{"translatedText": t} for t in texts]}})
    res = MagicMock()
    res.__enter__.return_value = io.BytesIO(body.encode())
    return res


def _locales() -> tuple[Any, Any]:
    return MagicMock(language_code="vi"), MagicMock(language_code="en")


def test_batches_split_by_count_and_size() -> None:
    many = [_S("a") for _ in range(MAX_STRINGS + 5)]
    assert [len(b) for b in _batches(many)] == [MAX_STRINGS, 5]
    big = [_S("x" * 20_000), _S("y" * 20_000), _S("z")]
    assert [len(b) for b in _batches(big)] == [1, 2]
    assert list(_batches([])) == []


def test_translate_sends_html_and_maps_results() -> None:
    translator = GoogleTranslateV2({"API_KEY": "k"})
    strings = [_S("Xin <b>chào</b>"), _S("Nhà máy")]
    with patch(
        "urllib.request.urlopen", return_value=_response(["Hello <b>there</b>", "Factory"])
    ) as call:
        result = translator.translate(*_locales(), strings)
    request = call.call_args.args[0]
    assert "key=k" in request.full_url
    payload = json.loads(request.data)
    assert payload == {
        "q": ["Xin <b>chào</b>", "Nhà máy"],
        "source": "vi",
        "target": "en",
        "format": "html",
    }
    assert [v.data for v in result.values()] == ["Hello <b>there</b>", "Factory"]
    assert translator.can_translate(*_locales())
    vi = _locales()[0]
    assert not translator.can_translate(vi, vi)


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError("u", 403, "Forbidden", {}, None),  # type: ignore[arg-type]
        urllib.error.URLError("down"),
        TimeoutError(),
    ],
)
def test_translate_errors(error: Exception) -> None:
    translator = GoogleTranslateV2({"API_KEY": "k"})
    with patch("urllib.request.urlopen", side_effect=error), pytest.raises(MachineTranslationError):
        translator.translate(*_locales(), [_S("a")])


@pytest.fixture
def untranslated(db: None, tmp_path: Path) -> Translation:
    """Một bài tin tức có bản dịch tiếng Anh, tiêu đề đã dịch tay, tóm tắt + nội dung chưa dịch."""
    (tmp_path / "Assets").mkdir()
    PILImage.new("RGB", (40, 30), "green").save(tmp_path / "Assets" / "a.png", "PNG")
    post: dict[str, Any] = {
        "slug": "tet",
        "kind": "news",
        "date": "2026-11-05",
        "cover": "",
        "vi": {"title": "Tiêu đề", "excerpt": "Tóm tắt"},
        "en": {"title": "Title", "excerpt": ""},
        "blocks": [{"type": "paragraph", "html": {"vi": "<p>Đoạn văn</p>", "en": "<p></p>"}}],
    }
    import_news({"posts": [post]}, assets_dir=tmp_path, home_section=False)
    source = TranslationSource.objects.get(
        object_id=NewsPost.objects.get(slug="tet", locale__language_code="vi").translation_key
    )
    return Translation.objects.get(source=source, target_locale__language_code="en")


@override_settings(WAGTAILLOCALIZE_MACHINE_TRANSLATOR=TRANSLATOR)
def test_button_fills_only_untranslated_strings(client: Client, untranslated: Translation) -> None:
    client.force_login(create_user(is_superuser=True, is_staff=True))
    url = reverse("wagtail_localize:machine_translate", args=[untranslated.pk])
    with patch.object(
        GoogleTranslateV2, "_post", side_effect=lambda p: [f"EN:{q}" for q in p["q"]]
    ) as post:
        res = client.post(f"{url}?next=/admin/")
    assert res.status_code == 302
    assert res["Location"] == "/admin/"
    sent = [q for call in post.call_args_list for q in call.args[0]["q"]]
    # Tiêu đề đã dịch tay thì không gửi đi
    assert "Tiêu đề" not in sent
    assert sorted(sent) == ["Tóm tắt", "Đoạn văn"]
    en = Locale.objects.get(language_code="en")
    saved = set(StringTranslation.objects.filter(locale=en).values_list("data", flat=True))
    assert {"Title", "EN:Tóm tắt", "EN:Đoạn văn"} <= saved


@override_settings(WAGTAILLOCALIZE_MACHINE_TRANSLATOR=TRANSLATOR)
def test_button_error_shows_message(client: Client, untranslated: Translation) -> None:
    client.force_login(create_user(is_superuser=True, is_staff=True))
    url = reverse("wagtail_localize:machine_translate", args=[untranslated.pk])
    with patch.object(GoogleTranslateV2, "_post", side_effect=MachineTranslationError("Hỏng.")):
        res = client.post(f"{url}?next=https://evil.example/", follow=True)
    assert res.redirect_chain[0][0] == reverse("wagtailadmin_home")
    assert "Hỏng. Thử lại sau hoặc dịch tay." in [str(m) for m in res.context["messages"]]
