# Plan xây CMS cho landing page BFC

Bản đầy đủ và mới nhất (2026-11-06): https://claude.ai/artifact/9FVCpAWcWRT4N4572rF5Fm

Tóm tắt đã chốt:

- Dự án tự build sẵn, hiện chỉ chạy local (venv + SQLite, không Docker); khi công ty dùng thì bật production.
- Django 5.2 LTS + Wagtail 7.x trong `backend/`, nền móng chuẩn từ G0: settings tách môi trường, app theo miền,
  services/selectors, base model + audit (Wagtail revision/log, django-auditlog, django-axes), custom user,
  uv + ruff + mypy + pytest + CI. Admin là Wagtail admin đổi giao diện theo BFC.
- Một vai trò duy nhất (Quản trị), xuất bản trực tiếp; nhóm quyền để sẵn để thêm sau.
- Phạm vi: Sản phẩm (nhập 50 mẫu mock, chưa nối ERP), Vật liệu, Nội dung trang, Yêu cầu liên hệ.
- Song ngữ: chữ giao diện tĩnh ở `frontend/messages`; dữ liệu CMS dịch máy hai chiều (wagtail-localize +
  Google Cloud Translation), lưu nháp, duyệt rồi xuất bản.
- Triển khai sau này: Docker Compose như ERP (nginx, web, cms, db) trên VPS của BFC.

Lộ trình (cập nhật 2026-11-07):

| Giai đoạn | Nội dung | Trạng thái |
| --- | --- | --- |
| G0 | Nền móng backend | Xong |
| G1 | Sản phẩm, frontend đọc từ CMS | Xong |
| G2 | Yêu cầu liên hệ (thêm quét virus, chống spam, Cài đặt → Liên hệ) | Xong |
| G3 | Vật liệu: nội dung trong bảng Material của catalog, API, frontend đọc từ CMS (ADR 0010) | Xong |
| G4 | Thông tin chung và khung site: thông tin công ty, logo, menu chính, footer, mạng xã hội, SEO mặc định sửa trong Cài đặt của admin (ADR 0011); thêm menu con lấy từ catalog, SEO riêng sản phẩm / nhóm / vật liệu, sitemap, canonical, hreflang, lệnh sync_taxonomy khi deploy (ADR 0012) | Xong |
| G5 | Nội dung trang: trang Wagtail + StreamField theo section, thư viện section dùng chung cho nhiều trang, SEO trang đơn và bảng điều khiển SEO, xem trước bản nháp | Đang làm: G5.1 Trang chủ xong (ADR 0013, gồm Xuất khẩu và Nhà máy sửa trong trang); còn trang Năng lực, Về chúng tôi, Liên hệ, đầu trang Sản phẩm / Vật liệu; xem trước bản nháp (ADR 0014) và rà soát SEO (ADR 0015) xong |
| G6 | Đồng bộ ERP | Để sau |
| G7 | Triển khai | Bộ triển khai và tài liệu xong (`deploy/`), chờ server của BFC |

Về đích (lập 2026-11-07, chi tiết ở mục 12 của plan artifact), làm xong thì QC cuối trên staging rồi mới lên PROD.
QC vòng 1 trên local đang chạy song song làm mốc (kết quả ở [qc-ket-qua.md](qc-ket-qua.md)); B7 đến B9 làm xong thì QC
lại phần mới cùng vòng staging:

| Bước | Nội dung |
| --- | --- |
| B0 | Chính sách bảo mật, Điều khoản sử dụng (/privacy, /terms, sửa trong CMS), link thật ở footer và form liên hệ; BFC duyệt nội dung trước PROD. **Xong** (4ded033) |
| B1 | Trang Năng lực (G5.2): các section tĩnh thành block sửa trong trang. **Tạm gác**: bố cục section chưa chốt với sếp |
| B2 | Về chúng tôi, Liên hệ, đầu trang Sản phẩm / Vật liệu (G5.3); CTA trang Sản phẩm dùng Section dùng chung. **Tạm gác** như B1 |
| B3 | Xem trước bản nháp bằng draft mode (G5.4): trang nội dung, Section dùng chung, Sản phẩm (ADR 0014). **Xong** |
| B4 | Bảng điều khiển SEO, rà SEO mọi trang (G5.5): màn Rà soát SEO trong admin, ảnh chia sẻ riêng từng trang (ADR 0015). **Xong** phần công cụ; hết mục Lỗi cần nội dung ở B5 |
| B5 | Dọn nội dung: 14 chỗ "NULL" mỗi ngôn ngữ, ảnh tạm, duyệt 50 mẫu mock |
| B6 | Chuẩn bị PROD: Postgres, bí mật, Nginx, ClamAV, HTTPS, 2FA, backup, quy trình deploy, staging. **Xong** phần file: bộ triển khai `deploy/` (Compose, Nginx, deploy / backup / restore, cron), CI frontend và deploy, sổ tay `deploy/README.md`, hướng dẫn admin `docs/huong-dan-quan-tri.md`. Còn: server, domain, SMTP, Turnstile, nơi chép backup (BFC cung cấp), dựng staging, 2FA (chưa chọn) |
| B7 | Tìm kiếm trên site (thêm 07/11): ô tìm ở header, trang `/search?q=` song ngữ, tìm sản phẩm (tên, mã mẫu, nhóm, loại, chất liệu), vật liệu, tin tức, trang nội dung; tìm không dấu tiếng Việt; gợi ý khi gõ; trang kết quả `noindex`. Backend: chỉ mục tìm kiếm của Wagtail trên Postgres, API `/api/v1/search` |
| B8 | Tin tức (thêm 07/11): trang danh sách `/news` (lọc chuyên mục, phân trang) và chi tiết `/news/<slug>` (ảnh bìa, ngày, tóm tắt, nội dung StreamField, bài liên quan); sửa, xem trước, hẹn giờ, dịch trong CMS; sitemap, JSON-LD Article, ảnh chia sẻ; mục menu do admin bật |
| B9 | Thêm section dùng chung (thêm 07/11): FAQ (câu hỏi / trả lời, JSON-LD FAQPage), chứng nhận, quy trình làm việc, dải số liệu (số chưa xác nhận để NULL), kêu gọi liên hệ đã có; gắn vào trang chủ, Năng lực, Liên hệ, sản phẩm. Danh sách cuối chốt cùng bố cục B1 / B2 |
| B10 | Cụm nút nổi (thêm 07/11): dính sát mép phải, dưới header, mọi trang; nút Tìm kiếm, Gọi điện, WhatsApp, Zalo, Email, Messenger, Báo giá, Link khác quản lý ở Cài đặt → Thông tin chung → Nút nổi (thứ tự, chữ vi / en, ẩn hiện); link liên hệ lấy từ tab Liên hệ. **Xong** trừ nút Tìm kiếm (hiện khi xong B7) |
| QC | Tự động, từng trang 2 ngôn ngữ, form liên hệ, luồng admin, dự phòng, SEO, hiệu năng, giao diện, truy cập, bảo mật, nội dung, vận hành. Đạt khi không còn lỗi P0 và BFC ký nhận |
