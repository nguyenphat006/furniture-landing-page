# 0014. Xem trước bản nháp bằng draft mode của Next.js

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
CMS chạy headless (ADR 0013), nút Xem trước của Wagtail không có trang HTML để vẽ. Người sửa nội
dung cần thấy bản đang sửa (chưa lưu cũng được) đúng như trên web trước khi xuất bản, còn khách
truy cập không bao giờ thấy bản nháp.

## Quyết định
- `serve_preview` (trang nội dung, Section dùng chung, Sản phẩm) dựng đúng JSON mà API công khai trả
  cho nội dung đó từ bản đang sửa, lưu vào bảng `Preview` (mã ngẫu nhiên, hết hạn 30 phút, tự dọn
  bản hết hạn), rồi chuyển tới `<FRONTEND_URL>/api/draft?token&path&ts&sig`.
  - Section dùng chung xem trên Trang chủ cùng ngôn ngữ, section đó thay bằng bản đang sửa.
  - Vật liệu chưa có nháp (sửa là lên luôn) nên chưa cần xem trước.
- Link ký HMAC bằng `CMS_SHARED_SECRET` trên `"<ts>.<token>.<path>"`, frontend chỉ nhận trong 5 phút.
  `path` chỉ là đường dẫn trong site (chống open redirect).
- `/api/draft` bật draft mode, lưu mã vào cookie `bfc_preview` (httpOnly, 30 phút), ghi cookie ngôn
  ngữ `NEXT_LOCALE` theo `path` để next-intl không chuyển sang ngôn ngữ khác, rồi mở `path`.
- Khi draft mode bật, `lib/cms/preview.ts` đọc `GET /api/v1/pages/preview/<token>` (request ký, không
  cache, một lần mỗi request) và dùng bản nháp thay bản đã xuất bản nếu đúng loại, khoá, ngôn ngữ.
  API này không nhận request không ký (403), mã sai / hết hạn trả 404.
- Dải "Đang xem bản nháp" cố định ở đáy, nút Thoát xem trước (server action) tắt draft mode và ở lại
  trang đang xem.
- Khung xem trước trong admin nhúng web bằng iframe: thay `X-Frame-Options: SAMEORIGIN` bằng CSP
  `frame-ancestors 'self' <nguồn CMS>`; nguồn lấy từ `CMS_ADMIN_ORIGIN` (nhiều nguồn ngăn dấu phẩy),
  mặc định gốc của `CMS_API_URL`. Cookie ở PROD là `SameSite=None; Secure` để chạy trong iframe.

## Hệ quả
- Cấu hình: backend `FRONTEND_URL` (trống thì lấy gốc `FRONTEND_REVALIDATE_URL`) và
  `CMS_SHARED_SECRET`; frontend `CMS_SHARED_SECRET`, `CMS_ADMIN_ORIGIN` nếu admin khác domain API.
  Thiếu cấu hình thì nút Xem trước báo rõ thay vì lỗi.
- Bản nháp lưu tạm trong DB tối đa 30 phút; ai có link chưa hết 5 phút mới vào được draft mode.
- URL ảnh trong bản nháp theo host admin đang mở; ở dev next/image cho cả `localhost` và `127.0.0.1`.
