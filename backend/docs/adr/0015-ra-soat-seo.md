# 0015. Màn Rà soát SEO trong admin, ảnh chia sẻ riêng từng trang

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
SEO nhập rải rác ở nhiều nơi (tab Quảng bá của trang, mục SEO của sản phẩm / nhóm / vật liệu, SEO
mặc định ở Cài đặt) và phần lớn để trống cho web tự tạo. Người quản trị cần một chỗ thấy trang nào
đang hiện kém trên Google trước khi lên PROD (plan B4).

## Quyết định
- `apps/core/seo_audit.py` chấm mỗi trang công khai ở mỗi ngôn ngữ (SEO mặc định, Trang chủ, trang
  pháp lý, nhóm, vật liệu, sản phẩm đang xuất bản) theo đúng quy tắc tự tạo của frontend: SEO riêng,
  trống thì lấy từ nội dung, rồi tới SEO mặc định. Chỉ đọc.
  - Lỗi: chưa dịch mà trang đang ẩn khỏi Google, thiếu mô tả (kể cả sản phẩm đang dùng câu chung
    giống mọi sản phẩm), tiêu đề SEO quá 60 hay mô tả SEO quá 160 ký tự, sản phẩm chưa có ảnh, không
    có ảnh chia sẻ nào (kể cả ảnh mặc định).
  - Cần xem: mô tả dưới 50 ký tự, tiêu đề tự tạo dài, chưa có ảnh riêng để chia sẻ.
  - Trang đặt "ẩn khỏi Google" không chấm.
- Admin: menu "Rà soát SEO" (`/admin/ra-soat-seo/`, lọc theo mức, mỗi dòng có Sửa và Xem trên web) và
  ô tóm tắt ở trang chủ admin.
- Frontend: trang sản phẩm, vật liệu, nhóm, pháp lý dùng ảnh chia sẻ riêng (ảnh đầu sản phẩm, ảnh
  vật liệu, ảnh bìa nhóm, ảnh nhập ở tab Quảng bá); không có thì giữ ảnh mặc định của site.
- CSS admin gắn `?v=<thời điểm sửa file>` để trình duyệt không giữ bản cũ sau khi cập nhật.

## Hệ quả
- "Xong" của B4 = màn Rà soát SEO không còn mục Lỗi. Với dữ liệu mock hiện tại phần lớn lỗi là 50
  sản phẩm chưa có mô tả và site chưa có ảnh chia sẻ mặc định: việc nội dung của B5, cần BFC.
- Chấm lại mỗi lần mở màn (vài trăm dòng, đủ nhanh); nhiều sản phẩm hơn thì cân nhắc cache.
