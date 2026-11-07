# 0012. Menu con từ catalog, SEO riêng từng trang, đồng bộ phân loại khi deploy

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Sau 0011, menu chính sửa được trong admin nhưng menu con (dropdown Sản phẩm, Vật liệu) vẫn cứng
trong frontend. Tiêu đề, mô tả từng trang cũng cứng trong messages; chưa có sitemap, canonical,
hreflang. User chốt (07/11/2026): menu con phải lấy từ catalog, không nhập tay; thêm nhóm hay vật
liệu mới vẫn cần dev khai báo ở frontend, đẩy lên prod rồi chỉnh dữ liệu trong admin, về sau
tự nhập khi deploy.

## Quyết định
- Menu Sản phẩm = Nhóm → Loại của catalog, theo thứ tự trong CMS. Thêm ô "hiện trong menu" cho
  Nhóm và Loại.
- Menu Vật liệu cần gom riêng (nhóm Kim loại không phải vật liệu, mục Teak, Inox chỉ là loại gỗ /
  kim loại), nên có màn **Sản phẩm → Menu vật liệu**: nhóm (có hoặc không có trang vật liệu) và
  mục con. Mọi mục đều chọn vật liệu từ bảng Chất liệu, tên để trống thì dùng tên vật liệu, nên
  không có link chết.
- API `GET /api/v1/catalog/menu`. Frontend bỏ qua slug chưa khai báo (chưa có trang).
- SEO riêng: Sản phẩm (tab SEO, dịch qua wagtail-localize như mô tả), Nhóm và Vật liệu (cột `_en`):
  tiêu đề, mô tả, "ẩn khỏi Google". Trang tiếng Anh không lấy SEO tiếng Việt.
  Thứ tự lấy: SEO riêng → tự tạo từ nội dung → SEO mặc định ở Cài đặt → Thông tin chung.
- Frontend: canonical + hreflang (vi, en, x-default) ở mọi trang, `sitemap.xml` (bỏ trang ẩn khỏi
  Google), `robots.txt`; địa chỉ gốc lấy từ `SITE_URL`.
- Lệnh `sync_taxonomy`: chỉ tạo nhóm, loại, chất liệu, tính năng mà frontend đã khai báo nhưng CMS
  chưa có (khớp slug), không sửa hay xoá mục đã có; menu vật liệu chỉ tạo khi CMS chưa có nhóm nào.
  Chạy mỗi lần deploy sau `migrate`. Nguồn là `fixtures/mock_catalog.json`, dev chạy lại
  `scripts/export_frontend_mock.mjs` khi thêm slug.

## Quy trình thêm nhóm / vật liệu mới
1. Dev khai báo slug và nhãn ở frontend (taxonomy.ts, messages), chạy export script, commit.
2. Deploy: `migrate` rồi `sync_taxonomy` tạo bản ghi mới với tên mặc định.
3. Quản trị viên chỉnh tên, thứ tự, ảnh, nội dung, SEO, menu trong admin.

## Bổ sung 07/11/2026: nhóm, loại, chất liệu hiển thị theo CMS
Trước đó chỉ menu con và SEO lấy từ CMS; ô nhóm trang chủ, đầu trang nhóm, chip lọc trang Sản
phẩm vẫn đọc tên, thứ tự, ảnh bìa trong code.
- Nhóm có thêm **mô tả ngắn** (vi / en, en trống thì dùng vi): ô nhóm trang chủ, đầu trang nhóm.
- Frontend đọc `/catalog/taxonomy` một lần mỗi lượt render: thứ tự nhóm, loại, chất liệu, tính
  năng và ảnh bìa nhóm theo CMS; tên và mô tả được đè lên messages khi nạp i18n, nên mọi chỗ hiển
  thị (chip lọc, thẻ sản phẩm, breadcrumb) đổi theo admin mà không sửa từng component.
- CMS lỗi thì giữ nhãn trong messages; slug CMS chưa có xếp cuối với dữ liệu mặc định.

## Hệ quả
- Màn Menu vật liệu thêm một chỗ phải nhớ khi thêm vật liệu (sync chỉ tạo menu lần đầu).
- Bảng điều khiển SEO (trang thiếu mô tả, tiêu đề quá dài) để G5, khi có thêm trang nội dung.

## Bổ sung (07/11/2026): phân loại động hoàn toàn
- Có CMS thì danh sách nhóm, loại, chất liệu, tính năng lấy hết từ CMS: thêm trong admin là có trang
  `/products/<nhóm>`, `/materials/<slug>`, menu, bộ lọc, sitemap; không khai báo gì ở frontend
  (`dynamicParams = true`, slug lạ vẫn 404). Danh sách trong `taxonomy.ts` chỉ còn là mock khi chạy
  không có CMS. Sản phẩm mang sẵn `category` từ API, URL không tra bảng loại → nhóm ở frontend nữa.
- Webhook `/api/revalidate` cho cache hết hạn ngay (`revalidateTag(tag, { expire: 0 })`) thay vì
  stale-while-revalidate: Next chỉ lưu cache khi CMS trả 200, nên nội dung bị xoá / gỡ trước đây vẫn
  hiện mãi bản cũ.
