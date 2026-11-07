"""Quét virus tệp đính kèm bằng ClamAV (clamd) qua giao thức INSTREAM, không cần thư viện ngoài.

Cấu hình: CLAMAV_URL = "tcp://<host>:<port>" (production: container clamav trong Compose,
xem docs/adr/0009). Trống = chưa có máy quét (máy dev): trả None, tệp được đánh dấu "chưa quét".

Giao thức (https://docs.clamav.net/manual/Usage/Scanning.html#clamd):
    gửi  b"zINSTREAM\\0", rồi từng khối <độ dài 4 byte big-endian><dữ liệu>, kết thúc bằng 4 byte 0
    nhận b"stream: OK\\0" | b"stream: <tên virus> FOUND\\0" | b"... ERROR\\0"
"""

from __future__ import annotations

import socket
import struct
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

from django.conf import settings

CHUNK_BYTES = 64 * 1024
TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class ScanResult:
    status: Literal["clean", "infected", "error"]
    signature: str = ""  # tên virus khi infected, mô tả lỗi khi error


def scanner_configured() -> bool:
    return bool(settings.CLAMAV_URL)


def _address() -> tuple[str, int]:
    url = urlparse(settings.CLAMAV_URL)
    if url.scheme != "tcp" or not url.hostname:
        raise ValueError("CLAMAV_URL phải có dạng tcp://host:port")
    return url.hostname, url.port or 3310


def scan_bytes(data: bytes) -> ScanResult | None:
    """Quét nội dung tệp. None = chưa cấu hình máy quét."""
    if not scanner_configured():
        return None
    try:
        with socket.create_connection(_address(), timeout=TIMEOUT_SECONDS) as conn:
            conn.sendall(b"zINSTREAM\0")
            for start in range(0, len(data), CHUNK_BYTES):
                chunk = data[start : start + CHUNK_BYTES]
                conn.sendall(struct.pack(">I", len(chunk)) + chunk)
            conn.sendall(struct.pack(">I", 0))
            reply = b""
            while not reply.endswith(b"\0"):
                part = conn.recv(4096)
                if not part:
                    break
                reply += part
    except (OSError, ValueError) as exc:
        return ScanResult("error", f"Không kết nối được máy quét: {exc}"[:200])
    return parse_reply(reply.rstrip(b"\0").decode("utf-8", "replace").strip())


def parse_reply(reply: str) -> ScanResult:
    # Ví dụ: "stream: OK", "stream: Eicar-Test-Signature FOUND",
    # "INSTREAM size limit exceeded. ERROR"
    body = reply.split(":", 1)[1].strip() if reply.startswith("stream:") else reply
    if body == "OK":
        return ScanResult("clean")
    if body.endswith(" FOUND"):
        return ScanResult("infected", body.removesuffix(" FOUND")[:200])
    return ScanResult("error", (body or "Máy quét không trả lời")[:200])
