"""Thông tin chung: nhập từ frontend, API /site theo ngôn ngữ, kiểm tra dữ liệu, trang admin."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest import mock

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client
from PIL import Image as PILImage
from rest_framework.test import APIClient

from apps.sitesettings.models import FooterLink, NavItem, SiteSettings, SocialLink
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


@pytest.mark.parametrize("url", ["javascript:alert(1)", "//evil.example", "privacy"])
def test_footer_link_rejects_other_urls(url: str) -> None:
    with pytest.raises(ValidationError):
        FooterLink(label="x", url=url).clean()


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
    for tab in ("Công ty", "Liên hệ", "Thương hiệu", "Menu", "Footer", "SEO"):
        assert tab in html
