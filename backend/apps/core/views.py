"""Health check cho giám sát và Docker healthcheck.

- /healthz: tiến trình còn sống (không chạm DB), luôn nhanh.
- /readyz: sẵn sàng nhận request (kết nối được DB). Trả 503 nếu DB lỗi, không lộ chi tiết lỗi.
"""

import structlog
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

logger = structlog.get_logger(__name__)


@never_cache
@require_GET
def healthz(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})


@never_cache
@require_GET
def readyz(request: HttpRequest) -> JsonResponse:
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        logger.exception("readyz_db_unavailable")
        return JsonResponse({"status": "unavailable", "checks": {"database": "error"}}, status=503)
    return JsonResponse({"status": "ok", "checks": {"database": "ok"}})
