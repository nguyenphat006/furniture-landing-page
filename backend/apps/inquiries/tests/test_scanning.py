"""Quét virus tệp đính kèm: giao thức clamd INSTREAM (máy quét giả), lưu / xoá tệp, chặn tải."""

from __future__ import annotations

import socket
import struct
import threading
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client
from django.urls import reverse

from apps.accounts.tests.factories import create_user
from apps.inquiries.models import Inquiry
from apps.inquiries.scanning import ScanResult, parse_reply, scan_bytes
from apps.inquiries.services import create_inquiry

PDF = b"%PDF-1.7\n%%EOF"
# Chuỗi thử EICAR: máy quét giả coi là virus khi thấy chuỗi này
EICAR_MARK = b"EICAR"
SIZE_ERROR = "INSTREAM size limit exceeded. ERROR"

pytestmark = pytest.mark.django_db


class FakeClamd:
    """clamd giả: đọc INSTREAM, trả OK hoặc FOUND tuỳ nội dung."""

    def __init__(self) -> None:
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        self.port = self.sock.getsockname()[1]
        self.received: list[bytes] = []
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            with conn:
                command = conn.recv(10)
                assert command == b"zINSTREAM\0"
                data = b""
                while True:
                    (size,) = struct.unpack(">I", self._read(conn, 4))
                    if size == 0:
                        break
                    data += self._read(conn, size)
                self.received.append(data)
                found = EICAR_MARK in data
                reply = b"stream: Eicar-Test-Signature FOUND" if found else b"stream: OK"
                conn.sendall(reply + b"\0")

    @staticmethod
    def _read(conn: socket.socket, size: int) -> bytes:
        buf = b""
        while len(buf) < size:
            buf += conn.recv(size - len(buf))
        return buf

    def close(self) -> None:
        self.sock.close()


@pytest.fixture
def clamd(settings: Any) -> Iterator[FakeClamd]:
    server = FakeClamd()
    settings.CLAMAV_URL = f"tcp://127.0.0.1:{server.port}"
    yield server
    server.close()


def _create(content: bytes = PDF) -> Inquiry:
    return create_inquiry(
        {
            "purpose": "quote",
            "name": "Jane",
            "email": "jane@example.com",
            # Nội dung khác nhau để không bị luật chặn gửi trùng (spam.py) gộp lại
            "message": f"Hi {uuid4()}",
        },
        SimpleUploadedFile("drawing.pdf", content),
    )


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        ("stream: OK", ScanResult("clean")),
        ("stream: Win.Test.EICAR_HDB-1 FOUND", ScanResult("infected", "Win.Test.EICAR_HDB-1")),
        ("INSTREAM size limit exceeded. ERROR", ScanResult("error", SIZE_ERROR)),
        ("", ScanResult("error", "Máy quét không trả lời")),
    ],
)
def test_parse_reply(reply: str, expected: ScanResult) -> None:
    assert parse_reply(reply) == expected


def test_scan_sends_whole_file_in_chunks(clamd: FakeClamd) -> None:
    data = b"x" * (200 * 1024 + 5)
    assert scan_bytes(data) == ScanResult("clean")
    assert clamd.received == [data]


def test_no_scanner_configured_returns_none(settings: Any) -> None:
    settings.CLAMAV_URL = ""
    assert scan_bytes(PDF) is None


def test_unreachable_scanner_is_an_error(settings: Any) -> None:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    settings.CLAMAV_URL = f"tcp://127.0.0.1:{port}"
    assert scan_bytes(PDF).status == "error"  # type: ignore[union-attr]


def test_clean_file_is_stored(clamd: FakeClamd) -> None:
    inquiry = _create()
    assert inquiry.scan_status == Inquiry.ScanStatus.CLEAN
    assert inquiry.scanned_at is not None
    assert inquiry.attachment
    assert inquiry.attachment_downloadable


def test_infected_file_is_never_stored(clamd: FakeClamd) -> None:
    inquiry = _create(PDF + EICAR_MARK)
    assert inquiry.scan_status == Inquiry.ScanStatus.INFECTED
    assert inquiry.scan_detail == "Eicar-Test-Signature"
    assert not inquiry.attachment
    assert inquiry.attachment_name == "drawing.pdf"
    assert not inquiry.attachment_downloadable


def test_without_scanner_file_is_marked_not_scanned(settings: Any) -> None:
    settings.CLAMAV_URL = ""
    inquiry = _create()
    assert inquiry.scan_status == Inquiry.ScanStatus.NOT_SCANNED
    assert inquiry.attachment


def test_no_attachment_has_no_scan_status() -> None:
    inquiry = create_inquiry(
        {"purpose": "other", "name": "Jane", "email": "jane@example.com", "message": "Hi"}
    )
    assert inquiry.scan_status == Inquiry.ScanStatus.NONE


@pytest.mark.parametrize(
    ("required", "status_code"),
    [(False, 200), (True, 302)],
    ids=["dev-allows-unscanned", "prod-blocks-unscanned"],
)
def test_download_of_unscanned_file_depends_on_setting(
    client: Client, settings: Any, required: bool, status_code: int
) -> None:
    settings.CLAMAV_URL = ""
    settings.ATTACHMENT_SCAN_REQUIRED = required
    inquiry = _create()
    client.force_login(create_user(is_superuser=True, is_staff=True))
    res = client.get(reverse("inquiries_attachment", args=[inquiry.public_id]))
    assert res.status_code == status_code


def test_rescan_command(clamd: FakeClamd, settings: Any) -> None:
    settings.CLAMAV_URL, url = "", settings.CLAMAV_URL
    clean = _create()
    infected = _create(PDF + EICAR_MARK)
    assert {clean.scan_status, infected.scan_status} == {Inquiry.ScanStatus.NOT_SCANNED}
    stored_path = infected.attachment.path

    settings.CLAMAV_URL = url
    call_command("scan_attachments")

    clean.refresh_from_db()
    infected.refresh_from_db()
    assert clean.scan_status == Inquiry.ScanStatus.CLEAN
    assert infected.scan_status == Inquiry.ScanStatus.INFECTED
    assert not infected.attachment
    assert not infected.attachment.storage.exists(stored_path)


def test_rescan_command_requires_scanner(settings: Any) -> None:
    settings.CLAMAV_URL = ""
    with pytest.raises(CommandError):
        call_command("scan_attachments")


def test_admin_shows_scan_status(client: Client, clamd: FakeClamd) -> None:
    infected = _create(PDF + EICAR_MARK)
    client.force_login(create_user(is_superuser=True, is_staff=True))
    res = client.get(reverse("wagtailsnippets_inquiries_inquiry:edit", args=[infected.pk]))
    assert "phát hiện virus" in res.content.decode()
    assert reverse("inquiries_attachment", args=[infected.public_id]).encode() not in res.content
