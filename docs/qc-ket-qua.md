# Kết quả QC

Danh sách kiểm tra theo mục 12.2 của plan ([docs/cms-plan.md](cms-plan.md)). Mỗi lỗi có mức độ:
**P0** chặn lên PROD, **P1** sửa trước khi công bố rộng, **P2** để sau.
Vòng 1 chạy trên máy local (bản build production, bản standalone giống Docker). Vòng 2 chạy lại trên staging
khi có server.

## Tiến độ vòng 1 (local)

| Nhóm | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tự động | Xong 07/11 | Lỗi 1, 2 |
| Từng trang, 2 ngôn ngữ | Xong 07/11 | 302 trang: đủ `lang`, tiêu đề, mô tả, canonical, 1 thẻ h1; không link hỏng, không lộ khoá dịch |
| Form liên hệ | Xong 07/11 | 4 mục đích x 2 ngôn ngữ, báo lỗi, tệp hợp lệ / bị chặn, chống spam, email. EICAR trong PDF cần ClamAV (staging) |
| Luồng admin | Xong 07/11 | Sửa, xem trước, xuất bản, lịch sử, khôi phục, gỡ xuất bản cho trang, section, sản phẩm, phân loại, Cài đặt; khoá đăng nhập; màn Dịch |
| Dự phòng | Xong 09/11 | Lỗi 21. Tắt CMS ngay sau một lần xuất bản: mọi trang vẫn 200 với nội dung trước đó, đường dẫn sai vẫn 404; CMS chạy lại thì webhook làm mới bình thường. Webhook lỗi: dữ liệu tự làm mới sau tối đa 1 giờ. Ảnh từ CMS không tải được khi CMS tắt (ảnh nằm ở CMS) |
| SEO | Xong 07/11 | Lỗi 12, 13, 14 |
| Hiệu năng | Xong 09/11 (local) | Lighthouse mobile 75 đến 89 trước khi sửa (LCP 3,8 đến 7,7 s, CLS 0). Đo lại 09/11 sau lỗi 29 (nén ảnh): mobile 86 đến 92 (LCP 3,4 đến 4,2 s), desktop 99 đến 100, truy cập 97 đến 100, best practices 100, SEO 92 (chỉ do canonical trỏ domain thật khi chạy localhost). Đo lại trên staging |
| Giao diện | Xong 09/11 (local) | Lần cuối 09/11: 302 trang (151 vi + 151 en) x 360 / 768 / 1440 = 906 lượt, gửi đúng `Accept-Language` từng bản: không tràn ngang, không lỗi JS, không request lỗi. axe 19 trang x 2 khổ: sạch, trừ số lớn mờ ở /capabilities (trang trí, `aria-hidden`). Safari iOS và Android cần máy thật |
| Truy cập | Xong 07/11 | Lỗi 15 đến 18 |
| Bảo mật | Một phần | Chữ ký API, header, quyền admin, bí mật trong repo đạt. HTTPS, HSTS thực tế, 2FA chỉ kiểm được trên staging |
| Nội dung | Chờ BFC | B5: chỗ NULL, ảnh tạm, tên pháp lý tiếng Anh trống, duyệt 50 mẫu |
| Vận hành | Chờ staging | backup / khôi phục, deploy, quay lại bản trước |

## Lỗi

