from django.apps import AppConfig


class CatalogConfig(AppConfig):
    name = "apps.catalog"
    label = "catalog"
    verbose_name = "Sản phẩm"

    def ready(self) -> None:
        from . import signals

        signals.connect()
