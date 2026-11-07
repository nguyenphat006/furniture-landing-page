"""Màn hình admin: menu "Nội dung trang", Section dùng chung.

Menu "Nội dung trang" mở thẳng màn sửa từng trang (bản tiếng Việt), khỏi phải tìm trong cây Pages
(trang pháp lý là trang con của Trang chủ). Tab "Được dùng ở" (có sẵn của Wagtail) cho biết trang
nào đang chèn một section dùng chung.
"""

from typing import Any

from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import path, reverse_lazy
from django.utils.translation import gettext_lazy as _
from wagtail import hooks
from wagtail.admin.menu import Menu, MenuItem, SubmenuMenuItem
from wagtail.admin.ui.tables import LiveStatusTagColumn, UpdatedAtColumn
from wagtail.models import Locale
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from .models import SharedSection
from .rich_text import FrontendPageLinkHandler
from .selectors import PAGE_MODELS


# order lớn: chạy sau hook của Wagtail để ghi đè bộ xử lý link "page" mặc định
@hooks.register("register_rich_text_features", order=100)
def frontend_page_links(features: Any) -> None:
    features.register_link_type(FrontendPageLinkHandler)


# (khoá trang, tên trong menu, icon)
PAGE_MENU = [
    ("home", _("Trang chủ"), "home"),
    ("privacy", _("Chính sách bảo mật"), "lock"),
    ("terms", _("Điều khoản sử dụng"), "doc-full"),
]


def edit_page_by_key(request: HttpRequest, key: str) -> HttpResponse:
    model = PAGE_MODELS.get(key)
    if model is None:
        raise Http404
    page = model.objects.filter(locale=Locale.get_default()).first()
    if page is None:
        messages.warning(request, _("Chưa có trang này, chạy lệnh import_pages để tạo."))
        return redirect("wagtailadmin_explore_root")
    return redirect("wagtailadmin_pages:edit", page.pk)


@hooks.register("register_admin_urls")
def register_admin_urls() -> list[Any]:
    return [path("noi-dung-trang/<slug:key>/", edit_page_by_key, name="pages_edit_by_key")]


# Tạm ẩn menu "Nội dung trang" khỏi sidebar (2026-11-07, theo yêu cầu); trang vẫn sửa được trong
# cây Pages, link /admin/noi-dung-trang/<khoá>/ vẫn chạy. Bật lại: đặt True.
SHOW_PAGE_MENU = False


def register_page_menu() -> SubmenuMenuItem:
    items = [
        MenuItem(label, reverse_lazy("pages_edit_by_key", args=[key]), icon_name=icon)
        for key, label, icon in PAGE_MENU
    ]
    return SubmenuMenuItem(
        _("Nội dung trang"), Menu(items=items), icon_name="doc-full-inverse", order=140
    )


if SHOW_PAGE_MENU:
    hooks.register("register_admin_menu_item", register_page_menu)


class SharedSectionViewSet(SnippetViewSet):
    model = SharedSection
    icon = "link"
    menu_label = _("Section dùng chung")
    menu_order = 150
    add_to_admin_menu = True
    list_display = ["name", LiveStatusTagColumn(), UpdatedAtColumn()]


register_snippet(SharedSectionViewSet)
