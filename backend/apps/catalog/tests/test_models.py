import pytest
from django.core.exceptions import ValidationError
from wagtail.models import Locale

from apps.catalog.models import Category, Product
from apps.catalog.models.product import ProductForm
from apps.catalog.services import ImportResult


def test_slug_must_be_unique_across_products(catalog: ImportResult) -> None:
    other = Product.objects.get(slug="stack-chair")
    other.slug = "atlas-sunlounger"
    with pytest.raises(ValidationError) as exc:
        other.full_clean()
    assert "slug" in exc.value.message_dict


def test_translation_may_share_slug(catalog: ImportResult) -> None:
    source = Product.objects.get(slug="atlas-sunlounger")
    translated = source.copy_for_translation(Locale.objects.get(language_code="en"))
    translated.full_clean(exclude=["translation_key"])


@pytest.mark.django_db
def test_taxonomy_slug_format() -> None:
    with pytest.raises(ValidationError):
        Category(slug="Dining Chairs", name="x", name_en="x").full_clean()


def test_taxonomy_label_by_language(catalog: ImportResult) -> None:
    dining = Category.objects.get(slug="dining")
    assert (str(dining), dining.label("vi"), dining.label("en")) == (
        "Bàn ghế ăn",
        "Bàn ghế ăn",
        "Dining",
    )


def _form(product: Product, slug: str) -> ProductForm:
    form_class = Product.edit_handler.bind_to_model(Product).get_form_class()
    data = {"slug": slug}
    form = form_class(instance=product, for_user=None)
    form.cleaned_data = data
    return form  # type: ignore[no-any-return]


def test_slug_locked_after_first_publish(catalog: ImportResult) -> None:
    product = Product.objects.get(slug="atlas-sunlounger")
    assert product.first_published_at is not None
    with pytest.raises(ValidationError):
        _form(product, "atlas-new").clean_slug()
    assert _form(product, "atlas-sunlounger").clean_slug() == "atlas-sunlounger"


def test_slug_editable_before_publish(catalog: ImportResult) -> None:
    product = Product.objects.get(slug="stack-chair")
    Product.objects.filter(pk=product.pk).update(first_published_at=None)
    product.refresh_from_db()
    assert _form(product, "stack-chair-2").clean_slug() == "stack-chair-2"
