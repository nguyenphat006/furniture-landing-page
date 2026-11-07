"""Phân trang chung cho mọi danh sách: ?page=&page_size= (tối đa 100)."""

from typing import Any

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class DefaultPagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data: Any) -> Response:
        assert self.page is not None  # noqa: S101 - DRF chỉ gọi sau khi đã phân trang
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": self.get_page_size(self.request) if self.request else self.page_size,
                "total_pages": self.page.paginator.num_pages,
                "results": data,
            }
        )

    def get_paginated_response_schema(self, schema: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "object",
            "required": ["count", "page", "page_size", "total_pages", "results"],
            "properties": {
                "count": {"type": "integer"},
                "page": {"type": "integer"},
                "page_size": {"type": "integer"},
                "total_pages": {"type": "integer"},
                "results": schema,
            },
        }
