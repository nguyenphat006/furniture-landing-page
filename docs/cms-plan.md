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
| G5 | Nội dung trang: trang Wagtail + StreamField theo section, thư viện section dùng chung cho nhiều trang, SEO trang đơn và bảng điều khiển SEO, xem trước bản nháp | Đang làm: G5.1 Trang chủ xong (ADR 0013, gồm Xuất khẩu và Nhà máy sửa trong trang); còn trang Năng lực, Về chúng tôi, Liên hệ, đầu trang Sản phẩm / Vật liệu, xem trước bản nháp, bảng điều khiển SEO |
| G6 | Đồng bộ ERP | Để sau |
| G7 | Triển khai | Để sau |

Về đích (lập 2026-11-07, chi tiết ở mục 12 của plan artifact), làm xong thì QC cuối trên staging rồi mới lên PROD:

| Bước | Nội dung |
| --- | --- |
| B0 | Chính sách bảo mật, Điều khoản sử dụng (/privacy, /terms, sửa trong CMS), link thật ở footer và form liên hệ; BFC duyệt nội dung trước PROD. Làm trước |
| B1 | Trang Năng lực (G5.2): các section tĩnh thành block sửa trong trang |
| B2 | Về chúng tôi, Liên hệ, đầu trang Sản phẩm / Vật liệu (G5.3); CTA trang Sản phẩm dùng Section dùng chung |
| B3 | Xem trước bản nháp bằng draft mode (G5.4) |
| B4 | Bảng điều khiển SEO, rà SEO mọi trang (G5.5) |
| B5 | Dọn nội dung: 14 chỗ "NULL" mỗi ngôn ngữ, ảnh tạm, duyệt 50 mẫu mock |
| B6 | Chuẩn bị PROD: Postgres, bí mật, Nginx, ClamAV, HTTPS, 2FA, backup, quy trình deploy, staging |
| QC | Tự động, từng trang 2 ngôn ngữ, form liên hệ, luồng admin, dự phòng, SEO, hiệu năng, giao diện, truy cập, bảo mật, nội dung, vận hành. Đạt khi không còn lỗi P0 và BFC ký nhận |
