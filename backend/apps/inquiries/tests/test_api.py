"""API nhận form Liên hệ: chữ ký HMAC, kiểm tra dữ liệu và tệp, lưu kho riêng tư, email báo."""

from __future__ import annotations

import time
from typing import Any

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from rest_framework.test import APIClient

from apps.core.revalidate import sign
from apps.inquiries.models import Inquiry

URL = "/api/v1/inquiries"
SECRET = "test-secret"
PDF = b"%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"

pytestmark = pytest.mark.django_db(transaction=True)


def staff_mails() -> list[Any]:
    """Thư báo nhân viên (bỏ thư cảm ơn gửi khách)."""
    return [m for m in mail.outbox if m.to != ["jane@example.com"]]


@pytest.fixture(autouse=True)
def _settings(settings: Any) -> None:
    settings.CMS_SHARED_SECRET = SECRET
    settings.INQUIRY_NOTIFY_EMAILS = ["office@example.com"]


def payload(**overrides: Any) -> dict[str, Any]:
    return {
        "purpose": "quote",
        "name": "Jane Buyer",
        "email": "jane@example.com",
        "company": "Acme",
        "country": "DE",
        "phone": "+49 123",
        "model": "2BFC2636",
        "message": "Please quote 2 containers.\nThanks",
        "locale": "en",
        **overrides,
    }


def post(
    client: APIClient,
    data: dict[str, Any],
    *,
    secret: str = SECRET,
    timestamp: int | None = None,
    tamper: bool = False,
) -> Any:
    body = encode_multipart(BOUNDARY, data)
    ts = str(timestamp if timestamp is not None else int(time.time()))
    signature = sign(secret, ts, body)
    if tamper:
        body = body.replace(b"Jane", b"Joan")
    return client.generic(
        "POST",
        URL,
        data=body,  # type: ignore[arg-type]  # Django nhận cả bytes
        content_type=MULTIPART_CONTENT,
        HTTP_X_BFC_TIMESTAMP=ts,
        HTTP_X_BFC_SIGNATURE=signature,
    )


def test_signed_request_creates_inquiry_and_emails_staff(api_client: APIClient) -> None:
    res = post(api_client, payload())

    assert res.status_code == 201, res.content
    inquiry = Inquiry.objects.get(public_id=res.json()["id"])
    assert inquiry.status == Inquiry.Status.NEW
    assert inquiry.model_codes == "2BFC2636"
    assert inquiry.locale == "en"
    assert inquiry.message == "Please quote 2 containers.\nThanks"

    assert len(staff_mails()) == 1
    sent = mail.outbox[0]
    assert sent.to == ["office@example.com"]
    assert sent.reply_to == ["jane@example.com"]
    assert "Please quote 2 containers." in sent.body
    assert f"/admin/snippets/inquiries/inquiry/edit/{inquiry.pk}/" in sent.body
    assert not sent.attachments


@pytest.mark.parametrize(
    "kwargs",
    [
        {"secret": "wrong"},
        {"timestamp": int(time.time()) - 3600},
        {"tamper": True},
    ],
    ids=["wrong-secret", "stale-timestamp", "tampered-body"],
)
def test_rejects_bad_signature(api_client: APIClient, kwargs: dict[str, Any]) -> None:
    res = post(api_client, payload(), **kwargs)
    assert res.status_code == 403
    assert Inquiry.objects.count() == 0


def test_rejects_everything_when_secret_unset(api_client: APIClient, settings: Any) -> None:
    settings.CMS_SHARED_SECRET = ""
    res = post(api_client, payload(), secret="")
    assert res.status_code == 403


def test_unsigned_request_is_rejected(api_client: APIClient) -> None:
    res = api_client.post(URL, payload(), format="multipart")
    assert res.status_code == 403


def test_validation_errors_use_standard_format(api_client: APIClient) -> None:
    res = post(api_client, payload(email="not-an-email", purpose="spam", country="Germany"))
    assert res.status_code == 400
    error = res.json()["error"]
    assert error["code"] == "invalid"
    assert set(error["details"]) == {"email", "purpose", "country"}


