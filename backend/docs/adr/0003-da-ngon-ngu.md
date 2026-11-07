# 0003. Đa ngôn ngữ (vi / en)

Trạng thái: chấp nhận (11/2026)

## Quyết định
- Chữ giao diện cố định (nút, nhãn) vẫn nằm tĩnh trong `frontend/messages/*.json`.
- Dữ liệu CMS dịch bằng wagtail-localize. Tiếng Việt là bản gốc.
- Dịch máy Google Cloud Translation chỉ chạy LÚC BIÊN TẬP (bấm "Dịch máy" trong admin), kết quả lưu
  thành bản nháp, người duyệt sửa rồi mới xuất bản. Không dịch lúc khách truy cập.
- Bật dịch máy bằng biến `GOOGLE_CLOUD_PROJECT_ID` + `GOOGLE_APPLICATION_CREDENTIALS`; thiếu thì dịch tay.
- Có bảng thuật ngữ nội thất (glossary) để dịch thống nhất (KD, FA, veneer...).
- Trang chưa dịch: frontend hiện bản tiếng Việt và gắn `noindex` cho bản en.
