"""API của app core. View mỏng: gọi selector, trả serializer."""

from drf_spectacular.utils import extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import locale_list

from .serializers import MetaSerializer


class MetaView(APIView):
    """Thông tin chung cho frontend: các ngôn ngữ nội dung đang bật."""

    @extend_schema(responses=MetaSerializer, operation_id="meta_retrieve")
    def get(self, request: Request) -> Response:
        return Response(MetaSerializer({"locales": locale_list()}).data)
