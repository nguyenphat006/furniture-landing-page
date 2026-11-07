"""Truy vấn đọc của app accounts."""

from django.db.models import QuerySet

from .models import User
from .roles import ADMIN_GROUP


def admin_users() -> QuerySet[User]:
    """Người dùng đang hoạt động thuộc nhóm Quản trị."""
    return User.objects.filter(is_active=True, groups__name=ADMIN_GROUP).order_by("username")
