"""Người dùng của CMS. Custom user model ngay từ migration đầu (đổi về sau rất khó)."""

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    # Email bắt buộc và duy nhất: dùng để nhận thông báo, khôi phục mật khẩu
    email = models.EmailField(_("email"), unique=True)

    class Meta:
        verbose_name = _("người dùng")
        verbose_name_plural = _("người dùng")

    def __str__(self) -> str:
        return self.get_full_name() or self.username
