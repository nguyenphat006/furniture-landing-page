# Làm mới design system: chữ, tương phản, chuyển động (2026-11-09)

Mục tiêu: site nhìn hiện đại, rõ nét và sinh động hơn mà không đổi màu thương hiệu, font hay bố cục.
Đã chốt qua brainstorming với mockup trong trình duyệt.

## 1. Chữ và tương phản (mức 2 "Vừa")

Font giữ Inter. Đổi ở token chung trong `frontend/src/app/globals.css`:

| Token | Cũ | Mới |
|---|---|---|
| `--color-ink` | #141414 | #111111 |
| `--color-ink-soft` | #444444 | #3d3d3d |
| `--color-ink-mute` | #6b6b6b | #555555 |
| `--color-line` | #e8e8e8 | #d9d9d9 |

- Tiêu đề section (`SectionHeading`), h1 hero và page header: 700. Tiêu đề in hoa dùng letter-spacing -0.01em (không -0.03em vì chữ in hoa có dấu dễ dính).
- Tiêu đề thẻ (h3/h4) 700; con số (stat) 700, letter-spacing -0.03em.
- Eyebrow: 700, vạch trước 2px x 32px.
- Link chữ (`ArrowLink`, `CardAction`): 600.

## 2. Chuyển động (mức "vừa phải", mẫu A "Tinh tế")

Token: `--reveal-distance: 16px`, `--duration-reveal: 700ms`, ease `--ease-out-soft`.

Cơ chế:
- Phần tử gắn `data-reveal="<kiểu>"`. Một client component `RevealObserver` trong layout locale dùng một IntersectionObserver (rootMargin đáy -15%) gắn `data-shown` khi vào màn hình, chỉ một lần. MutationObserver bắt phần tử mới sau khi chuyển trang.
- Trạng thái ẩn chỉ áp dụng khi `<html>` có class `js` (script inline trong head) và không bật `prefers-reduced-motion`. Không JS, bot, reduced-motion: nội dung hiện ngay, đứng yên.
- Phần tử đã nằm trong màn hình lúc tải vẫn chạy hiệu ứng ngay (observer báo lần đầu).

Kiểu:
- `heading`: vạch eyebrow scaleX 0→1, tiêu đề trượt lên + hiện, mô tả và action trễ 0,15s. Gắn sẵn trong `SectionHeading`.
- `fade-up`: opacity 0→1, translateY 16px→0.
- `stagger`: con trực tiếp hiện lần lượt cách 80ms (tối đa 6 bậc, con sau đó cùng bậc 6).
- `image`: ảnh trong khung scale 1,06→1. Gắn sẵn trong `ImagePlaceholder` (khi có ảnh thật).

Hover: ảnh trong thẻ có link (`group`) scale 1,04, 420ms, đặt trong `ImagePlaceholder` qua `group-hover`.

Số đếm: dùng `CountUp` có sẵn cho số liệu tĩnh hiện có; không thêm số mới.

Hero: lúc tải trang, các dòng tiêu đề trượt lên lần lượt, sau đó mô tả và nút hiện dần (motion, đã là client). Không áp dụng `data-reveal` cho hero, ảnh hero vẫn tải ưu tiên. Reduced-motion: đứng yên.

## 3. Phạm vi

Áp dụng: trang chủ, giới thiệu, năng lực, sản phẩm (danh sách, danh mục, chi tiết), vật liệu, liên hệ.
Header, footer, form, trang pháp lý: chỉ ăn theo token chữ. Không đụng `components/archive`.
Không làm: parallax, scroll story, đổi màu thương hiệu, đổi bố cục, đổi font.

## 4. Kiểm tra

- tsc, eslint, prettier.
- Build, chạy standalone cổng 4200; quét các trang vi/en x 360/768/1440: không tràn ngang, không phần tử `data-reveal` nào còn ẩn sau khi cuộn hết trang.
- Lighthouse mobile không dưới 86; axe tương phản sạch (trừ ngoại lệ đã biết).
- Thử reduced-motion và tắt JS: nội dung hiện đầy đủ.
- Ảnh chụp trước/sau cho user xem.

## 5. Các bước làm

1. Token màu + chữ (globals.css), SectionHeading, page header, hero h1, ArrowLink, CardAction, tiêu đề thẻ, stat.
2. CSS reveal + script class `js` + `RevealObserver` trong layout.
3. Gắn `heading` (SectionHeading), `image` + hover (ImagePlaceholder), `fade-up`/`stagger` cho khối nội dung và lưới thẻ từng trang.
4. Hero text transition; CountUp cho số liệu.
5. Kiểm tra như mục 4, chụp trước/sau.
