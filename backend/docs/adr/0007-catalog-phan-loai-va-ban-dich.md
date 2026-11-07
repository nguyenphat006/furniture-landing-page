# 0007. Catalog: phân loại 2 cột tên, sản phẩm dịch bằng wagtail-localize

Trạng thái: chấp nhận (11/2026)

## Bối cảnh
Plan ban đầu để Nhóm / Loại / Chất liệu / Tính năng là snippet có bản dịch (TranslatableMixin).
Khi làm thì thấy: phân loại ít mục, dịch tay một lần, slug giống nhau ở mọi ngôn ngữ; nếu cho dịch
theo bản ghi thì mỗi mục thành 2 bản ghi, khoá ngoại và bộ lọc từ sản phẩm phải đổi theo ngôn ngữ.

## Quyết định
- Phân loại là model thường, có 2 cột `name` (vi) và `name_en`. API trả `name` theo `?locale=`.
- Product dùng TranslatableMixin + wagtail-localize. Chỉ `description` được dịch; tên mẫu, mã,
  slug, phân loại, quy cách, ảnh và món trong bộ là SynchronizedField (copy nguyên từ bản gốc).
- ProductImage và SetItem không dịch, được đồng bộ theo sản phẩm.
- Sản phẩm chưa có bản dịch đã xuất bản: API trả bản gốc với `is_fallback: true`.
- Slug duy nhất toàn site (mọi bản dịch cùng slug), khoá sau lần xuất bản đầu.

## Hệ quả
- Thêm ngôn ngữ thứ ba thì phải thêm cột tên cho phân loại (chấp nhận được, hiện chỉ vi / en).
- Backend tìm kiếm SQLite không hỗ trợ tìm theo cột cụ thể, nên admin tìm theo chỉ mục của model.
