# Tìm kiếm trên website (B7), 2026-11-09

## Mục tiêu
Người xem tìm được sản phẩm (tên, mã mẫu, nhóm, loại, chất liệu), nhóm và loại sản phẩm, vật liệu, các
trang chính, từng xưởng ở trang Năng lực và bài tin tức (thêm 09/11, theo tiêu đề và tóm tắt), ở cả tiếng Việt và tiếng Anh. Gõ không dấu vẫn ra.

## Cách làm
- Tìm ngay trong Next (`frontend/src/features/search/search.ts`) trên dữ liệu các trang đã dùng
  (`getProducts`, `getTaxonomy`, `getMaterials`, messages), vốn được cache theo tag `cms`.
  - Không gọi CMS theo từng từ khoá, nên không thêm tải cho CMS.
  - CMS tạm lỗi vẫn tìm được trên bản dự phòng.
  - Chạy được cả khi chưa bật CMS (mock).
  - Không dùng chỉ mục Wagtail: SQLite (local) và Postgres (server) xử lý dấu tiếng Việt khác nhau, và
    cả hai đều không coi "đ" là "d".
- Chuẩn hoá (`normalize.ts`): viết thường, bỏ dấu, đ thành d, ký tự khác chữ số thành khoảng trắng.
- Khớp: mọi từ khoá phải có trong tên, mã hoặc trường phụ. Tên nhóm, loại, chất liệu lấy cả hai ngôn
  ngữ.
- Xếp hạng, từ cao xuống thấp:
  1. mã trùng hoặc bắt đầu bằng cụm từ khoá;
  2. tên bắt đầu bằng cụm;
  3. tên chứa cụm;
  4. cụm nằm trong trường phụ;
  5. từng từ ở đầu một từ của tên;
  6. thứ tự catalog.

## Giao diện
- **Ô tìm nhanh** `SearchDialog`: `<dialog>` gốc, mở bằng icon kính lúp trên header (từ `sm`) và nút nổi
  Tìm kiếm.
  - Gợi ý khi gõ lấy từ `GET /api/search?q=&locale=` (chờ 180ms sau phím cuối, huỷ request cũ).
  - Hiện tối đa 5 sản phẩm, mỗi nhóm khác 3 mục.
  - Combobox ARIA: ↑ ↓ chọn, Enter mở mục đang chọn; chưa chọn mục nào thì Enter mở `/search?q=`.
  - Esc hoặc bấm ra nền tối thì đóng.
- **Trang kết quả** `/[locale]/search?q=`:
  - form GET, chạy cả khi không có JS;
  - các nhóm kết quả: nhóm và loại (chip), sản phẩm (`ProductCard`), vật liệu, trang;
  - không có kết quả thì hiện chip các nhóm sản phẩm;
  - `noindex, follow`, không có trong sitemap.
- **Nút mở tìm kiếm** `SearchTrigger`: là link tới `/search`, có JS thì mở modal tại chỗ.

## Ngoài phạm vi
- Nội dung chi tiết trong trang pháp lý.
