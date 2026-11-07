"""Webhook làm mới cache frontend: ký HMAC đúng định dạng frontend, lỗi mạng không làm hỏng."""

from __future__ import annotations

import hashlib
import hmac
import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import pytest

from apps.core.revalidate import send_revalidate, sign

SECRET = "test-secret"


class _Capture(BaseHTTPRequestHandler):
    received: list[dict[str, Any]] = []
    status = 200

    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers["Content-Length"]))
        _Capture.received.append({"headers": self.headers, "body": body})
        self.send_response(_Capture.status)
        self.end_headers()

    def log_message(self, *args: Any) -> None:
        pass


@pytest.fixture
def frontend(settings: Any) -> Iterator[list[dict[str, Any]]]:
    _Capture.received = []
    _Capture.status = 200
    server = HTTPServer(("127.0.0.1", 0), _Capture)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    settings.FRONTEND_REVALIDATE_URL = f"http://127.0.0.1:{server.server_port}/api/revalidate"
    settings.CMS_SHARED_SECRET = SECRET
    yield _Capture.received
    server.shutdown()


def test_sign_matches_frontend_format() -> None:
    expected = hmac.new(b"s", b"123.{}", hashlib.sha256).hexdigest()
    assert sign("s", "123", b"{}") == expected


def test_sends_signed_request(frontend: list[dict[str, Any]]) -> None:
    assert send_revalidate(["cms", "cms"]) is True
    [req] = frontend
    assert json.loads(req["body"]) == {"tags": ["cms"]}
    ts = req["headers"]["X-BFC-Timestamp"]
    assert req["headers"]["X-BFC-Signature"] == sign(SECRET, ts, req["body"])


def test_non_2xx_is_reported(frontend: list[dict[str, Any]]) -> None:
    _Capture.status = 401
    assert send_revalidate(["cms"]) is False


def test_disabled_without_settings(settings: Any) -> None:
    settings.FRONTEND_REVALIDATE_URL = ""
    assert send_revalidate(["cms"]) is False


def test_network_error_does_not_raise(settings: Any) -> None:
    settings.FRONTEND_REVALIDATE_URL = "http://127.0.0.1:9/api/revalidate"
    settings.CMS_SHARED_SECRET = SECRET
    assert send_revalidate(["cms"]) is False
