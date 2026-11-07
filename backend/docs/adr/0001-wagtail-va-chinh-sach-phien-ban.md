# 0001. Django + Wagtail, chính sách phiên bản thư viện

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Landing page BFC cần CMS cho Sản phẩm, Vật liệu, Nội dung trang và Yêu cầu liên hệ. Đội quen Python (ERP),
cần admin dùng được ngay, có nháp / xuất bản, lịch sử phiên bản, đa ngôn ngữ.

## Quyết định
- Django 5.2 LTS + Wagtail 8.0, dùng admin của Wagtail (đổi logo, màu BFC), không tự viết admin bằng Next.
- Chọn Django 5.2 LTS thay vì 6.x vì django-auditlog và django-structlog mới chính thức hỗ trợ đến 5.2;
  5.2 được vá bảo mật tới 04/2028.
- Mọi thư viện ghim phiên bản chính xác (`==`) trong `pyproject.toml`, khoá bằng `uv.lock`.
- Chỉ thêm / nâng bản đã phát hành ít nhất 2 tuần (tránh bản lỗi, tấn công chuỗi cung ứng).
- Không thêm thư viện nếu tự viết chỉ vài chục dòng: health check tự viết (`apps/core/views.py`)
  vì django-health-check bản mới yêu cầu Python 3.14.

## Hệ quả
- Wagtail là Django thuần: model, field, API, màn hình admin riêng đều tự thêm được.
- Nâng cấp theo đợt, chạy đủ `poe check` + CI trước khi merge.
