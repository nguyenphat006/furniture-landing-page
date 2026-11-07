"""Link tới trang trong rich text: đổi sang đường dẫn của web Next.js (CMS chạy headless).

Mặc định Wagtail ghi URL theo cây trang của CMS (headless thì ra "None"). Ở đây trang nội dung trỏ
về đúng route frontend, có tiền tố ngôn ngữ như frontend (tiếng Việt không tiền tố, "as-needed").
Bản dịch: wagtail-localize đã đổi link sang trang cùng ngôn ngữ, nên chỉ cần đọc locale của trang.
"""

from __future__ import annotations

from django.conf import settings
from django.utils.html import escape
from wagtail.models import Page
from wagtail.rich_text.pages import PageLinkHandler

from .models import HomePage, PrivacyPage, TermsPage

FRONTEND_PATHS: dict[type[Page], str] = {
    HomePage: "/",
    PrivacyPage: "/privacy",
    TermsPage: "/terms",
}


def frontend_path(page: Page) -> str | None:
    path = FRONTEND_PATHS.get(type(page))
    if path is None:
        return None
    language = page.locale.language_code
    if language == settings.LANGUAGE_CODE:
        return path
    return f"/{language}" if path == "/" else f"/{language}{path}"


class FrontendPageLinkHandler(PageLinkHandler):  # type: ignore[misc]
    @classmethod
    def expand_db_attributes_many(cls, attrs_list: list[dict[str, str]]) -> list[str]:
        result = []
        for page in cls.get_many(attrs_list):
            path = frontend_path(page) if page is not None else None
            result.append(f'<a href="{escape(path)}">' if path else "<a>")
        return result
