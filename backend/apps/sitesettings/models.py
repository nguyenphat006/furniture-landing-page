"""Thông tin chung và khung site, sửa trong admin: Cài đặt → Thông tin chung (docs/adr/0011).

Một bản ghi duy nhất (BaseGenericSetting), chia tab: Công ty, Liên hệ, Thương hiệu, Menu,
Footer, Nút nổi, SEO (gồm mã Google Analytics).
Chữ song ngữ theo cột `_en` như phân loại (docs/adr/0007); bản tiếng Anh trống thì dùng tiếng Việt.
Admin chỉ đổi nội dung; bố cục header, footer vẫn do frontend quyết định và giống nhau ở mọi trang.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
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


def validate_action_url(value: str) -> None:
    """Link nút nổi: https://, tel:, mailto: hoặc đường dẫn trong web."""
    if value.startswith("/") and not value.startswith("//"):
        return
    if re.match(r"(https?://|tel:|mailto:)", value):
        return
    raise ValidationError(_("Dùng https://..., tel:..., mailto:... hoặc đường dẫn bắt đầu bằng /."))


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
            "Messenger và Link khác bắt buộc. Gọi điện, WhatsApp, Zalo, Email: trống thì lấy ở tab "
            "Liên hệ. Tìm kiếm, Báo giá không cần link."
        ),
    )
    visible = models.BooleanField(_("hiện"), default=True)

    panels = [
        FieldRowPanel([FieldPanel("kind"), FieldPanel("visible")]),
        FieldPanel("url"),
        _pair("label"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = _("nút nổi")

    def clean(self) -> None:
        if self.kind in self.BUILT_IN and self.url:
            raise ValidationError({"url": _("Loại này không cần link, để trống ô này.")})
        needs_url = self.kind not in self.BUILT_IN and self.kind not in self.FROM_CONTACT
        if needs_url and not self.url:
            raise ValidationError({"url": _("Loại này cần có link.")})
        if self.kind == self.Kind.LINK and not self.label:
            raise ValidationError({"label": _("Link khác cần có chữ hiện khi rê chuột.")})

    def resolved_url(self, site: SiteSettings) -> str:
        """Link thật của nút; rỗng = ẩn (vd chưa nhập số điện thoại)."""
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
        if not (self.url.startswith("/") and not self.url.startswith("//")) and not re.match(
            r"https?://", self.url
        ):
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
