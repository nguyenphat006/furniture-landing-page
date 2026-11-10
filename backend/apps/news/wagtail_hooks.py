"""Màn hình admin: menu "Tin tức" (mỗi bài một dòng, cột tình trạng bản tiếng Anh)."""

from django.utils.translation import gettext_lazy as _
from wagtail.admin.ui.tables import Column, LiveStatusTagColumn, UpdatedAtColumn
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from apps.core.admin_translations import SourceLocaleListingMixin, TranslationStatusColumn

from .models import NewsPost


class NewsPostViewSet(SourceLocaleListingMixin, SnippetViewSet):
    model = NewsPost
    icon = "doc-empty-inverse"
    menu_label = _("Tin tức")
    menu_order = 120
    add_to_admin_menu = True
    list_display = [
        "title",
        Column("kind", label=_("Loại"), accessor="get_kind_display"),
        Column("date", label=_("Ngày đăng")),
        LiveStatusTagColumn(),
        TranslationStatusColumn(),
        UpdatedAtColumn(),
    ]
    list_filter = ["kind", "live"]
    list_per_page = 50
    ordering = ["-date", "-id"]


register_snippet(NewsPostViewSet)
