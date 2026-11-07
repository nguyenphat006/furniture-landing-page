"""Trang nội dung: nhập từ frontend, bản dịch wagtail-localize, API, section dùng chung, admin."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest import mock

import pytest
from django.core.management import call_command
from django.test import Client
from PIL import Image as PILImage
from rest_framework.test import APIClient
from wagtail.models import Locale, Page, Site

from apps.pages.models import HomePage, SharedSection
from apps.pages.services import import_pages, string_pairs

pytestmark = pytest.mark.django_db


@pytest.fixture
def assets(tmp_path: Path) -> Path:
    (tmp_path / "Assets").mkdir()
    for name in ("hero-1.png", "hero-2.png", "cta.png"):
        PILImage.new("RGB", (80, 50), "green").save(tmp_path / "Assets" / name, "PNG")
    return tmp_path


def _home(lang: str) -> dict[str, Any]:
    vi = lang == "vi"
    return {
        "body": [
            {
                "type": "hero",
                "value": {
                    "slides": ["/Assets/hero-1.png", "/Assets/hero-2.png", "/Assets/none.png"],
                    "title": "Dòng một,\ndòng hai" if vi else "Line one,\nline two",
                    "lede": "Mô tả" if vi else "Lede",
                    "button_label": "",
                },
            },
            {
                "type": "intro",
                "value": {
                    "heading": "Câu chuyện" if vi else "Story",
                    "quote": "Trích dẫn" if vi else "Quote",
                    "body": "Đoạn văn" if vi else "Body",
                    "button_label": "",
                },
            },
            {"type": "section", "value": {"section": "products"}},
            {
                "type": "export",
                "value": {
                    "kicker": "Xuất khẩu" if vi else "Export",
                    "title": "Hơn 20 nước" if vi else "20+ countries",
                    "markets": [
                        {"country": "USA", "position": "28,36", "side": "L"},
                        {"country": "JPN", "position": "", "side": "C"},
                        {"country": "BRA", "position": "999,1", "side": "R"},
                    ],
                    "stats": [{"value": "20+", "label": "Quốc gia" if vi else "Countries"}],
                },
            },
            {
                "type": "factory",
                "value": {
                    # Chuỗi có ký tự HTML: wagtail-localize lưu dạng đã escape
                    "kicker": "Năng lực & nhà máy" if vi else "Capabilities & factory",
                    "title": "Nhà máy" if vi else "Factory",
                    "lede": "",
                    "image": "/Assets/hero-1.png",
                    "detail_image": "/Assets/hero-2.png",
                    "points": ["Từ 2010", "OEM"] if vi else ["Since 2010", "OEM"],
                    "button_label": "",
                },
            },
            {"type": "shared", "value": "cta"},
        ]
    }


def _cta(lang: str) -> dict[str, Any]:
    vi = lang == "vi"
    return {
        "type": "cta",
        "value": {
            "kicker": "Bắt đầu" if vi else "Start",
            "title": "Gửi bản vẽ" if vi else "Send drawings",
            "image": "/Assets/cta.png",
            "quote_label": "",
            "visit_label": "",
        },
    }


def pages_data() -> dict[str, Any]:
    return {
        "shared": {"cta": {"name": "CTA cuối trang", "vi": _cta("vi"), "en": _cta("en")}},
        "home": {"title": "Trang chủ", "title_en": "Home", "vi": _home("vi"), "en": _home("en")},
    }


@pytest.fixture
def imported(assets: Path) -> None:
    result = import_pages(pages_data(), assets_dir=assets)
    assert result.created == ["shared:cta", "home"]
    assert result.missing_images == ["/Assets/none.png"]


def _get(client: APIClient, url: str, status: int = 200, **params: Any) -> Any:
    res = client.get(url, params)
    assert res.status_code == status, res.content
    return res.json()


@pytest.mark.usefixtures("imported")
def test_home_api_in_both_languages(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/pages/home")
    en = _get(api_client, "/api/v1/pages/home", locale="en")

    assert (vi["title"], en["title"]) == ("Trang chủ", "Home")
    assert en["is_fallback"] is False
    # Section dùng chung được thay bằng block bên trong
    assert [b["type"] for b in vi["body"]] == [
        "hero",
        "intro",
        "section",
        "export",
        "factory",
        "cta",
    ]
    hero = en["body"][0]["value"]
    assert hero["title"] == "Line one,\nline two"
    assert len(hero["slides"]) == 2
    assert hero["slides"][0]["url"].endswith(".webp")
    assert en["body"][1]["value"]["quote"] == "Quote"
    assert en["body"][2]["value"] == {"section": "products"}
    export = en["body"][3]["value"]
    # Vị trí trống hoặc ngoài bản đồ = cờ ngay tại nước (null); nước ngoài 8 nước cũ chọn được
    assert export["markets"] == [
        {"code": "USA", "label": [28.0, 36.0], "side": "L"},
        {"code": "JPN", "label": None, "side": "C"},
        {"code": "BRA", "label": None, "side": "R"},
    ]
    assert export["stats"] == [{"value": "20+", "label": "Countries"}]
    factory = en["body"][4]["value"]
    assert factory["kicker"] == "Capabilities & factory"
    assert factory["points"] == ["Since 2010", "OEM"]
    assert factory["detail_image"]["url"].endswith(".webp")
    cta = en["body"][5]["value"]
    assert (cta["kicker"], cta["image"]["url"].startswith("http://testserver/media/")) == (
        "Start",
        True,
    )
    assert vi["seo"] == {"title": "", "description": "", "noindex": False, "og_image": None}


@pytest.mark.usefixtures("imported")
def test_untranslated_page_falls_back_and_unknown_key_404(api_client: APIClient) -> None:
    HomePage.objects.get(locale__language_code="en").unpublish()
    en = _get(api_client, "/api/v1/pages/home", locale="en")
    assert en["is_fallback"] is True
    assert en["title"] == "Trang chủ"
    _get(api_client, "/api/v1/pages/about", status=404)


@pytest.mark.usefixtures("imported")
def test_shared_section_edit_and_unpublish(api_client: APIClient) -> None:
    section = SharedSection.objects.get(locale__language_code="vi")
    section.body[0].value["title"] = "Tiêu đề mới"
    section.save()
    section.save_revision().publish()
    body = _get(api_client, "/api/v1/pages/home")["body"]
    assert body[-1]["value"]["title"] == "Tiêu đề mới"

    # Bản dịch chưa xuất bản thì dùng bản gốc đang xuất bản; gỡ cả bản gốc thì section biến mất
    SharedSection.objects.get(locale__language_code="en").unpublish()
    body = _get(api_client, "/api/v1/pages/home", locale="en")["body"]
    assert body[-1]["value"]["title"] == "Tiêu đề mới"
    section.unpublish()
    assert [b["type"] for b in _get(api_client, "/api/v1/pages/home")["body"]][-1] == "factory"


@pytest.mark.usefixtures("imported")
def test_import_replaces_welcome_page_and_is_idempotent(assets: Path) -> None:
    home = HomePage.objects.get(locale=Locale.get_default())
    assert Site.objects.get().root_page_id == home.pk
    assert not Page.objects.filter(depth=2, title__startswith="Welcome").exists()

    again = import_pages(pages_data(), assets_dir=assets)
    assert again.created == []
    assert again.skipped == ["shared:cta", "home"]

    data = pages_data()
    data["home"]["vi"]["body"][1]["value"]["quote"] = "Trích dẫn mới"
    data["home"]["en"]["body"][1]["value"]["quote"] = "New quote"
    assert import_pages(data, assets_dir=assets, force=True).created == ["shared:cta", "home"]
    en = HomePage.objects.get(locale__language_code="en")
    assert en.body[1].value["quote"] == "New quote"
    assert HomePage.objects.count() == 2


def test_string_pairs_skips_empty() -> None:
    assert string_pairs({"a": "Xin chào", "b": ""}, {"a": "Hello", "b": ""}) == {
        "Xin chào": "Hello"
    }


def test_publish_triggers_revalidate(assets: Path) -> None:
    with mock.patch("apps.pages.signals.revalidate_on_commit") as revalidate:
        import_pages(pages_data(), assets_dir=assets)
    # CTA vi + en, trang chủ vi + en
    assert revalidate.call_count >= 4


def test_import_pages_command(assets: Path, tmp_path: Path) -> None:
    file = tmp_path / "pages.json"
    file.write_text(json.dumps(pages_data()), encoding="utf-8")
    call_command("import_pages", file=file, assets=assets)
    call_command("import_pages", file=file, assets=assets)
    assert HomePage.objects.count() == 2
    assert SharedSection.objects.count() == 2


def test_frontend_fixture_imports(assets: Path) -> None:
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "pages.json"
    result = import_pages(json.loads(fixture.read_text("utf-8")), assets_dir=assets)
    assert result.created == ["shared:cta", "home"]


@pytest.mark.usefixtures("imported")
def test_admin_pages_render(admin_client: Client) -> None:
    home = HomePage.objects.get(locale=Locale.get_default())
    section = SharedSection.objects.get(locale=Locale.get_default())
    for url in (
        "/admin/pages/",
        f"/admin/pages/{home.pk}/edit/",
        # Bản tiếng Anh mở màn dịch của wagtail-localize
        f"/admin/pages/{HomePage.objects.get(locale__language_code='en').pk}/edit/",
        f"/admin/pages/{home.pk}/",
        "/admin/snippets/pages/sharedsection/",
        f"/admin/snippets/pages/sharedsection/edit/{section.pk}/",
        f"/admin/snippets/pages/sharedsection/usage/{section.pk}/",
    ):
        assert admin_client.get(url).status_code == 200, url
    # Tab "Được dùng ở": trang chủ đang chèn section này
    usage = admin_client.get(f"/admin/snippets/pages/sharedsection/usage/{section.pk}/")
    assert "Trang chủ" in usage.content.decode()


def test_map_position_block_and_widget() -> None:
    from django.core.exceptions import ValidationError

    from apps.pages.blocks import ExportMarketBlock, MapPositionBlock, export_map

    block = MapPositionBlock()
    assert block.clean("12.5,30") == "12.5,30"
    assert block.clean("") == ""
    with pytest.raises(ValidationError):
        block.clean("abc")
    html = block.field.widget.render("pos", "12.5,30", {"id": "x-markets-0-value-position"})
    assert "data-map-position" in html
    assert 'value="12.5,30"' in html
    assert f'data-width="{export_map()["width"]}"' in html
    codes = [c for c, _ in ExportMarketBlock().child_blocks["country"].field.choices]
    assert {"USA", "BRA", "FRA", "SGP"} <= set(codes)


def test_legal_pages(api_client: APIClient, admin_client: Client, assets: Path) -> None:
    from datetime import date

    from apps.pages.models import PrivacyPage, TermsPage
    from apps.pages.services import legal_html

    fixtures = Path(__file__).resolve().parents[1] / "fixtures"
    data = json.loads((fixtures / "pages.json").read_text("utf-8"))
    data["legal"] = json.loads((fixtures / "legal.json").read_text("utf-8"))
    result = import_pages(data, assets_dir=assets)
    assert result.created[-2:] == ["privacy", "terms"]
    # Chạy lại không ghi đè nội dung admin đã sửa
    assert import_pages(data, assets_dir=assets).skipped[-2:] == ["privacy", "terms"]

    page = PrivacyPage.objects.get(locale=Locale.get_default())
    page.updated_on = date(2026, 11, 7)
    page.save_revision().publish()

    vi = _get(api_client, "/api/v1/pages/privacy", locale="vi")
    assert vi["title"] == "Chính sách bảo mật"
    assert vi["updated_on"] == "2026-11-07"
    first = vi["body"][0]
    assert first["type"] == "legal"
    assert first["value"]["body"].startswith("<p>")
    en = _get(api_client, "/api/v1/pages/terms", locale="en")
    assert en["title"] == "Terms of Use"
    assert en["is_fallback"] is False
    assert en["body"][0]["value"]["heading"] == "Acceptance of terms"

    assert legal_html(["a & b", ["x", "y"]]) == "<p>a &amp; b</p><ul><li>x</li><li>y</li></ul>"
    for model in (PrivacyPage, TermsPage):
        pk = model.objects.get(locale=Locale.get_default()).pk
        assert admin_client.get(f"/admin/pages/{pk}/edit/").status_code == 200
    # Menu "Nội dung trang" mở thẳng màn sửa bản tiếng Việt
    for key, model in (("privacy", PrivacyPage), ("terms", TermsPage)):
        pk = model.objects.get(locale=Locale.get_default()).pk
        res = admin_client.get(f"/admin/noi-dung-trang/{key}/")
        assert res.status_code == 302
        assert res["Location"] == f"/admin/pages/{pk}/edit/"
    assert admin_client.get("/admin/noi-dung-trang/khong-co/").status_code == 404
    # Menu đang tạm ẩn khỏi sidebar (SHOW_PAGE_MENU); hàm dựng menu vẫn đủ 3 trang
    assert "/admin/noi-dung-trang/home/" not in admin_client.get("/admin/").content.decode()
    from apps.pages.wagtail_hooks import register_page_menu

    assert len(register_page_menu().menu.initial_menu_items) == 3


def test_page_menu_without_pages(admin_client: Client) -> None:
    res = admin_client.get("/admin/noi-dung-trang/privacy/")
    assert res.status_code == 302
    assert res["Location"] == "/admin/pages/"


def test_legal_publish_revalidates_and_page_links(assets: Path) -> None:
    from wagtail.rich_text import expand_db_html

    from apps.pages.models import PrivacyPage

    fixtures = Path(__file__).resolve().parents[1] / "fixtures"
    data = pages_data()
    data["legal"] = json.loads((fixtures / "legal.json").read_text("utf-8"))
    import_pages(data, assets_dir=assets)
    vi = PrivacyPage.objects.get(locale=Locale.get_default())
    en = PrivacyPage.objects.get(locale__language_code="en")
    home_en = HomePage.objects.get(locale__language_code="en")

    with mock.patch("apps.pages.signals.revalidate_on_commit") as revalidate:
        vi.save_revision().publish()
    assert revalidate.called

    # Link chọn trang trong rich text → đường dẫn của web, có tiền tố ngôn ngữ
    html = expand_db_html(
        f'<a linktype="page" id="{vi.pk}">a</a><a linktype="page" id="{en.pk}">b</a>'
        f'<a linktype="page" id="{home_en.pk}">c</a><a linktype="page" id="999999">d</a>'
    )
    assert html == '<a href="/privacy">a</a><a href="/en/privacy">b</a><a href="/en">c</a><a>d</a>'
