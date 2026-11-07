"""API trang nội dung (chỉ đọc, công khai)."""

from __future__ import annotations

from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.api.views import LOCALE_PARAM, LocaleQuerySerializer

from .. import selectors
from .serializers import ContentPageSerializer


class ContentPageView(APIView):
    """Trang theo khoá (home...).

    Chưa có bản dịch đã xuất bản thì trả bản gốc, is_fallback = true.
    """

    @extend_schema(
        parameters=[
            OpenApiParameter("key", str, OpenApiParameter.PATH, enum=list(selectors.PAGE_MODELS)),
            LOCALE_PARAM,
        ],
        responses=ContentPageSerializer,
        operation_id="pages_retrieve",
    )
    def get(self, request: Request, key: str) -> Response:
        params = LocaleQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        language = params.validated_data.get("locale") or settings.LANGUAGE_CODE
        found = selectors.live_page(key, language)
        if found is None:
            raise NotFound
        context = {"request": request, "is_fallback": found.is_fallback}
        return Response(ContentPageSerializer(found.page, context=context).data)
