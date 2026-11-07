"""Quyền cho API ghi server-to-server (Next.js server → CMS).

Request phải ký HMAC-SHA256 bằng CMS_SHARED_SECRET, cùng định dạng với webhook revalidate
(apps/core/revalidate.py), chỉ đổi chiều:
    X-BFC-Timestamp: giây Unix
    X-BFC-Signature: hex(HMAC(secret, "<timestamp>.<raw body>"))
Lệch giờ quá 5 phút bị từ chối (chống gửi lại). Chưa đặt bí mật thì từ chối mọi request
(fail-closed): API ghi không bao giờ mở cho trình duyệt hay bên ngoài.
"""

from __future__ import annotations

import hmac
import time
from typing import Any

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from rest_framework.exceptions import APIException
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.core.revalidate import sign

MAX_SKEW_SECONDS = 300


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = "Request quá lớn."
    default_code = "payload_too_large"


def valid_signature(secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > MAX_SKEW_SECONDS:
        return False
    return hmac.compare_digest(sign(secret, timestamp, body), signature)


class SignedByFrontend(BasePermission):
    message = "Request không có chữ ký hợp lệ."

    def has_permission(self, request: Request, view: Any) -> bool:
        secret = settings.CMS_SHARED_SECRET
        if not secret:
            return False
        # Đọc raw body trước khi DRF parse (permission chạy trước khi truy cập request.data)
        try:
            body = request._request.body
        except RequestDataTooBig as exc:
            # Quá DATA_UPLOAD_MAX_MEMORY_SIZE: trả 413 thay vì 500 (QC 07/11)
            raise PayloadTooLarge from exc
        return valid_signature(
            secret,
            request.headers.get("X-BFC-Timestamp", ""),
            body,
            request.headers.get("X-BFC-Signature", ""),
        )
