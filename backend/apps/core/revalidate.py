"""Báo frontend (Next.js) làm mới cache khi nội dung CMS đổi.

Gọi webhook FRONTEND_REVALIDATE_URL (POST {"tags": [...]}) có ký HMAC-SHA256 bằng CMS_SHARED_SECRET:
header X-BFC-Timestamp (giây) và X-BFC-Signature = hex(HMAC(secret, "<timestamp>.<body>")).
Khớp với frontend/src/app/api/revalidate/route.ts.

Gửi sau khi transaction commit; lỗi mạng chỉ ghi log, không làm hỏng thao tác lưu trong admin
(frontend vẫn tự làm mới sau tối đa 1 giờ).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.request
from collections.abc import Iterable

import structlog
from django.conf import settings
from django.db import transaction

log = structlog.get_logger(__name__)

# Tag cache chung phía frontend (CMS_TAG trong src/lib/cms/client.ts)
CMS_TAG = "cms"
TIMEOUT_SECONDS = 5


def sign(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def send_revalidate(tags: Iterable[str]) -> bool:
    """Gửi webhook ngay. Trả True nếu frontend nhận (HTTP 2xx)."""
    url = settings.FRONTEND_REVALIDATE_URL
    secret = settings.CMS_SHARED_SECRET
    if not url or not secret:
        return False
    body = json.dumps({"tags": sorted(set(tags))}).encode()
    timestamp = str(int(time.time()))
    request = urllib.request.Request(  # noqa: S310 - URL lấy từ settings, không từ người dùng
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-BFC-Timestamp": timestamp,
            "X-BFC-Signature": sign(secret, timestamp, body),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            ok = bool(200 <= response.status < 300)
    except OSError as exc:
        log.warning("frontend_revalidate_failed", url=url, error=str(exc))
        return False
    log.info("frontend_revalidated", tags=sorted(set(tags)), ok=ok)
    return ok


def revalidate_on_commit(tags: Iterable[str] = (CMS_TAG,)) -> None:
    """Hẹn gửi webhook sau khi transaction hiện tại commit (không gửi nếu rollback)."""
    tag_list = list(tags)
    transaction.on_commit(lambda: send_revalidate(tag_list))
