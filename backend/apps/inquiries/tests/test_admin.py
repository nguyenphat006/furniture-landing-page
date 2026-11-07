"""Admin Liên hệ: xem, xử lý, không tạo tay, tải tệp có kiểm tra quyền."""

from __future__ import annotations

import pytest
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.urls import reverse

from apps.accounts.models import User
from apps.accounts.tests.factories import create_user
from apps.inquiries.models import Inquiry
from apps.inquiries.services import create_inquiry

PDF = b"%PDF-1.7\n%%EOF"

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff() -> User:
    return create_user(is_superuser=True, is_staff=True)


@pytest.fixture
def inquiry() -> Inquiry:
    return create_inquiry(
        {
            "purpose": "oem",
            "name": "Jane Buyer",
            "email": "jane@example.com",
            "company": "Acme",
            "message": "Hello",
            "locale": "en",
        },
        SimpleUploadedFile("spec sheet.pdf", PDF),
    )


def test_listing_and_edit_render(client: Client, staff: User, inquiry: Inquiry) -> None:
    client.force_login(staff)
    listing = client.get(reverse("wagtailsnippets_inquiries_inquiry:list"))
    assert listing.status_code == 200
    assert b"Jane Buyer" in listing.content

    edit = client.get(reverse("wagtailsnippets_inquiries_inquiry:edit", args=[inquiry.pk]))
    assert edit.status_code == 200
    assert reverse("inquiries_attachment", args=[inquiry.public_id]).encode() in edit.content


def test_cannot_add_by_hand(client: Client, staff: User) -> None:
    client.force_login(staff)
    res = client.get(reverse("wagtailsnippets_inquiries_inquiry:add"))
    assert res.status_code in (302, 403)
    assert Inquiry.objects.count() == 0


def test_edit_sets_status_and_handler(client: Client, staff: User, inquiry: Inquiry) -> None:
    client.force_login(staff)
    url = reverse("wagtailsnippets_inquiries_inquiry:edit", args=[inquiry.pk])
    res = client.post(url, {"status": "in_progress", "staff_note": "Gọi lại thứ Hai"})
    assert res.status_code == 302, res.content

    inquiry.refresh_from_db()
    assert inquiry.status == Inquiry.Status.IN_PROGRESS
    assert inquiry.staff_note == "Gọi lại thứ Hai"
    assert inquiry.handled_by == staff
    # Phần khách gửi không đổi qua form
    assert inquiry.name == "Jane Buyer"


def test_attachment_download_requires_permission(client: Client, inquiry: Inquiry) -> None:
    url = reverse("inquiries_attachment", args=[inquiry.public_id])

    # Chưa đăng nhập: về trang đăng nhập admin
    assert client.get(url).status_code == 302

    # Vào được admin nhưng không có quyền với Liên hệ
    viewer = create_user(is_staff=True)
    viewer.user_permissions.add(*_admin_access())
    client.force_login(viewer)
    res = client.get(url)
    # Wagtail đổi PermissionDenied trong admin thành chuyển về trang chủ admin kèm thông báo
    assert res.status_code == 302
    assert res["Location"] == "/admin/"


def test_attachment_download_is_forced(client: Client, staff: User, inquiry: Inquiry) -> None:
    client.force_login(staff)
    res = client.get(reverse("inquiries_attachment", args=[inquiry.public_id]))
    assert res.status_code == 200
    assert res["Content-Type"] == "application/octet-stream"
    assert res["Content-Disposition"].startswith("attachment;")
    assert res["X-Content-Type-Options"] == "nosniff"
    assert b"".join(res.streaming_content) == PDF  # type: ignore[attr-defined]


def _admin_access() -> list[Permission]:
    return list(
        Permission.objects.filter(content_type__app_label="wagtailadmin", codename="access_admin")
    )


def test_settings_page_renders_and_saves(client: Client, staff: User) -> None:
    from apps.inquiries.config import InquirySettings

    client.force_login(staff)
    url = reverse("wagtailsettings:edit", args=["inquiries", "inquirysettings"])
    # Trang cài đặt chung chuyển tới bản ghi duy nhất (/.../1/)
    res = client.get(url, follow=True)
    assert res.status_code == 200
    assert "Chống spam" in res.content.decode()
    url = res.redirect_chain[-1][0]

    form = {
        "notify_emails": "sales@example.com",
        "duplicate_check": "on",
        "duplicate_minutes": "15",
        "email_limit": "on",
        "max_per_email_per_hour": "5",
        "max_links": "2",
    }
    assert client.post(url, form).status_code == 302
    config = InquirySettings.load()
    assert config.recipients() == ["sales@example.com"]
    assert config.duplicate_minutes == 15
    assert config.link_filter is False
