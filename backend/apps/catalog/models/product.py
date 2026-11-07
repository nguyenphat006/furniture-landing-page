"""Sản phẩm, ảnh sản phẩm và món con của bộ.

Product có nháp / xuất bản / lịch sử (DraftStateMixin, RevisionMixin) và bản dịch
(TranslatableMixin, wagtail-localize). Chỉ chữ mô tả cần dịch; tên mẫu, mã, số đo, phân loại, ảnh
và món con được đồng bộ
nguyên từ bản gốc sang bản dịch (xem `translatable_fields`).

Quy cách (kích thước, đóng gói, carton, xếp container) dùng chung cho sản phẩm và món con của bộ qua
SpecFields, khớp kiểu Dimensions / Loading / SetItem của frontend.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.contrib.contenttypes.fields import GenericRelation
from django.core.exceptions import ValidationError
from django.db import models
from django.forms import CheckboxSelectMultiple
from django.http import HttpRequest, HttpResponse
from django.utils.translation import gettext_lazy as _
from modelcluster.fields import ParentalKey, ParentalManyToManyField
from modelcluster.models import ClusterableModel
from wagtail.admin.forms import WagtailAdminModelForm
from wagtail.admin.panels import (
    FieldPanel,
    FieldRowPanel,
    HelpPanel,
    InlinePanel,
    MultiFieldPanel,
    MultipleChooserPanel,
    ObjectList,
    TabbedInterface,
)
from wagtail.fields import RichTextField
from wagtail.models import (
    DraftStateMixin,
    Orderable,
    PreviewableMixin,
    RevisionMixin,
    TranslatableMixin,
)
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField, TranslatableField

from apps.core.models import TimeStampedModel

from .seo import SeoFields
from .taxonomy import slug_validator

if TYPE_CHECKING:
    from django_stubs_ext import StrOrPromise

DIMENSION_FIELDS = ("length", "width", "height", "diameter")
CARTON_FIELDS = tuple(f"carton_{f}" for f in DIMENSION_FIELDS)
CONTAINER_TYPES = ("20GP", "40GP", "40HC")
LOADING_FIELDS = tuple(f"loading_{c.lower()}" for c in CONTAINER_TYPES)


def _cm(label: StrOrPromise) -> models.DecimalField[Any, Any]:
    # Đơn vị cm ghi ở tiêu đề nhóm trường trong admin
    return models.DecimalField(label, max_digits=6, decimal_places=1, null=True, blank=True)


def _pcs(label: StrOrPromise) -> models.PositiveIntegerField[Any, Any]:
    return models.PositiveIntegerField(label, null=True, blank=True)


class Assembly(models.TextChoices):
    KD = "kd", _("Tháo rời (KD)")
    FA = "fa", _("Lắp sẵn (FA)")


class SpecFields(models.Model):
    """Quy cách dùng chung: kích thước, đóng gói, carton, pcs mỗi container. Thiếu thì để trống."""

    length = _cm(_("dài"))
    width = _cm(_("rộng"))
    height = _cm(_("cao"))
    diameter = _cm(_("đường kính"))

    assembly = models.CharField(_("đóng gói"), max_length=2, choices=Assembly.choices, blank=True)
    pcs_per_box = _pcs(_("số sản phẩm mỗi thùng"))

    carton_length = _cm(_("carton dài"))
    carton_width = _cm(_("carton rộng"))
    carton_height = _cm(_("carton cao"))
    carton_diameter = _cm(_("carton đường kính"))

    loading_20gp = _pcs(_("pcs / 20GP"))
    loading_40gp = _pcs(_("pcs / 40GP"))
    loading_40hc = _pcs(_("pcs / 40HC"))

    class Meta:
        abstract = True

    @classmethod
    def spec_panels(cls) -> list[MultiFieldPanel]:
        return [
            MultiFieldPanel(
                [FieldRowPanel([FieldPanel(f) for f in DIMENSION_FIELDS])],
                heading=_("Kích thước (cm)"),
            ),
            MultiFieldPanel(
                [
                    FieldRowPanel([FieldPanel("assembly"), FieldPanel("pcs_per_box")]),
                    FieldRowPanel([FieldPanel(f) for f in CARTON_FIELDS]),
                    FieldRowPanel([FieldPanel(f) for f in LOADING_FIELDS]),
                ],
                heading=_("Đóng gói, carton (cm) và số pcs mỗi container"),
            ),
        ]


class ProductForm(WagtailAdminModelForm):
    """Khoá slug sau khi sản phẩm đã xuất bản lần đầu (URL đã public)."""

    def clean_slug(self) -> str:
        slug: str = self.cleaned_data["slug"]
        instance = self.instance
        if (
            instance.pk
            and instance.first_published_at is not None
            and slug != Product.objects.values_list("slug", flat=True).get(pk=instance.pk)
        ):
            raise ValidationError(
                _(
                    "Sản phẩm đã xuất bản nên không đổi slug (URL đã public). "
                    "Cần đổi thì báo kỹ thuật."
                )
            )
        return slug


class Product(
    TranslatableMixin,
    DraftStateMixin,
    PreviewableMixin,
    RevisionMixin,
    index.Indexed,
    SpecFields,
    SeoFields,
    TimeStampedModel,
    ClusterableModel,
):
    slug = models.CharField(
        _("slug"),
        max_length=120,
        validators=[slug_validator],
        help_text=_(
            "URL sản phẩm, duy nhất toàn site, ví dụ: atlas-sunlounger. Khoá sau khi xuất bản."
        ),
    )
    name = models.CharField(_("tên mẫu"), max_length=200)
    code = models.CharField(_("mã mẫu"), max_length=40, blank=True, db_index=True)
    product_type = models.ForeignKey(
        "catalog.ProductType",
        verbose_name=_("loại"),
        on_delete=models.PROTECT,
        related_name="products",
    )
    materials = ParentalManyToManyField(
        "catalog.Material", verbose_name=_("chất liệu"), blank=True, related_name="products"
    )
    features = ParentalManyToManyField(
        "catalog.Feature", verbose_name=_("tính năng"), blank=True, related_name="products"
    )
    description = RichTextField(
        _("mô tả"),
        blank=True,
        features=["bold", "italic", "ol", "ul", "link"],
        help_text=_("Tab Mô tả trên web. Để trống thì web dùng đoạn giới thiệu OEM chung."),
    )
    sort_order = models.PositiveIntegerField(_("thứ tự"), default=0, db_index=True)
    erp_variant_id = models.PositiveIntegerField(
        _("ERP variant id"),
        null=True,
        blank=True,
        help_text=_("Để sẵn cho lúc đồng bộ ERP. Chưa dùng."),
    )

    _revisions = GenericRelation("wagtailcore.Revision", related_query_name="product")

    base_form_class = ProductForm

    # Chỉ mô tả cần dịch; các trường còn lại đồng bộ nguyên từ bản gốc
    translatable_fields = [
        TranslatableField("description"),
        TranslatableField("seo_title"),
        TranslatableField("seo_description"),
        SynchronizedField("noindex"),
        SynchronizedField("slug"),
        SynchronizedField("name"),
        SynchronizedField("code"),
        SynchronizedField("product_type"),
        SynchronizedField("materials"),
        SynchronizedField("features"),
        SynchronizedField("sort_order"),
        SynchronizedField("erp_variant_id"),
        *(SynchronizedField(f) for f in (*DIMENSION_FIELDS, *CARTON_FIELDS, *LOADING_FIELDS)),
        SynchronizedField("assembly"),
        SynchronizedField("pcs_per_box"),
        SynchronizedField("images"),
        SynchronizedField("set_items"),
    ]

    search_fields = [
        index.SearchField("name"),
        index.SearchField("code"),
        index.AutocompleteField("name"),
        index.AutocompleteField("code"),
        index.FilterField("locale_id"),
        index.FilterField("live"),
        index.FilterField("product_type_id"),
    ]

    edit_handler = TabbedInterface(
        [
            ObjectList(
                [
                    FieldRowPanel([FieldPanel("name"), FieldPanel("code")]),
                    FieldRowPanel([FieldPanel("slug"), FieldPanel("product_type")]),
                    MultipleChooserPanel(
                        "images", chooser_field_name="image", heading=_("Ảnh"), label=_("ảnh")
                    ),
                    FieldPanel("description"),
                ],
                heading=_("Chung"),
            ),
            ObjectList(
                [
                    FieldPanel("materials", widget=CheckboxSelectMultiple),
                    FieldPanel("features", widget=CheckboxSelectMultiple),
                    *SpecFields.spec_panels(),
                ],
                heading=_("Thông số"),
            ),
            ObjectList(
                [
                    HelpPanel(
                        _(
                            "Chỉ dùng khi loại sản phẩm là bộ (ví dụ Bộ sofa, Bộ bàn ăn): "
                            "khai báo từng món kèm quy cách riêng."
                        )
                    ),
                    InlinePanel("set_items", heading=_("Món trong bộ"), label=_("món")),
                ],
                heading=_("Thành phần bộ"),
            ),
            ObjectList(SeoFields.seo_panels(), heading=_("SEO")),
            ObjectList(
                [FieldPanel("sort_order"), FieldPanel("erp_variant_id", read_only=True)],
                heading=_("Khác"),
            ),
        ]
    )

    class Meta(TranslatableMixin.Meta):
        verbose_name = _("sản phẩm")
        verbose_name_plural = _("sản phẩm")
        ordering = ["product_type__category__sort_order", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["slug", "locale"], name="catalog_product_slug_locale"),
        ]

    def __str__(self) -> str:
        return self.name

    def serve_preview(self, request: HttpRequest, mode_name: str) -> HttpResponse:
        """Xem trước trang chi tiết trên web Next.js với bản đang sửa (apps/pages/preview.py)."""
        from django.conf import settings

        from apps.catalog.api.serializers import ProductDetailSerializer
        from apps.pages.preview import preview_response

        language = self.locale.language_code
        prefix = "" if language == settings.LANGUAGE_CODE else f"/{language}"
        path = f"{prefix}/products/{self.product_type.category.slug}/{self.slug}"
        # Thuộc tính annotate ở selectors.live_products; bản đang sửa luôn là bản của chính nó
        self.__dict__["is_fallback"] = False
        context = {"request": request, "locale": self.locale, "language": language}
        return preview_response(
            request,
            kind="product",
            key=self.slug,
            locale=language,
            path=path,
            data=dict(ProductDetailSerializer(self, context=context).data),
        )

    def clean(self) -> None:
        super().clean()
        # Slug duy nhất toàn site: mọi bản dịch cùng slug, nhưng hai sản phẩm khác nhau không trùng
        clash = (
            Product.objects.filter(slug=self.slug)
            .exclude(translation_key=self.translation_key)
            .exists()
        )
        if clash:
            raise ValidationError({"slug": _("Slug đã được sản phẩm khác dùng.")})


class ProductImage(Orderable):
    """Ảnh sản phẩm có thứ tự; ảnh đầu là ảnh đại diện."""

    product = ParentalKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ForeignKey(
        "wagtailimages.Image", verbose_name=_("ảnh"), on_delete=models.CASCADE, related_name="+"
    )

    panels = [FieldPanel("image")]

    class Meta(Orderable.Meta):
        verbose_name = _("ảnh sản phẩm")
        verbose_name_plural = _("ảnh sản phẩm")

    def __str__(self) -> str:
        return str(self.image)


class SetItem(SpecFields, Orderable, ClusterableModel):
    """Một món trong bộ (chỉ dùng cho sản phẩm thuộc loại 'là bộ'), có quy cách riêng."""

    product = ParentalKey(Product, on_delete=models.CASCADE, related_name="set_items")
    product_type = models.ForeignKey(
        "catalog.ProductType",
        verbose_name=_("loại"),
        on_delete=models.PROTECT,
        related_name="+",
    )
    qty = models.PositiveIntegerField(_("số lượng"), default=1)
    materials = ParentalManyToManyField(
        "catalog.Material", verbose_name=_("chất liệu"), blank=True, related_name="+"
    )
    features = ParentalManyToManyField(
        "catalog.Feature", verbose_name=_("tính năng"), blank=True, related_name="+"
    )
    image = models.ForeignKey(
        "wagtailimages.Image",
        verbose_name=_("ảnh riêng"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    panels = [
        FieldRowPanel([FieldPanel("product_type"), FieldPanel("qty")]),
        FieldPanel("materials", widget=CheckboxSelectMultiple),
        FieldPanel("features", widget=CheckboxSelectMultiple),
        *SpecFields.spec_panels(),
        FieldPanel("image"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = _("món trong bộ")
        verbose_name_plural = _("món trong bộ")

    def __str__(self) -> str:
        return f"{self.qty} x {self.product_type}"
