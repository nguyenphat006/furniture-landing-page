from unittest import mock

import pytest
from django.test import Client


def test_healthz_does_not_need_db(client: Client) -> None:
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert "no-cache" in res["Cache-Control"]


@pytest.mark.django_db
def test_readyz_ok(client: Client) -> None:
    res = client.get("/readyz")
    assert res.status_code == 200
    assert res.json()["checks"]["database"] == "ok"


@pytest.mark.django_db
def test_readyz_reports_db_failure_without_details(client: Client) -> None:
    with mock.patch("apps.core.views.connection.ensure_connection", side_effect=OSError("boom")):
        res = client.get("/readyz")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable", "checks": {"database": "error"}}
    assert "boom" not in res.content.decode()


def test_health_only_allows_get(client: Client) -> None:
    assert client.post("/healthz").status_code == 405
