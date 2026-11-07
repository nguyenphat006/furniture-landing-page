from django.apps import AppConfig


class PagesConfig(AppConfig):
    name = "apps.pages"
    label = "pages"
    verbose_name = "Nội dung trang"

    def ready(self) -> None:
        from . import signals

        signals.connect()
