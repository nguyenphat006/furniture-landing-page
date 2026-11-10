# 0003. Đa ngôn ngữ (vi / en)

Trạng thái: chấp nhận (11/2026)

## Quyết định
- Chữ giao diện cố định (nút, nhãn) vẫn nằm tĩnh trong `frontend/messages/*.json`.
- Dữ liệu CMS dịch bằng wagtail-localize. Tiếng Việt là bản gốc.
- Dịch máy Google Cloud Translation chỉ chạy LÚC BIÊN TẬP (bấm "Dịch máy" trong admin), kết quả lưu
  thành bản nháp, người duyệt sửa rồi mới xuất bản. Không dịch lúc khách truy cập.
- Bật dịch máy bằng biến `GOOGLE_TRANSLATE_API_KEY`; thiếu thì dịch tay. (10/11) Dùng Cloud Translation
  API v2 qua REST (`apps/core/machine_translation.py`) thay bộ dịch v3 có sẵn của wagtail-localize: chỉ
  cần API key, không thêm thư viện google-cloud-translate / gRPC. Nút dịch chỉ điền chuỗi chưa dịch,
  chuỗi đã dịch tay giữ nguyên.
- Bảng thuật ngữ nội thất (glossary: KD, FA, veneer...) để dịch thống nhất: CHƯA làm (API v2 không có
  glossary; cần thì chuyển v3 hoặc thay thế chuỗi trước / sau khi dịch). Người duyệt sửa thuật ngữ tay.
- Trang chưa dịch: frontend hiện bản tiếng Việt và gắn `noindex` cho bản en.
