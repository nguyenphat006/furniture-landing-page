"""Thao tác ghi của app accounts."""

from django.contrib.auth.models import Group, Permission
from django.db import transaction
from wagtail.models import Collection, GroupCollectionPermission, GroupPagePermission, Page

from .roles import ADMIN_GROUP, COLLECTION_PERMISSIONS, EXCLUDED_APP_LABELS, PAGE_PERMISSIONS


@transaction.atomic
def ensure_admin_group() -> Group:
    """Tạo / cập nhật nhóm Quản trị với toàn quyền nội dung. Chạy lại an toàn (idempotent).

    Chạy lại sau khi thêm model mới để nhóm nhận quyền của model đó (`manage.py bootstrap`).
    """
    group, _ = Group.objects.get_or_create(name=ADMIN_GROUP)

    model_perms = Permission.objects.exclude(content_type__app_label__in=EXCLUDED_APP_LABELS)
    group.permissions.set(model_perms)

    root_page = Page.get_first_root_node()
    if root_page is not None:
        for codename in PAGE_PERMISSIONS:
            perm = Permission.objects.get(content_type__app_label="wagtailcore", codename=codename)
            GroupPagePermission.objects.get_or_create(group=group, page=root_page, permission=perm)

    root_collection = Collection.get_first_root_node()
    if root_collection is not None:
        for app_label, codename in COLLECTION_PERMISSIONS:
            perm = Permission.objects.get(content_type__app_label=app_label, codename=codename)
            GroupCollectionPermission.objects.get_or_create(
                group=group, collection=root_collection, permission=perm
            )
    return group
