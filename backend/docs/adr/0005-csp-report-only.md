# 0005. CSP ở chế độ report-only

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Admin Wagtail dùng script / style nội tuyến; bật CSP chặn ngay sẽ làm hỏng admin.

## Quyết định
Production bật django-csp ở chế độ `Content-Security-Policy-Report-Only`, theo dõi vi phạm rồi siết dần.
`X-Frame-Options: SAMEORIGIN` (cảnh báo `security.W019` được tắt có chủ đích) vì khung xem trước
của Wagtail cần nhúng cùng nguồn; `frame-ancestors 'self'` vẫn chặn site khác nhúng.
