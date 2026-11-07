# 0008. Form Liên hệ lưu ở CMS, Next.js gửi sang bằng request có ký

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Form Liên hệ (frontend/src/features/contact) đã có lớp bảo vệ ở server action: giới hạn tần suất
theo IP, bẫy bot, captcha Turnstile, kiểm tra trường và tệp. Nhưng yêu cầu chưa được gửi đi đâu.
Cần nơi lưu để nhân viên xem, theo dõi trạng thái, không mất yêu cầu khi email lỗi.

## Quyết định
- App `apps/inquiries`, model `Inquiry`. Màn hình admin "Liên hệ" là snippet của Wagtail:
  - không có nút Thêm (InquiryPermissionPolicy chặn "add");
  - phần khách gửi chỉ đọc; nhân viên sửa trạng thái (Mới / Đang xử lý / Đã xong / Rác) và ghi chú;
  - người sửa gần nhất được ghi là người xử lý; auditlog chỉ ghi các trường xử lý.
- API `POST /api/v1/inquiries` (multipart) chỉ nhận request ký HMAC-SHA256 bằng
  `CMS_SHARED_SECRET`. Định dạng giống webhook revalidate, chỉ đổi chiều: header
  `X-BFC-Timestamp`, `X-BFC-Signature`, lệch giờ tối đa 5 phút. Chưa đặt bí mật thì từ chối
  mọi request. Trình duyệt không bao giờ gọi thẳng API này.
- CMS kiểm tra lại dữ liệu và tệp (đuôi, <= 10 MB, magic bytes, PDF không có nội dung chủ động),
  dù frontend đã kiểm tra, vì CMS là nơi lưu tệp.
- Tệp lưu ở kho riêng tư `STORAGES["private"]` (`backend/private/`, không có URL), tên tệp theo
  mã công khai của yêu cầu. Chỉ tải qua view admin có kiểm tra quyền, luôn ở dạng tải về
  (`application/octet-stream`, `nosniff`).
- Email báo nhân viên tới `INQUIRY_NOTIFY_EMAILS`: text thuần, email khách chỉ ở Reply-To,
  không đính kèm tệp, kèm link mở yêu cầu trong admin. Gửi sau khi commit; lỗi gửi chỉ ghi log.
- Log chỉ ghi mã công khai và mục đích, không ghi nội dung hay thông tin cá nhân.
- Cài đặt vận hành sửa trong admin, **Cài đặt → Liên hệ** (`config.InquirySettings`, có ghi
  lịch sử bằng auditlog): email nhận thông báo, bật / tắt và ngưỡng của từng luật chống spam.
  Danh sách email trong admin để trống thì dùng `INQUIRY_NOTIFY_EMAILS` của server. Khoá bí mật và
  cấu hình quét virus vẫn ở biến môi trường, để tài khoản admin không xem hay tắt được.
- Chống spam phía CMS (`spam.py`), lưu bằng database nên không mất khi khởi động lại. Giá trị mặc
  định (đổi được trong admin):
  - cùng email và cùng nội dung trong 10 phút: trả lại bản đã có, không tạo mới;
  - tối đa 3 yêu cầu mỗi email mỗi giờ: API trả 429, frontend báo gửi quá nhiều lần;
  - có trên 3 link trong nội dung, hoặc có link trong họ tên / công ty: vẫn lưu nhưng đánh dấu
    Rác và không gửi email báo.
- Frontend dùng một biến `CMS_SHARED_SECRET` cho cả hai chiều (tên cũ `CMS_REVALIDATE_SECRET`
  vẫn đọc được). Chưa nối CMS: dev báo thành công để thử giao diện, production báo lỗi.

## Hệ quả và việc còn lại
- Quét virus tệp đính kèm: xem 0009 (ClamAV, tệp nhiễm không được lưu).
- Chưa có chính sách lưu giữ: yêu cầu và tệp được giữ vô thời hạn. Cần chốt thời hạn (vd 24 tháng)
  rồi thêm lệnh dọn định kỳ.
- `DATA_UPLOAD_MAX_MEMORY_SIZE` nâng lên 12 MB vì API phải đọc cả body để kiểm tra chữ ký.
  Nginx production cần `client_max_body_size` tương ứng cho đường dẫn này.
- Nếu sau này đổi giao diện admin (tự làm bằng Next + shadcn), chỉ thay phần wagtail_hooks;
  model, service và API giữ nguyên.
