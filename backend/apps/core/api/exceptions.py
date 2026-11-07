"""Một định dạng lỗi chung cho toàn bộ API:

    {"error": {"code": "not_found", "message": "...", "details": {...}}}

- code: chuỗi ổn định để frontend rẽ nhánh (không dựa vào message).
- details: lỗi theo trường khi validate (dạng DRF), có thể rỗng.
Lỗi không lường trước trả 500 với message chung; chi tiết chỉ nằm trong log.
"""

from typing import Any

import structlog
from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = structlog.get_logger(__name__)


def _error(code: str, message: str, details: Any, http_status: int) -> Response:
    return Response(
        {"error": {"code": code, "message": message, "details": details or {}}},
        status=http_status,
    )


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("api_unhandled_error", view=type(context.get("view")).__name__)
        return _error(
            "server_error",
            "Lỗi máy chủ, vui lòng thử lại sau.",
            None,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, exceptions.ValidationError):
        return _error("invalid", "Dữ liệu không hợp lệ.", response.data, response.status_code)
    if isinstance(exc, exceptions.APIException):
        detail = exc.detail
        message = str(detail) if not isinstance(detail, dict | list) else exc.default_detail
        code = exc.get_codes()
        return _error(
            code if isinstance(code, str) else exc.default_code,
            str(message),
            None,
            response.status_code,
        )
    return response  # pragma: no cover - DRF chỉ xử lý APIException
