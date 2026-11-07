"""Hook của drf-spectacular: OpenAPI chỉ mô tả API công bố cho frontend (/api/v1/).

API nội bộ của Wagtail admin (/admin/api/...) không thuộc hợp đồng với Next.js nên bị loại.
"""

from typing import Any

API_PREFIX = "/api/v1/"


def only_public_api(
    endpoints: list[tuple[str, str, str, Any]], **_: Any
) -> list[tuple[str, str, str, Any]]:
    return [e for e in endpoints if e[0].startswith(API_PREFIX)]
