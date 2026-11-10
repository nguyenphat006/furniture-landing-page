"""Thông tin chung và khung site, sửa trong admin: Cài đặt → Thông tin chung (docs/adr/0011).

Một bản ghi duy nhất (BaseGenericSetting), chia tab: Công ty, Liên hệ, Thương hiệu, Menu,
Ngôn ngữ, Footer, Nút nổi, SEO (gồm mã Google Analytics).
Chữ song ngữ theo cột `_en` như phân loại (docs/adr/0007); bản tiếng Anh trống thì dùng tiếng Việt.
Admin chỉ đổi nội dung; bố cục header, footer vẫn do frontend quyết định và giống nhau ở mọi trang.
"""

from __future__ import annotations

import functools
import re
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.templatetags.static import static
from django.utils.html import format_html
from django.utils.safestring import SafeString, mark_safe
from django.utils.translation import gettext_lazy as _
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.admin.panels import (
    FieldPanel,
    FieldRowPanel,
    InlinePanel,
    MultiFieldPanel,
    ObjectList,
    TabbedInterface,
)
from wagtail.contrib.settings.models import BaseGenericSetting, register_setting
from wagtail.models import Orderable

from apps.core.widgets import VisualRadioSelect

if TYPE_CHECKING:
    from django_stubs_ext import StrOrPromise


def localized(obj: Any, field: str, language: str) -> str:
    """Giá trị theo ngôn ngữ; bản tiếng Anh còn trống thì dùng tiếng Việt."""
    value = getattr(obj, f"{field}_en") if language == "en" else ""
    return str(value or getattr(obj, field))


def validate_maps_embed(value: str) -> None:
    """Bản đồ nhúng chỉ nhận link Google Maps (trang web nhúng iframe từ địa chỉ này)."""
    parts = urlsplit(value)
    host = parts.hostname or ""
    if parts.scheme != "https" or not re.fullmatch(r"(www\.)?google\.com", host):
        raise ValidationError(_("Chỉ nhận link https://www.google.com/maps... dạng nhúng."))
    if not parts.path.startswith("/maps"):
        raise ValidationError(_("Chỉ nhận link https://www.google.com/maps... dạng nhúng."))


# Mã đo lường GA4 (Measurement ID), vd G-AB12CD34EF. Chỉ nhận đúng dạng này: web chèn mã vào script
validate_ga_id = RegexValidator(
    r"^G-[A-Z0-9]{4,16}$", _("Mã Google Analytics 4 có dạng G-XXXXXXXXXX (chữ in hoa và số).")
)


# Mã xác minh Search Console / Bing: chỉ chữ, số, - và _ (web đặt vào thẻ meta)
validate_verification = RegexValidator(
    r"^[A-Za-z0-9_-]{10,100}$",
    _('Mã xác minh chỉ gồm chữ, số, dấu - và _. Dán phần content="..." hoặc cả thẻ meta.'),
)


def verification_token(value: str) -> str:
    """Admin hay dán cả thẻ <meta ... content="..."> Google đưa: chỉ giữ phần content."""
    match = re.search(r'content\s*=\s*["\']([^"\']*)["\']', value)
    return (match.group(1) if match else value).strip()


def _image(verbose_name: StrOrPromise, help_text: StrOrPromise = "") -> Any:
    return models.ForeignKey(
        "wagtailimages.Image",
        verbose_name=verbose_name,
        help_text=help_text,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )


def _pair(field: str) -> FieldRowPanel:
    return FieldRowPanel([FieldPanel(field), FieldPanel(f"{field}_en")])


