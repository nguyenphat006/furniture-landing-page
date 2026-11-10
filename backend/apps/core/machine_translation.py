"""Dịch máy cho wagtail-localize bằng Google Cloud Translation API v2 (10/11).

Bật khi có GOOGLE_TRANSLATE_API_KEY: màn "Dịch" (bản tiếng Anh...) có nút "Dịch bằng Google
Translate", điền mọi chuỗi CHƯA dịch từ bản gốc tiếng Việt; chuỗi đã dịch tay giữ nguyên. Người
duyệt đọc, sửa rồi mới xuất bản (không tự dịch khi đồng bộ, user chốt 10/11).

Vì sao không dùng GoogleCloudTranslator có sẵn của wagtail-localize: bản đó dùng API v3, cần thư
viện google-cloud-translate (kéo theo gRPC) và tài khoản service account. API v2 chỉ cần một API
key và gọi REST bằng urllib có sẵn. Chuỗi gửi đi là HTML (thẻ link / đậm của wagtail-localize),
format=html để Google giữ nguyên thẻ.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterator, Sequence
from typing import Any

import structlog
from django.contrib import messages
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from wagtail_localize.machine_translators.base import BaseMachineTranslator
from wagtail_localize.strings import StringValue

log = structlog.get_logger(__name__)

ENDPOINT = "https://translation.googleapis.com/language/translate/v2"
TIMEOUT_SECONDS = 30
# Giới hạn của API v2: tối đa 128 chuỗi mỗi lần gọi; giữ mỗi lần dưới ~25.000 ký tự cho chắc
MAX_STRINGS = 100
MAX_CHARS = 25_000


class MachineTranslationError(Exception):
    """Gọi Google thất bại: màn Dịch báo lỗi thay vì trang 500 (middleware bên dưới)."""


def _batches(strings: Sequence[Any]) -> Iterator[list[Any]]:
    batch: list[Any] = []
    size = 0
    for string in strings:
        length = len(string.data)
        if batch and (len(batch) >= MAX_STRINGS or size + length > MAX_CHARS):
            yield batch
            batch, size = [], 0
        batch.append(string)
        size += length
    if batch:
        yield batch


class GoogleTranslateV2(BaseMachineTranslator):  # type: ignore[misc]
    display_name = "Google Translate"

    def _post(self, payload: dict[str, Any]) -> list[str]:
        url = f"{ENDPOINT}?{urllib.parse.urlencode({'key': self.options['API_KEY']})}"
        request = urllib.request.Request(  # noqa: S310 - URL cố định của Google
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
                data = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            # Không ghi URL (có API key) vào log
            log.warning("machine_translation_failed", status=exc.code)
            raise MachineTranslationError(f"Google Translate trả lỗi {exc.code}.") from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            log.warning("machine_translation_failed", error=type(exc).__name__)
            raise MachineTranslationError("Không kết nối được Google Translate.") from exc
        return [t["translatedText"] for t in data["data"]["translations"]]

    def translate(
        self, source_locale: Any, target_locale: Any, strings: Sequence[Any]
    ) -> dict[Any, StringValue]:
        result: dict[Any, StringValue] = {}
        for batch in _batches(list(strings)):
            texts = self._post(
                {
                    "q": [s.data for s in batch],
                    "source": source_locale.language_code,
                    "target": target_locale.language_code,
                    "format": "html",
                }
            )
            for string, text in zip(batch, texts, strict=True):
                # Google trả HTML (giữ <a id>, <b>..., ký tự đã escape), đúng dạng StringValue nhận
                result[string] = StringValue(text)
        return result

    def can_translate(self, source_locale: Any, target_locale: Any) -> bool:
        return bool(source_locale.language_code != target_locale.language_code)


class MachineTranslationErrorMiddleware:
    """Lỗi dịch máy: báo trên màn Dịch rồi quay lại trang đang dịch."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        return self.get_response(request)

    def process_exception(self, request: HttpRequest, exception: Exception) -> HttpResponse | None:
        if not isinstance(exception, MachineTranslationError):
            return None
        messages.error(request, f"{exception} Thử lại sau hoặc dịch tay.")
        next_url = request.GET.get("next", "")
        if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
            next_url = reverse("wagtailadmin_home")
        return HttpResponseRedirect(next_url)
