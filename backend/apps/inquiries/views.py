"""Tải tệp đính kèm của yêu cầu liên hệ (trong admin, cần quyền xem/sửa Inquiry).

Luôn trả dạng tải về (Content-Disposition: attachment, application/octet-stream, nosniff) để
trình duyệt không mở tệp của khách ngay trong trang admin.
"""

from __future__ import annotations

from uuid import UUID

from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404, HttpRequest

from .models import Inquiry


def download_attachment(request: HttpRequest, public_id: UUID) -> FileResponse:
    if not request.user.has_perm("inquiries.change_inquiry"):
        raise PermissionDenied
    inquiry = Inquiry.objects.filter(public_id=public_id).first()
    if inquiry is None or not inquiry.attachment:
        raise Http404
    if not inquiry.attachment_downloadable:
        # Production: chỉ tệp đã quét sạch (docs/adr/0009)
        raise PermissionDenied
    response = FileResponse(
        inquiry.attachment.open("rb"),
        as_attachment=True,
        filename=inquiry.attachment_name or "attachment",
        content_type="application/octet-stream",
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response
