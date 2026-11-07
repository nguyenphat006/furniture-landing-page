"""Rà soát SEO (apps/core/seo_audit.py, docs/adr/0015): chấm đúng thứ web hiện, màn admin."""

from __future__ import annotations

from pathlib import Path

import pytest
from django.test import Client
from wagtail.models import Locale

from apps.catalog.models import Category, Material, Product
from apps.catalog.services import ImportResult
from apps.core import seo_audit
from apps.core.wagtail_hooks import _versioned
from apps.pages.tests.test_pages import assets, imported  # noqa: F401 - fixture dùng chung
from apps.sitesettings.models import SiteSettings

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("imported")]


def _rows(kind: str, name: str) -> dict[str, seo_audit.SeoRow]:
    return {r.language: r for r in seo_audit.audit() if r.kind == kind and r.name == name}


def _texts(row: seo_audit.SeoRow) -> str:
    return " ".join(i.text for i in row.issues)


def test_product_rules(catalog: ImportResult) -> None:
    product = Product.objects.filter(locale=Locale.get_default(), live=True).first()
    assert product is not None
    product.description = ""
    product.seo_title = ""
    product.seo_description = ""
    product.save()
    rows = _rows("Sản phẩm", product.name)
    # Chưa có chữ cần dịch: bản tiếng Anh chấm trên bản gốc, lỗi là thiếu mô tả
    assert set(rows) == {"vi", "en"}
    assert rows["vi"].level == seo_audit.ERROR
    assert "câu chung" in _texts(rows["vi"])
    assert rows["en"].path.startswith("/en/products/")

    product.description = "<p>" + "Ghế ngoài trời khung nhôm sơn tĩnh điện. " * 2 + "</p>"
    product.seo_title = "x" * 80
    product.save()
    rows = _rows("Sản phẩm", product.name)
    assert "Tiêu đề SEO dài 80" in _texts(rows["vi"])
    # Có mô tả mà chưa dịch: trang tiếng Anh bị ẩn khỏi Google
    assert "Chưa có bản dịch" in _texts(rows["en"])

    product.seo_title = ""
    product.seo_description = "y" * 200
    product.save()
    assert "Mô tả SEO dài 200" in _texts(_rows("Sản phẩm", product.name)["vi"])

    product.noindex = True
    product.save()
    assert _rows("Sản phẩm", product.name)["vi"].level == seo_audit.HIDDEN


def test_taxonomy_and_site_rules(catalog: ImportResult) -> None:
    category = Category.objects.first()
    assert category is not None
    category.description = "Mô tả nhóm đủ dài để Google hiện đẹp trong kết quả tìm kiếm."
    category.description_en = ""
    category.save()
    rows = _rows("Nhóm sản phẩm", category.name)
    assert "Thiếu mô tả" not in _texts(rows["vi"])
    assert "Thiếu mô tả" in _texts(rows["en"])
    assert rows["en"].level == seo_audit.ERROR

    material = Material.objects.first()
    assert material is not None
    material.lede = "Ngắn"
    material.save()
    assert "Mô tả ngắn" in _texts(_rows("Vật liệu", material.name)["vi"])

    site = SiteSettings.load()
    site.seo_description = ""
    site.save()
    site_rows = [r for r in seo_audit.audit() if r.kind == "SEO mặc định"]
    assert {r.language for r in site_rows} == {"vi", "en"}
    assert all("ảnh chia sẻ mặc định" in _texts(r) for r in site_rows)
    vi = next(r for r in site_rows if r.language == "vi")
    assert "Chưa có mô tả mặc định" in _texts(vi)

    counts = seo_audit.summary(seo_audit.audit())
    assert set(counts) == {"error", "warning", "ok", "hidden"}


def test_pages_rows() -> None:
    rows = _rows("Trang", "Trang chủ")
    assert rows["vi"].path == "/"
    assert rows["en"].path == "/en"
    # Chưa có ảnh chia sẻ riêng, site cũng chưa có ảnh mặc định
    assert "Không có ảnh chia sẻ" in _texts(rows["vi"])


def test_admin_screens(admin_client: Client, catalog: ImportResult) -> None:
    res = admin_client.get("/admin/ra-soat-seo/")
    assert res.status_code == 200
    html = res.content.decode()
    assert "Rà soát SEO" in html
    assert "bfc-seo-badge--error" in html
    assert admin_client.get("/admin/ra-soat-seo/?level=ok").status_code == 200
    # Mức lạ quay về Lỗi
    assert admin_client.get("/admin/ra-soat-seo/?level=khong-co").context["level"] == "error"
    home = admin_client.get("/admin/").content.decode()
    assert 'id="bfc-seo"' in home or "bfc-seo-summary" in home
    assert "/admin/ra-soat-seo/" in home


def test_versioned_static(tmp_path: Path) -> None:
    assert _versioned("core/css/admin-theme.css").split("?v=")[1].isdigit()
    assert _versioned("khong-co.css").endswith("?v=0")
