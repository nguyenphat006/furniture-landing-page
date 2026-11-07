"""Chống spam phía CMS: gửi trùng, giới hạn theo email, nội dung giống spam."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.core import mail
from django.utils import timezone

from apps.inquiries import spam
from apps.inquiries.config import InquirySettings, parse_emails
from apps.inquiries.models import Inquiry
from apps.inquiries.services import InquiryRateLimited, create_inquiry

pytestmark = pytest.mark.django_db(transaction=True)


def staff_mails() -> list[Any]:
    """Thư báo nhân viên (bỏ thư cảm ơn gửi khách)."""
    return [m for m in mail.outbox if m.to != ["jane@example.com"]]


@pytest.fixture(autouse=True)
def _notify(settings: Any) -> None:
    settings.INQUIRY_NOTIFY_EMAILS = ["office@example.com"]


def data(**overrides: Any) -> dict[str, Any]:
    return {
        "purpose": "quote",
        "name": "Jane Buyer",
        "email": "jane@example.com",
        "message": "Please quote 2 containers.",
        **overrides,
    }


def test_duplicate_within_window_returns_existing() -> None:
    first = create_inquiry(data())
    again = create_inquiry(data(email="JANE@example.com"))
    assert again.pk == first.pk
    assert Inquiry.objects.count() == 1
    assert len(staff_mails()) == 1


def test_same_message_after_window_is_new() -> None:
    first = create_inquiry(data())
    Inquiry.objects.filter(pk=first.pk).update(
        created_at=timezone.now() - timedelta(minutes=InquirySettings.load().duplicate_minutes + 1)
    )
    assert create_inquiry(data()).pk != first.pk


def test_email_limit_per_hour() -> None:
    for i in range(InquirySettings.load().max_per_email_per_hour):
        create_inquiry(data(message=f"Message {i}"))
    with pytest.raises(InquiryRateLimited):
        create_inquiry(data(message="One more"))
    # Email khác không bị ảnh hưởng
    create_inquiry(data(email="other@example.com", message="One more"))


def test_email_limit_resets_after_window() -> None:
    for i in range(InquirySettings.load().max_per_email_per_hour):
        create_inquiry(data(message=f"Message {i}"))
    Inquiry.objects.update(created_at=timezone.now() - spam.EMAIL_WINDOW - timedelta(minutes=1))
    create_inquiry(data(message="Next hour"))


@pytest.mark.parametrize(
    "overrides",
    [
        {"message": "Buy now https://a.example http://b.example www.c.example https://d.example"},
        {"name": "Cheap SEO https://spam.example"},
        {"company": "www.spam-shop.example"},
    ],
    ids=["many-links", "link-in-name", "link-in-company"],
)
def test_spammy_content_is_saved_as_spam_without_email(overrides: dict[str, Any]) -> None:
    inquiry = create_inquiry(data(**overrides))
    assert inquiry.status == Inquiry.Status.SPAM
    assert staff_mails() == []


def test_a_few_links_are_fine() -> None:
    inquiry = create_inquiry(
        data(message="Our site https://acme.example and catalogue https://acme.example/cat.pdf")
    )
    assert inquiry.status == Inquiry.Status.NEW
    assert len(staff_mails()) == 1


def configure(**fields: Any) -> InquirySettings:
    config = InquirySettings.load()
    for key, value in fields.items():
        setattr(config, key, value)
    config.full_clean()
    config.save()
    return config  # type: ignore[no-any-return]


def test_rules_can_be_switched_off_in_admin_settings() -> None:
    configure(duplicate_check=False, email_limit=False, link_filter=False)
    for _ in range(5):
        create_inquiry(data(message="Same https://a.x https://b.x https://c.x https://d.x"))
    assert Inquiry.objects.count() == 5
    assert not Inquiry.objects.filter(status=Inquiry.Status.SPAM).exists()


def test_thresholds_come_from_admin_settings() -> None:
    configure(max_per_email_per_hour=1, max_links=0)
    first = create_inquiry(data(message="See https://acme.example"))
    assert first.status == Inquiry.Status.SPAM
    with pytest.raises(InquiryRateLimited):
        create_inquiry(data(message="Second"))


def test_admin_recipients_override_env(settings: Any) -> None:
    configure(notify_emails="sales@example.com\nboss@example.com, sales@example.com")
    create_inquiry(data())
    assert mail.outbox[0].to == ["sales@example.com", "boss@example.com"]


def test_env_recipients_used_when_admin_list_empty(settings: Any) -> None:
    configure(notify_emails="")
    create_inquiry(data())
    assert mail.outbox[0].to == ["office@example.com"]


def test_invalid_recipient_is_rejected() -> None:
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        configure(notify_emails="ok@example.com\nnot-an-email")


def test_parse_emails() -> None:
    assert parse_emails(" a@x.com , b@x.com\n\na@x.com ") == ["a@x.com", "b@x.com"]