| # | Mức | Nhóm | Lỗi | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | P0 | Tự động | `npm audit`: Next 16.3.0 có lỗ hổng chạy mã từ xa (API tối ưu ảnh, `use cache`), SSRF, nhiễm độc cache; thêm zod, sharp, undici, nanoid, source-map-js. CLI `shadcn` nằm trong dependencies chạy production nên kéo theo nhiều thư viện lỗi | Sửa 07/11: next / eslint-config-next 16.4.3, zod 4.6.7, `shadcn` sang devDependencies, thư viện con cài với `--before` 2 tuần. `npm audit --omit=dev`: 0 lỗ hổng |
| 2 | P0 | Tự động (build standalone) | Đường dẫn chi tiết không tồn tại trả 500 thay vì 404 ở bản production: trang 404 lấy ngôn ngữ qua header trong trang dựng tĩnh theo yêu cầu | Sửa 07/11: bỏ `generateMetadata` của trang 404 |
| 3 | P0 | Luồng admin | Màn Dịch không lưu được chuỗi dịch nào (415): DRF chỉ nhận JSON, màn Dịch gửi multipart | Sửa 07/11: thêm FormParser, MultiPartParser; có test, chạy lại luồng dịch đạt |
| 4 | P1 | Form | Tệp sát 10 MB làm form hỏng không báo gì: proxy đệm body tối đa 10 MB | Sửa 07/11: `proxyClientMaxBodySize` 11 MB; form báo lỗi chung khi server action ném lỗi |
| 5 | P1 | Bảo mật | Lách giới hạn 5 lần/IP bằng `X-Forwarded-For` tự gửi | Sửa 07/11: Nginx ghi đè XFF bằng IP thật, web đọc `X-Real-IP` |
| 6 | P1 | Bảo mật | Domain web không có HSTS | Sửa 07/11: thêm ở Nginx cho web và www; kiểm lại trên staging |
| 7 | P1 | Tự động (CI) | Dựng OpenAPI schema truy vấn database, `check --deploy` / `spectacular` trên DB trống ra cảnh báo | Sửa 07/11: view giả của schema không truy vấn; có test |
| 8 | P2 | Form | Tên có xuống dòng gửi thẳng API làm email lỗi, API trả 500 | Sửa 07/11: gộp xuống dòng ở trường một dòng, bắt `BadHeaderError` |
| 9 | P2 | Form | Body quá giới hạn trả 500 thay vì 413 | Sửa 07/11 |
| 10 | P2 | Bảo mật | Header `X-Powered-By: Next.js`; axes sau Nginx chỉ thấy IP Nginx | Sửa 07/11: tắt header; axes đọc `X-Real-IP` ở prod |
| 11 | P2 | Form | Thỉnh thoảng lỗi mạng khi gọi CMS, yêu cầu bị mất | Sửa 07/11: thử lại 1 lần (CMS chặn gửi trùng); kiểm lại trên staging với gunicorn |
| 12 | P1 | Hiệu năng | Ảnh LCP tải lười; hero tải cả 4 slide; favicon PNG 2000px 407 KB; logo, ảnh nền CTA tải quá cỡ | Sửa 07/11: ảnh đầu trang ưu tiên, hero tải dần, quality 60 / 50, favicon 8 KB + apple-icon, `sizes` logo |
| 13 | P1 | SEO | 16 trang thiếu og:image; thiếu og:url, og:locale | Sửa 07/11: `pageLinks` cho mọi trang, ảnh dự phòng `public/og-default.jpg` |
| 14 | P2 | SEO | Sitemap chỉ một `<url>` mỗi trang, không x-default; ghi cả bản en noindex | Sửa 07/11: mỗi ngôn ngữ một `<url>`, x-default. Sửa lại 09/11: bản sửa đầu bỏ mọi sản phẩm en chưa dịch, trong khi trang chỉ noindex khi bản gốc có mô tả tiếng Việt; nay cùng điều kiện với trang (144 URL) |
| 15 | P1 | Truy cập | Tương phản thấp: nhãn chứng nhận footer, chữ phụ khối năng lực | Sửa 07/11 |
| 16 | P2 | Truy cập | Menu thả xuống: Tab không vào được panel; Esc ở menu mobile không trả focus | Sửa 07/11 |
| 17 | P2 | Truy cập | Cờ bản đồ không có vai trò, không có viền focus; tên link carousel vật liệu khác chữ hiển thị | Sửa 07/11 |
| 18 | P2 | Truy cập | Thẻ sản phẩm h3 ngay dưới h1; link chéo đầu footer ngoài vùng điều hướng | Sửa 07/11 |
| 19 | P2 | Giao diện | Trang danh sách sản phẩm tràn ngang ở 360px (hàng chip lọc) | Sửa 07/11 |
| 20 | P2 | Admin | Nút "gửi duyệt" thừa (một vai trò, xuất bản trực tiếp); trang khoá đăng nhập tiếng Anh chữ trơn | Sửa 07/11: tắt workflow, trang khoá tiếng Việt |
| 21 | P1 | Dự phòng | CMS sập sau một lần xuất bản thì mọi trang trả 500 tới khi CMS chạy lại: webhook cho dữ liệu hết hạn ngay (cần để trang đã gỡ không hiện mãi), lần dựng lại không còn dữ liệu cũ | Sửa 09/11: mỗi lần CMS trả lời thì web ghi bản JSON ra `.cms-fallback/` (ghi sẵn lúc build, Dockerfile chép vào image); CMS lỗi mạng / 5xx thì dùng bản này |
| 22 | P2 | Giao diện | Trang chủ tràn ngang (tài liệu rộng 5793px ở khổ 1440): chữ ẩn cho trình đọc màn hình thêm ở lỗi 17 nằm ngoài vùng cắt của carousel vật liệu | Sửa 09/11: tên vật liệu làm khung định vị (`relative`) |
| 23 | P2 | Form | Bộ lọc PDF bỏ sót mã chủ động khi tên viết bằng `#xx` (`/J#61vaScript`) hoặc nằm trong object stream nén | Sửa 09/11 ở cả web và CMS: giải mã `#xx`, giải nén object stream (giới hạn 20 MB, lỗi giải nén thì từ chối) |
| 24 | P2 | Form | Gửi lỗi (vd thiếu captcha) thì ô Quốc gia bị xoá, các ô khác còn | Sửa 09/11 |
| 25 | P2 | Email | Tiêu đề email cho nhân viên viết thường cả chữ viết tắt ("yêu cầu oEM") | Sửa 09/11: giữ nguyên khi hai chữ đầu viết hoa |
| 26 | P2 | Admin | Link nút nổi và link footer dạng `/\host` được nhận, trình duyệt mở sang web khác | Sửa 09/11: CMS chặn `\`, khoảng trắng, ký tự điều khiển; web bỏ link không hợp lệ (bản ghi cũ) |
| 27 | P2 | Admin | Nút nổi "Link khác" thiếu chữ tiếng Anh thì web tiếng Anh hiện chữ tiếng Việt | Sửa 09/11: bắt buộc nhập chữ tiếng Anh |
| 28 | P2 | Admin | Lịch sử thay đổi không ghi menu, nút nổi, link footer, mạng xã hội (bản ghi con trong Thông tin chung) | Sửa 09/11: đăng ký auditlog cho từng loại |
| 29 | P1 | Hiệu năng | Bản build standalone không nén ảnh: `/_next/image` trả nguyên PNG 477 KB (sharp không nạp được vì trace bỏ sót thư viện libvips cạnh file `.node`) | Sửa 09/11: `outputFileTracingIncludes` chép cả `node_modules/@img`; nay WebP 31 KB. Kiểm lại trên image Docker ở staging (Linux) |
| 30 | P1 | Giao diện | /contact bản tiếng Việt tràn ngang 7px ở 360 (nút "Đặt lịch thăm nhà máy" không xuống dòng, lưới không khai báo cột) | Sửa 09/11 |
| 31 | P1 | Truy cập | Chữ trắng trên nền gold ở /capabilities (khoảng 1,6:1); dòng mô tả trắng/85 trên nền forest 4,45:1 | Sửa 09/11: chữ ink trên gold, trắng/90. Số thứ tự nhỏ đổi `gold-ink`; số lớn giữ màu gold, đánh dấu trang trí (`aria-hidden`) vì thứ tự đã có trong `<ol>` |
| 32 | P2 | Giao diện | Hero 360: nút "Cuộn xuống" đè nút Slide 1 | Sửa 09/11: ẩn nút cuộn dưới sm |
| 33 | P2 | Truy cập | Menu mobile: Tab ra khỏi panel mà menu vẫn mở; tab nội dung sản phẩm thiếu kiểu viền focus; carousel tới cuối thì focus rơi về body; link VI/EN có tên đọc khác chữ hiện; chấm section 6px; không có link bỏ qua header | Sửa 09/11 (link "Bỏ qua, tới nội dung chính", `<main id="main">`) |
| 34 | P2 | SEO | 50 trang sản phẩm chưa có mô tả dùng chung một meta description | Sửa 09/11: ghép tên, mã, loại, chất liệu với câu OEM |
| 35 | P2 | Giao diện | Nút nổi che mép nội dung ở 360 đến 768 | Sửa 09/11: dưới 1024px thành thanh dính đáy màn hình (icon + chữ ngắn), chừa khoảng trống cuối trang để không che footer, nút lên đầu trang nằm trên thanh; từ 1024px giữ cột bên phải |
| 36 | P2 | SEO | Trang 404 server trả vỏ lỗi rỗng, nội dung chỉ hiện sau khi JS chạy (status 404 và noindex vẫn đúng) | Không sửa: hành vi của Next 16.4.3 với `notFound()` ở trang động. Đã thử hai app tối giản (layout gốc chuẩn `app/layout.tsx` và layout trong `[locale]`) đều cho cùng vỏ rỗng. Trang 404 không được index nên không ảnh hưởng SEO |
| 37 | P3 | SEO | Tiêu đề trang chủ 87 ký tự, mô tả 189 ký tự (Google cắt); mô tả nhóm sản phẩm 30 đến 49 ký tự; sitemap không có `lastmod` | Sửa 09/11: tiêu đề và mô tả mặc định rút gọn trong CMS (Cài đặt → Thông tin chung → SEO) và fixture, chỉ dùng chữ có sẵn (vi 56/143, en 52/150 ký tự; bản cũ: "BINH BFC - Nhà sản xuất nội thất ngoài trời tại Việt Nam \| Gỗ, Nhôm, Dây đan & Mây nhựa"); mô tả nhóm thêm câu chung về nơi sản xuất; API sản phẩm trả `updated` (ngày xuất bản), sitemap có `lastmod` cho trang sản phẩm |
| 38 | Ghi chú | Quét | Kiểm lại 09/11 sau khi sửa 21-34: bản tiếng Việt 151 URL ở 360 và 1440 (302 lượt, gửi `Accept-Language: vi`) không tràn ngang, không lỗi JS, không request lỗi | Đạt |

Câu hỏi treo: trình duyệt đặt tiếng Anh mở trang gốc bị chuyển 307 sang `/en` (next-intl tự nhận ngôn ngữ).
Giữ hay tắt: chờ quyết định.

## Đã đạt

- Backend `poe check`: ruff, mypy, migration, 184 test, coverage 98%.
- Kiểm lại 09/11 trên bản build mới: crawl 302 trang (chỉ còn NULL ở Chính sách bảo mật, nội dung B5); 22 ca chữ ký API và header đạt; tên có xuống dòng 201, body 13 MB 413; tệp sát 10 MB và 9 MB gửi qua form thật đạt; màn Dịch sửa, xuất bản, trả bản gốc đạt.
- `pip-audit`: không có lỗ hổng.
- Frontend: `tsc`, `eslint`, `prettier`, `next build` đạt.
- Bản standalone: `/`, `/en`, nhóm, vật liệu, chi tiết, Liên hệ, Chính sách bảo mật 200; đường dẫn sai 404; ảnh CMS
  qua tối ưu ảnh 200.
- Chữ ký API: webhook revalidate, draft, preview, API nhận yêu cầu đều từ chối request không ký, ký sai, quá hạn,
  body bị sửa.
- Chống spam: honeypot, gửi quá nhanh, gửi trùng, quá 3 lần mỗi email, quá 5 lần mỗi IP, nhiều link.
- Luồng admin: web đổi trong 0,1 đến 2 giây sau khi lưu / xuất bản; khôi phục và gỡ xuất bản đúng; audit ghi đúng
  người.

## Ghi chú

- Lúc build, Next dùng lại dữ liệu CMS trong `.next/cache` của lần build trước: build trên máy dev sau khi đổi
  API thì xoá `.next/cache/fetch-cache`. Docker build luôn sạch nên không ảnh hưởng server.
- Bản build production chạy trên máy dev với CMS ở 127.0.0.1: next.config mở `dangerouslyAllowLocalIP` khi
  CMS_API_URL là localhost, server thật dùng domain CMS công khai nên luôn tắt.
