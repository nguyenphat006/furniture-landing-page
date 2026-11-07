# components/archive

Kho các component **không còn hiển thị trên site** nhưng giữ lại để tái sử dụng (2026-11-06).
Các thư mục gốc (`features/*/components`, `components/shared`) chỉ chứa component đang dùng.

Quy ước:

- Ẩn một section = chuyển file vào đây (theo thư mục trang gốc), gỡ khỏi barrel `index.ts` của feature,
  để lại một dòng ghi chú trong page. Không xoá.
- Dùng lại = import thẳng từ `@/components/archive/<trang>/<file>` hoặc chuyển file về lại feature.
- File trong đây vẫn được tsc/eslint kiểm tra, nên phải luôn build được. Dữ liệu và messages vẫn
  nằm ở feature gốc (`@/features/home/data`, `@/features/capabilities/data`, messages/*.json).

## home (trước ở features/home/components)

| File                       | Component             | Ẩn từ      | Bố cục                                                                            |
| -------------------------- | --------------------- | ---------- | --------------------------------------------------------------------------------- |
| projects-section.tsx       | ProjectsSection       | 2026-11-05 | Carousel ảnh 16:10 kiểu ATC, tràn mép phải; đã thay bằng MaterialsShowcaseSection |
| stats-section.tsx          | StatsSection          | 2026-11-04 | Dải số liệu count-up (370 nhân sự, 28.000 m², 6 xưởng)                            |
| about-section.tsx          | AboutSection          | 2026-11-04 | Tiêu đề giữa, 2 cột văn, hàng số liệu kẻ viền                                     |
| capabilities-section.tsx   | CapabilitiesSection   | 2026-11-04 | Accordion ngang full-bleed 100svh, nhãn dọc                                       |
| materials-section.tsx      | MaterialsSection      | 2026-11-04 | Band theo vật liệu, slideshow prev/next                                           |
| process-section.tsx        | ProcessSection        | 2026-11-04 | Các bước từ yêu cầu tới container                                                 |
| certifications-section.tsx | CertificationsSection | 2026-11-04 | Chứng nhận (bản trang chủ)                                                        |
| factory-bento-section.tsx  | (bento)               | 2026-11-04 | Bento: 3 điểm tin cậy + ảnh lớn chữ đè + 2 ô nhỏ                                  |

## capabilities (trước ở features/capabilities/components)

| File                              | Component            | Bố cục                                                                   |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| exploded-chair.tsx + chair-3d.tsx | ExplodedChair        | Ghế 3D ghim giữa màn, tách bộ phận theo scroll                           |
| workshops-flow.tsx                | WorkshopsFlow        | Dòng chảy 6 xưởng, đường dọc chạy theo scroll; thay bằng WorkshopsScroll |
| surface-section.tsx               | SurfaceSection       | Xử lý bề mặt bản cũ; thay bằng SurfaceFinishSection                      |
| qc-section.tsx                    | QcSection            | QC nền kem full-screen; thay bằng QualitySection                         |
| inhouse-section.tsx               | InhouseSection       | Làm trong nhà máy và hạng mục mua ngoài                                  |
| process-detail-section.tsx        | ProcessDetailSection | Chi tiết quy trình                                                       |
| oem-section.tsx                   | OemSection           | OEM full-screen min-h 100dvh                                             |

## about (trước ở features/about/components)

| File               | Component          | Bố cục                                                                                      |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------- |
| values-section.tsx | AboutValuesSection | "Điều chúng tôi giữ": nền stone, 4 nguyên tắc 01-04; thay bằng HistoryTimeline (2026-11-06) |

## not-found (trước ở features/not-found)

| File                    | Component           | Bố cục                               |
| ----------------------- | ------------------- | ------------------------------------ |
| suggestions-section.tsx | NotFoundSuggestions | Gợi ý các trang chính dưới trang 404 |

## shared (trước ở components/shared)

| File          | Component | Ghi chú                                                                 |
| ------------- | --------- | ----------------------------------------------------------------------- |
| line-link.tsx | LineLink  | Link chữ + vạch; thôi dùng khi đồng nhất nút về ButtonLink (2026-11-05) |
| page-hero.tsx | PageHero  | Đầu trang ảnh nền lớn; thay bằng PageHeader                             |

## products (trước ở features/products/components)

| File              | Component    | Ẩn từ      | Bố cục                                                                                            |
| ----------------- | ------------ | ---------- | ------------------------------------------------------------------------------------------------- |
| category-grid.tsx | CategoryGrid | 2026-11-06 | Lưới 6 nhóm (ảnh bìa 4:3, tên, mô tả, loại, số mẫu); /products đổi sang hiện thẳng sản phẩm + lọc |
