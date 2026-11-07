"""Vai trò của CMS. Hiện chỉ có MỘT vai trò: Quản trị (toàn quyền nội dung, xuất bản trực tiếp).

Thêm vai trò mới (Biên tập, Duyệt, Sale...) sau này: khai báo thêm ở đây và trong services,
không cần đổi model. Xem docs/adr/0004.
"""

ADMIN_GROUP = "Quản trị"

# Quyền trên cây trang và thư viện ảnh / tài liệu của Wagtail
PAGE_PERMISSIONS = [
    "add_page",
    "change_page",
    "publish_page",
    "bulk_delete_page",
    "lock_page",
    "unlock_page",
]
COLLECTION_PERMISSIONS = [
    ("wagtailimages", "add_image"),
    ("wagtailimages", "change_image"),
    ("wagtailimages", "delete_image"),
    ("wagtailimages", "choose_image"),
    ("wagtaildocs", "add_document"),
    ("wagtaildocs", "change_document"),
    ("wagtaildocs", "delete_document"),
    ("wagtaildocs", "choose_document"),
]
# Quyền model không cấp cho Quản trị (chỉ superuser): log hệ thống, cấu hình nhạy cảm
EXCLUDED_APP_LABELS = {"admin", "sessions", "contenttypes", "axes", "auditlog"}
