"""Hook Wagtail của app core: CSS màu BFC cho admin, màn Rà soát SEO (seo_audit.py)."""

import os
from typing import Any

from django.conf import settings
from django.contrib.staticfiles import finders
from django.http import HttpRequest, HttpResponse
from django.template.response import TemplateResponse
from django.templatetags.static import static
from django.urls import path, reverse, reverse_lazy
from django.utils.html import format_html
from django.utils.safestring import SafeString
from django.utils.translation import gettext_lazy as _
from wagtail import hooks
from wagtail.admin.menu import MenuItem
from wagtail.admin.ui.components import Component

from . import seo_audit


def _versioned(path: str) -> str:
    """Thêm ?v=<thời điểm sửa file> để trình duyệt không giữ CSS cũ sau khi cập nhật."""
    found = finders.find(path)
    version = int(os.path.getmtime(found)) if isinstance(found, str) else 0
    return f"{static(path)}?v={version}"


@hooks.register("insert_global_admin_css")
def bfc_admin_theme() -> SafeString:
    return format_html('<link rel="stylesheet" href="{}">', _versioned("core/css/admin-theme.css"))


LEVELS = [
    (seo_audit.ERROR, _("Lỗi")),
    (seo_audit.WARNING, _("Cần xem")),
    (seo_audit.OK, _("Ổn")),
    (seo_audit.HIDDEN, _("Ẩn khỏi Google")),
]


def seo_audit_view(request: HttpRequest) -> HttpResponse:
    rows = seo_audit.audit()
    counts = seo_audit.summary(rows)
    labels = dict(LEVELS)
    level = request.GET.get("level") or seo_audit.ERROR
    if level not in labels:
        level = seo_audit.ERROR
    shown = [r for r in rows if r.level == level]
    for row in shown:
        row.level_label = labels[row.level]  # type: ignore[attr-defined]
    return TemplateResponse(
        request,
        "core/seo_audit.html",
        {
            "page_title": _("Rà soát SEO"),
            "header_title": _("Rà soát SEO"),
            "header_icon": "search",
            "rows": shown,
            "level": level,
            "filters": [{"key": k, "label": v, "count": counts[k]} for k, v in LEVELS],
            "frontend_url": settings.FRONTEND_URL.rstrip("/"),
            "title_max": seo_audit.TITLE_MAX,
            "description_min": seo_audit.DESCRIPTION_MIN,
            "description_max": seo_audit.DESCRIPTION_MAX,
        },
    )


@hooks.register("register_admin_urls")
def register_seo_urls() -> list[Any]:
    return [path("ra-soat-seo/", seo_audit_view, name="seo_audit")]


@hooks.register("register_admin_menu_item")
def register_seo_menu() -> MenuItem:
    return MenuItem(_("Rà soát SEO"), reverse_lazy("seo_audit"), icon_name="search", order=900)


class SeoPanel(Component):
    """Ô tóm tắt ở trang chủ admin: số trang lỗi / cần xem / ổn."""

    name = "bfc_seo"
    template_name = "core/seo_panel.html"
    order = 50

    def get_context_data(self, parent_context: Any) -> dict[str, Any]:
        return {
            "counts": seo_audit.summary(seo_audit.audit()),
            "url": reverse("seo_audit"),
        }


@hooks.register("construct_homepage_panels")
def add_seo_panel(request: HttpRequest, panels: list[Any]) -> None:
    panels.append(SeoPanel())
