"""Email cảm ơn người gửi: tiếng Anh, sửa ở Cài đặt → Liên hệ, không lặp lại nội dung khách viết."""

from __future__ import annotations

from typing import Any
from unittest import mock

import pytest
from django.core import mail
from django.core.exceptions import ValidationError

from apps.inquiries.config import InquirySettings
from apps.inquiries.models import Inquiry
from apps.inquiries.services import create_inquiry, thank_sender
from apps.sitesettings.models import SiteSettings

pytestmark = pytest.mark.django_db(transaction=True)


def data(**overrides: Any) -> dict[str, Any]:
    return {
        "purpose": "quote",
        "name": "Jane Buyer",
        "email": "jane@example.com",
        "model_codes": "2BFC2636",
        "message": "Secret message https://phish.example",
        **overrides,
    }


def thanks() -> list[Any]:
    return [m for m in mail.outbox if m.to == ["jane@example.com"]]


def test_sender_gets_english_thank_you_without_their_message(settings: Any) -> None:
    settings.FRONTEND_URL = "https://bfcfurniture.com"
    site = SiteSettings.load()
    site.email = "office@bfcfurniture.com"
    site.save()

    create_inquiry(data())

    [sent] = thanks()
    assert sent.subject == "We have received your request | BINH BFC"
    assert sent.body.startswith("Dear Jane Buyer,")
    assert "Purpose: Quotation" in sent.body
    assert "Model codes: 2BFC2636" in sent.body
    assert "https://bfcfurniture.com" in sent.body
    assert "Secret message" not in sent.body
    assert sent.reply_to == ["office@bfcfurniture.com"]


def test_no_thank_you_for_spam_or_when_switched_off() -> None:
    create_inquiry(data(name="Win https://spam.example"))
    assert Inquiry.objects.get().status == Inquiry.Status.SPAM
    assert thanks() == []

    config = InquirySettings.load()
    config.auto_reply = False
    config.save()
    create_inquiry(data(email="jane@example.com", message="Another request"))
    assert thanks() == []


def test_custom_template_and_reply_to_fallback() -> None:
    config = InquirySettings.load()
    config.notify_emails = "sales@example.com"
    config.auto_reply_subject = "Thanks {name}"
    config.auto_reply_body = "Hi {name}, about {purpose}: {model_codes}."
    config.full_clean()
    config.save()

    create_inquiry(data(model_codes="", name="Ann {company}"))

    [sent] = thanks()
    assert sent.subject == "Thanks Ann {company}"
    assert sent.body == "Hi Ann {company}, about Quotation: -."
    assert sent.reply_to == ["sales@example.com"]


def test_unknown_placeholder_rejected() -> None:
    config = InquirySettings.load()
    config.auto_reply_body = "Hello {nmae}"
    with pytest.raises(ValidationError):
        config.full_clean()


def test_send_failure_only_logs() -> None:
    inquiry = create_inquiry(data())
    with mock.patch("apps.inquiries.services.EmailMessage.send", side_effect=OSError("down")):
        assert thank_sender(inquiry) is False
