"""Hook Wagtail của app core: nạp CSS màu BFC cho toàn bộ admin."""

from django.templatetags.static import static
from django.utils.html import format_html
from django.utils.safestring import SafeString
from wagtail import hooks


@hooks.register("insert_global_admin_css")
def bfc_admin_theme() -> SafeString:
    return format_html('<link rel="stylesheet" href="{}">', static("core/css/admin-theme.css"))
