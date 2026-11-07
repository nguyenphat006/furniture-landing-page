"""URL tuyệt đối cho ảnh / tệp trong API.

PROD: web Next.js gọi CMS qua mạng nội bộ (http://cms:8000), nên không dựng URL theo host của
request (ra địa chỉ nội bộ, trình duyệt không mở được). Đặt CMS_PUBLIC_URL
(vd https://cms.bfcfurniture.com) thì mọi URL ảnh dùng địa chỉ công khai đó. Trống (máy dev) thì
theo host của request như cũ.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from django.conf import settings


def absolute_url(context: Mapping[str, Any], url: str) -> str:
    base = settings.CMS_PUBLIC_URL.rstrip("/")
    if base and url.startswith("/"):
        return f"{base}{url}"
    request = context.get("request")
    return request.build_absolute_uri(url) if request is not None else url
