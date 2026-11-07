"""Rà soát SEO toàn site (docs/adr/0015): mỗi trang công khai ở mỗi ngôn ngữ một dòng.

Đánh giá đúng thứ web sẽ hiện, theo cùng quy tắc tự tạo của frontend: SEO riêng nhập trong admin,
trống thì lấy từ nội dung (tên, mô tả), rồi tới SEO mặc định ở Cài đặt. Mức:
- lỗi: Google thấy nội dung kém hoặc sai (chưa dịch, thiếu mô tả, mô tả trùng mọi trang, quá dài);
- cần xem: nên làm tốt hơn (mô tả ngắn, tên dài, chưa có ảnh riêng để chia sẻ);
- trang đặt "ẩn khỏi Google" không chấm.
Chỉ đọc, không đổi dữ liệu.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.urls import reverse
from django.utils.html import strip_tags
from django.utils.text import normalize_newlines
from django.utils.translation import gettext as _

TITLE_MAX = 60
DESCRIPTION_MIN = 50
DESCRIPTION_MAX = 160

ERROR = "error"
WARNING = "warning"
OK = "ok"
HIDDEN = "hidden"


@dataclass
class Issue:
    level: str
    text: str


@dataclass
class SeoRow:
    kind: str
    name: str
    language: str
    path: str
    edit_url: str
    noindex: bool = False
    issues: list[Issue] = field(default_factory=list)

    @property
    def level(self) -> str:
        if self.noindex:
            return HIDDEN
        levels = {i.level for i in self.issues}
        return ERROR if ERROR in levels else WARNING if WARNING in levels else OK

    def error(self, text: str) -> None:
        self.issues.append(Issue(ERROR, text))

    def warn(self, text: str) -> None:
        self.issues.append(Issue(WARNING, text))


def _plain(html: str) -> str:
    return " ".join(normalize_newlines(strip_tags(html or "")).split())


def _prefix(language: str) -> str:
    return "" if language == settings.LANGUAGE_CODE else f"/{language}"


def _languages() -> list[str]:
    return [code for code, _name in settings.WAGTAIL_CONTENT_LANGUAGES]


def _check_text(
    row: SeoRow,
    *,
    seo_title: str,
    auto_title: str,
    seo_description: str,
    auto_description: str,
    missing_description: str,
) -> None:
    """Tiêu đề và mô tả: SEO riêng nếu có, không thì giá trị web tự tạo."""
    if seo_title and len(seo_title) > TITLE_MAX:
        row.error(
            _("Tiêu đề SEO dài %(n)s ký tự, Google cắt sau khoảng %(max)s.")
            % {"n": len(seo_title), "max": TITLE_MAX}
        )
    elif not seo_title and len(auto_title) > TITLE_MAX:
        row.warn(
            _("Tiêu đề tự tạo dài %(n)s ký tự, nên nhập tiêu đề SEO ngắn hơn.")
            % {"n": len(auto_title)}
        )

    description = seo_description or auto_description
    if not description:
        row.error(missing_description)
    elif len(description) > DESCRIPTION_MAX and seo_description:
        row.error(
            _("Mô tả SEO dài %(n)s ký tự, nên tối đa %(max)s.")
            % {"n": len(description), "max": DESCRIPTION_MAX}
        )
    elif len(description) < DESCRIPTION_MIN:
        row.warn(
            _("Mô tả ngắn (%(n)s ký tự), nên từ %(min)s đến %(max)s.")
            % {"n": len(description), "min": DESCRIPTION_MIN, "max": DESCRIPTION_MAX}
        )


def _snippet_edit(obj: Any) -> str:
    meta = obj._meta
    return reverse(f"wagtailsnippets_{meta.app_label}_{meta.model_name}:edit", args=[obj.pk])


# ------------------------------------------------------------------------------------ trang
def _page_rows(site_description: dict[str, str], site_has_image: bool) -> Iterable[SeoRow]:
    from wagtail.models import Locale

    from apps.pages.models import HomePage
    from apps.pages.rich_text import frontend_path
    from apps.pages.selectors import PAGE_MODELS

    default = Locale.get_default()
    for model in PAGE_MODELS.values():
        source = model.objects.filter(locale=default).first()
        if source is None:
            continue
        for language in _languages():
            page = (
                source
                if language == default.language_code
                else model.objects.filter(
                    translation_key=source.translation_key,
                    locale__language_code=language,
                    live=True,
                ).first()
            )
            row = SeoRow(
                kind=_("Trang"),
                name=source.title,
                language=language,
                path=frontend_path(page or source) or f"{_prefix(language)}/",
                edit_url=reverse("wagtailadmin_pages:edit", args=[(page or source).pk]),
                noindex=source.noindex,
            )
            if page is None:
                row.error(_("Chưa có bản dịch đã xuất bản: web đang hiện bản tiếng Việt."))
                yield row
                continue
            row.path = frontend_path(page) or row.path
            if isinstance(page, HomePage):
                auto_description = site_description.get(language, "")
                missing = _("Thiếu mô tả: nhập ở tab Quảng bá hoặc SEO mặc định ở Cài đặt.")
            else:
                first = next(iter(page.body), None)
                auto_description = _plain(str(first.value["body"])) if first else ""
                missing = _("Thiếu mô tả: nhập ở tab Quảng bá.")
            _check_text(
                row,
                seo_title=page.seo_title,
                auto_title=page.title,
                seo_description=page.search_description,
                auto_description=auto_description[:DESCRIPTION_MAX],
                missing_description=missing,
            )
            if not page.og_image:
                if site_has_image:
                    row.warn(_("Chưa có ảnh chia sẻ riêng, đang dùng ảnh mặc định của site."))
                else:
                    row.error(_("Không có ảnh chia sẻ (cả ảnh mặc định ở Cài đặt)."))
            yield row


# ------------------------------------------------------------------------------------ catalog
def _product_rows() -> Iterable[SeoRow]:
    from wagtail.models import Locale

    from apps.catalog.models import Product

    default = Locale.get_default()
    sources = (
        Product.objects.filter(locale=default, live=True)
        .select_related("product_type__category")
        .prefetch_related("images")
        .order_by("product_type__category__sort_order", "sort_order", "id")
    )
    translations = {
        (p.translation_key, p.locale.language_code): p
        for p in Product.objects.filter(live=True).exclude(locale=default).select_related("locale")
    }
    for source in sources:
        category = source.product_type.category
        for language in _languages():
            product = (
                source
                if language == default.language_code
                else translations.get((source.translation_key, language))
            )
            row = SeoRow(
                kind=_("Sản phẩm"),
                name=source.name,
                language=language,
                path=f"{_prefix(language)}/products/{category.slug}/{source.slug}",
                edit_url=_snippet_edit(product or source),
                noindex=source.noindex,
            )
            if product is None:
                # Như frontend: chưa dịch mà bản gốc có chữ cần dịch thì trang tiếng khác bị ẩn khỏi
                # Google; chưa có chữ nào (tên, nhãn dùng chung) thì chấm luôn trên bản gốc
                if _plain(source.description) or source.seo_title or source.seo_description:
                    row.error(_("Chưa có bản dịch đã xuất bản: trang đang ẩn khỏi Google."))
                    yield row
                    continue
                product = source
            _check_text(
                row,
                seo_title=product.seo_title,
                auto_title=f"{source.name} | {source.product_type.label(language)}",
                seo_description=product.seo_description,
                auto_description=_plain(product.description)[:DESCRIPTION_MAX],
                missing_description=_(
                    "Thiếu mô tả: web dùng một câu chung giống mọi sản phẩm. "
                    "Nhập mô tả hoặc mô tả SEO."
                ),
            )
            if not source.images.all():
                row.error(_("Chưa có ảnh: trang và ảnh chia sẻ trống."))
            yield row


def _bilingual(obj: Any, field_name: str, language: str) -> str:
    return str(getattr(obj, f"{field_name}_en" if language == "en" else field_name) or "")


def _taxonomy_rows() -> Iterable[SeoRow]:
    from apps.catalog.models import Category, Material

    groups: list[tuple[str, Any, str, str, str]] = [
        (_("Nhóm sản phẩm"), Category.objects.all(), "products", "description", "cover"),
        (_("Vật liệu"), Material.objects.all(), "materials", "lede", "image"),
    ]
    for kind, queryset, base, text_field, image_field in groups:
        for obj in queryset:
            for language in _languages():
                row = SeoRow(
                    kind=kind,
                    name=obj.name,
                    language=language,
                    path=f"{_prefix(language)}/{base}/{obj.slug}",
                    edit_url=_snippet_edit(obj),
                    noindex=obj.noindex,
                )
                name = _bilingual(obj, "name", language)
                if not name:
                    row.error(_("Chưa có tên tiếng Anh."))
                _check_text(
                    row,
                    seo_title=_bilingual(obj, "seo_title", language),
                    auto_title=name or obj.name,
                    seo_description=_bilingual(obj, "seo_description", language),
                    auto_description=_bilingual(obj, text_field, language),
                    missing_description=_("Thiếu mô tả ngắn ở ngôn ngữ này."),
                )
                if not getattr(obj, f"{image_field}_id"):
                    row.warn(_("Chưa có ảnh: ảnh chia sẻ dùng ảnh mặc định của site."))
                yield row


# ------------------------------------------------------------------------------------ cài đặt
def _site_rows(site: Any) -> Iterable[SeoRow]:
    edit_url = reverse("wagtailsettings:edit", args=["sitesettings", "sitesettings"])
    for language in _languages():
        row = SeoRow(
            kind=_("SEO mặc định"),
            name=_("Cài đặt → Thông tin chung"),
            language=language,
            path=f"{_prefix(language)}/",
            edit_url=edit_url,
        )
        if not _bilingual(site, "seo_title", language):
            row.warn(_("Chưa có tiêu đề mặc định, web dùng tiêu đề có sẵn trong code."))
        description = _bilingual(site, "seo_description", language)
        if not description:
            row.error(_("Chưa có mô tả mặc định (dùng cho trang chủ và trang thiếu mô tả)."))
        elif not DESCRIPTION_MIN <= len(description) <= DESCRIPTION_MAX:
            row.warn(
                _("Mô tả mặc định dài %(n)s ký tự, nên từ %(min)s đến %(max)s.")
                % {"n": len(description), "min": DESCRIPTION_MIN, "max": DESCRIPTION_MAX}
            )
        if not site.og_image_id:
            row.error(_("Chưa có ảnh chia sẻ mặc định."))
        yield row


def audit() -> list[SeoRow]:
    from apps.sitesettings.models import SiteSettings

    site = SiteSettings.load()
    descriptions = {lang: _bilingual(site, "seo_description", lang) for lang in _languages()}
    return [
        *_site_rows(site),
        *_page_rows(descriptions, bool(site.og_image_id)),
        *_taxonomy_rows(),
        *_product_rows(),
    ]


def summary(rows: list[SeoRow]) -> dict[str, int]:
    counts = {ERROR: 0, WARNING: 0, OK: 0, HIDDEN: 0}
    for row in rows:
        counts[row.level] += 1
    return counts
