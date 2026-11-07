# 0009. Quét virus tệp đính kèm bằng ClamAV

Trạng thái: chấp nhận (11/2026). Code đã có; container ClamAV thêm khi triển khai Compose.

## Bối cảnh
Form Liên hệ nhận tệp từ người lạ (PDF, DWG, DXF, JPG, PNG, tối đa 10 MB). Frontend và CMS đã
kiểm tra đuôi, kích thước, magic bytes và chặn PDF có nội dung chủ động, nhưng vẫn không phát hiện
được mã độc thật. Nhân viên sẽ tải và mở các tệp này trên máy công ty.

## Quyết định
- Quét bằng **ClamAV** (miễn phí, chạy trong mạng nội bộ, tệp không rời server).
  - CMS gửi nội dung qua giao thức `INSTREAM` của clamd (`apps/inquiries/scanning.py`), không
    thêm thư viện.
  - Cấu hình bằng `CLAMAV_URL=tcp://clamav:3310`.
- Quét **ngay khi nhận** yêu cầu, trước khi lưu tệp:
  - sạch: lưu tệp, trạng thái "Sạch";
  - nhiễm virus: **không lưu tệp**, giữ yêu cầu (nội dung khách vẫn có giá trị), ghi tên virus;
    email báo nhân viên ghi rõ;
  - máy quét lỗi hoặc không kết nối được: lưu tệp, trạng thái "Lỗi khi quét", chờ quét lại.
- Khách luôn nhận thông báo đã gửi thành công, không biết kết quả quét (không lộ cho kẻ dò).
- **Tải tệp trong admin:**
  - production (`ATTACHMENT_SCAN_REQUIRED=True`, bắt buộc trong prod.py): chỉ tải được tệp "Sạch";
  - máy dev (mặc định `False`, chưa có ClamAV): tải được tệp "Chưa quét" kèm cảnh báo.
- Lệnh `python manage.py scan_attachments` quét lại tệp "Chưa quét" / "Lỗi khi quét"; tệp nhiễm
  virus bị xoá khỏi kho. Chạy định kỳ trên server.
- Admin: trang chi tiết hiện kết quả quét; danh sách lọc được theo trạng thái quét.

## Triển khai (Compose)
Thêm vào `docker-compose.prod.yml`. Chỉ mạng nội bộ, không mở cổng ra ngoài:

```yaml
  clamav:
    image: clamav/clamav:1.4.3   # ghim phiên bản; freshclam trong image tự cập nhật mẫu virus
    restart: unless-stopped
    volumes:
      - clamav-db:/var/lib/clamav  # giữ cơ sở dữ liệu virus giữa các lần khởi động lại
    healthcheck:
      test: ["CMD", "clamdcheck.sh"]
      interval: 60s
      start_period: 300s           # lần đầu tải mẫu virus mất vài phút
  cms:
    environment:
      CLAMAV_URL: tcp://clamav:3310
    depends_on:
      clamav: { condition: service_healthy }
```

- Container cần khoảng 1,5 đến 2 GB RAM (nạp cơ sở dữ liệu mẫu virus). Tính vào cấu hình VPS.
- Giới hạn kích thước stream mặc định của clamd là 25 MB, lớn hơn mức 10 MB của form.
- Cron quét lại, chạy trên server mỗi 15 phút:
  `docker compose exec -T cms python manage.py scan_attachments`

## Hệ quả
- Máy dev không chạy ClamAV (quy tắc không cài dịch vụ nền trên máy dev), nên tệp ở dev luôn
  là "Chưa quét". Phần giao thức và luồng xử lý được test bằng máy quét giả trong
  `tests/test_scanning.py`.
- ClamAV không bắt được mọi mã độc. Vẫn giữ các lớp khác: chỉ nhận vài định dạng, kiểm tra magic
  bytes, chặn PDF chủ động, tải về dạng octet-stream, cảnh báo nhân viên không chạy macro.
