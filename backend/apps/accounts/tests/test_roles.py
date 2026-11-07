import pytest
from django.test import Client
from wagtail.models import GroupCollectionPermission, GroupPagePermission

from apps.accounts.roles import ADMIN_GROUP
from apps.accounts.selectors import admin_users
from apps.accounts.services import ensure_admin_group
from apps.accounts.tests.factories import create_user


@pytest.mark.django_db
def test_admin_group_has_content_permissions_but_not_system_logs() -> None:
    group = ensure_admin_group()
    codenames = set(group.permissions.values_list("codename", flat=True))
    assert {"access_admin", "change_user", "add_image"} <= codenames
    # Log hệ thống chỉ superuser xem
    assert not group.permissions.filter(content_type__app_label__in=["auditlog", "axes"]).exists()
    assert GroupPagePermission.objects.filter(group=group).count() == 6
    assert GroupCollectionPermission.objects.filter(group=group).count() == 8


@pytest.mark.django_db
def test_ensure_admin_group_is_idempotent() -> None:
    first = ensure_admin_group()
    second = ensure_admin_group()
    assert first.pk == second.pk
    assert GroupPagePermission.objects.filter(group=second).count() == 6


@pytest.mark.django_db
def test_admin_member_can_open_wagtail_admin(client: Client) -> None:
    group = ensure_admin_group()
    member = create_user()
    member.groups.add(group)
    outsider = create_user(is_active=True)
    create_user(is_active=False).groups.add(group)

    assert list(admin_users()) == [member]

    client.force_login(member)
    assert client.get("/admin/").status_code == 200

    client.force_login(outsider)
    assert client.get("/admin/").status_code == 302  # không có quyền vào admin


@pytest.mark.django_db
def test_django_admin_is_superuser_only(client: Client) -> None:
    group = ensure_admin_group()
    member = create_user(is_staff=True)
    member.groups.add(group)
    client.force_login(member)
    assert client.get("/django-admin/").status_code == 302

    client.force_login(create_user(is_staff=True, is_superuser=True))
    assert client.get("/django-admin/").status_code == 200


def test_group_name() -> None:
    assert ADMIN_GROUP == "Quản trị"
