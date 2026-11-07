"""API thông tin chung (chỉ đọc, công khai): header, footer, trang Liên hệ, SEO mặc định."""

from __future__ import annotations

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.api.views import LOCALE_PARAM, LocaleQuerySerializer

from .. import selectors
from .serializers import SiteSerializer


class SiteView(APIView):
    """Chữ song ngữ theo cột `_en`, không qua bảng Locale của Wagtail (docs/adr/0011)."""

    @extend_schema(
        parameters=[LOCALE_PARAM], responses=SiteSerializer, operation_id="site_retrieve"
    )
    def get(self, request: Request) -> Response:
        params = LocaleQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        language = params.validated_data.get("locale") or settings.LANGUAGE_CODE
        context = {"request": request, "language": language}
        return Response(SiteSerializer(selectors.site_settings(), context=context).data)
