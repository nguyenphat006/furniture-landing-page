"""API nhận form Liên hệ. Chỉ Next.js server gọi được (chữ ký HMAC), trình duyệt không gọi thẳng."""

from __future__ import annotations

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api.permissions import SignedByFrontend
from apps.inquiries import services

from .serializers import InquiryCreatedSerializer, InquiryCreateSerializer

SIGNATURE_HEADERS = [
    OpenApiParameter("X-BFC-Timestamp", str, OpenApiParameter.HEADER, required=True),
    OpenApiParameter("X-BFC-Signature", str, OpenApiParameter.HEADER, required=True),
]


class InquiryCreateView(APIView):
    permission_classes = [SignedByFrontend]
    parser_classes = [MultiPartParser]
    # Frontend đã giới hạn theo IP của khách; ở đây mọi request đến từ cùng IP server Next
    throttle_classes = []

    @extend_schema(
        request={"multipart/form-data": InquiryCreateSerializer},
        responses={201: InquiryCreatedSerializer, 429: None},
        parameters=SIGNATURE_HEADERS,
        operation_id="inquiries_create",
    )
    def post(self, request: Request) -> Response:
        serializer = InquiryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        attachment = data.pop("file", None)
        try:
            inquiry = services.create_inquiry(data, attachment)
        except services.InquiryRateLimited as exc:
            raise Throttled(detail="Email này đã gửi quá nhiều yêu cầu, thử lại sau.") from exc
        return Response(InquiryCreatedSerializer(inquiry).data, status=status.HTTP_201_CREATED)
