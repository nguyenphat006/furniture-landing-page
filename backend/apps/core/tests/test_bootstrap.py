import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from wagtail.models import Locale

from apps.accounts.roles import ADMIN_GROUP


@pytest.mark.django_db
def test_bootstrap_is_idempotent() -> None:
    call_command("bootstrap")
    call_command("bootstrap")
    assert sorted(Locale.objects.values_list("language_code", flat=True)) == ["en", "vi"]
    assert Group.objects.filter(name=ADMIN_GROUP).count() == 1