def test_attachment_goes_to_private_storage(api_client: APIClient, settings: Any) -> None:
    upload = SimpleUploadedFile("Bản vẽ ../../evil.pdf", PDF, content_type="application/pdf")
    res = post(api_client, payload(file=upload))

    assert res.status_code == 201, res.content
    inquiry = Inquiry.objects.get()
    stored = inquiry.attachment.name or ""
    assert stored.startswith("inquiries/")
    assert stored.endswith(f"{inquiry.public_id}.pdf")
    assert ".." not in inquiry.attachment_name
    assert inquiry.attachment.path.startswith(str(settings.PRIVATE_MEDIA_ROOT))
    with inquiry.attachment.open("rb") as f:
        assert f.read() == PDF


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("drawing.pdf", b"MZ\x90\x00 not a pdf"),
        ("drawing.pdf", PDF.replace(b"/Catalog", b"/Catalog /OpenAction 2 0 R")),
        ("tool.exe", b"MZ\x90\x00"),
    ],
    ids=["wrong-magic", "pdf-active-content", "bad-extension"],
)
def test_rejects_unsafe_attachment(api_client: APIClient, name: str, content: bytes) -> None:
    res = post(api_client, payload(file=SimpleUploadedFile(name, content)))
    assert res.status_code == 400
    assert "file" in res.json()["error"]["details"]
    assert Inquiry.objects.count() == 0


def test_no_email_when_recipients_unset(api_client: APIClient, settings: Any) -> None:
    settings.INQUIRY_NOTIFY_EMAILS = []
    assert post(api_client, payload()).status_code == 201
    assert staff_mails() == []


def test_email_rate_limit_returns_429(api_client: APIClient) -> None:
    for i in range(3):
        assert post(api_client, payload(message=f"Message {i}")).status_code == 201
    res = post(api_client, payload(message="One more"))
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "throttled"


def test_line_breaks_in_single_line_fields_are_collapsed(api_client: APIClient) -> None:
    # Tên nằm trong tiêu đề email: xuống dòng ở đó làm gửi email lỗi (QC 07/11)
    res = post(api_client, payload(name="Jane\r\nBcc: x@evil.test", company="Acme\nLtd"))

    assert res.status_code == 201, res.content
    inquiry = Inquiry.objects.get(public_id=res.json()["id"])
    assert inquiry.name == "Jane Bcc: x@evil.test"
    assert inquiry.company == "Acme Ltd"
    assert len(staff_mails()) == 1


def test_body_over_upload_limit_is_413(api_client: APIClient, settings: Any) -> None:
    settings.DATA_UPLOAD_MAX_MEMORY_SIZE = 100
    res = post(api_client, payload(message="x" * 500))

    assert res.status_code == 413
    assert not Inquiry.objects.exists()


def _objstm_pdf(body: bytes) -> bytes:
    import zlib

    packed = zlib.compress(body)
    return (
        b"%PDF-1.7\n1 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length "
        + str(len(packed)).encode()
        + b" >>\nstream\n"
        + packed
        + b"\nendstream\nendobj\n%%EOF"
    )


@pytest.mark.parametrize(
    "content",
    [
        # Tên viết bằng mã #xx (QC 09/11)
        b"%PDF-1.7\n1 0 obj << /Open#41ction << /S /J#61vaScript /J#53 (app.alert(1)) >> >> endobj",
        # /JavaScript giấu trong object stream nén
        _objstm_pdf(b"2 0 << /S /JavaScript /JS (app.alert(1)) >>"),
        # Object stream hỏng: không kiểm được bên trong
        b"%PDF-1.7\n1 0 obj << /Type /ObjStm /N 1 >>\nstream\nkhong-phai-zlib\nendstream",
    ],
)
def test_evasive_active_pdf_is_rejected(api_client: APIClient, content: bytes) -> None:
    res = post(api_client, payload(file=SimpleUploadedFile("ban-ve.pdf", content)))

    assert res.status_code == 400
    assert not Inquiry.objects.exists()


def test_clean_object_stream_pdf_is_accepted(api_client: APIClient) -> None:
    content = _objstm_pdf(b"2 0 << /Type /Page /MediaBox [0 0 612 792] >>")
    res = post(api_client, payload(file=SimpleUploadedFile("ban-ve.pdf", content)))

    assert res.status_code == 201, res.content


def test_staff_subject_keeps_acronyms(api_client: APIClient) -> None:
    post(api_client, payload(purpose="oem"))
    post(api_client, payload(purpose="quote", email="joe@example.com", message="Other text"))

    subjects = sorted(m.subject for m in mail.outbox if m.to == ["office@example.com"])
    assert subjects == [
        "[Website] Yêu cầu OEM / ODM: Jane Buyer",
        "[Website] Yêu cầu báo giá: Jane Buyer",
    ]
