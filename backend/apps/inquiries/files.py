"""Kiểm tra lại tệp đính kèm ở CMS (lớp thứ hai, frontend đã kiểm tra trong security.ts).

API chỉ nhận request có chữ ký của Next.js server, nhưng vẫn kiểm tra vì CMS là nơi lưu tệp:
không tin hoàn toàn vào một lớp phía trước. Quy tắc giống frontend:
đuôi cho phép, <= 10 MB, nội dung khớp đuôi (magic bytes), PDF không có nội dung chủ động.
"""

from __future__ import annotations

import re
from typing import Any

from django.core.files.uploadedfile import UploadedFile

MAX_BYTES = 10 * 1024 * 1024
EXTENSIONS = (".pdf", ".dwg", ".dxf", ".jpg", ".jpeg", ".png")

_PDF_ACTIVE = re.compile(rb"/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)\b")
_DXF_TEXT = re.compile(rb"^\s*(0|999)\s*\r?\n")
_SAFE_NAME = re.compile(r"[^\w.-]+")


def extension(name: str) -> str | None:
    lower = name.lower()
    return next((ext for ext in EXTENSIONS if lower.endswith(ext)), None)


def _matches(ext: str, head: bytes) -> bool:
    if ext == ".pdf":
        return head.startswith(b"%PDF-")
    if ext == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == ".dwg":
        return head.startswith(b"AC1")
    # .dxf: dạng nhị phân hoặc dạng chữ mở đầu bằng group code 0 / 999
    return head.startswith(b"AutoCAD Binary DXF") or bool(_DXF_TEXT.match(head[:64]))


def is_acceptable(upload: UploadedFile[Any]) -> bool:
    ext = extension(upload.name or "")
    if ext is None or not upload.size or upload.size > MAX_BYTES:
        return False
    upload.seek(0)
    data = upload.read()
    upload.seek(0)
    if not _matches(ext, data[:64]):
        return False
    return not (ext == ".pdf" and _PDF_ACTIVE.search(data))


def display_name(name: str) -> str:
    """Tên chỉ để hiển thị trong admin (không dùng làm đường dẫn lưu)."""
    base = _SAFE_NAME.sub("_", name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]).strip("._")
    return base[-120:] or "attachment"
