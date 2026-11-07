# 0002. Cấu trúc app và phân tầng

Trạng thái: chấp nhận (11/2026)

## Quyết định
Mỗi nghiệp vụ là một app trong `apps/` (core, accounts, sau này catalog, materials, pages, inquiries).
Trong mỗi app:

| File | Vai trò |
| --- | --- |
| `models/` | Bảng dữ liệu, kế thừa model nền trong `apps/core/models/base.py` |
| `services.py` | Mọi thao tác GHI (tạo, sửa, lưu trữ). Nhận `actor` rõ ràng |
| `selectors.py` | Mọi truy vấn ĐỌC phức tạp, tối ưu `select_related` / `prefetch_related` |
| `api/` | View DRF mỏng: kiểm tra input, gọi service / selector, trả serializer |
| `wagtail_hooks.py` | Đăng ký màn hình admin, menu, CSS |
| `tests/` | Test theo đúng cấu trúc trên |

Quy tắc:
- View và admin không viết truy vấn / logic trực tiếp.
- Model nền: TimeStamped, UserStamped (`stamp(actor)`), PublicId (UUID ra ngoài), Archivable
  (lưu trữ thay vì xoá; `objects` chỉ trả bản ghi còn hoạt động).
- Lịch sử thay đổi: revision của Wagtail cho nội dung, django-auditlog cho model thường.
- API công khai dưới `/api/v1/`, lỗi theo một định dạng `{"error": {code, message, details}}`.

## Môi trường
- Máy dev: SQLite, không Docker. CI và production: Postgres (`DATABASE_URL`).
- Settings tách `base / dev / test / prod`; prod fail-closed khi thiếu biến bắt buộc.
