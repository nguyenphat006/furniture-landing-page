# 0010. Nội dung trang Vật liệu nằm trên bảng Material của catalog

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Plan ban đầu định làm `MaterialPage` (Wagtail Page, StreamField, dịch qua wagtail-localize).
Thực tế trang /materials/<slug> có bố cục cố định (mô tả ngắn, Đặc tính, Gia công, Bảo quản,
3 ảnh) và chỉ có 8 vật liệu. Bảng `Material` của catalog đã có slug, tên vi / en và là khoá
của bộ lọc sản phẩm. Làm thêm một Page sẽ có hai nơi cùng giữ danh sách vật liệu.

## Quyết định
- Thêm cột nội dung vào `catalog.Material`, sửa trong admin **Sản phẩm → Chất liệu**:
  - `heading` / `heading_en`: tên trên trang Vật liệu (vd "Gỗ teak"); để trống thì dùng `name`,
    vốn là nhãn ngắn của bộ lọc ("Gỗ");
  - `lede`, `properties`, `craft`, `care` cùng bản `_en`: ô chữ thuần, các đoạn cách nhau bằng
    một dòng trống, API trả về danh sách đoạn văn;
  - 4 ảnh: `image` (ảnh đại diện: thumbnail ở thẻ và ảnh trên cùng trang chi tiết),
    `detail_image` (ảnh cận dọc ở mục Đặc tính, khác ảnh đại diện), `use_image` (ứng dụng),
    `craft_image` (xưởng).
- Song ngữ theo cột `_en` như tên phân loại (0007), không qua wagtail-localize. Bản tiếng Anh
  còn trống thì API trả tiếng Việt.
- Không có nháp / xuất bản: lưu là lên web ngay (signal catalog gọi revalidate), giống phân loại.
- API công khai: `GET /api/v1/catalog/materials` (thẻ: tên, mô tả ngắn, ảnh) và
  `GET /api/v1/catalog/materials/{slug}` (đủ nội dung). Không phân trang.
- `import_mock` nhập luôn nội dung trang và ảnh từ frontend (messages/*.json, ảnh trong
  features/materials/data.ts), qua `scripts/export_frontend_mock.mjs`.
- Frontend đọc qua `data/catalog/materials.ts`: có CMS thì gọi API, không thì dùng mock cũ.
  Ảnh CMS còn trống thì frontend hiện khung kẻ sọc ghi tên file cần chụp.

## Hệ quả
- Không có lịch sử phiên bản như Page; chỉ có auditlog nếu bật cho model này sau.
- Slug vật liệu vẫn phải khai báo ở frontend (taxonomy.ts) mới có trang; slug lạ từ CMS bị bỏ qua.
- Nếu sau này trang vật liệu cần bố cục tự do (khối tuỳ ý), chuyển sang StreamField trên chính
  bảng này hoặc làm Page; API giữ nguyên dạng trả về.
