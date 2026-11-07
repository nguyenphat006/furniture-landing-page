"""Cụm nút nổi mặc định cho site đã có thông tin chung (site mới: import_site tạo)."""

from __future__ import annotations

from typing import Any

from django.db import migrations

DEFAULT_FLOATING = ("search", "phone", "whatsapp", "zalo", "email")


def forwards(apps: Any, schema_editor: Any) -> None:
    site_settings = apps.get_model("sitesettings", "SiteSettings")
    floating_action = apps.get_model("sitesettings", "FloatingAction")
    for site in site_settings.objects.all():
        if floating_action.objects.filter(settings=site).exists():
            continue
        floating_action.objects.bulk_create(
            floating_action(settings=site, kind=kind, sort_order=order)
            for order, kind in enumerate(DEFAULT_FLOATING)
        )


class Migration(migrations.Migration):
    dependencies = [("sitesettings", "0004_floating_actions")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
