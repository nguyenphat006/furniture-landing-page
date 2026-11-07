from django.apps import AppConfig


class CoreTestSupportConfig(AppConfig):
    """App chỉ bật trong config.settings.test: model cụ thể để test các abstract base model."""

    name = "apps.core.tests.support"
    label = "core_tests"
