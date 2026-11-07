import pytest
from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.test import APIClient

from apps.core.api.exceptions import exception_handler
from apps.core.services import ensure_locales


@pytest.mark.django_db
def test_meta_lists_locales_default_first(api_client: APIClient) -> None:
    ensure_locales()
    res = api_client.get("/api/v1/meta")
    assert res.status_code == 200
    assert res.json() == {
        "locales": [
            {"code": "vi", "name": "Tiếng Việt", "is_default": True},
            {"code": "en", "name": "English", "is_default": False},
        ]
    }


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (Http404(), 404, "not_found"),
        (exceptions.NotFound(), 404, "not_found"),
        (PermissionDenied(), 403, "permission_denied"),
        (exceptions.Throttled(wait=3), 429, "throttled"),
    ],
)
def test_error_format(exc: Exception, status: int, code: str) -> None:
    res = exception_handler(exc, {})
    assert res is not None
    assert res.status_code == status
    assert res.data["error"]["code"] == code
    assert res.data["error"]["details"] == {}


def test_validation_error_has_field_details() -> None:
    res = exception_handler(exceptions.ValidationError({"email": ["Sai định dạng."]}), {})
    assert res is not None
    assert res.status_code == 400
    assert res.data["error"]["code"] == "invalid"
    assert res.data["error"]["details"] == {"email": ["Sai định dạng."]}


def test_unexpected_error_hides_details() -> None:
    res = exception_handler(RuntimeError("secret detail"), {})
    assert res is not None
    assert res.status_code == 500
    assert res.data["error"]["code"] == "server_error"
    assert "secret" not in str(res.data)


def test_openapi_only_contains_public_api() -> None:
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(request=None, public=True)
    paths = sorted(schema["paths"])
    assert paths == [
        "/api/v1/catalog/materials",
        "/api/v1/catalog/materials/{slug}",
        "/api/v1/catalog/menu",
        "/api/v1/catalog/products",
        "/api/v1/catalog/products/{slug}",
        "/api/v1/catalog/taxonomy",
        "/api/v1/inquiries",
        "/api/v1/meta",
        "/api/v1/pages/{key}",
        "/api/v1/site",
    ]
