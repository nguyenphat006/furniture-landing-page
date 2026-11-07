import pytest
from auditlog.context import set_actor
from auditlog.models import LogEntry

from apps.accounts.tests.factories import create_user


@pytest.mark.django_db
def test_user_change_is_audited_with_actor() -> None:
    admin, target = create_user(), create_user(email="old@example.com")

    with set_actor(admin):
        target.email = "new@example.com"
        target.save()

    entry = LogEntry.objects.get_for_object(target).filter(action=LogEntry.Action.UPDATE).get()
    assert entry.actor == admin
    assert entry.changes_dict["email"] == ["old@example.com", "new@example.com"]


@pytest.mark.django_db
def test_password_is_never_audited() -> None:
    user = create_user()
    user.set_password("another-long-password-123")
    user.save()
    for entry in LogEntry.objects.get_for_object(user):
        assert "password" not in entry.changes_dict


@pytest.mark.django_db
def test_system_actor_has_no_user() -> None:
    user = create_user()
    user.first_name = "Changed"
    user.save()
    entry = LogEntry.objects.get_for_object(user).filter(action=LogEntry.Action.UPDATE).get()
    assert entry.actor is None
