"""Kiểm tra lại tệp đính kèm ở CMS (lớp thứ hai, frontend đã kiểm tra trong security.ts).

API chỉ nhận request có chữ ký của Next.js server, nhưng vẫn kiểm tra vì CMS là nơi lưu tệp:
không tin hoàn toàn vào một lớp phía trước. Quy tắc giống frontend:
đuôi cho phép, <= 10 MB, nội dung khớp đuôi (magic bytes), PDF không có nội dung chủ động.
"""

from __future__ import annotations

import re
import zlib
from typing import Any

from django.core.files.uploadedfile import UploadedFile

MAX_BYTES = 10 * 1024 * 1024
EXTENSIONS = (".pdf", ".dwg", ".dxf", ".jpg", ".jpeg", ".png")

_PDF_ACTIVE = re.compile(rb"/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)\b")
# Tên PDF viết bằng mã #xx (/J#61vaScript = /JavaScript): giải mã trước khi so (QC 09/11)
_PDF_NAME_HEX = re.compile(rb"#([0-9A-Fa-f]{2})")
# Object stream (PDF 1.5+) chứa các đối tượng ở dạng nén: phải giải nén mới thấy /JavaScript bên
# trong. Chỉ giải nén loại này, không giải nén ảnh (điểm ảnh có thể tình cờ chứa "/JS").
_PDF_OBJSTM = re.compile(rb"/Type\s*/ObjStm\b[^>]*?>>\s*stream\r?\n", re.S)
_PDF_INFLATE_LIMIT = 20 * 1024 * 1024
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


def _unhex(data: bytes) -> bytes:
    return _PDF_NAME_HEX.sub(lambda m: bytes([int(m[1], 16)]), data)


def _pdf_has_active(data: bytes) -> bool:
    """Có hành động tự chạy / tệp nhúng, kể cả viết bằng #xx hay nằm trong object stream nén."""
    if _PDF_ACTIVE.search(_unhex(data)):
        return True
    budget = _PDF_INFLATE_LIMIT
    for match in _PDF_OBJSTM.finditer(data):
        start = match.end()
        end = data.find(b"endstream", start)
        inflater = zlib.decompressobj()
        try:
            out = inflater.decompress(data[start : end if end != -1 else len(data)], budget)
        except zlib.error:
            # Không giải nén được thì không kiểm được bên trong: từ chối
            return True
        if inflater.unconsumed_tail:
            # Vượt giới hạn giải nén (bom nén): từ chối
            return True
        budget -= len(out)
        if _PDF_ACTIVE.search(_unhex(out)):
            return True
    return False


def is_acceptable(upload: UploadedFile[Any]) -> bool:
    ext = extension(upload.name or "")
    if ext is None or not upload.size or upload.size > MAX_BYTES:
        return False
    upload.seek(0)
    data = upload.read()
    upload.seek(0)
    if not _matches(ext, data[:64]):
        return False
    return not (ext == ".pdf" and _pdf_has_active(data))


def display_name(name: str) -> str:
    """Tên chỉ để hiển thị trong admin (không dùng làm đường dẫn lưu)."""
    base = _SAFE_NAME.sub("_", name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]).strip("._")
    return base[-120:] or "attachment"
