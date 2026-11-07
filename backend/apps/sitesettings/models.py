"""Thông tin chung và khung site, sửa trong admin: Cài đặt → Thông tin chung (docs/adr/0011).

Một bản ghi duy nhất (BaseGenericSetting), chia tab: Công ty, Liên hệ, Thương hiệu, Menu,
Footer, SEO.
Chữ song ngữ theo cột `_en` như phân loại (docs/adr/0007); bản tiếng Anh trống thì dùng tiếng Việt.
Admin chỉ đổi nội dung; bố cục header, footer vẫn do frontend quyết định và giống nhau ở mọi trang.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
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
                    MultiFieldPanel(
                        [_pair("seo_title"), _pair("seo_description")],
                        heading=_("Trang không có tiêu đề, mô tả riêng"),
                    )
                ],
                heading=_("SEO"),
            ),
        ]
    )

    class Meta:
        verbose_name = _("Thông tin chung")

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
