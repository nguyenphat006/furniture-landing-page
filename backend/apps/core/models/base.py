"""Model nền dùng chung. Mọi model nghiệp vụ kế thừa thay vì tự khai báo lại.

- TimeStampedModel: created_at / updated_at.
- UserStampedModel: + created_by / updated_by. Điền trong service (tham số `actor`), không lấy ngầm
  từ thread-local, để code dễ test và job chạy nền (actor = None) vẫn rõ ràng.
- PublicIdModel: UUID dùng ra ngoài (URL, API, email); khoá chính bigint không lộ ra ngoài.
- ArchivableModel: lưu trữ thay vì xoá cứng; `objects` chỉ trả bản ghi còn hoạt động,
  `all_objects` trả tất cả.

Lịch sử thay đổi theo trường: django-auditlog (đăng ký trong apps.py của từng app).
Nội dung có nháp / xuất bản: dùng thêm RevisionMixin / DraftStateMixin của Wagtail.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

if TYPE_CHECKING:
    from apps.accounts.models import User


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(_("tạo lúc"), auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(_("cập nhật lúc"), auto_now=True)

    class Meta:
        abstract = True


class UserStampedModel(TimeStampedModel):
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("người tạo"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        editable=False,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("người cập nhật"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        editable=False,
    )

    class Meta:
        abstract = True

    def stamp(self, actor: User | None) -> None:
        """Gắn người thực hiện trước khi lưu. Gọi từ service, không gọi trong save()."""
        if actor is None:
            return
        if self._state.adding and self.created_by_id is None:
            self.created_by = actor
        self.updated_by = actor


class PublicIdModel(models.Model):
    public_id = models.UUIDField(_("mã công khai"), default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        abstract = True


class ActiveQuerySet(models.QuerySet[Any]):
    def active(self) -> ActiveQuerySet:
        return self.filter(archived_at__isnull=True)

    def archived(self) -> ActiveQuerySet:
        return self.filter(archived_at__isnull=False)


class ActiveManager(models.Manager[Any]):
    """Manager mặc định: ẩn bản ghi đã lưu trữ."""

    def get_queryset(self) -> ActiveQuerySet:
        return ActiveQuerySet(self.model, using=self._db).active()


class ArchivableModel(models.Model):
    archived_at = models.DateTimeField(_("lưu trữ lúc"), null=True, blank=True, db_index=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("người lưu trữ"),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        editable=False,
    )

    objects = ActiveManager()
    all_objects = ActiveQuerySet.as_manager()

    class Meta:
        abstract = True
        # Admin, khoá ngoại và quan hệ dùng all_objects để không mất bản ghi đã lưu trữ
        base_manager_name = "all_objects"

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    def archive(self, *, actor: User | None) -> None:
        if self.archived_at is None:
            self.archived_at = timezone.now()
            self.archived_by = actor
            self.save(update_fields=["archived_at", "archived_by"])

    def restore(self) -> None:
        if self.archived_at is not None:
            self.archived_at = None
            self.archived_by = None
            self.save(update_fields=["archived_at", "archived_by"])
