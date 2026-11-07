# 0011. Thông tin chung và khung site sửa trong Cài đặt của admin

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Tên công ty, địa chỉ, điện thoại, email, bản đồ, logo, menu header, nội dung footer và SEO mặc định
nằm cứng trong frontend (`src/config/site.ts`, `site-header.tsx`, messages). Muốn đổi số điện
thoại hay thứ tự menu đều phải nhờ dev. Yêu cầu ngày 07/11/2026: những thứ hiện ở mọi trang phải
sửa được trong admin.

## Quyết định
- App `apps/sitesettings`, model `SiteSettings` (`wagtail.contrib.settings`, một bản ghi), trong
  admin là **Cài đặt → Thông tin chung**, chia tab:
  - Công ty: tên giao dịch, dòng dưới tên, tên pháp lý, mã số thuế, địa chỉ;
  - Liên hệ: điện thoại, email, WhatsApp, Zalo, giờ làm việc, Google Maps, bản đồ nhúng, mạng xã hội;
  - Thương hiệu: logo, logo trên nền tối, favicon, ảnh chia sẻ mặc định;
  - Menu: mục menu chính (trang có sẵn hoặc link ngoài), thứ tự, ẩn / hiện, tên tuỳ chọn;
  - Footer: đoạn giới thiệu, link cuối trang;
  - SEO: tiêu đề và mô tả mặc định.
- Menu, link footer, mạng xã hội là các dòng con (Orderable, InlinePanel) lưu cùng bản ghi.
- Song ngữ theo cột `_en` như phân loại (0007); bản tiếng Anh trống thì dùng tiếng Việt. API
  đọc thẳng mã ngôn ngữ, không qua bảng Locale.
- Kiểm tra dữ liệu:
  - bản đồ nhúng chỉ nhận `https://www.google.com/maps...`, vì web nhúng iframe từ link này;
  - link footer chỉ nhận `https://...` hoặc đường dẫn trong web bắt đầu bằng `/`;
  - mục menu "Link khác" bắt buộc có link và tên.
- Admin chỉ đổi nội dung, không đổi bố cục: header, footer vẫn giống nhau ở mọi trang. Menu con của
  Vật liệu, Sản phẩm vẫn tự lấy từ catalog. Nút Báo giá và dải gợi ý trên footer vẫn do code.
- API công khai `GET /api/v1/site?locale=` trả cả gói. Lưu là webhook revalidate (signal), frontend
  làm mới cache.
- Frontend: `data/site` đọc một lần ở layout rồi truyền qua `SiteProvider` (`useSite()`). Chưa nối
  CMS thì dùng dữ liệu cũ trong `config/site.ts` và messages. CMS chưa có logo thì dùng logo trong
  `public/`, chưa có menu thì dùng menu mặc định.
- Lệnh `import_site` nhập thông tin hiện có của frontend (qua `scripts/export_frontend_mock.mjs`).
  Lệnh ghi đè những gì đã sửa trong admin nên chỉ chạy lúc khởi tạo.
- Có lịch sử sửa bằng auditlog.

## Hệ quả
- Footer, logo, phần liên hệ của trang Liên hệ thành client component (đọc context). Nội dung vẫn
  render sẵn ở server.
- Link "Chính sách bảo mật", "Điều khoản" đang là link tạm (`#`) nên không nhập vào CMS: khi nối
  CMS, footer chỉ hiện link khi đã thêm trong admin (cần có trang chính sách trước).
- Dải chứng nhận ở footer vẫn lấy từ `data/certifications` của frontend; chuyển sang CMS cùng nội
  dung trang Năng lực (G5).
