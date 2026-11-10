"""FAQ: block Câu hỏi thường gặp, Section dùng chung gắn vào Cài đặt, API /sections/<slot>."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from django.core.exceptions import ValidationError
from django.test import Client
from rest_framework.test import APIClient

from apps.pages.models import SharedSection
from apps.pages.services import import_pages
from apps.sitesettings.models import SiteSettings

from .test_pages import assets, pages_data  # noqa: F401  (fixture assets)

pytestmark = pytest.mark.django_db


def _faq(lang: str) -> dict[str, Any]:
    vi = lang == "vi"
    return {
        "type": "faq",
        "value": {
            "kicker": "Hỏi đáp" if vi else "FAQ",
            "title": "Câu hỏi thường gặp" if vi else "Common questions",
            "note": "Chưa thấy?" if vi else "Not finding it?",
            "button_label": "",
            "items": [
                {"question": "MOQ?" if vi else "MOQ?!", "answer": "Tuỳ mẫu" if vi else "Depends"},
                {"question": "Mẫu?" if vi else "Samples?", "answer": "Có" if vi else "Yes"},
            ],
        },
    }


def faq_data() -> dict[str, Any]:
    data = pages_data()
    data["shared"]["faq"] = {"name": "Câu hỏi thường gặp", "vi": _faq("vi"), "en": _faq("en")}
    data["slots"] = {"capabilities_faq": "faq"}
    return data


@pytest.fixture
def imported(assets: Path) -> None:  # noqa: F811
    result = import_pages(faq_data(), assets_dir=assets)
    assert result.created == ["shared:cta", "shared:faq", "slot:capabilities_faq", "home"]


def _get(client: APIClient, url: str, status: int = 200, **params: Any) -> Any:
    res = client.get(url, params)
    assert res.status_code == status, res.content
    return res.json()


@pytest.mark.usefixtures("imported")
def test_slot_api_in_both_languages(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/sections/capabilities-faq")
    en = _get(api_client, "/api/v1/sections/capabilities-faq", locale="en")
    assert vi["is_fallback"] is False
    assert [b["type"] for b in vi["body"]] == ["faq"]
    value = en["body"][0]["value"]
    assert value["title"] == "Common questions"
    assert value["note"] == "Not finding it?"
    assert value["button_label"] == ""
    assert value["items"] == [
        {"question": "MOQ?!", "answer": "Depends"},
        {"question": "Samples?", "answer": "Yes"},
    ]
    _get(api_client, "/api/v1/sections/nope", status=404)


@pytest.mark.usefixtures("imported")
def test_slot_fallback_unpublish_and_unset(api_client: APIClient) -> None:
    SharedSection.objects.get(locale__language_code="en", name="Câu hỏi thường gặp").unpublish()
    en = _get(api_client, "/api/v1/sections/capabilities-faq", locale="en")
    assert en["is_fallback"] is True
    assert en["body"][0]["value"]["title"] == "Câu hỏi thường gặp"

    vi = SharedSection.objects.get(locale__language_code="vi", name="Câu hỏi thường gặp")
    vi.unpublish()
    _get(api_client, "/api/v1/sections/capabilities-faq", status=404)

    vi.save_revision().publish()
    settings = SiteSettings.load()
    settings.capabilities_faq = None
    settings.save()
    _get(api_client, "/api/v1/sections/capabilities-faq", status=404)


@pytest.mark.usefixtures("imported")
def test_slot_choosing_english_copy_still_resolves(api_client: APIClient) -> None:
    settings = SiteSettings.load()
    settings.capabilities_faq = SharedSection.objects.get(
        locale__language_code="en", name="Câu hỏi thường gặp"
    )
    settings.save()
    vi = _get(api_client, "/api/v1/sections/capabilities-faq")
    assert vi["body"][0]["value"]["title"] == "Câu hỏi thường gặp"


@pytest.mark.usefixtures("imported")
def test_settings_reject_non_faq_section() -> None:
    settings = SiteSettings.load()
    settings.capabilities_faq = SharedSection.objects.get(
        locale__language_code="vi", name="CTA cuối trang"
    )
    with pytest.raises(ValidationError) as err:
        settings.full_clean()
    assert "capabilities_faq" in err.value.message_dict


@pytest.mark.usefixtures("imported")
def test_import_keeps_existing_slot(assets: Path) -> None:  # noqa: F811
    cta = SharedSection.objects.get(locale__language_code="vi", name="CTA cuối trang")
    SiteSettings.objects.filter(pk=SiteSettings.load().pk).update(capabilities_faq=cta)
    again = import_pages(faq_data(), assets_dir=assets)
    assert "slot:capabilities_faq" in again.skipped
    assert SiteSettings.load().capabilities_faq_id == cta.pk


@pytest.mark.usefixtures("imported")
def test_faq_on_home_page_and_admin(api_client: APIClient, admin_client: Client) -> None:
    from apps.pages.models import HomePage

    home = HomePage.objects.get(locale__language_code="vi")
    faq = SharedSection.objects.get(locale__language_code="vi", name="Câu hỏi thường gặp")
    home.body.append(("shared", faq))
    home.save_revision().publish()
    body = _get(api_client, "/api/v1/pages/home")["body"]
    assert body[-1]["type"] == "faq"
    assert body[-1]["value"]["items"][0]["question"] == "MOQ?"

    res = admin_client.get(f"/admin/snippets/pages/sharedsection/edit/{faq.pk}/")
    assert res.status_code == 200
    res = admin_client.get("/admin/settings/sitesettings/sitesettings/")
    assert res.status_code in (200, 302)


def _rows(client: Client, url: str) -> tuple[int, str]:
    html = client.get(url).content.decode()
    return html.count("data-bulk-action-checkbox class="), html


@pytest.mark.usefixtures("imported")
def test_shared_section_list_shows_one_row_per_section(admin_client: Client) -> None:
    url = "/admin/snippets/pages/sharedsection/"
    # 2 section (CTA, FAQ), mỗi section có bản vi + en: danh sách chỉ hiện 2 dòng bản tiếng Việt
    rows, html = _rows(admin_client, url)
    assert rows == 2
    assert html.count("Đã xuất bản") == 2
    SharedSection.objects.get(locale__language_code="en", name="Câu hỏi thường gặp").unpublish()
    _, html = _rows(admin_client, url)
    assert "Chưa xuất bản (web dùng bản tiếng Việt)" in html
    SharedSection.objects.get(locale__language_code="en", name="Câu hỏi thường gặp").delete()
    _, html = _rows(admin_client, url)
    assert "Chưa dịch" in html
    # Chọn ngôn ngữ ở bộ lọc thì xem riêng bản tiếng Anh
    rows, _ = _rows(admin_client, url + "?locale=en")
    assert rows == 1
