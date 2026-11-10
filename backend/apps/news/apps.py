from django.apps import AppConfig


class NewsConfig(AppConfig):
    name = "apps.news"
    label = "news"
    verbose_name = "Tin tức"

    def ready(self) -> None:
        from . import signals

        signals.connect()
