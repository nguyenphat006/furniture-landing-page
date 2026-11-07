# 0013. Nội dung trang bằng trang Wagtail, section dùng chung là snippet

Trạng thái: chấp nhận (11/2026), làm trước cho Trang chủ

## Bối cảnh
Chữ, ảnh, thứ tự section của các trang đơn (Trang chủ, Năng lực, Về chúng tôi, Liên hệ) còn cứng
trong frontend. Yêu cầu (07/11/2026): quản lý nội dung riêng từng trang, và có section dùng chung
cho nhiều trang (sửa một lần, mọi trang đổi theo).

## Quyết định
- App `apps/pages`. Mỗi trang đơn là một **trang Wagtail** (nháp, lịch sử, lên lịch, bản dịch
  wagtail-localize như sản phẩm, ADR 0003). Hiện có `HomePage`; trang khác kế thừa `ContentPage`.
- Thân trang là StreamField, mỗi block khớp 1-1 với một section frontend. Admin sửa chữ, ảnh,
  thứ tự, thêm / bớt section; không đổi được bố cục hay màu.
  - Section tĩnh sửa nội dung ngay trong trang: `hero`, `intro`, `export`, `factory` (chữ, 2 ảnh,
    điểm nổi bật), `cta`.
  - `export`: tiêu đề, số liệu và danh sách nước. Mỗi nước chọn trong 177 nước của bản đồ chấm, đặt
    vị trí cờ bằng cách bấm lên bản đồ trong admin (trống = cờ ngay trên nước, có que nối khi đặt chỗ
    khác) và chọn cờ nằm trái / giữa / phải điểm. Bản đồ, toạ độ từng nước, cờ sinh một lần từ
    dotted-map 2.2.3 và country-flag-icons 1.6.20: `frontend/src/features/home/world-dots.ts`,
    `backend/apps/pages/static/pages/export-countries.json`, `export-map.svg`, `public/flags`. Vị trí
    không dịch (wagtail-localize bỏ qua), màu chấm theo khu vực tự tính. Tên nước: messages nếu có
    (Mỹ, Anh...), còn lại `Intl.DisplayNames`.
  - Section lấy từ catalog (`section`: Nhóm sản phẩm, Vật liệu) chỉ đặt vị trí hoặc bỏ; nội dung,
    kể cả chữ tiêu đề, theo bên catalog (user chốt 07/11/2026), tiêu đề hiện còn trong messages.
- **Section dùng chung** là snippet `SharedSection` (nháp, lịch sử, bản dịch) chứa đúng một block.
  Trang chèn bằng block "Section dùng chung". Tab "Được dùng ở" có sẵn của Wagtail cho biết trang
  nào đang chèn. Xuất bản section thì webhook làm mới mọi trang (cùng tag cache).
- API `GET /api/v1/pages/<key>?locale=`: `{title, is_fallback, seo, body}`, section dùng chung đã
  được thay bằng block bên trong nên frontend vẽ bằng cùng component. Bản dịch chưa xuất bản thì
  trả bản tiếng Việt với `is_fallback: true`, frontend gắn noindex.
- SEO trang: tab Quảng bá (tiêu đề SEO, mô tả, ảnh chia sẻ, ẩn khỏi Google). Thứ tự lấy: SEO
  riêng → SEO mặc định ở Cài đặt → messages.
- Chữ trên nút để trống thì dùng nhãn mặc định trong messages.
- Danh sách trong block (ảnh hero, số liệu, điểm nổi bật) lưu dạng ListBlock có id cho từng mục:
  wagtail-localize cần id để tách chuỗi dịch. Chuỗi dịch là HTML đã escape (`&amp;`, `<br/>`).
- Lệnh `import_pages` dựng nội dung ban đầu từ messages (bản en qua wagtail-localize với chữ trong
  `messages/en.json`), chỉ tạo phần chưa có nên chạy được mỗi lần deploy; `--force` ghi đè.
  Nguồn là `fixtures/pages.json` do `scripts/export_frontend_mock.mjs` sinh.
- Trang pháp lý (07/11/2026): `PrivacyPage`, `TermsPage` là trang con của Trang chủ, thân trang là
  các mục (tiêu đề + rich text: đậm, nghiêng, danh sách, link), có ngày cập nhật (dùng chung mọi
  ngôn ngữ). API cùng `/pages/privacy`, `/pages/terms` (block `legal`, trường `updated_on`).
  Web: `/privacy`, `/terms`, link cố định ở footer (link thêm ở Cài đặt vẫn hiện sau) và dưới form
  liên hệ, có trong sitemap. Nội dung ban đầu `fixtures/legal.json` viết theo đúng cách site xử lý
  dữ liệu, chỗ chưa quyết (nơi đặt máy chủ, thời hạn lưu) để "NULL"; BFC phải duyệt trước PROD.
  Không có CMS thì 2 trang trả 404 (không giữ bản mock).
- Frontend: `getHomePage` (CMS, hoặc mock từ `features/home/page-content.ts` + messages khi chưa
  có CMS), `HomeBlocks` vẽ block, chấm điều hướng và nút cuộn của hero tính theo thứ tự block.

## Chưa làm
- Xem trước bản nháp (draft mode của Next): tạm tắt nút xem trước trong admin.
- Thao tác "Tách thành bản riêng" / "Lưu vào thư viện" giữa section riêng và section dùng chung.
- Các trang còn lại (G5.2, G5.3), bảng điều khiển SEO (G5.4). CTA ở trang Sản phẩm, trang nhóm vẫn
  đọc messages; khi chuyển sẽ chọn cùng Section dùng chung.

## Hệ quả
- Thêm loại section mới cần dev thêm block ở backend và component ở frontend.
- Sửa bản tiếng Việt xong phải đồng bộ bản dịch (màn Dịch của wagtail-localize) thì bản tiếng Anh
  mới theo cấu trúc mới.