@register_setting(icon="site")
class SiteSettings(ClusterableModel, BaseGenericSetting):
    # ---------------------------------------------------------------- công ty
    name = models.CharField(
        _("tên giao dịch"),
        max_length=80,
        default="BINH BFC",
        help_text=_("Hiện cạnh logo, dòng bản quyền và tên site khi chia sẻ link."),
    )
    tagline = models.CharField(_("dòng dưới tên (tiếng Việt)"), max_length=80, blank=True)
    tagline_en = models.CharField(_("dòng dưới tên (tiếng Anh)"), max_length=80, blank=True)
    legal_name = models.CharField(_("tên pháp lý (tiếng Việt)"), max_length=200, blank=True)
    legal_name_en = models.CharField(_("tên pháp lý (tiếng Anh)"), max_length=200, blank=True)
    tax_code = models.CharField(_("mã số thuế"), max_length=20, blank=True)
    address = models.TextField(_("địa chỉ (tiếng Việt)"), blank=True)
    address_en = models.TextField(_("địa chỉ (tiếng Anh)"), blank=True)

    # ---------------------------------------------------------------- liên hệ
    phone = models.CharField(
        _("điện thoại"),
        max_length=40,
        blank=True,
        help_text=_(
            "Ghi như muốn hiện trên web, vd +84 - 914 642 008. Link gọi tự lấy các chữ số."
        ),
    )
    email = models.EmailField(_("email"), blank=True)
    whatsapp_url = models.URLField(
        _("link WhatsApp"), blank=True, help_text=_("vd https://wa.me/84914642008. Trống thì ẩn.")
    )
    zalo_url = models.URLField(
        _("link Zalo"), blank=True, help_text=_("vd https://zalo.me/0914642008. Trống thì ẩn.")
    )
    hours = models.CharField(_("giờ làm việc (tiếng Việt)"), max_length=120, blank=True)
    hours_en = models.CharField(_("giờ làm việc (tiếng Anh)"), max_length=120, blank=True)
    maps_url = models.URLField(_("link Google Maps"), max_length=500, blank=True)
    maps_embed_url = models.URLField(
        _("link bản đồ nhúng"),
        max_length=500,
        blank=True,
        validators=[validate_maps_embed],
        help_text=_("Dạng https://www.google.com/maps?q=...&output=embed. Trống thì ẩn bản đồ."),
    )

    # ---------------------------------------------------------------- thương hiệu
    logo = _image(_("logo"), _("Logo tròn, nền trong suốt. Trống thì dùng logo có sẵn của web."))
    logo_on_dark = _image(_("logo trên nền tối"), _("Dùng ở footer. Trống thì dùng logo ở trên."))
    favicon = _image(_("biểu tượng tab trình duyệt"), _("Ảnh vuông, tối thiểu 512 x 512."))
    og_image = _image(
        _("ảnh chia sẻ mặc định"),
        _("Hiện khi chia sẻ link lên Facebook, Zalo... Nên 1200 x 630."),
    )

    # ---------------------------------------------------------------- footer
    footer_blurb = models.TextField(_("giới thiệu ngắn (tiếng Việt)"), blank=True)
    footer_blurb_en = models.TextField(_("giới thiệu ngắn (tiếng Anh)"), blank=True)

    # ---------------------------------------------------------------- SEO
    seo_title = models.CharField(_("tiêu đề mặc định (tiếng Việt)"), max_length=120, blank=True)
    seo_title_en = models.CharField(_("tiêu đề mặc định (tiếng Anh)"), max_length=120, blank=True)
    seo_description = models.TextField(_("mô tả mặc định (tiếng Việt)"), blank=True)
    seo_description_en = models.TextField(_("mô tả mặc định (tiếng Anh)"), blank=True)

    # ---------------------------------------------------------------- xác minh công cụ tìm kiếm
    google_site_verification = models.CharField(
        _("mã xác minh Google Search Console"),
        max_length=200,
        blank=True,
        validators=[validate_verification],
        help_text=_(
            "Search Console → Thêm tài sản → Thẻ HTML: dán cả thẻ meta hoặc chỉ phần content. "
            "Giữ nguyên sau khi xác minh xong, xoá đi Google sẽ huỷ xác minh."
        ),
    )
    bing_site_verification = models.CharField(
        _("mã xác minh Bing Webmaster"),
        max_length=200,
        blank=True,
        validators=[validate_verification],
        help_text=_("Thẻ meta msvalidate.01 của Bing Webmaster Tools (tuỳ chọn)."),
    )

    # ------------------------------------------------ section trên trang chưa có trong CMS
    # Trang Năng lực còn cứng ở frontend (docs/adr/0013, G5.2); riêng FAQ lấy từ Section dùng chung.
    capabilities_faq = models.ForeignKey(
        "pages.SharedSection",
        verbose_name=_("câu hỏi thường gặp trang Năng lực"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text=_(
            "Chọn Section dùng chung loại Câu hỏi thường gặp (sửa ở Nội dung → Section dùng "
            "chung). Bản tiếng Anh tự lấy bản dịch. Trống thì web dùng câu hỏi mặc định."
        ),
    )

    # ---------------------------------------------------------------- đo lường
    ga_measurement_id = models.CharField(
        _("mã Google Analytics"),
        max_length=20,
        blank=True,
        validators=[validate_ga_id],
        help_text=_(
            "Measurement ID của GA4, dạng G-XXXXXXXXXX (Google Analytics → Quản trị → "
            "Luồng dữ liệu). "
            "Trống thì web không gắn Google Analytics. Không tính lượt xem trước bản nháp."
        ),
    )

    edit_handler = TabbedInterface(
        [
            ObjectList(
                [
                    FieldPanel("name"),
                    _pair("tagline"),
                    _pair("legal_name"),
                    FieldPanel("tax_code"),
                    _pair("address"),
                ],
                heading=_("Công ty"),
            ),
            ObjectList(
                [
                    FieldRowPanel([FieldPanel("phone"), FieldPanel("email")]),
                    FieldRowPanel([FieldPanel("whatsapp_url"), FieldPanel("zalo_url")]),
                    _pair("hours"),
                    FieldPanel("maps_url"),
                    FieldPanel("maps_embed_url"),
                    InlinePanel("social_links", heading=_("Mạng xã hội"), label=_("mạng xã hội")),
                ],
                heading=_("Liên hệ"),
            ),
            ObjectList(
                [
                    FieldRowPanel([FieldPanel("logo"), FieldPanel("logo_on_dark")]),
                    FieldRowPanel([FieldPanel("favicon"), FieldPanel("og_image")]),
                ],
                heading=_("Thương hiệu"),
            ),
            ObjectList(
                [InlinePanel("nav_items", heading=_("Menu chính"), label=_("mục menu"))],
                heading=_("Menu"),
            ),
            ObjectList(
                [
                    InlinePanel(
                        "languages",
                        heading=_("Nút đổi ngôn ngữ ở header"),
                        label=_("ngôn ngữ"),
                        help_text=_(
                            "Thứ tự, cờ, tên hiện trong danh sách ngôn ngữ. Chỉ chọn được ngôn ngữ "
                            "web đã cài; cần thêm ngôn ngữ mới thì báo bộ phận kỹ thuật."
                        ),
                    )
                ],
                heading=_("Ngôn ngữ"),
            ),
            ObjectList(
                [
                    _pair("footer_blurb"),
                    InlinePanel(
                        "footer_links", heading=_("Link cuối trang"), label=_("link cuối trang")
                    ),
                ],
                heading=_("Footer"),
            ),
            ObjectList(
                [
                    InlinePanel(
                        "floating_actions",
                        heading=_("Nút nổi sát mép phải, dưới menu"),
                        label=_("nút"),
                        help_text=_(
                            "Hiện ở mọi trang, theo thứ tự này. Gọi điện, WhatsApp, Zalo, Email "
                            "tự lấy link ở tab Liên hệ khi để trống ô link; chưa có thì nút ẩn."
                        ),
                    )
                ],
                heading=_("Nút nổi"),
            ),
            ObjectList(
                [FieldPanel("capabilities_faq")],
                heading=_("Section trên trang"),
            ),
            ObjectList(
                [
                    MultiFieldPanel(
                        [_pair("seo_title"), _pair("seo_description")],
                        heading=_("Trang không có tiêu đề, mô tả riêng"),
                    ),
                    MultiFieldPanel(
                        [
                            FieldPanel("google_site_verification"),
                            FieldPanel("bing_site_verification"),
                        ],
                        heading=_("Xác minh công cụ tìm kiếm"),
                    ),
                    MultiFieldPanel(
                        [FieldPanel("ga_measurement_id")], heading=_("Google Analytics")
                    ),
                ],
                heading=_("SEO"),
            ),
        ]
    )

    class Meta:
        verbose_name = _("Thông tin chung")

    def clean_fields(self, exclude: Any = None) -> None:
        # Rút mã từ thẻ meta trước khi kiểm tra dạng
        self.google_site_verification = verification_token(self.google_site_verification)
        self.bing_site_verification = verification_token(self.bing_site_verification)
        super().clean_fields(exclude=exclude)

    def clean(self) -> None:
        super().clean()
        faq = self.capabilities_faq
        if faq is not None and not any(b.block_type == "faq" for b in faq.body):
            raise ValidationError(
                {"capabilities_faq": _("Section này không phải loại Câu hỏi thường gặp.")}
            )

    def phone_href(self) -> str:
        digits = re.sub(r"[^\d+]", "", self.phone)
        return f"tel:{digits}" if digits else ""


class NavItem(Orderable):
    """Mục menu chính. Trang có sẵn của web hoặc link ngoài; Vật liệu, Sản phẩm tự có menu con."""

    class Target(models.TextChoices):
        CAPABILITIES = "capabilities", _("Năng lực")
        MATERIALS = "materials", _("Vật liệu (có menu con)")
        PRODUCTS = "products", _("Sản phẩm (có menu con)")
        ABOUT = "about", _("Về chúng tôi")
        PROJECTS = "projects", _("Dự án")
        NEWS = "news", _("Tin tức")
        CONTACT = "contact", _("Liên hệ")
        LINK = "link", _("Link khác")

    settings = ParentalKey(SiteSettings, on_delete=models.CASCADE, related_name="nav_items")
    target = models.CharField(_("trỏ tới"), max_length=20, choices=Target.choices)
    url = models.URLField(_("link"), blank=True, help_text=_("Chỉ dùng khi chọn Link khác."))
    label = models.CharField(
        _("tên (tiếng Việt)"),
        max_length=60,
        blank=True,
        help_text=_("Trống thì dùng tên có sẵn của trang."),
    )
    label_en = models.CharField(_("tên (tiếng Anh)"), max_length=60, blank=True)
    visible = models.BooleanField(_("hiện"), default=True)

    panels = [
        FieldRowPanel([FieldPanel("target"), FieldPanel("visible")]),
        FieldPanel("url"),
        _pair("label"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = _("mục menu")

    def clean(self) -> None:
        if self.target == self.Target.LINK:
            errors = {}
            if not self.url:
                errors["url"] = _("Link khác cần có link.")
            if not self.label:
                errors["label"] = _("Link khác cần có tên.")
            if errors:
                raise ValidationError(errors)
        elif self.url:
            raise ValidationError({"url": _("Trang có sẵn không cần link, để trống ô này.")})


# Cờ chọn được cho ngôn ngữ (mã quốc gia ISO 3166). Frontend có SVG đúng các mã này
# (components/shared/flag-icon.tsx): thêm cờ thì thêm cả hai nơi
FLAGS: list[tuple[str, StrOrPromise]] = [
    ("VN", _("Việt Nam")),
    ("GB", _("Anh")),
    ("US", _("Mỹ")),
    ("AU", _("Úc")),
    ("CA", _("Canada")),
    ("DE", _("Đức")),
    ("FR", _("Pháp")),
    ("ES", _("Tây Ban Nha")),
    ("IT", _("Ý")),
    ("NL", _("Hà Lan")),
    ("BE", _("Bỉ")),
    ("PT", _("Bồ Đào Nha")),
    ("BR", _("Brazil")),
    ("MX", _("Mexico")),
    ("SE", _("Thuỵ Điển")),
    ("DK", _("Đan Mạch")),
    ("NO", _("Na Uy")),
    ("FI", _("Phần Lan")),
    ("PL", _("Ba Lan")),
    ("RU", _("Nga")),
    ("TR", _("Thổ Nhĩ Kỳ")),
    ("SA", _("Ả Rập Xê Út")),
    ("AE", _("UAE")),
    ("IN", _("Ấn Độ")),
    ("CN", _("Trung Quốc")),
    ("TW", _("Đài Loan")),
    ("JP", _("Nhật Bản")),
    ("KR", _("Hàn Quốc")),
    ("TH", _("Thái Lan")),
    ("ID", _("Indonesia")),
    ("MY", _("Malaysia")),
]

# Cờ mặc định khi chưa đặt trong CMS
DEFAULT_FLAGS = {
    "vi": "VN",
    "en": "GB",
    "de": "DE",
    "fr": "FR",
    "es": "ES",
    "it": "IT",
    "nl": "NL",
    "pt": "PT",
    "ja": "JP",
    "ko": "KR",
    "zh-hans": "CN",
    "ru": "RU",
}


def language_choices() -> list[tuple[str, str]]:
    """Ngôn ngữ đã cài (settings.LANGUAGES, theo CMS_LANGUAGES); gọi lúc chạy để đổi env không sinh
    migration."""
    from django.conf import settings

    return list(settings.LANGUAGES)


class FlagSelect(VisualRadioSelect):
    """Chọn cờ: ô thả xuống có hình cờ SVG (static/sitesettings/flags)."""

    def visual(self, value: str) -> SafeString:
        return format_html(
            '<img src="{}" alt="" width="30" height="20">',
            static(f"sitesettings/flags/{value}.svg"),
        )


class SiteLanguage(Orderable):
    """Một ngôn ngữ trong nút đổi ngôn ngữ ở header (10/11): thứ tự, cờ, tên, ẩn/hiện."""

    settings = ParentalKey(SiteSettings, on_delete=models.CASCADE, related_name="languages")
    code = models.CharField(_("ngôn ngữ"), max_length=10, choices=language_choices)
    flag = models.CharField(
        _("cờ"),
        max_length=2,
        choices=FLAGS,
        help_text=_("Cờ quốc gia hiện cạnh tên, vd tiếng Anh chọn Anh hoặc Mỹ."),
    )
    label = models.CharField(
        _("tên hiển thị"),
        max_length=40,
        blank=True,
        help_text=_("Trống thì dùng tên gốc của ngôn ngữ, vd English, Deutsch."),
    )
    visible = models.BooleanField(
        _("hiện"),
        default=True,
        help_text=_("Tắt thì bỏ khỏi nút đổi ngôn ngữ. Tiếng Việt (mặc định) luôn hiện."),
    )

    panels = [
        FieldRowPanel([FieldPanel("code"), FieldPanel("visible")]),
        FieldPanel("flag", widget=FlagSelect),
        FieldPanel("label"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = _("ngôn ngữ")
        constraints = [
            models.UniqueConstraint(fields=["settings", "code"], name="site_language_unique_code")
        ]

    def __str__(self) -> str:
        return self.display_name()

    def display_name(self) -> str:
        return self.label or dict(language_choices()).get(self.code, self.code)


def is_internal_path(value: str) -> bool:
    """Đường dẫn trong web (/contact). Chặn //host và /\\host: trình duyệt hiểu là link sang web
    khác (QC 09/11); chặn cả khoảng trắng, ký tự điều khiển."""
    return (
        value.startswith("/")
        and not value.startswith("//")
        and "\\" not in value
        and not re.search(r"[\s\x00-\x1f\x7f]", value)
    )


def validate_action_url(value: str) -> None:
    """Link nút nổi: https://, tel:, mailto: hoặc đường dẫn trong web."""
    if is_internal_path(value):
        return
    if re.match(r"(https?://|tel:|mailto:)", value):
        return
    raise ValidationError(_("Dùng https://..., tel:..., mailto:... hoặc đường dẫn bắt đầu bằng /."))


# Icon chọn được cho nút nổi (10/11). Trùng tên với frontend config/action-icons.ts; hình SVG cho ô
# chọn trong admin ở static/sitesettings/icons (sinh bằng backend/scripts/export_admin_icons.mjs)
ACTION_ICONS: list[tuple[str, StrOrPromise]] = [
    ("search", _("Kính lúp")),
    ("phone", _("Điện thoại")),
    ("phone-call", _("Đang gọi")),
    ("smartphone", _("Di động")),
    ("mail", _("Thư")),
    ("message-circle", _("Tin nhắn tròn")),
    ("message-square", _("Tin nhắn vuông")),
    ("messages-square", _("Trò chuyện")),
    ("send", _("Gửi")),
    ("headphones", _("Tai nghe hỗ trợ")),
    ("file-text", _("Tài liệu")),
    ("clipboard-list", _("Danh sách")),
    ("book-open", _("Catalogue")),
    ("download", _("Tải về")),
    ("link", _("Link")),
    ("external-link", _("Link ngoài")),
    ("map-pin", _("Bản đồ")),
    ("calendar", _("Lịch hẹn")),
    ("clock", _("Đồng hồ")),
    ("circle-help", _("Hỏi đáp")),
    ("globe", _("Quả địa cầu")),
    ("users", _("Nhóm người")),
    ("building", _("Toà nhà")),
    ("package", _("Thùng hàng")),
    ("sofa", _("Sofa")),
    ("armchair", _("Ghế bành")),
    ("video", _("Video")),
    ("star", _("Ngôi sao")),
    ("whatsapp", _("WhatsApp")),
    ("zalo", _("Zalo")),
    ("messenger", _("Messenger")),
    ("facebook", _("Facebook")),
    ("instagram", _("Instagram")),
    ("youtube", _("YouTube")),
    ("tiktok", _("TikTok")),
    ("telegram", _("Telegram")),
    ("viber", _("Viber")),
    ("wechat", _("WeChat")),
    ("line", _("LINE")),
]


class IconSelect(VisualRadioSelect):
    """Chọn icon: ô thả xuống có hình (SVG nhúng thẳng để theo màu chữ admin, cả nền tối)."""

    empty_label = "Theo loại"

    def visual(self, value: str) -> SafeString | str:
        return _icon_svg(value)


@functools.cache
def _icon_svg(name: str) -> str:
    """SVG của icon trong static/sitesettings/icons; chưa có file thì rỗng (chỉ hiện tên)."""
    from django.contrib.staticfiles import finders

    path = finders.find(f"sitesettings/icons/{name}.svg") if name else None
    if not path:
        return ""
    with open(path, encoding="utf-8") as fh:
        # File do script trong repo sinh ra từ thư viện icon, không phải nội dung người dùng nhập
        return mark_safe(fh.read())  # noqa: S308


class FloatingAction(Orderable):
    """Nút trong cụm nút nổi sát mép phải màn hình (dưới header), giống nhau ở mọi trang."""

    class Kind(models.TextChoices):
        SEARCH = "search", _("Tìm kiếm")
        PHONE = "phone", _("Gọi điện")
        WHATSAPP = "whatsapp", _("WhatsApp")
        ZALO = "zalo", _("Zalo")
        EMAIL = "email", _("Email")
        MESSENGER = "messenger", _("Messenger")
        QUOTE = "quote", _("Báo giá (form Liên hệ)")
        LINK = "link", _("Link khác")

    # Loại lấy link từ tab Liên hệ khi ô link trống
    FROM_CONTACT = (Kind.PHONE, Kind.WHATSAPP, Kind.ZALO, Kind.EMAIL)
    # Loại không cần link (web tự xử lý)
    BUILT_IN = (Kind.SEARCH, Kind.QUOTE)

    settings = ParentalKey(SiteSettings, on_delete=models.CASCADE, related_name="floating_actions")
    kind = models.CharField(_("loại"), max_length=20, choices=Kind.choices)
    label = models.CharField(
        _("chữ khi rê chuột (tiếng Việt)"),
        max_length=60,
        blank=True,
        help_text=_("Trống thì dùng tên có sẵn theo loại."),
    )
    label_en = models.CharField(_("chữ khi rê chuột (tiếng Anh)"), max_length=60, blank=True)
    url = models.CharField(
        _("link"),
        max_length=500,
        blank=True,
        validators=[validate_action_url],
        help_text=_(
            "Gọi điện, WhatsApp, Zalo, Email: trống thì lấy ở tab Liên hệ. Tìm kiếm, Báo giá không "
            "cần link. Nút đang bật Hiện mà chưa có link vẫn hiện trên web nhưng không bấm được."
        ),
    )
    visible = models.BooleanField(
        _("hiện"), default=True, help_text=_("Ẩn hay hiện trên web chỉ theo ô này.")
    )
    icon = models.CharField(
        _("icon"),
        max_length=40,
        blank=True,
        choices=ACTION_ICONS,
        help_text=_('Bấm để chọn icon; "Theo loại" dùng icon có sẵn của loại nút.'),
    )

    panels = [
        FieldRowPanel([FieldPanel("kind"), FieldPanel("visible")]),
        FieldPanel("icon", widget=IconSelect),
        FieldPanel("url"),
        _pair("label"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = _("nút nổi")

    def clean(self) -> None:
        if self.kind in self.BUILT_IN and self.url:
            raise ValidationError({"url": _("Loại này không cần link, để trống ô này.")})
        if self.kind == self.Kind.LINK:
            # Bản tiếng Anh không có tên mặc định: trống thì web tiếng Anh hiện chữ tiếng Việt
            errors = {}
            if not self.label:
                errors["label"] = _("Link khác cần có chữ hiện khi rê chuột.")
            if not self.label_en:
                errors["label_en"] = _("Link khác cần có chữ tiếng Anh cho trang tiếng Anh.")
            if errors:
                raise ValidationError(errors)

    def resolved_url(self, site: SiteSettings) -> str:
        """Link thật của nút; rỗng = nút vẫn hiện nhưng không bấm được (chưa nhập số...)."""
        if self.url or self.kind in self.BUILT_IN:
            return self.url
        links: dict[str, str] = {
            self.Kind.PHONE: site.phone_href(),
            self.Kind.WHATSAPP: site.whatsapp_url,
            self.Kind.ZALO: site.zalo_url,
            self.Kind.EMAIL: f"mailto:{site.email}" if site.email else "",
        }
        return links.get(str(self.kind), "")


class FooterLink(Orderable):
    """Link nhỏ ở dòng cuối footer (chính sách bảo mật, điều khoản...)."""

    settings = ParentalKey(SiteSettings, on_delete=models.CASCADE, related_name="footer_links")
    label = models.CharField(_("tên (tiếng Việt)"), max_length=60)
    label_en = models.CharField(_("tên (tiếng Anh)"), max_length=60, blank=True)
    url = models.CharField(
        _("link"),
        max_length=500,
        help_text=_("Link đầy đủ (https://...) hoặc đường dẫn trong web (vd /contact)."),
    )

    panels = [_pair("label"), FieldPanel("url")]

    class Meta(Orderable.Meta):
        verbose_name = _("link cuối trang")

    def clean(self) -> None:
        if not is_internal_path(self.url) and not re.match(r"https?://", self.url):
            raise ValidationError({"url": _("Dùng https://... hoặc đường dẫn bắt đầu bằng /.")})


class SocialLink(Orderable):
    class Network(models.TextChoices):
        FACEBOOK = "facebook", "Facebook"
        LINKEDIN = "linkedin", "LinkedIn"
        YOUTUBE = "youtube", "YouTube"
        INSTAGRAM = "instagram", "Instagram"
        TIKTOK = "tiktok", "TikTok"
        PINTEREST = "pinterest", "Pinterest"

    settings = ParentalKey(SiteSettings, on_delete=models.CASCADE, related_name="social_links")
    network = models.CharField(_("mạng"), max_length=20, choices=Network.choices)
    url = models.URLField(_("link"))

    panels = [FieldRowPanel([FieldPanel("network"), FieldPanel("url")])]

    class Meta(Orderable.Meta):
        verbose_name = _("mạng xã hội")
