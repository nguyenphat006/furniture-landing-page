from django.urls import path

from .views import (
    MaterialDetailView,
    MaterialListView,
    MenuView,
    ProductDetailView,
    ProductListView,
    TaxonomyView,
)

urlpatterns = [
    path("catalog/taxonomy", TaxonomyView.as_view(), name="catalog-taxonomy"),
    path("catalog/materials", MaterialListView.as_view(), name="catalog-materials"),
    path("catalog/materials/<slug:slug>", MaterialDetailView.as_view(), name="catalog-material"),
    path("catalog/menu", MenuView.as_view(), name="catalog-menu"),
    path("catalog/products", ProductListView.as_view(), name="catalog-products"),
    path("catalog/products/<slug:slug>", ProductDetailView.as_view(), name="catalog-product"),
]
