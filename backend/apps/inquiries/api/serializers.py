from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers

from apps.inquiries.files import is_acceptable
from apps.inquiries.models import Inquiry


class InquiryCreateSerializer(serializers.Serializer[Any]):
    """Dữ liệu form Liên hệ do Next.js server chuyển sang (đã làm sạch một lần ở frontend)."""

    purpose = serializers.ChoiceField(choices=Inquiry.Purpose.choices)
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=200)
    company = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    country = serializers.RegexField(r"^[A-Z]{2}$", required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    model = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default="", source="model_codes"
    )
    message = serializers.CharField(max_length=5000, trim_whitespace=False)
    locale = serializers.ChoiceField(choices=[code for code, _ in settings.LANGUAGES], default="vi")
    file = serializers.FileField(required=False, max_length=200, allow_empty_file=False)

    # Trường một dòng: gộp xuống dòng và khoảng trắng thừa. Tên, công ty nằm trong tiêu đề email,
    # xuống dòng ở đó làm gửi email lỗi (QC 07/11).
    def validate_name(self, value: str) -> str:
        return " ".join(value.split())

    def validate_company(self, value: str) -> str:
        return " ".join(value.split())

    def validate_phone(self, value: str) -> str:
        return " ".join(value.split())

    def validate_message(self, value: str) -> str:
        # Multipart (trình duyệt, FormData) gửi xuống dòng dạng CRLF
        return value.replace("\r\n", "\n").replace("\r", "\n")

    def validate_file(self, value: UploadedFile[Any]) -> UploadedFile[Any]:
        if not is_acceptable(value):
            raise serializers.ValidationError("Tệp không hợp lệ.", code="invalid_file")
        return value


class InquiryCreatedSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField(source="public_id")
