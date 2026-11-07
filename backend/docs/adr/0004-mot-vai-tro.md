# 0004. Một vai trò "Quản trị"

Trạng thái: chấp nhận (11/2026)

## Quyết định
Trước mắt chỉ một nhóm `Quản trị`: sửa và xuất bản trực tiếp, không quy trình duyệt.
Nhóm và quyền tạo bằng code (`apps/accounts/roles.py`, lệnh `manage.py bootstrap`), không bấm tay.
Superuser chỉ dành cho kỹ thuật; `/django-admin/` chỉ superuser vào được.

## Hệ quả
Khi cần thêm vai trò (Biên tập, Duyệt), khai báo thêm trong `roles.py` và bật workflow của Wagtail,
không phải sửa model.
