"""Xem trước bản nháp trên web Next.js (docs/adr/0014).

CMS chạy headless nên không tự vẽ trang. Khi quản trị viên bấm Xem trước (khung bên phải hoặc tab
mới), Wagtail gọi `serve_preview` với bản đang sửa (chưa lưu cũng được). Ở đó ta:
1. dựng đúng JSON mà API công khai trả cho trang / sản phẩm đó, từ bản đang sửa;
2. lưu vào bảng `Preview` với mã ngẫu nhiên, hết hạn sau PREVIEW_TTL;
3. chuyển trình duyệt tới `<FRONTEND_URL>/api/draft?token=...&path=...&ts=...&sig=...`, chữ ký
   HMAC bằng CMS_SHARED_SECRET (hết hạn sau 5 phút, chống dùng lại link).
Frontend kiểm chữ ký, bật draft mode, lưu mã vào cookie rồi mở `path`; trang đọc bản nháp qua
`GET /api/v1/pages/preview/<token>` (request ký bằng bí mật chung, trình duyệt không gọi được).
Khách truy cập không có cookie nên luôn thấy bản đã xuất bản.
"""

from __future__ import annotations

import secrets
import time
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.html import escape

from apps.core.revalidate import sign

PREVIEW_TTL = timedelta(minutes=30)


def create_preview(*, kind: str, key: str, locale: str, path: str, data: dict[str, Any]) -> str:
    from .models import Preview

    now = timezone.now()
    Preview.objects.filter(expires_at__lt=now).delete()
    token = secrets.token_urlsafe(32)
    Preview.objects.create(
        token=token,
        kind=kind,
        key=key,
        locale=locale,
        path=path,
        payload=data,
        expires_at=now + PREVIEW_TTL,
    )
    return token


def preview_signature(token: str, path: str, timestamp: str) -> str:
    return sign(settings.CMS_SHARED_SECRET, timestamp, f"{token}.{path}".encode())


def preview_response(
    request: HttpRequest, *, kind: str, key: str, locale: str, path: str, data: dict[str, Any]
) -> HttpResponse:
    base = settings.FRONTEND_URL.rstrip("/")
    if not base or not settings.CMS_SHARED_SECRET:
        return HttpResponse(
            "<p style='font-family:sans-serif;padding:2rem'>"
            + escape("Chưa cấu hình xem trước: đặt FRONTEND_URL và CMS_SHARED_SECRET.")
            + "</p>"
        )
    token = create_preview(kind=kind, key=key, locale=locale, path=path, data=data)
    timestamp = str(int(time.time()))
    query = urlencode(
        {
            "token": token,
            "path": path,
            "ts": timestamp,
            "sig": preview_signature(token, path, timestamp),
        }
    )
    return redirect(f"{base}/api/draft?{query}")
