import pytest
from axes.models import AccessAttempt
from django.test import Client

from apps.accounts.services import ensure_admin_group
from apps.accounts.tests.factories import create_user


@pytest.mark.django_db
def test_admin_login_locks_after_repeated_failures(client: Client) -> None:
    user = create_user(username="editor")
    user.groups.add(ensure_admin_group())

    for _ in range(5):
        client.post("/admin/login/", {"username": "editor", "password": "wrong"})

    assert AccessAttempt.objects.filter(username="editor").exists()
    # Đúng mật khẩu vẫn bị chặn khi đã bị khoá
    res = client.post(
        "/admin/login/", {"username": "editor", "password": "correct-horse-battery-staple"}
    )
    assert res.status_code == 429
