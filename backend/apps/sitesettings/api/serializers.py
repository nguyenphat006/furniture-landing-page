"""Serializer thông tin chung. Một gói cho header, footer, trang Liên hệ, SEO; chữ theo ngôn ngữ."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from wagtail.images.models import AbstractImage

from apps.core.media_url import absolute_url

from ..models import FloatingAction, FooterLink, NavItem, SiteSettings, SocialLink, localized

# Logo giữ PNG (nền trong suốt, nét sắc); favicon vuông; ảnh chia sẻ đúng khung 1200 x 630
RENDITION_LOGO = "max-480x480|format-png"
RENDITION_FAVICON = "fill-512x512|format-png"
RENDITION_OG = "fill-1200x630|format-jpeg|jpegquality-85"


def _language(context: Mapping[str, Any]) -> str:
    return str(context["language"])


def _url(context: Mapping[str, Any], image: AbstractImage | None, spec: str) -> str | None:
    if image is None:
        return None
    return absolute_url(context, image.get_rendition(spec).url)


class CompanySerializer(serializers.Serializer[SiteSettings]):
    name = serializers.CharField()
    tagline = serializers.SerializerMethodField()
    legal_name = serializers.SerializerMethodField()
    tax_code = serializers.CharField()
    address = serializers.SerializerMethodField()

    def get_tagline(self, obj: SiteSettings) -> str:
        return localized(obj, "tagline", _language(self.context))

    def get_legal_name(self, obj: SiteSettings) -> str:
        return localized(obj, "legal_name", _language(self.context))

    def get_address(self, obj: SiteSettings) -> str:
        return localized(obj, "address", _language(self.context))


class ContactSerializer(serializers.Serializer[SiteSettings]):
    phone = serializers.CharField()
    phone_href = serializers.CharField(help_text="tel:+84...; rỗng nếu chưa có số")
    email = serializers.CharField()
    whatsapp_url = serializers.CharField()
    zalo_url = serializers.CharField()
    hours = serializers.SerializerMethodField()
    maps_url = serializers.CharField()
    maps_embed_url = serializers.CharField()

    def get_hours(self, obj: SiteSettings) -> str:
        return localized(obj, "hours", _language(self.context))


class SocialLinkSerializer(serializers.Serializer[SocialLink]):
    network = serializers.ChoiceField(choices=SocialLink.Network.choices)
    url = serializers.CharField()


class BrandingSerializer(serializers.Serializer[SiteSettings]):
    """URL ảnh; null = chưa đặt, frontend dùng ảnh có sẵn."""

    logo = serializers.SerializerMethodField()
    logo_on_dark = serializers.SerializerMethodField()
    favicon = serializers.SerializerMethodField()
    og_image = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_logo(self, obj: SiteSettings) -> str | None:
        return _url(self.context, obj.logo, RENDITION_LOGO)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_logo_on_dark(self, obj: SiteSettings) -> str | None:
        return _url(self.context, obj.logo_on_dark or obj.logo, RENDITION_LOGO)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_favicon(self, obj: SiteSettings) -> str | None:
        return _url(self.context, obj.favicon, RENDITION_FAVICON)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_og_image(self, obj: SiteSettings) -> str | None:
        return _url(self.context, obj.og_image, RENDITION_OG)


class NavItemSerializer(serializers.Serializer[NavItem]):
    target = serializers.ChoiceField(
        choices=NavItem.Target.choices,
        help_text="Trang có sẵn của web, hoặc `link` (link ngoài, xem url)",
    )
    # Field.label của DRF trùng tên; metaclass của serializer tách field ra nên chạy đúng
    label = serializers.SerializerMethodField(  # type: ignore[assignment]
        help_text="Rỗng: dùng tên có sẵn của trang"
    )
    url = serializers.CharField(help_text="Chỉ có khi target = link")

    def get_label(self, obj: NavItem) -> str:
        return localized(obj, "label", _language(self.context))


class FooterLinkSerializer(serializers.Serializer[FooterLink]):
    label = serializers.SerializerMethodField()  # type: ignore[assignment]
    url = serializers.CharField()

    def get_label(self, obj: FooterLink) -> str:
        return localized(obj, "label", _language(self.context))


class FooterSerializer(serializers.Serializer[SiteSettings]):
    blurb = serializers.SerializerMethodField()
    links = FooterLinkSerializer(source="footer_links", many=True)

    def get_blurb(self, obj: SiteSettings) -> str:
        return localized(obj, "footer_blurb", _language(self.context))


class SeoSerializer(serializers.Serializer[SiteSettings]):
    title = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    def get_title(self, obj: SiteSettings) -> str:
        return localized(obj, "seo_title", _language(self.context))

    def get_description(self, obj: SiteSettings) -> str:
        return localized(obj, "seo_description", _language(self.context))


class AnalyticsSerializer(serializers.Serializer[SiteSettings]):
    ga_measurement_id = serializers.CharField(help_text="Mã GA4 (G-...); rỗng = không gắn")
    google_site_verification = serializers.CharField(
        help_text="Nội dung thẻ meta google-site-verification; rỗng = không gắn"
    )
    bing_site_verification = serializers.CharField(
        help_text="Nội dung thẻ meta msvalidate.01; rỗng = không gắn"
    )


class FloatingActionSerializer(serializers.Serializer[FloatingAction]):
    kind = serializers.ChoiceField(choices=FloatingAction.Kind.choices)
    label = serializers.SerializerMethodField(  # type: ignore[assignment]
        help_text="Rỗng: dùng tên có sẵn theo loại"
    )
    url = serializers.SerializerMethodField(
        help_text="Link đã lấy từ Liên hệ khi cần; rỗng với search và quote"
    )

    def get_label(self, obj: FloatingAction) -> str:
        return localized(obj, "label", _language(self.context))

    def get_url(self, obj: FloatingAction) -> str:
        return obj.resolved_url(self.context["site"])


def _floating(obj: SiteSettings, context: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Nút đang hiện và có link dùng được (search, quote không cần link)."""
    items = []
    for action in obj.floating_actions.filter(visible=True):
        data = FloatingActionSerializer(action, context={**context, "site": obj}).data
        if data["url"] or action.kind in FloatingAction.BUILT_IN:
            items.append(dict(data))
    return items


class SiteSerializer(serializers.Serializer[SiteSettings]):
    company = CompanySerializer(source="*")
    contact = ContactSerializer(source="*")
    social = SocialLinkSerializer(source="social_links", many=True)
    branding = BrandingSerializer(source="*")
    nav = NavItemSerializer(
        source="nav_items", many=True, help_text="Mục menu chính đang hiện, theo thứ tự"
    )
    footer = FooterSerializer(source="*")
    seo = SeoSerializer(source="*")
    analytics = AnalyticsSerializer(source="*")
    floating = serializers.SerializerMethodField(
        help_text="Cụm nút nổi sát mép phải, theo thứ tự; chỉ nút đang hiện và có link"
    )

    @extend_schema_field(FloatingActionSerializer(many=True))
    def get_floating(self, obj: SiteSettings) -> list[dict[str, Any]]:
        return _floating(obj, self.context)
