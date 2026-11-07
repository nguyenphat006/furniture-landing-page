# Kết quả QC

Danh sách kiểm tra theo mục 12.2 của plan ([docs/cms-plan.md](cms-plan.md)). Mỗi lỗi có mức độ:
**P0** chặn lên PROD, **P1** sửa trước khi công bố rộng, **P2** để sau.
Vòng 1 chạy trên máy local (bản build production, bản standalone giống Docker). Vòng 2 chạy lại trên staging
khi có server.

## Tiến độ vòng 1 (local)

| Nhóm | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tự động | Xong 07/11 | 2 lỗi P0 đã sửa (dưới đây) |
| Từng trang, 2 ngôn ngữ | Chưa | |
| Form liên hệ | Chưa | |
| Luồng admin | Chưa | |
| Dự phòng | Chưa | |
| SEO | Chưa | |
| Hiệu năng | Chưa | Lighthouse trên bản build local, đo lại trên staging |
| Giao diện | Chưa | Bề ngang 360 / 768 / 1024 / 1440; Safari iOS và Android cần máy thật |
| Truy cập | Chưa | |
| Bảo mật | Một phần | HTTPS, HSTS, 2FA chỉ kiểm được trên staging |
| Nội dung | Chờ BFC | B5: chỗ NULL, ảnh tạm, duyệt 50 mẫu |
| Vận hành | Chờ staging | backup / khôi phục, deploy, quay lại bản trước |

## Lỗi

| # | Mức | Nhóm | Lỗi | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | P0 | Tự động | `npm audit`: Next 16.3.0 có lỗ hổng chạy mã từ xa (API tối ưu ảnh, `use cache`), SSRF, nhiễm độc cache; thêm zod, sharp, undici, nanoid, source-map-js. CLI `shadcn` nằm trong dependencies chạy production nên kéo theo nhiều thư viện lỗi | Sửa 07/11: next / eslint-config-next 16.4.3, zod 4.6.7, `shadcn` sang devDependencies, thư viện con cài với `--before` 2 tuần. `npm audit --omit=dev`: 0 lỗ hổng |
| 2 | P0 | Tự động (build standalone) | Đường dẫn chi tiết không tồn tại (sản phẩm, nhóm, vật liệu đã xoá hoặc gõ sai) trả 500 thay vì 404 ở bản production: trang 404 lấy ngôn ngữ qua header trong trang dựng tĩnh theo yêu cầu. Google sẽ coi là lỗi server thay vì trang đã gỡ | Sửa 07/11: bỏ `generateMetadata` của trang 404 (tiêu đề tab dùng tiêu đề mặc định) |

## Đã đạt

- Backend `poe check`: ruff, mypy, migration, 174 test, coverage 98%. `check --deploy` sạch trên CI.
- `pip-audit`: không có lỗ hổng.
- Frontend: `tsc`, `eslint`, `prettier`, `next build` (153 trang dựng sẵn) đạt.
- Bản standalone: `/`, `/en`, nhóm, vật liệu, chi tiết, Liên hệ, Chính sách bảo mật 200; đường dẫn sai 404.

## Ghi chú

- Lúc build, Next dùng lại dữ liệu CMS trong `.next/cache` của lần build trước: build trên máy dev sau khi đổi
  API thì xoá `.next/cache/fetch-cache`. Docker build luôn sạch nên không ảnh hưởng server.
