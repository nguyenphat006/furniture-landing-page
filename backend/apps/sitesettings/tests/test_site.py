"""Thông tin chung: nhập từ frontend, API /site theo ngôn ngữ, kiểm tra dữ liệu, trang admin."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest import mock

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, override_settings
from PIL import Image as PILImage
from rest_framework.test import APIClient

from apps.sitesettings.models import (
    FooterLink,
    NavItem,
    SiteLanguage,
    SiteSettings,
    SocialLink,
)
from apps.sitesettings.services import import_site

pytestmark = pytest.mark.django_db

EMBED = "https://www.google.com/maps?q=BFC&output=embed"


@pytest.fixture
def assets(tmp_path: Path) -> Path:
    PILImage.new("RGBA", (300, 300), "green").save(tmp_path / "logo.png", "PNG")
    return tmp_path


def site_data() -> dict[str, Any]:
    return {
        "name": "BINH BFC",
        "tagline": "Furniture Company",
        "legal_name": "Công ty TNHH Bình B.F.C",
        "address": "Đồng Nai",
        "address_en": "Dong Nai",
        "phone": "+84 - 914 642 008",
        "email": "office@example.com",
        "hours": "Thứ 2 đến Thứ 7",
        "maps_url": "https://www.google.com/maps/search/?api=1&query=BFC",
        "maps_embed_url": EMBED,
        "footer_blurb": "Nhà sản xuất.",
        "footer_blurb_en": "Manufacturer.",
        "seo_title": "BFC",
        "seo_title_en": "BFC EN",
        "logo": "/logo.png",
        "og_image": "/missing.jpg",
        "nav": [
            {"target": "capabilities"},
            {"target": "about", "label": "Về BFC", "visible": False},
            {"target": "link", "url": "https://example.com/catalog", "label": "Catalog"},
        ],
    }


def _get(client: APIClient, **params: Any) -> Any:
    res = client.get("/api/v1/site", params)
    assert res.status_code == 200, res.content
    return res.json()


def test_import_site_sets_fields_logo_and_nav(assets: Path) -> None:
    missing = import_site(site_data(), assets_dir=assets)

    site = SiteSettings.load()
    assert missing == ["/missing.jpg"]
    assert site.logo is not None
    assert site.phone_href() == "tel:+84914642008"
    assert [n.target for n in site.nav_items.all()] == ["capabilities", "about", "link"]

    # Chạy lại: menu được thay, không nhân đôi
    import_site({"nav": [{"target": "products"}]}, assets_dir=assets)
    assert list(NavItem.objects.values_list("target", flat=True)) == ["products"]


def test_site_api_follows_locale(api_client: APIClient, assets: Path) -> None:
    import_site(site_data(), assets_dir=assets)
    site = SiteSettings.load()
    SocialLink.objects.create(settings=site, network="facebook", url="https://facebook.com/bfc")
    FooterLink.objects.create(settings=site, label="Bảo mật", label_en="Privacy", url="/privacy")

    vi = _get(api_client)
    en = _get(api_client, locale="en")

    assert vi["company"]["address"] == "Đồng Nai"
    assert en["company"]["address"] == "Dong Nai"
    # Bản tiếng Anh trống thì dùng tiếng Việt
    assert en["company"]["legal_name"] == "Công ty TNHH Bình B.F.C"
    assert en["contact"]["hours"] == "Thứ 2 đến Thứ 7"
    assert en["contact"]["phone_href"] == "tel:+84914642008"
    assert en["branding"]["logo"].startswith("http://testserver/")
    assert en["branding"]["logo_on_dark"] == en["branding"]["logo"]
    assert en["branding"]["og_image"] is None
    # Mục ẩn không trả về
    assert en["nav"] == [
        {"target": "capabilities", "label": "", "url": ""},
        {"target": "link", "label": "Catalog", "url": "https://example.com/catalog"},
    ]
    assert en["footer"] == {
        "blurb": "Manufacturer.",
        "links": [{"label": "Privacy", "url": "/privacy"}],
    }
    assert en["social"] == [{"network": "facebook", "url": "https://facebook.com/bfc"}]
    assert en["seo"]["title"] == "BFC EN"
    assert en["analytics"] == {
        "ga_measurement_id": "",
        "google_site_verification": "",
        "bing_site_verification": "",
    }


def test_site_api_works_before_any_setup(api_client: APIClient) -> None:
    data = _get(api_client)
    assert data["company"]["name"] == "BINH BFC"
    assert data["contact"]["phone_href"] == ""
    assert data["nav"] == []


@pytest.mark.parametrize(
    "url",
    [
        "http://www.google.com/maps?q=x&output=embed",
        "https://evil.example/maps?q=x",
        "https://google.com.evil.example/maps",
        "https://www.google.com/search?q=x",
    ],
)
def test_maps_embed_only_accepts_google_maps(url: str) -> None:
    site = SiteSettings.load()
    site.maps_embed_url = url
    with pytest.raises(ValidationError):
        site.full_clean()


def test_ga_measurement_id_in_api_and_validated(api_client: APIClient) -> None:
    site = SiteSettings.load()
    site.ga_measurement_id = "G-AB12CD34EF"
    site.full_clean()
    site.save()
    assert _get(api_client)["analytics"]["ga_measurement_id"] == "G-AB12CD34EF"

    # Chỉ nhận đúng dạng GA4: web chèn mã vào script
    for bad in ["UA-123456-1", "g-ab12cd", "G-AB12'); alert(1)//"]:
        site.ga_measurement_id = bad
        with pytest.raises(ValidationError):
            site.full_clean()


def test_site_verification_accepts_meta_tag_or_token(api_client: APIClient) -> None:
    site = SiteSettings.load()
    site.google_site_verification = (
        '<meta name="google-site-verification" content="abcDEF123_-xyz456789" />'
    )
    site.bing_site_verification = "  0123456789ABCDEF0123456789ABCDEF "
    site.full_clean()
    site.save()
    data = _get(api_client)["analytics"]
    assert data["google_site_verification"] == "abcDEF123_-xyz456789"
    assert data["bing_site_verification"] == "0123456789ABCDEF0123456789ABCDEF"

    site.google_site_verification = 'abc" onload="x'
    with pytest.raises(ValidationError):
        site.full_clean()


def test_floating_actions_follow_visible_toggle_only(api_client: APIClient) -> None:
    from apps.sitesettings.models import FloatingAction
    from apps.sitesettings.services import ensure_default_floating

    site = SiteSettings.load()
    site.phone = "+84 914 642 008"
    site.email = "office@example.com"
    site.save()
    ensure_default_floating(site)
    site.save()
    FloatingAction.objects.create(
        settings=site,
        kind="link",
        url="/catalog",
        label="Catalog",
        label_en="Catalogue",
        sort_order=10,
    )
    FloatingAction.objects.create(settings=site, kind="quote", visible=False, sort_order=11)

    en = _get(api_client, locale="en")["floating"]
    # Chỉ theo ô Hiện: WhatsApp, Zalo mặc định tắt; quote tắt; search chưa có link vẫn trả về
    assert en == [
        {"kind": "search", "label": "", "url": "", "icon": ""},
        {"kind": "phone", "label": "", "url": "tel:+84914642008", "icon": ""},
        {"kind": "email", "label": "", "url": "mailto:office@example.com", "icon": ""},
        {"kind": "link", "label": "Catalogue", "url": "/catalog", "icon": ""},
    ]
    # Icon chọn trong CMS đi kèm
    site.floating_actions.filter(kind="link").update(icon="book-open")
    assert _get(api_client)["floating"][-1]["icon"] == "book-open"
    # Bật lại WhatsApp: hiện dù chưa có số (không bấm được)
    site.floating_actions.filter(kind="whatsapp").update(visible=True)
    kinds = [f["kind"] for f in _get(api_client, locale="en")["floating"]]
    assert "whatsapp" in kinds
    # Chạy lại không thêm trùng
    ensure_default_floating(site)
    assert site.floating_actions.count() == 7


@pytest.mark.parametrize(
    ("fields", "error_field"),
    [
        ({"kind": "link", "url": "/x"}, "label"),
        ({"kind": "link", "url": "/x", "label": "Catalog"}, "label_en"),
        ({"kind": "search", "url": "/search"}, "url"),
        ({"kind": "link", "url": "javascript:alert(1)", "label": "x"}, "url"),
        # Trình duyệt hiểu /\host là //host: link sang web khác (QC 09/11)
        ({"kind": "link", "url": "/\\evil.example", "label": "x", "label_en": "x"}, "url"),
        ({"kind": "link", "url": "/ x", "label": "x", "label_en": "x"}, "url"),
    ],
)
def test_floating_action_validation(fields: dict[str, str], error_field: str) -> None:
    from apps.sitesettings.models import FloatingAction

    action = FloatingAction(settings=SiteSettings.load(), **fields)
    with pytest.raises(ValidationError) as exc:
        action.full_clean()
    assert error_field in exc.value.message_dict


def test_floating_action_without_link_is_allowed() -> None:
    from apps.sitesettings.models import FloatingAction

    FloatingAction(settings=SiteSettings.load(), kind="messenger").full_clean()


def test_nav_item_validation() -> None:
    site = SiteSettings.load()
    with pytest.raises(ValidationError) as err:
        NavItem(settings=site, target="link").clean()
    assert set(err.value.message_dict) == {"url", "label"}
    with pytest.raises(ValidationError):
        NavItem(settings=site, target="about", url="https://example.com").clean()
    NavItem(settings=site, target="about").clean()


@pytest.mark.parametrize("url", ["/privacy", "https://example.com/terms"])
def test_footer_link_accepts_path_or_https(url: str) -> None:
    FooterLink(label="x", url=url).clean()


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "//evil.example", "/\\evil.example", "/\tx", "privacy"]
)
def test_footer_link_rejects_other_urls(url: str) -> None:
    with pytest.raises(ValidationError):
        FooterLink(label="x", url=url).clean()


def test_inline_settings_rows_are_audited() -> None:
    """Menu, nút nổi, link footer, mạng xã hội là bản ghi con: phải có log riêng (QC 09/11)."""
    from auditlog.models import LogEntry

    from apps.sitesettings.models import FloatingAction

    site = SiteSettings.load()
    action = FloatingAction.objects.create(
        settings=site, kind="link", url="/catalog", label="Catalog", label_en="Catalogue"
    )
    link = FooterLink.objects.create(settings=site, label="Bảo mật", url="/privacy")
    action.label_en = "Catalog EN"
    action.save()
    assert LogEntry.objects.get_for_object(action).count() == 2
    assert LogEntry.objects.get_for_object(link).count() == 1


def test_saving_settings_revalidates_frontend() -> None:
    with mock.patch("apps.sitesettings.signals.revalidate_on_commit") as revalidate:
        SiteSettings.load().save()
    revalidate.assert_called()


def test_import_site_command(assets: Path, tmp_path: Path) -> None:
    file = tmp_path / "site.json"
    file.write_text('{"name": "BFC", "nav": [{"target": "contact"}]}', encoding="utf-8")
    call_command("import_site", file=file, assets=assets)
    assert SiteSettings.load().name == "BFC"


def test_import_site_command_reads_frontend_fixture() -> None:
    call_command("import_site")
    assert SiteSettings.load().nav_items.count() == 4


def test_settings_admin_page_renders_and_saves(admin_client: Client, assets: Path) -> None:
    import_site(site_data(), assets_dir=assets)
    url = "/admin/settings/sitesettings/sitesettings/"
    res = admin_client.get(url, follow=True)
    assert res.status_code == 200
    html = res.content.decode()
    for tab in ("Công ty", "Liên hệ", "Thương hiệu", "Menu", "Ngôn ngữ", "Footer", "SEO"):
        assert tab in html
    # Cờ, icon chọn bằng ô thả xuống có hình (core/widgets.py), không phải dropdown chữ
    assert "data-visual-picker" in html
    assert "core/js/visual-picker.js" in html
    assert "sitesettings/flags/VN.svg" in html
    # Icon nút nổi: SVG nhúng thẳng, có lựa chọn "Theo loại"
    assert "lucide-phone" in html
    assert "Theo loại" in html


VI = {"code": "vi", "label": "Tiếng Việt", "flag": "VN"}
EN = {"code": "en", "label": "English", "flag": "GB"}


def test_languages_default_to_installed_languages(api_client: APIClient) -> None:
    """Chưa đặt ngôn ngữ trong CMS: mọi ngôn ngữ đã cài, cờ mặc định."""
    SiteSettings.load().languages.all().delete()
    assert _get(api_client)["languages"] == [VI, EN]


def test_languages_follow_cms_order_flag_label_and_visible(api_client: APIClient) -> None:
    site = SiteSettings.load()
    site.languages.all().delete()
    SiteLanguage.objects.create(settings=site, code="en", flag="US", label="EN (US)", sort_order=0)
    SiteLanguage.objects.create(settings=site, code="vi", flag="VN", sort_order=1)
    assert _get(api_client)["languages"] == [
        {"code": "en", "label": "EN (US)", "flag": "US"},
        VI,
    ]
    # Ẩn tiếng Anh thì bỏ; tiếng Việt (mặc định) ẩn vẫn hiện
    SiteLanguage.objects.filter(code="en").update(visible=False)
    SiteLanguage.objects.filter(code="vi").update(visible=False)
    assert _get(api_client)["languages"] == [VI]


def test_languages_skip_uninstalled_and_keep_default(api_client: APIClient) -> None:
    site = SiteSettings.load()
    site.languages.all().delete()
    # "de" còn trong CMS nhưng đã bỏ khỏi CMS_LANGUAGES: không hiện; thiếu vi thì tự thêm đầu
    SiteLanguage.objects.create(settings=site, code="de", flag="DE", sort_order=0)
    SiteLanguage.objects.create(settings=site, code="en", flag="GB", sort_order=1)
    assert _get(api_client)["languages"] == [VI, EN]
    assert str(SiteLanguage.objects.get(code="de")) == "de"


@override_settings(LANGUAGES=[("vi", "Tiếng Việt"), ("en", "English"), ("de", "Deutsch")])
def test_languages_third_language(api_client: APIClient) -> None:
    site = SiteSettings.load()
    site.languages.all().delete()
    for order, (code, flag) in enumerate([("vi", "VN"), ("en", "GB"), ("de", "DE")]):
        SiteLanguage.objects.create(settings=site, code=code, flag=flag, sort_order=order)
    assert _get(api_client)["languages"][-1] == {"code": "de", "label": "Deutsch", "flag": "DE"}
    assert str(SiteLanguage.objects.get(code="de")) == "Deutsch"


def test_every_action_icon_has_admin_svg() -> None:
    """Mỗi icon chọn được trong CMS có SVG cho ô chọn (chạy scripts/export_admin_icons.mjs)."""
    from apps.sitesettings.models import ACTION_ICONS, _icon_svg

    missing = [name for name, _label in ACTION_ICONS if not _icon_svg(name).startswith("<svg")]
    assert missing == []
    assert _icon_svg("") == ""
    assert _icon_svg("khong-co") == ""
