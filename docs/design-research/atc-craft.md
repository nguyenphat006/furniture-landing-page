# Phân tích UI/UX: atc-craft.com (ATC Furniture)

> Mục đích: rút ra pattern UI/UX để học hỏi cho landing page BFC. **Không** sao chép logo, ảnh, copy hay nhận diện thương hiệu của ATC.
>
> Quy ước nhãn trong tài liệu:
> - **[QS]** Quan sát: có dẫn chứng trực tiếp từ HTML/CSS/JS/HTTP header đã tải về.
> - **[SL]** Suy luận: rút ra từ code, chưa quan sát bằng mắt trên trình duyệt.
> - **[CXĐ]** Chưa xác định: không đủ dữ liệu để kết luận.
>
> **Lưu ý quan trọng:** mục 1–9 ban đầu được thực hiện bằng `curl` (không chụp màn hình, không chạy JS). Mọi nhận định về hình ảnh, bố cục, chuyển động trong các mục đó đều được **suy ra từ HTML/CSS/JS**, không quan sát trực tiếp.
>
> **Bổ sung runtime (mục 10, 9.3):** Quan sát runtime bằng REA ngày 2026-11-04, viewport 1424×805 desktop; chưa xem mobile. 25 trang/trạng thái đã chụp bằng Chrome qua CDP, ảnh nằm ở `screenshots/atc/`. Chỗ nào ảnh chụp chứng minh nhận định tĩnh sai, tài liệu ghi **"(đã đính chính theo ảnh chụp)"** ngay tại chỗ và tổng hợp ở mục 10.5.

---

## 1. Tổng quan

| Hạng mục | Nội dung |
|---|---|
| Ngày phân tích | 2026-11-04 |
| Doanh nghiệp | ATC Furniture, nhà sản xuất & bán sỉ nội thất ngoài trời (mây nhựa/wicker, gỗ teak, lục bình) tại Việt Nam |
| Định vị [QS] | Title trang chủ: "Outdoor Patio Furniture Manufacturer For Wholesalers"; nhấn mạnh xuất khẩu 45+ quốc gia, nhà máy 30.000 m², thành lập 2006 |
| Đối tượng [SL] | Nhà bán sỉ/nhập khẩu quốc tế, chủ đầu tư resort/khách sạn/F&B (danh sách dự án toàn hospitality & chuỗi cà phê) |
| Nền tảng [QS] | PHP 8.2 (`x-powered-by: PHP/8.2.35`), cookie `XSRF-TOKEN` + `atc_session` → **Laravel** (CMS tự viết, không phải WordPress/Shopify). Hosting Hostinger + LiteSpeed, CDN Cloudflare |
| Front-end [QS] | Không framework SPA. `template/js/common.js` (192 KB, bundle GSAP 3.12.5 + ScrollTrigger + Splitting.js + lớp smooth scroll tự viết `smoothScrolling`), `template/js/app.js` (35 KB, logic trang), `template/css/app.css` (29 KB) + **~142 KB CSS inline** trong `<head>` |
| Tracking [QS] | Google Tag Manager; Termly consent ("Consent Preferences" ở footer) |
| Đa ngôn ngữ [QS] | EN (mặc định, `/`) và VI (`/vi/`), `hreflang` vi/en/x-default; slug được dịch (`/products/wicker-furniture/sofa-sets/` ↔ `/san-pham/bo-suu-tap-may-dan/bo-sofa-ngoai-troi/`) |

**Tóm tắt nhận diện thị giác [SL]:** phong cách "editorial tối giản": nền trắng, chữ xám than, một màu nhấn vàng đồng duy nhất, tiêu đề section in hoa rất lớn nhưng nét mảnh (Montserrat weight 100), hình ảnh và video chiếm phần lớn diện tích, gần như không có button đặc (solid button).

> (đã đính chính theo ảnh chụp) Tiêu đề không phải lúc nào cũng mảnh: H1 trang con mảnh (weight 200) và tiêu đề section mảnh (weight 100), nhưng tiêu đề khối nội dung lại **đậm** (700, ví dụ "ATC FURNITURE STORY", "INTEGRITY", "Charity Contributions"). Button đặc có xuất hiện, nhưng chỉ ở form: nút pill xám `GET CATALOGUE`, `SEND INFO` (radius 3rem). Ngoài form, CTA vẫn là link chữ hoặc nút viền.

---

## 2. Information architecture & navigation

### 2.1 Sitemap (từ menu, footer, link nội bộ) [QS]

```
Home
├── Our Story (dropdown)
│   ├── About Us · Milestone · Activities · Core Values · Sustainability · Partners
├── Products (mega dropdown + nút "Filter")
│   ├── Wicker Furniture → Sofa Sets, Dining Sets, Bistro & Bar Sets, Sunbeds, Swing Chairs, Parasol & Others
│   ├── Teak Furniture   → Teak Sofas, Teak Chairs, Teak Loungers
│   └── Hyacinth Furniture → Sofa, Dining & Cafe, Decoration
│       └── Chi tiết sản phẩm: /products/{nhóm}/{loại}/{tên}-en/
├── Catalogue (form nhận catalogue, lead magnet)
├── Why choose ATC → 8 trang lý do (In-house Production, 3-year warranty, 45+ Countries, ...)
├── Showroom
├── Company Insights (dropdown) → Factory Visit · Exhibition · Projects
│   └── Projects → 24 dự án → trang chi tiết /{ten-du-an}-en/
├── News & Views (dropdown) → Company's News · Product's videos
├── Jobs & Career
├── Contact → /thank-you/
└── Footer-only: Terms & Conditions, Factory Gallery, Consent Preferences, Search result
```

Nhận xét [SL]: 3 tầng tối đa (nhóm vật liệu → loại sản phẩm → sản phẩm). Nhóm sản phẩm theo **vật liệu trước, công năng sau**, gần giống IA của BFC (Materials + Products).

### 2.2 Header [QS: `inline.css`, `home.html`]

- `position: fixed`, chồng lên hero (chữ trắng). Logo **căn giữa tuyệt đối** (`.logo{width:12rem;left:calc(50% - 6rem);top:1rem}`).
- Bố cục đối xứng: **hamburger** cố định góc trái (`.nav-click{left:2rem;top:2rem}`), nhóm link trái (Products · Showroom · Projects, `text-transform:uppercase`), nhóm link phải (Our Story · Catalogue · Contact) + icon search + switch ngôn ngữ VI/EN.
- Khi cuộn: class `.header.hide` đổi chữ sang đen, kéo link lên `top:.5rem` (header "co lại") [QS]; trang có hero sáng dùng `.top-black` để chữ đen ngay từ đầu [QS].
- Search: nút icon mở overlay form (`.search-form` + `.overlay-search`) [QS].
- Hover link: hiệu ứng "text roll": chữ gốc trượt lên, bản sao màu nhấn trượt từ dưới lên (`.hover-text .inner .hover{transform:translateY(calc(100% + 1rem));transition:transform .3s}`) [QS].

### 2.3 Menu fullscreen [QS]

- `.navigation{position:fixed;width:100%;height:100%;transform:translateY(100%)}` → `.show{transform:none}`: menu **trượt từ dưới lên** phủ toàn màn hình.
- Danh sách `.main-menu{width:20vw}` căn phải, mỗi `li` fade-in bằng GSAP (`gsap.to(".main-menu li",{duration:.3,opacity:1})`), chữ menu được Splitting tách theo ký tự (`Splitting({target:".nav-item .normal",by:"chars"})`) → [SL] chữ hiện lần lượt từng ký tự.
- Mục có con là `<button>` mở `.sub-menu-drop` (accordion/panel); Products có các nhóm `head-menu` in hoa + `group-sub` 3 mục/nhóm, kèm lối tắt "Filter".
- Menu chứa nhiều mục hơn header (Why choose, Company Insights, News, Jobs): **header = lối tắt ưu tiên, menu = sitemap đầy đủ**.
- (đã đính chính theo ảnh chụp, `screenshots/atc/menu-00.png`) Khi mở ra, menu **không phủ kín màn hình bằng một nền đặc**. Nó gồm một **panel trắng bên trái** (~30% chiều rộng, nút X ở góc trên trái) chứa cấp 1 căn phải, cỡ ~20px weight 300, mục đang ở có màu vàng đồng, mục có con có chevron `›`. Bên cạnh là một **cột cấp 2 nền xám đậm** (~20% rộng, chữ trắng 16px weight 500, mục active màu vàng đồng). Phần trang còn lại phía sau bị **làm mờ (blur) và phủ trắng**. Ảnh tĩnh không cho thấy hướng chuyển động trượt; [CXĐ] hướng "từ dưới lên" vẫn chỉ suy ra từ CSS.

### 2.4 Footer [QS]

Bổ sung theo ảnh chụp: logo vàng đồng lớn nằm bên trái, góc phải có huy hiệu tròn "ATC FURNITURE ↑" để về đầu trang, và dải copyright nền `#e3e3e3` ở đáy. Trên trang **Contact**, footer **bỏ khối logo/địa chỉ** (vì nội dung đã có trong trang), chỉ còn icon mạng xã hội và hàng link (`contact-01.png`).

Footer gọn, nền trắng, `font-size:.9rem`: logo, khối thông tin (địa chỉ văn phòng + nhà máy, điện thoại, WhatsApp, email có icon), hàng link phụ (Terms, News, Consent, Factory Gallery), icon mạng xã hội (Facebook, Zalo, Instagram, YouTube, Pinterest), copyright. **Không** có sitemap cột, newsletter hay CTA lớn trong footer.

---

## 3. Design tokens

Nguồn: CSS inline trong `<head>` của `https://atc-craft.com/` (khối `<style>` ~142 KB, đồng thời là CSS chính) và `https://atc-craft.com/template/css/app.css?ver=1.1.1` (29 KB, chủ yếu keyframes/animation và hover).

### 3.1 Typography [QS]

| Token | Giá trị | Ghi chú |
|---|---|---|
| Font | `Montserrat, sans-serif` (Google Fonts, variable `wght 100..900`, có italic) | Nạp trễ qua `<noscript id="deferred-styles">` + JS |
| Body | `font-weight:300`, màu `--color-black` (#323232) | Body mảnh |
| Root font-size | `html{font-size:1vw}` → 1.1vw (≤1800) → 1.15vw (≤1500) → 1.2vw (≤1300) → 1.3vw (≤1200) → **18px** (≤1100) → 17px → 16px (≤380) | Toàn bộ `rem` co giãn theo viewport ở desktop (fluid scale) |
| Thang tiêu đề (biến) | `--titleMax:8vw`, `--titlePresent:6vw`, `--titleBig:5vw`, `--titleFont:4vw`, `--titleMedium:3.5vw`, `--titleSmall:3vw`, `--titleMin:2vw` | Đơn vị vw |
| H2 section | `.text-ani-item .text-inner{font-size:var(--titleFont);font-weight:100}`, in hoa | Rất lớn, rất mảnh |
| H1 trang con | `.section-title .title-page .text-inner{font-size:var(--titleSmall);font-weight:200}` | |
| Tiêu đề nhỏ | `.small-font .text-inner{font-size:2rem;weight 400}` (1.6/1.3rem ở mobile) | Dùng cho H1 sản phẩm, "Related Products" |
| Quote | `.text-quote p{font-size:2rem}` + icon ngoặc kép | |
| Cỡ chữ phổ biến | `.8rem` (29 lần), `1.2rem`, `1rem`, `1.5rem`, `.9rem`, `.7rem`, `2rem` | |
| Link "View more" | `.6rem`, in hoa, weight 400–700 | Micro-label |
| Line-height | 1.4 (phổ biến nhất), 1.6, 1.2 cho tiêu đề | |
| Weight dùng | 400, 700, 600, 500, 300, 100 | |
| **Đo runtime @1424px** | root `16.376px` (=1.15vw); H1 trang con hiển thị (`.text-inner`) **42.7px/200 in hoa**, màu `#58595b`; tiêu đề section trang chủ ("VIDEOS") **42.7px/100**; tiêu đề section trang con ("VISION", "ATC FURNITURE") **57px/100**; tiêu đề khối nội dung 23–29px/**700**; quote 24px/300; body 16.4px/300, line-height 1.6; micro-link 13px/400–500; breadcrumb 9.8px/700 in hoa | Đo bằng `getComputedStyle` trên phần tử hiển thị. Thẻ `H2` SEO ẩn đo ra 25px/700 nên không phản ánh chữ người dùng thấy |

### 3.2 Màu [QS: biến `:root`, đếm số lần dùng `var()`]

| Biến | Hex | Vai trò (suy từ tần suất) | Số lần dùng |
|---|---|---|---|
| `--color-highlight` | `#c0995d` | Màu nhấn duy nhất: hover link, filter đang chọn, chữ nhấn | 87 |
| `--color-white` | `#fff` | Nền chính, chữ trên ảnh | 84 |
| `--color-black-alpha-01` | `rgba(0,0,0,.1)` | Shadow, đường kẻ | 35 |
| `--color-white-grey` | `#f6f6f6` | Nền phụ | 30 |
| `--color-normal` | `#858585` | Chữ phụ | 26 |
| `--color-grey` | `#999` | Chữ mờ | 18 |
| `--color-black` | `#323232` | Chữ chính (không dùng đen tuyệt đối) | 13 |
| `--color-normal-dark` | `#58595b` | Link, menu | 13 |
| `--color-grey-light` | `#e3e3e3` | Nền ô Core Values | 8 |
| `--color-red` | `#c25757` | Lỗi form, dấu * | 7 |
| Khác | `#f1f0e8` (bg be), `#1a3789`, `#ebebeb` | Ít dùng | ≤3 |

Gradient: `--black-gradient-01/02` (đen 40% → trong suốt) phủ trên/dưới hero bằng `mix-blend-mode:multiply` để chữ trắng đọc được trên video [QS].

### 3.3 Spacing, layout, radius, shadow [QS]

| Nhóm | Giá trị |
|---|---|
| Gutter ngang | `padding:0 5vw` (19 lần), khối nội dung `5vw` |
| Khoảng cách section | `padding:5vw 0` (19 lần), `8vw 0` (11 lần) |
| Container văn bản | `.wrap-content{width:70%;max-width:50rem}` (đọc thoải mái); `max-width` khác: 65rem, 75rem, 80rem |
| Section media | `.wrap-full` full-bleed (chỉ có gutter 5vw) |
| Breakpoints | Chính: **1100px** (desktop ↔ tablet/mobile, đổi ảnh `<picture>`), phụ: 1800/1500/1300/1200, 900/840/780/740/680/620/580/440/380; có `(hover:hover) and (pointer:fine)` và `(orientation:portrait/landscape)` |
| Border-radius | Chủ yếu `50%` (nút tròn, icon); `.3rem` nhỏ; ảnh/thẻ **không bo** [SL từ việc không có radius trên `.pic-cover`]. (đã đính chính theo ảnh chụp) Ảnh đúng là không bo, nhưng **thẻ nội dung có bo**: khối intro trang chủ chỉ bo **một góc trên phải** (`border-radius: 0 3rem` ≈ 49px), thẻ USP ở Why choose bo lớn (~2rem), card form Contact bo `1rem` (16px), nút submit dạng pill (`3rem`). Đo bằng `getComputedStyle` toàn trang: `50%` 73 lần, `49.128px` 1–2 lần, `16.376px` 1 lần, `4.9128px` 1–2 lần |
| Shadow | Một shadow chuẩn: `0 1rem 1rem 0 rgba(0,0,0,.1)` (31 lần qua 2 file), biến thể `.2` alpha |
| Aspect ratio ảnh | 14/9 (thẻ sản phẩm/dự án/video), 16/9 (video), 13/9, 3/4 (banner dự án dọc trên mobile portrait) |

### 3.4 Motion [QS]

| Hạng mục | Giá trị |
|---|---|
| Transition chuẩn | `all .3s ease-in-out` (41 lần), `opacity .3s/.5s ease-in-out` |
| Easing đặc biệt | `cubic-bezier(.5,.5,.3,1)`, `(.83,.31,.2,.9)`, `(.25,1,.5,1)`, `(.5,0,0,1.25)` (overshoot) |
| Keyframes (app.css) | `Start, Preloader, Rotate, fadeIn/Out, fadeInDown/Up, toLeft/Right, goLeft/Right, scaleBlur, scaleLarge, blurOut, StrokeLine, ClipPath, HorRight, aniWidth/Height`… |
| Thư viện | GSAP 3.12.5 + ScrollTrigger, Splitting.js (tách chữ theo chars/words), smooth scroll tự viết (`smoothScrolling` có `lerp/damp`, [SL] kiến trúc giống Lenis), IntersectionObserver |
| Slider | Tự viết (`.slidebox`, `.slidebox-track`, `.slidebox-item.is-active`), không dùng Swiper/Slick |

---

## 4. Trang chủ: phân tích từng section (theo thứ tự DOM)

| # | Section (class) | Mục đích | Bố cục & nội dung [QS] | Tương tác |
|---|---|---|---|---|
| 0 | Preloader `.mask.loader` | Che FOUC khi tải font/CSS trễ | Tạo bằng JS, ẩn sau ~0.7–1s ở trang chủ | [QS] `Done()` thêm class `hide` rồi remove |
| 1 | Hero `.banner` | Gây ấn tượng, cho thấy quy mô/không gian | **Video nền** full-width, `height:100vh; max-height:calc(1125/2000*100vw)` (tỉ lệ 16:9), autoplay muted loop playsinline; file riêng cho mobile (`data-mobile`). H1 SEO nằm trong `.title-page` đặt tuyệt đối gần đáy hero, chữ trắng in hoa. **(đã đính chính theo ảnh chụp, `home-00.png`)** Ở viewport 1424×805 không thấy H1 nào trên hero. Chỉ có video full-bleed, header trắng và một **huy hiệu tròn ~80px ở góc dưới phải**, chữ "ATC FURNITURE" chạy vòng quanh mũi tên ↓ (scroll cue). Footer dùng lại huy hiệu này làm nút về đầu trang (mũi tên ↑) | Gradient trên/dưới; header trắng chồng lên. Xác nhận bằng ảnh: hero **không có CTA** |
| 2 | Intro `.intro-home` | Câu chuyện thương hiệu ngắn | Cột trái: trích dẫn lớn (2rem) có icon ngoặc kép; cột phải: H2 "… STORY", 1 đoạn văn (năm thành lập, diện tích nhà máy, số nước xuất khẩu), link "Learn More". **(đã đính chính theo ảnh chụp)** Không chia 2 cột: các khối **xếp dọc** trong container ~820px căn giữa. Trên cùng là trích dẫn 24px/300 có icon ngoặc kép. Bên dưới là **một card nền `#ebebeb` bo góc trên phải ~3rem**, trong đó có H2 đậm 29px/700 và đoạn văn thụt vào. Link "LEARN MORE" là chữ 11px đậm kèm **vòng tròn viền ~80px có chevron** | Fade-in khi cuộn (`.ani-item`), tiêu đề tách chữ |
| 3 | Videos `.video-home` | Chứng minh năng lực (nhà máy, showroom) | Tiêu đề căn giữa; carousel 3 thẻ ảnh (Factory, 2 showroom), tiêu đề thẻ đè lên ảnh | Thẻ không active `opacity:.5`; thẻ active lộ ra bằng `clip-path:inset(0 0 0 0)` (từ `inset(0 0 20% 0)`); click mở popup video (`view-video.html?id=…`, mp4 hoặc YouTube) |
| 4 | Collection `.colection-home` | Dẫn vào danh mục | Carousel thẻ danh mục (`.product-item{width:39vw}`, ~2.5 thẻ/màn hình) gồm ảnh, H3, đoạn mô tả, "View more" | Hover: ảnh `filter:contrast(110%) grayscale(.3)`, chữ link đổi màu nhấn; clip-path reveal cho thẻ active |
| 5 | Our Projects `.project-home` | Social proof bằng dự án thật | Carousel 5 dự án (resort, khách sạn, căn hộ), ảnh + tên + "Discover" | Giống Collection |
| 6 | Catalogue `.catalogue-home` | **Thu lead** | 2 cột: ảnh bìa catalogue 60% + khối 40% căn phải ("Get inspired", nút viền `RECEIVE CATALOGUE`) | Nút outline `border:1px solid currentColor; padding:.8rem 3rem`; dẫn sang form |
| 7 | Core Values `.value-home` | Củng cố niềm tin | 4 ô vuông nền `#e3e3e3`, mỗi ô 25vw, cách nhau 1px; icon SVG + tiêu đề in hoa + đoạn văn | Tĩnh |
| 8 | Footer | Liên hệ | Xem mục 2.4 | Hover text roll |

Nhận xét [SL]: nhịp trang chủ là **ảnh/video → chữ → carousel → carousel → carousel → lead magnet → giá trị**. Toàn trang chỉ có 1 điểm chuyển đổi rõ (Catalogue); không có số liệu thống kê dạng counter, testimonial, logo khách hàng, hay form liên hệ.

---

## 5. Các template trang con

### 5.1 Trang "Products" (tổng danh mục) `/products/` [QS]
- H1 lớn + **sidebar filter dính** (`.filter-product{position:sticky;top:4rem;width:14rem}`) với các nhóm: Category, Type, Material (HDPE Rattan, Bamboo Wicker, Teak, Acacia…), Fabric Color; nút "Clear Filters".
- Lưới 3 cột (`calc(33% - 1rem)`), ban đầu hiển thị 3 thẻ nhóm vật liệu; chọn filter thì **tải kết quả bằng AJAX** (XMLHttpRequest, fade GSAP 0.4s) vào `.load-product`. [SL] URL không đổi theo filter → không chia sẻ/bookmark được kết quả.
- Cuối trang: khối nội dung SEO dài (nhiều H2/H3) bị thu gọn, có nút "view more" mở rộng (`aria-expanded`).

### 5.2 Trang danh mục cấp 2/3 `/products/wicker-furniture/sofa-sets/` [QS]
- H1 + breadcrumb (icon home › Products › nhóm › loại).
- Lưới **40 sản phẩm** trên một trang, không phân trang; thẻ: ảnh 14/9, tên in hoa (H3), loại (H4 "Outdoor Sofa Set"), "More Details". Cả thẻ click được.
- Khối bài viết SEO dài (dạng hướng dẫn mua sỉ, FAQ "How do I choose…") ẩn sau nút mở rộng.

### 5.3 Chi tiết sản phẩm `/products/…/bora-en/` [QS]
- Bố cục 2 cột: trái ảnh lớn + nút "All Photos" (mở album popup); phải H1 tên sản phẩm + **accordion 5 tab**:
  1. DESCRIPTION (mã sản phẩm, vật liệu)
  2. SPECIFICATIONS: kích thước từng món, **Net/Gross weight, Volume (CBM)**
  3. FEATURES: vật liệu, số món, sức chứa, độ bền, **"Shipment: 22 sets / 40'HQ"**, tổng CBM
  4. VIDEO (mp4 `preload="none"`)
  5. 2D MEASUREMENTS (bản vẽ kích thước dạng ảnh)
  - (đã đính chính theo ảnh chụp, `product-detail-00.png`) Chỉ thấy **4 tab accordion**: SPECIFICATIONS (mở sẵn), FEATURES, VIDEO, 2D MEASUREMENTS. Phần "description" không phải tab mà là một đoạn văn 15px nằm ngay dưới H1. H1 là tên sản phẩm in hoa **màu vàng đồng, 33px weight 400**. Ảnh chính chiếm ~41% chiều rộng bên trái, link "All Photos" có icon xếp chồng nằm dưới ảnh. Breadcrumb có nền `#f6f6f6`, dính dưới header, và mục cuối (tên sản phẩm) **chạy chữ kiểu marquee** ("• BORA •").
- Carousel "Related Products" (10 sản phẩm cùng loại).
- **Không có CTA hỏi giá / inquiry / thêm vào danh sách báo giá** trên trang chi tiết (grep `inquir|quote|request` chỉ trúng CSS).
- Schema: Organization, WebSite, BreadcrumbList (cấu trúc mảng lồng sai chuẩn, chỉ 2 cấp, URL `/bora-en/` không khớp URL thật). Không có schema `Product`.

### 5.4 Danh sách dự án `/projects/` và chi tiết [QS]
- Danh sách: lưới 2 cột (`.wrap-project-list .project-item{width:calc(50% - 1rem)}`), 24 dự án, chỉ ảnh + tên. Không filter theo loại hình/quốc gia.
- Chi tiết: H1, ảnh banner lớn (16/9 ngang, 3/4 khi mobile portrait), sau đó **chuỗi ~13 ảnh** trong lưới (`.load-text.align-grid`), kết thúc bằng điều hướng "Return to List" / "Next Project".
- **Không có** mô tả dự án (địa điểm, quy mô, sản phẩm đã cung cấp, thời gian), alt ảnh là tên file (`02.webp`).
- (đã đính chính theo ảnh chụp, `projects-02.png`, `project-detail-02.png`) Trang danh sách ban đầu **chỉ hiện 6 dự án**. Bên dưới có pill viền "**18 POSTS LEFT**" và nút tròn "VIEW MORE" để tải thêm; 24 dự án chỉ có đủ trong DOM. Trang chi tiết **không phải lưới ảnh đều**: banner full-width (khoảng 1280px), rồi nền đổi sang `#f6f6f6`. Từ đó là **chuỗi ảnh so le trái/phải**, mỗi ảnh rộng ~63%, phía đối diện có **vòng tròn viền mảnh đánh số "01", "02"…** (chữ xám đậm 700). Ảnh cao 598px, cách nhau ~140px.

### 5.5 About Us [QS]
- H1 + trích dẫn sứ mệnh + đoạn giới thiệu; khối 2 cột so le (`.box-left.minus-y` / `.box-right.plus-y`) [SL] tạo lệch dọc/parallax nhẹ; câu chuyện gia đình, làng nghề; giá trị cốt lõi; video nhúng.
- Các trang con tách riêng: Milestone, Activities, Core Values, Sustainability, Partners.
- (đã đính chính theo ảnh chụp, `about-03.png`) Trang About **không có sidebar dọc**. Các trang con được nối với nhau bằng một **thanh nav ngang nền `#f6f6f6` đặt ở cuối trang, ngay trên footer** (`section.sub-append`), mục đang xem tô vàng đồng. Bố cục About thực tế là: trích dẫn sứ mệnh, rồi 2 cột (văn bản trái, **ảnh 3 nhà sáng lập xử lý hiệu ứng vẽ chì** bên phải), rồi khối nền `#ebebeb` chứa video nhà máy có điều khiển.

### 5.6 Why choose ATC [QS]
- Lưới 8 ô (2 hàng × 4): icon SVG + H2 ngắn (USP) + H3 diễn giải 1 câu + link "View" sang trang chi tiết riêng cho từng USP (bảo hành 3 năm, 45+ nước, đối tác vải, 300+ mẫu showroom, hỗ trợ đa ngôn ngữ…).
- (đã đính chính theo ảnh chụp, `why-choose-00.png`) Các ô **không thẳng hàng như một lưới cứng**. Đây là 4 cột thẻ **so le theo chiều dọc kiểu masonry**: cột 2 và 4 cao hơn hoặc lệch lên. Thẻ có nền `#f6f6f6`, **bo góc lớn (~2rem)**, icon nét mảnh màu xám ~90px, H2 25px/600 và nút "VIEW" kèm vòng tròn viền. Trang chi tiết USP (`/in-house-production/`) có một **dải icon 8 USP ở cuối trang** đóng vai sub-nav, mục đang xem tô vàng đồng.

### 5.7 Contact & Catalogue (form) [QS]
- Contact: banner ảnh, khối thông tin (địa chỉ có link "Find us in Maps", phone, WhatsApp, email) + form 4 trường: Full Name*, Phone, Email*, Comment. Placeholder dạng `span.holder` nổi (floating label tự viết), lỗi hiển thị qua `data-error`. Submit chuyển sang `/thank-you/`.
- Catalogue: "Please complete the form to receive CATALOGUE 2026": Name, Phone, Email, **Country (select)**, checkbox đồng ý điều khoản → `/thank-you/`. Đây là cơ chế **gated content** thu lead.
- Showroom: 2 địa điểm kèm link Maps + video YouTube lazy (`data-embed`, chỉ tạo iframe khi cần).

### 5.8 Đa ngôn ngữ [QS]
- Switch VI/EN ở header; link VI trỏ đúng trang tương ứng với slug tiếng Việt. Trang chủ VI có title/description tiếng Việt riêng (tối ưu SEO nội địa).

---

## 6. Pattern tương tác & motion

| Pattern | Cơ chế | Nhãn |
|---|---|---|
| Preloader + header xuất hiện tuần tự | `.init-head.showed .logo{animation:fadeInUp 1s}`, `.right-header{animation:goLeft 1s .5s}` | [QS] |
| Chuyển trang mờ dần | Click `.link-load` → `gsap.to([".navigation",".container",".footer"],{opacity:0,duration:.5})` rồi `window.location` (MPA, không phải SPA) | [QS] |
| Tiêu đề tách chữ | Splitting.js `by:"chars"` cho `.text-inner`; biến CSS `--char-index`, `--word-percent` cho stagger | [QS] cơ chế, [SL] hiển thị là chữ hiện lần lượt |
| Reveal khi cuộn | `.ani-item` + IntersectionObserver/ScrollTrigger thêm `on-show` | [QS] |
| Smooth scroll | Lớp `smoothScrolling` với lerp/damp (kiểu Lenis), `data-prevent-wheel` để vùng filter cuộn riêng | [QS] |
| Carousel active clip-path | Thẻ active `clip-path:inset(0)`, thẻ khác bị cắt 20% đáy + mờ 50% | [QS] |
| Hover ảnh | Tăng contrast + giảm bão hoà (không zoom) | [QS] |
| Hover chữ "roll" | Chữ trượt lên, bản sao màu vàng đồng trượt vào | [QS] |
| Menu fullscreen trượt lên | `translateY(100%) → none`, mục menu fade 0.3s | [QS] |
| Popup video/album | Tải HTML phụ `view-video.html?id=…`, `view-album.html?id=…` | [QS] |
| Accordion spec | `.click-tab.expand` trên trang chi tiết | [QS] |
| Nội dung SEO thu gọn | Nút `view-more` `aria-expanded` | [QS] |

---

## 7. Mobile / responsive

- **Ngưỡng chính 1100px** [QS]: dưới ngưỡng, ẩn nhóm link trái và sub-nav; logo chuyển sang trái (`left:5vw`, rộng 10rem, đổi sang `logo-icon.svg`); hamburger chuyển sang phải (`right:1rem`). Root font cố định 18px → 16px.
- **Ảnh art-direction** [QS]: mọi `<picture>` có `source media="(max-width:1100px)"` trỏ thư mục `/pictures/mobiles/` (vd ảnh dự án 176 KB cho mobile so với 579 KB desktop).
- **Video hero riêng cho mobile** [QS] (`data-mobile`), nhưng file mobile 24,5 MB còn lớn hơn bản desktop 23,9 MB.
- Lưới [QS]: danh sách sản phẩm và dự án về 1 cột ở ≤680px; ô Core Values 1 cột ở ≤680px; tỉ lệ ảnh 14/9; banner dự án 3/4 khi portrait.
- Filter sản phẩm trên mobile: nút `.open-button` mở panel filter, tự đóng sau khi chọn [QS: `Mobile.matches&&document.querySelector(".open-button").click()`].
- `(hover:hover) and (pointer:fine)` giới hạn hiệu ứng hover cho thiết bị có chuột [QS].
- [CXĐ] Chất lượng thực tế (vùng chạm, khả năng đọc chữ 4vw trên màn nhỏ) chưa kiểm chứng bằng thiết bị.

---

## 8. Điểm mạnh / điểm yếu UX

### Điểm mạnh

1. **Thông số B2B "logistics-ready" trên trang sản phẩm**: NW/GW, CBM, số bộ/container 40'HQ, bản vẽ 2D. Đây đúng là dữ liệu người mua sỉ cần để tính giá landed cost; giảm vòng hỏi đáp qua email.
2. **Lead magnet catalogue** có trường Country: phân loại lead theo thị trường ngay từ đầu, xuất hiện cả ở header, menu và trang chủ.
3. **Hệ thống thị giác kỷ luật**: một màu nhấn duy nhất, một shadow, một transition chuẩn, thang tiêu đề bằng biến. Dễ nhất quán và dễ bảo trì.
4. **Header đối xứng + menu fullscreen làm sitemap đầy đủ**: header giữ 6 lối tắt quan trọng nhất, phần còn lại đẩy vào menu. Cân bằng giữa tối giản và khả năng khám phá.
5. **Filter đa chiều (loại × vật liệu × màu vải)** với sidebar sticky, phù hợp catalogue lớn.
6. **"Why choose" tách thành USP có trang riêng**: mỗi lý do có nội dung chứng minh, tốt cho cả SEO long-tail lẫn sales.
7. **Art-direction ảnh desktop/mobile**, WebP phần lớn, `loading="lazy"` cho 23/24 ảnh trang chủ, video YouTube chỉ nhúng khi cần.
8. **Đa ngôn ngữ đúng chuẩn**: slug dịch, hreflang, link chuyển ngôn ngữ trỏ trang tương ứng.

### Điểm yếu

1. **Thiếu CTA chuyển đổi trên trang sản phẩm và hero**: không có "Request a quote", "Add to inquiry list", "Ask about OEM". Người mua phải tự tìm sang Contact, mất ngữ cảnh sản phẩm.
2. **Hero video quá nặng**: ~24 MB và còn `<link rel="preload" as="video">` + `preload="auto"`: tốn băng thông, ảnh hưởng LCP, đặc biệt trên mobile (file mobile còn nặng hơn).
3. **Trang dự án chỉ có ảnh**: không có bối cảnh (địa điểm, quy mô, hạng mục, sản phẩm đã dùng), alt ảnh là tên file → yếu cả về thuyết phục lẫn SEO/a11y.
4. **Filter AJAX không cập nhật URL** [SL]: không chia sẻ, không back được, không index được tổ hợp filter.
5. **Accessibility**: `:focus{outline:0}` reset toàn cục [QS] (người dùng bàn phím mất chỉ báo focus); body weight 300 màu #323232 trên nền trắng và chữ xám #999/#858585 có nguy cơ tương phản thấp; root `font-size:1vw` làm cỡ chữ phụ thuộc chiều rộng cửa sổ thay vì cài đặt người dùng; thuộc tính gõ sai `arial-label`.
6. **SEO kỹ thuật lỏng**: nhiều trang có meta description = tên trang ("Contact", "Projects", "Showroom"); BreadcrumbList sai cấu trúc; không có schema Product; `aggregateRating` gắn vào Organization (rủi ro bị Google bỏ qua).
7. **Danh mục 40 sản phẩm không phân trang/không sắp xếp**, thẻ không có thông tin phân biệt (chỉ tên + loại), khó so sánh.
8. **Khối SEO dài thu gọn ở cuối trang danh mục**: [SL] nội dung viết cho bot, người dùng ít đọc; nếu ẩn quá mức có thể bị đánh giá thấp.
9. **CSS inline 142 KB trên mỗi trang** (HTML ~186–223 KB/trang) không được cache giữa các trang.

---

## 9. Áp dụng cho BFC

Bối cảnh BFC: Next.js 16 + Tailwind + shadcn, token ink/forest/gold, font Inter, header 72px (logo + CTA + hamburger → menu fullscreen), hero slider 4 ảnh crossfade + Ken Burns, IA: Home, Capabilities, About, Contact, Materials (+5), Products (+6), Projects.

### 9.1 Pattern nên lấy

| Ưu tiên | Pattern | Áp dụng vào BFC | Ghi chú triển khai |
|---|---|---|---|
| **P0** | Khối thông số logistics trên sản phẩm (kích thước, NW/GW, CBM, số lượng/container 20'/40'HQ, MOQ, lead time) | `Products/[slug]` (6 trang sản phẩm/nhóm) | Dùng shadcn `Accordion` hoặc `Tabs`; dữ liệu dạng bảng `<dl>`/table để copy được. Thêm cột "Tuỳ chỉnh OEM được" (vật liệu, finish, kích thước) |
| **P0** | **Bổ sung** CTA ngữ cảnh mà ATC thiếu: "Yêu cầu báo giá cho sản phẩm này" mở form đã điền sẵn mã sản phẩm | Products detail, Materials detail, cuối Projects detail | Form ngắn (Tên, Công ty, Email, Quốc gia, Số lượng dự kiến, Ghi chú); Server Action |
| **P0** | Lead magnet có trường Country (catalogue/capability deck PDF) | Section gần cuối Home + mục trong menu fullscreen + trang Capabilities | Bố cục 2 cột (mockup bìa + nút gold), kết quả về trang cảm ơn có link tải |
| **P1** | Lưới USP có trang/khối chứng minh riêng ("Why BFC") | Home (section giá trị) → link sang Capabilities/About | 6–8 ô icon + tiêu đề ngắn + 1 câu; mỗi ô dẫn tới anchor có số liệu, chứng chỉ, ảnh nhà máy |
| **P1** | Filter đa chiều: vật liệu (gỗ/nhôm/thép/nệm) × loại sản phẩm × ứng dụng (hospitality/residential/office) | `Products` index | Đồng bộ với URL search params (`?material=aluminium&type=chair`) để chia sẻ và SEO, khắc phục điểm yếu của ATC |
| **P1** | Template dự án: banner lớn + lưới ảnh + "Dự án tiếp theo" | `Projects/[slug]` | **Bổ sung** khối fact (địa điểm, năm, số lượng, sản phẩm/vật liệu dùng, phạm vi OEM) và alt ảnh mô tả |
| **P1** | Header: giữ ít lối tắt + menu fullscreen làm sitemap đầy đủ | Header BFC hiện tại đã đúng hướng | Có thể thêm 2–3 link text (Products, Projects, Capabilities) ở ≥1100px cạnh CTA; menu fullscreen liệt kê đủ Materials (+5) và Products (+6) theo nhóm như mega-menu ATC |
| **P2** | Tiêu đề section lớn, nét mảnh, in hoa + reveal tách chữ | Tiêu đề section Home/Capabilities | Dùng Inter weight 200–300 cỡ `clamp(2.5rem,4vw,4.5rem)`; reveal theo từ (không theo ký tự) bằng CSS + IntersectionObserver hoặc Motion; tôn trọng `prefers-reduced-motion` |
| **P2** | Carousel active-reveal (thẻ active rõ, thẻ khác mờ/cắt) | Carousel Projects/Materials trên Home | Dùng Embla (shadcn `Carousel`) + class active; chỉ dùng clip-path/opacity (rẻ GPU) |
| **P2** | Hover chữ "roll" cho link điều hướng | Link menu, footer | Chỉ áp dụng trong `@media (hover:hover)`; dùng màu gold `#C9A227` làm màu hover thay vì vàng đồng của ATC |
| **P2** | Ảnh art-direction desktop/mobile | Hero slider + banner dự án | `next/image` với `<picture>`/`sizes`, crop riêng 4:5 cho mobile |
| **P2** | Hệ thống token kỷ luật (1 accent, 1 shadow, 1 duration) | `globals.css` | BFC đã có token; chốt thêm `--shadow-card`, `--duration-base: 300ms`, `--ease-out-expo` |
| **P3** | Switch ngôn ngữ trỏ trang tương ứng + slug dịch | next-intl `[locale]` | Dùng pathnames localized của next-intl; hreflang tự sinh |
| **P3** | Video ngắn "nhà máy" dạng thẻ mở popup | Capabilities (dây chuyền gỗ/nhôm/thép/nệm) | Poster ảnh + tải video khi click (không autoplay nặng) |

### 9.2 Pattern nên tránh

| Pattern của ATC | Lý do tránh | Thay thế cho BFC |
|---|---|---|
| Hero video ~24 MB, preload auto | Hại LCP/băng thông mobile | Giữ slider ảnh hiện tại (đã tối ưu bằng `next/image`, ưu tiên ảnh đầu); nếu dùng video: ≤3–5 MB, `preload="metadata"`, poster là LCP |
| `html{font-size:1vw}` (rem theo viewport) | Phá cài đặt cỡ chữ người dùng, khó kiểm soát a11y | `clamp()` chỉ cho heading; body cố định 16–18px |
| `:focus{outline:0}` | Mất chỉ báo focus bàn phím | Giữ `focus-visible` ring của shadcn (màu forest) |
| Body weight 300 + chữ xám nhạt | Tương phản thấp | Body Inter 400 màu ink-soft `#444`; ink-mute `#6b6b6b` chỉ cho chú thích (đạt ~5.3:1 trên nền trắng) |
| Filter AJAX không đổi URL | Không chia sẻ/không index | Search params + Server Components |
| Trang dự án chỉ có ảnh, alt = tên file | Thiếu bằng chứng và SEO | Case study ngắn có số liệu |
| Danh mục 40 thẻ không phân trang, thẻ ít thông tin | Khó quét | Thẻ có vật liệu + ứng dụng + badge "OEM"; phân trang/"load more" có URL |
| Khối SEO dài ẩn sau "view more" ở mọi danh mục | Nội dung cho bot, UX kém | Nội dung hướng dẫn ngắn, hữu ích, hiển thị thật (FAQ dạng Accordion + schema FAQPage) |
| Meta description = tên trang, schema sai | Mất điểm SEO | `generateMetadata` từng trang; schema Organization, BreadcrumbList, Product, chuẩn hoá bằng helper |
| Preloader che trang 1s | Trì hoãn nội dung | Không cần preloader với Next.js; dùng skeleton nếu cần |
| Màu vàng đồng `#c0995d`, Montserrat mảnh, logo căn giữa | Là nhận diện riêng của ATC | Giữ nhận diện BFC (forest/gold, Inter, logo trái) |

### 9.3 Bổ sung từ quan sát runtime (map vào trang BFC)

Rút ra từ ảnh chụp mục 10. Chỉ học cấu trúc và cơ chế, không học nhận diện.

| Ưu tiên | Phát hiện từ ATC (ảnh) | Trang BFC | Cách áp dụng |
|---|---|---|---|
| **P0** | **Factory Visit** là cả một trang dịch vụ cho người mua: đón từ sân bay, ăn uống, nơi nghỉ, "100 visits/year", ảnh khách thật chụp cùng đội ngũ (`factory-visit-*.png`) | **Capabilities** (khối "Thăm nhà máy / Audit") + **Contact** (lựa chọn "Đặt lịch thăm nhà máy") | Thêm khối 3 cột (Đưa đón · Lịch audit/QC · Hỗ trợ visa/lưu trú) kèm ảnh khách thăm thật; trên form Contact thêm radio "Mục đích liên hệ: Báo giá / OEM / Thăm nhà máy" |
| **P0** | **Milestone** là timeline dọc căn giữa, so le trái/phải; năm in **rất lớn màu nhấn**; mỗi mốc có **pictogram tăng dần số lượng** (1 xưởng → 4 nhà máy) để thể hiện quy mô bằng hình (`milestone-00/02.png`) | **About** (khối "Hành trình") | Timeline 5–7 mốc: năm (Inter 600, `clamp(3rem,6vw,5.5rem)`, màu gold), diện tích m², số công nhân, dây chuyền mới (gỗ → nhôm → thép → nệm). Pictogram nên dùng icon line của BFC, không lặp hình nhà máy của ATC |
| **P0** | **Sustainability** gộp **chứng chỉ (FSC, SMETA)** với **thẻ vật liệu** (ảnh cận chất liệu trên nền xám nhạt, kèm H3 và 2 tiêu đề phụ "độ bền / nguồn gốc") (`sustainability-*.png`) | **Materials (+5)** cho gỗ, nhôm, thép, nệm, vải; **About** (chứng chỉ) | Mỗi trang Materials mở đầu bằng ảnh cận chất liệu 4:3 nền trung tính, sau đó là các khối "Độ bền", "Xử lý bề mặt", "Chứng nhận". Logo chứng chỉ đặt trong khối zig-zag ảnh/chữ |
| **P1** | **Partners** là lưới logo 6 cột, logo giữ màu gốc, 24 thương hiệu hospitality (`partners-00.png`). Trang chủ ATC **không** có dải logo này | **Home** (dải logo ngay sau hero hoặc sau Capabilities) + **Projects** | BFC nên đưa dải logo lên Home, vì đây là điểm ATC bỏ lỡ. Dùng logo grayscale, hover hiện màu, 5–6 cột ở desktop và marquee ở mobile |
| **P1** | **Danh sách có "N POSTS LEFT" + nút tròn View more** cho Projects/Exhibition: chỉ hiện 6–9 thẻ đầu, số còn lại hiện rõ (`projects-02.png`, `exhibition-01.png`) | **Projects** index | Hiện 6 thẻ, nút "Xem thêm (18)" đồng bộ `?page=` để giữ URL; hiện số còn lại giúp người xem ước lượng quy mô danh mục |
| **P1** | **Chi tiết dự án**: ảnh so le trái/phải, có vòng tròn đánh số 01…n trên nền xám nhạt (`project-detail-02.png`) | **Projects/[slug]** | Giữ nhịp so le nhưng thay số thứ tự bằng **chú thích có nội dung** (khu vực, sản phẩm, vật liệu, số lượng), vì ATC chỉ đánh số mà không có thông tin |
| **P1** | **Sub-nav cuối trang** cho cụm About (thanh ngang nền xám nhạt trên footer) và cho cụm USP (dải 8 icon) (`about-03.png`, `usp-detail-02.png`) | **About**, **Materials (+5)**, **Products (+6)** | Đặt "anh em cùng cụm" ở cuối trang (ví dụ 5 vật liệu dạng icon và nhãn) để người đọc đi tiếp ngang thay vì quay lại menu. Mục hiện tại đánh dấu bằng màu gold |
| **P1** | **Thanh tab/breadcrumb dính dưới header** (News categories, Product's videos, breadcrumb sản phẩm) (`news-01.png`, `product-cat-01.png`) | **Products** index và chi tiết, **Materials** | Breadcrumb/tab lọc `position: sticky; top: var(--header-h)` cao khoảng 36px, chữ 11px in hoa, nền trắng có viền trên/dưới |
| **P2** | **Form Catalogue/Contact**: input chỉ có gạch chân, floating label, card form trắng bo 1rem đặt trên nền xám nhạt, nút pill đặc (`catalogue-00.png`, `contact-01.png`) | **Contact**, lead magnet trên **Home/Capabilities** | Dùng shadcn `Input` biến thể underline + `Card` bo `rounded-2xl`, nút pill màu forest. Trường **Country** giữ dạng select có tìm kiếm (Combobox) |
| **P2** | **Thẻ USP bo lớn, so le kiểu masonry** với icon line xám (`why-choose-00.png`) | **Home** (Why BFC) hoặc **Capabilities** | Lưới 4 cột lệch `translateY` 0/−3rem/0/−3rem tạo nhịp. Mỗi thẻ cần link sang chứng minh thật (anchor số liệu) |
| **P2** | **Chi tiết sản phẩm**: H1 màu nhấn, mô tả ngắn, accordion **mở sẵn SPECIFICATIONS** (NW/GW/CBM từng món) (`product-detail-00.png`) | **Products (+6)** | Mở sẵn tab thông số và đặt CTA "Yêu cầu báo giá" ngay dưới accordion. ATC không có CTA này (xác nhận lại bằng ảnh) |
| **P3** | **Bài tin dạng buying guide B2B** dài ~20.000px, có infographic, chú thích ảnh in nghiêng, mục đánh số 1/1.1 (`news-detail-*.png`) | (chưa có trong IA BFC) có thể thêm vào **Capabilities** dạng "Hướng dẫn mua OEM" | Nếu làm, cần thêm mục lục dính bên cạnh và CTA giữa bài; ATC không có cả hai |

Không nên lấy (bổ sung):
- **Ảnh lifestyle có dấu hiệu ghép nền/AI** ở danh mục sản phẩm và tin tức (bối cảnh Địa Trung Hải đồng nhất, gối logo lặp lại) [SL]. BFC là OEM nên cần ảnh nhà máy và sản phẩm thật; ảnh render chỉ dùng cho concept và phải ghi rõ.
- **Scroll-reveal làm trang trắng khi cuộn nhanh** (ảnh `home-rt-03`, `core-values-03` ở scratchpad mờ hoặc trống). Reveal của BFC nên dùng `opacity` từ 0.001 với `translateY` nhỏ, và nội dung đã ở trên màn hình khi load phải hiện ngay.
- **Thumbnail YouTube kiểu banner** ở Product's videos lệch hẳn khỏi ngôn ngữ tối giản của site (`products-videos-00.png`). BFC nên tự chụp poster video theo tỉ lệ và tông của site.

---

## 10. Quan sát runtime (REA, 2026-11-04)

> Quan sát runtime bằng REA ngày 2026-11-04, viewport 1424×805 desktop; chưa xem mobile.
>
> Cách làm: Chrome riêng qua CDP, script cuộn hết trang và ở mỗi viewport gọi REA `capture-web-screenshot` (mỗi ảnh có `evidence_id`), đồng thời trích outline DOM (thẻ, vị trí, nền, heading, CTA). Typography đo bằng `getComputedStyle` trên phần tử hiển thị. Ảnh đầy đủ (~150 ảnh) để ở scratchpad; repo chỉ giữ tối đa 3 ảnh tiêu biểu mỗi trang trong `screenshots/atc/`. Riêng trang chủ giữ 6 ảnh đã có từ trước, đổi tên `home-NN.png`; evidence_id trang chủ lấy từ lần chụp lại `home-rt` cùng viewport.
>
> Lưu ý: site dùng scroll-reveal (`.ani-item` → `on-show`) và smooth-scroll. Khi chụp nhanh, một số khối còn mờ hoặc trống. Core Values và USP detail được chụp lại theo chế độ "cuộn trước rồi mới chụp"; ảnh trong repo của 2 trang này lấy từ lần chụp lại.

### 10.1 Sơ đồ routes thực tế (lấy từ DOM)

Nguồn: chạy `nav-routes` trên `/` và `/about-us/` (36 route cùng origin, duy nhất), cộng thêm link nội dung trên các trang hub (Why choose, News, Projects, Product's videos). Các vùng nav:
- **Header bar**: `.left-header` / `.right-header` trong `header.header`.
- **Menu**: `nav.navigation`, ẩn cho đến khi bấm hamburger (cũng nằm trong `header.header`).
- **Sub-nav cuối trang**: `div.sub-menu` / `section.sub-append`, chỉ có trên cụm About.
- **Footer**: `footer.footer`.

| Route | Tên | Vùng nav chứa nó | Template | Đã chụp |
|---|---|---|---|---|
| `/` | Home | Header (logo), Menu (icon nhà) | Home | Có (6 ảnh cũ `home-*`; 9 ảnh runtime ở scratchpad) |
| `/about-us/` | About Us ("Our Story") | Header, Menu ▸ Our Story, Sub-nav | Trang tĩnh About | Có (5) |
| `/milestone/` | Milestone | Menu ▸ Our Story, Sub-nav | Timeline | Có (5) |
| `/activities/` | Activities | Menu ▸ Our Story, Sub-nav | Tĩnh, zig-zag | Có (6) |
| `/core-values/` | Core Values | Menu ▸ Our Story, Sub-nav | Tĩnh | Có (6 + 6 chụp lại) |
| `/sustainability/` | Sustainability | Menu ▸ Our Story, Sub-nav | Tĩnh, zig-zag | Có (9) |
| `/partners/` | Partners | Menu ▸ Our Story, Sub-nav | Lưới logo | Có (3) |
| `/products/` | Products index | Header, Menu ▸ Products | Danh mục gốc + filter | Có (3) |
| `/products/wicker-furniture/` (+ `teak-furniture`, `hyacinth-furniture`) | Nhóm vật liệu (cấp 2) | Menu ▸ Products (nhóm in hoa) | Danh mục cấp 2 | Chụp 1 đại diện: wicker (4) |
| `/products/wicker-furniture/sofa-sets/` (+ 11 loại khác) | Loại sản phẩm (cấp 3) | Menu ▸ Products (mục con) | Danh mục cấp 3 | Chụp 1 đại diện: sofa-sets (11) |
| `/products/…/bora-en/` | Chi tiết sản phẩm | Link trong thẻ danh mục | Chi tiết sản phẩm | Chụp 1 đại diện (4) |
| `/catalogue-en/` | Catalogue 2026 | Header, Menu | Form lead | Có (2) |
| `/why-choose-atc/` | Why choose ATC | Menu | Lưới USP | Có (3) |
| `/in-house-production/` (+ 7 USP: `/3-year-warranty/`, `/45-countries-export/`, `/sunbrella-partnership/`, `/convenient-visiting/`, `/sustainable-materials/`, `/300-samples-in-showoom/`, `/multi-language-communication/`) | Chi tiết USP | Link "VIEW" trong Why choose, dải icon cuối trang USP | Chi tiết USP | Chụp 1 đại diện (4 + 4 chụp lại) |
| `/showroom/` | Showroom | Header, Menu | Tĩnh + video | Có (3) |
| `/factory-visit/` | Factory Visit | Menu ▸ Company Insights | Tĩnh dịch vụ | Có (6) |
| `/exhibition/` | Exhibition | Menu ▸ Company Insights | Danh sách thẻ | Có (3); trang chi tiết hội chợ chưa chụp |
| `/projects/` | Projects | Header, Menu ▸ Company Insights | Danh sách dự án | Có (4) |
| `/mia-resort-nha-trang-en/` (+ 23 dự án `/…-en/`) | Chi tiết dự án | Link "DISCOVER" | Chi tiết dự án | Chụp 1 đại diện (12) |
| `/companys-news/` | Company's News | Menu ▸ News & Views, Footer | Danh sách tin + tab | Có (4) |
| `/delivery-journal/`, `/tips-and-advice/`, `/lifestyles/`, `/guides-en/` | Chuyên mục tin | Tab dính trong News | Cùng template danh sách tin | Không chụp (dùng chung UI) |
| `/commercial-patio-furniture-buying-guide/` (+ ~30 bài) | Bài tin | Link "VIEW DETAILS" | Bài viết | Chụp 1 đại diện (12) |
| `/products-videos/` (+ `/sofa-sets-video/`, `/video-dinning-sets/`, `/hammock-accessories-video/`, `/video-coffee-bar/`) | Product's videos | Menu ▸ News & Views | Lưới video + tab | Chụp trang gốc (5); tab con không chụp |
| `/jobs-career/` | Jobs & Career | Menu | Danh sách tuyển dụng | Có (5) |
| `/contact/` | Contact | Header (link hiện), Menu (link ẩn) | Form liên hệ | Có (2) |
| `/factory-gallery-en/` | Factory Gallery | Footer | Gallery | Có (3) |
| `/terms-conditions/` | Terms | Footer | Pháp lý | Bỏ qua (theo phạm vi) |
| `/vi/`, `/ve-chung-toi/`… | Bản tiếng Việt | Header (switch VI) | Như EN | Bỏ qua (theo phạm vi) |
| (trạng thái) menu mở | Menu fullscreen | Hamburger | Overlay | Có (`menu-00.png`) |

Nhận xét IA [QS]:
- Header bar chỉ có **6 lối tắt**: Products · Showroom · Projects | Our Story · Catalogue · Contact. Menu có **9 mục cấp 1**: Home, Our Story ▸, Products ▸, Catalogue, Why choose, Showroom, Company Insights ▸, News & Views ▸, Jobs.
- "Projects" xuất hiện ở 2 nơi: header và menu ▸ Company Insights. Factory Gallery **chỉ có ở footer**.
- Menu không có sidebar riêng. Trên About chỉ có thêm sub-nav cuối trang.

### 10.2 Phân tích từng trang chính

Ký hiệu nền: **T** = trắng `#fff`, **X** = xám nhạt `#f6f6f6`, **XĐ** = xám `#ebebeb`/`#e3e3e3`. Typography là số đo thật tại 1424px. Phần lớn trang con dùng chung **"page head"**: khoảng trống trên cao 298px (header 120px + padding), H1 in hoa căn giữa 42.7px/200 màu `#58595b`, logo vàng đồng lớn. Header không chồng lên ảnh, trừ Home và Contact.

#### Home `/`

Ảnh: `screenshots/atc/home-00.png`, `home-01.png`, `home-02.png`, `home-04.png`, `home-06.png`, `home-08.png` · ev chính `ev_7c33c8a8afb2c076f4bf7646d0ed042d22b68d4c055e239e850d02f8b6df8d42`

| # | Section | Mục đích | Bố cục / nền | Typography đo | CTA / tương tác |
|---|---|---|---|---|---|
| 1 | Hero video | Ấn tượng không gian | Video full-bleed 100vh, chữ header trắng, logo trắng lớn giữa; **không có H1/CTA hiển thị**; huy hiệu tròn "ATC FURNITURE ↓" góc dưới phải | — | Scroll cue. Khi cuộn, header chuyển sang nền trắng cao 66px, logo vàng nhỏ |
| 2 | Quote + Story card | Kể chuyện thương hiệu | Container ~820px: quote, rồi card XĐ bo góc trên phải 3rem | Quote 24/300; H2 29.5/700; body 16.4/300 | "LEARN MORE" + vòng tròn viền 80px |
| 3 | Videos | Năng lực nhà máy/showroom | Tiêu đề căn giữa; carousel thẻ active ~713px ở giữa, 2 thẻ bên **nhỏ hơn và mờ 50%**, ló ra ở mép | "VIDEOS" 42.7/**100**; H3 thẻ 24.6/600 in hoa, chữ trắng trên ảnh | Nút play tròn giữa ảnh; mũi tên ← → mảnh |
| 4 | Collection | Dẫn vào danh mục | Carousel ~2.5 thẻ, tràn mép phải; ảnh 14/9, dưới ảnh 2 cột (tên + mô tả \| vạch dọc + "VIEW MORE →") | H3 **màu vàng đồng** 19.7–24.6/500 in hoa; mô tả 14.7/300 | ← → |
| 5 | Our Projects | Social proof | Carousel 2 thẻ lớn ~713px | H3 24.6/400 in hoa | "DISCOVER →" sau vạch dọc |
| 6 | Catalogue | Lead | Mockup bìa catalogue (bóng đổ) bên trái ~37%; phải: "Get inspired" | H3 41.8/400 vàng đồng | Nút viền chữ nhật `RECEIVE CATALOGUE` 13/500 |
| 7 | Core Values | Niềm tin | 4 ô vuông XĐ full-bleed, cách nhau 1px; icon line ~90px, H3, đoạn căn giữa | H3 29.5/700 in hoa; body 16/300 | Tĩnh |
| 8 | Footer | Liên hệ | Logo trái, địa chỉ + 3 kênh có icon, huy hiệu tròn ↑, dải social + link, copyright XĐ | 16/300; link 11px in hoa | Hover roll |

#### About Us `/about-us/`

Ảnh: `screenshots/atc/about-00.png`, `about-01.png`, `about-03.png` · ev `ev_9ae82035f0c648ff3ec5e8030055a35a21dcb2f054d365e0817ad04065a01d19`

1. Page head "ABOUT US".
2. **Mission quote** (24/300 có icon ngoặc kép) + đoạn giới thiệu, container ~820px.
3. **2 cột 50/50**: văn bản dài bên trái, trong đó Ace/Trust/Care là link gạch chân màu vàng đồng; bên phải là **ảnh 3 nhà sáng lập xử lý kiểu vẽ chì đen trắng**.
4. Khối XĐ: **video nhà máy có controls** rộng ~1140px, có phụ đề tiếng Việt.
5. **Sub-nav cụm Our Story** (nền X, 13px, mục active vàng đồng), rồi footer.

Không có CTA chuyển đổi.

#### Milestone `/milestone/`

Ảnh: `screenshots/atc/milestone-00.png`, `milestone-02.png` · ev `ev_bf00dad4398c6e85d3a2eeae0dd19ca09f84473dddd4a19e96be6eebb1bb5fc2`

Timeline dọc: đường kẻ mảnh xám ở giữa trang, chấm tròn xám ~26px ở mỗi mốc, nội dung so le trái/phải. Mỗi mốc gồm:
- pictogram (xen kẽ xám và vàng đồng);
- **năm cỡ ~90px weight 700 màu vàng đồng**;
- một gạch ngang nối vào trục;
- 2–3 dòng thông số 22px/300 ("Factory size: 5.000 m²", "Worker: 50").

Số pictogram nhà xưởng tăng dần theo năm (1 → 4). Có 6 mốc: 2006, 2008, 2010, 2013, 2016, 2024. Mỗi mốc reveal `trans-y` khi cuộn. Cuối trang là sub-nav.

#### Activities `/activities/`

Ảnh: `screenshots/atc/activities-00.png`, `activities-02.png` · ev `ev_618ca11591a56d91ac4885c2fda978472ec293984f41176f756bf2a35d5f233d`

1. Page head, rồi quote "Together We Grow…" và đoạn văn.
2. **Dải 3 ảnh** (mỗi ảnh ~372px, ảnh giữa cao hơn và nhô lên, tạo nhịp so le).
3. 4 khối **zig-zag ảnh/chữ 50/50**: Shared Vision, Charity, Year-End Party, Team Building. H3 dạng sentence case 30px/700; một số khối có slider ảnh với nút tròn ← → đặt đè lên mép ảnh.

Ảnh là ảnh sự kiện thật, màu sắc không được xử lý đồng bộ.

#### Core Values `/core-values/`

Ảnh: `screenshots/atc/core-values-00.png`, `core-values-01.png`, `core-values-04.png` · ev `ev_5c7ca2efe3c2fbd32028e1e61e5171a8d1685abfa9ce827740f682050b40d0a1`

1. **VISION**: tiêu đề **căn trái, 57px/100**, có **đường kẻ ngang chạy tới mép phải màn hình**. Đây là motif tiêu đề section của trang con. Bên dưới là quote 24/300.
2. **MISSION** (nền X): 5 mục 2 cột so le, mỗi mục có **vòng tròn trắng ~100px chứa số "01"…** (xám 700), H3 23/700, đoạn 19.7/300.
3. **CORE VALUES** (nền X): 4 cột icon + H3 in hoa, giống Home nhưng nằm trong container.
4. **BUSINESS PHILOSOPHY**: nền **ảnh 3D trừu tượng xám (render)**, chữ trắng; tiêu đề 57/100 + kẻ ngang trắng; 3 cột "Needs/Quality/Creative" 49px/700.
5. Sub-nav.

#### Sustainability `/sustainability/`

Ảnh: `screenshots/atc/sustainability-00.png`, `sustainability-01.png`, `sustainability-03.png` · ev `ev_d7c9094fef7d6c240837501998ba78357671c00be3f85fc89e6654a09b55e2f4`

Quote mở đầu, rồi **8 khối zig-zag 50/50** (container ~1075px):
- 2 khối chứng chỉ: FSC có badge nền xanh rêu bo ~1.5rem kèm mã chứng chỉ; SMETA dùng logo trên nền trắng.
- 6 khối vật liệu: Poly Rattan, Rope, Teak, Resin, Wicker, Water Hyacinth. Ảnh là **ảnh cận chất liệu trên nền xám nhạt** (kiểu packshot). H3 30/700 và 2 tiêu đề phụ 16/600 ("Durability", "Sustainable Sourcing").

Cuối trang là khối XĐ "Commitment to Sustainability". Đây là trang ATC dùng để giải thích vật liệu, sát nhất với nhóm trang **Materials** của BFC.

#### Partners `/partners/`

Ảnh: `screenshots/atc/partners-00.png` · ev `ev_0e9bf3ed4e712187f4e7311d5e001bdab8e579c57fba74a5295126c5acdec256`

Lưới **6 cột × 4 hàng**, 24 logo đối tác (chuỗi khách sạn, cà phê, bất động sản), **giữ màu gốc**, căn giữa trong ô ~190px, không có viền hay nền. Không có chữ giải thích, không link sang dự án tương ứng.

#### Why choose ATC `/why-choose-atc/`

Ảnh: `screenshots/atc/why-choose-00.png`, `why-choose-01.png` · ev `ev_e118d5c22683d14f4817c8c2cf7a5faf093515f4a4cad00f6b39d330896dd5d5`

8 thẻ USP xếp 4 cột **so le dọc (masonry)**. Mỗi thẻ: nền X, bo ~2rem, icon line xám ~90px, H2 25/600 sentence case, H3 15/300, nút "VIEW" có vòng tròn viền. Chiều cao thẻ không đều theo độ dài nội dung.

#### Chi tiết USP `/in-house-production/` (đại diện 8 trang)

Ảnh: `screenshots/atc/usp-detail-00.png`, `usp-detail-01.png`, `usp-detail-02.png` · ev `ev_e89cdee8af2bbbd6265ae4b3f8c0e4fde8a04eed12cd164bf792a9e618671317`

1. Page head.
2. Khối nền X 2 cột: tuyên bố in hoa 29/500 **căn phải** ở cột trái, đoạn mở đầu ở cột phải.
3. Thân bài 1 cột ~820px: H3 25/600 và đoạn 16.4/300; giữa bài có cặp ảnh 2 cột kèm **chú thích in nghiêng căn giữa**.
4. **Dải 8 icon USP** (nền X) làm sub-nav, mục active vàng đồng.

Không có CTA.

#### Showroom `/showroom/`

Ảnh: `screenshots/atc/showroom-00.png` · ev `ev_037d42582ccd9d2078ddb896ba02a5104f1250b18e7786948365b75cb59847e4`

1. Page head, rồi quote "Where Style and Comfort Meet" và đoạn văn.
2. **2 địa chỉ có icon pin**: tên đậm, địa chỉ, link "(Find us in maps)".
3. **1 video YouTube rộng ~1140px tự phát khi cuộn tới** (thấy player đang chạy 0:03–0:06).

Header bị ẩn ở các ảnh chụp lúc cuộn [CXĐ: có thể do header tự ẩn khi cuộn xuống trên trang này]. Trang ngắn, không có ảnh tĩnh, không có giờ mở cửa, không có CTA đặt lịch.

#### Factory Visit `/factory-visit/`

Ảnh: `screenshots/atc/factory-visit-00.png`, `factory-visit-01.png`, `factory-visit-04.png` · ev `ev_7e0f51a9deb95b040459d73ba6ab2a547d5ad1842f29e26bd7b110e8243cce51`

1. Page head.
2. Intro 2 cột 30/70: nhãn "FACTORY VISIT" 33/300 bên trái, 2 đoạn văn bên phải.
3. Dải 3 ảnh so le (giống Activities): khách quốc tế chụp trước tường logo.
4. 3 khối zig-zag: Number Of Visits, Transportation Service, F&B Provided. H2 33/300 (**mảnh, khác hẳn H3 700 ở Activities**), ảnh ~490px.
5. **Slider full-bleed** ảnh khách trên sofa, nút tròn ← → viền trắng ở 2 mép. Đè lên mép trên ảnh là **3 cột số liệu** "100 VISITS / YEAR · TRANSPORT · F&B PROVIDED" (33/700 in hoa); phần ảnh dưới chữ được làm mờ trắng dần.

#### Exhibition `/exhibition/`

Ảnh: `screenshots/atc/exhibition-00.png`, `exhibition-01.png` · ev `ev_a997c9e7b5281a4883794f047c7977036d0fcf1e63bc7ab6ff296fb8ef30ff15`

Lưới **3 cột**, thẻ ảnh ~368×207 (16/9), tên hội chợ 16/600 in hoa, vạch dọc, "VIEW DETAILS →". Hiện 9 thẻ (HAWA/VIFA 2017–2026), rồi pill viền "**5 POSTS LEFT**" và nút tròn "VIEW MORE". Ảnh gian hàng thật, sáng và đồng tông.

#### Projects `/projects/`

Ảnh: `screenshots/atc/projects-00.png`, `projects-02.png` · ev `ev_0b4daf07ac056803efe1fe77d58fe18ee082daa0191e45c6b5e53e40caeb9b72`

Lưới **2 cột** (ảnh ~554×311, khoảng 16/9), tên dự án 24.6/400 in hoa, vạch dọc, "DISCOVER →". Hiện **6/24** dự án, rồi "18 POSTS LEFT" và nút tròn "VIEW MORE". Không có filter, không có địa điểm hay năm trên thẻ.

#### Chi tiết dự án `/mia-resort-nha-trang-en/`

Ảnh: `screenshots/atc/project-detail-00.png`, `project-detail-02.png` · ev `ev_850066f4ee40efb362df6a9c25d7462440c591f02c5520fcdbe0b47a9956c9ab`

1. Page head (tên dự án), rồi banner ~1280×740.
2. Nền đổi sang X, **13 ảnh `figure` so le trái/phải** (mỗi ảnh ~897×598), phía đối diện có **vòng tròn viền mảnh ~140px đánh số 01–13**.
3. Khối XĐ "RETURN TO LIST / NEXT PROJECT".

Trang cao 11.462px nhưng không có một dòng mô tả nào.

#### Catalogue `/catalogue-en/`

Ảnh: `screenshots/atc/catalogue-00.png` · ev `ev_97cff552467cfd575416a679b8450e28863598964b77c06674c3c84dc87b3c88`

Page head "CATALOGUE 2026", rồi 2 cột 50/50:
- Trái: **mockup bìa catalogue tràn sát mép trái**, nền tường xám có bóng lá.
- Phải: lời mời 25/300 kèm "CATALOGUE 2026" 33/400, rồi form gồm Full Name* và Phone (2 cột), Email*, **Select Country*** (dropdown có mũi tên), checkbox nhận tin. Input chỉ có **gạch chân 1px**, placeholder xám, dấu * đỏ `#c25757`.
- Nút **pill đặc xám `GET CATALOGUE`** căn phải.

#### Contact `/contact/`

Ảnh: `screenshots/atc/contact-00.png`, `contact-01.png` · ev `ev_592754d7da46a245a8ac971c2fa3c3f61c876de4f1d47e1241b4e5ac828d2ef7`

1. **Banner ảnh phong cảnh** cao ~570px, header trắng chồng lên, tiêu đề "CONTACT" **42.7/600 trắng** ở đáy banner (khác hẳn H1 mảnh 200 của các trang con khác), kèm huy hiệu tròn ↓.
2. Nền X, 2 cột:
   - Trái: "ATC FURNITURE" 57/100, 2 địa chỉ có icon pin và "Find us in Maps", điện thoại, WhatsApp, email.
   - Phải: **card trắng bo 1rem** chứa form 4 trường gạch chân và nút pill xám có icon phong bì "SEND INFO".
3. Footer rút gọn.

#### Company's News `/companys-news/`

Ảnh: `screenshots/atc/news-00.png`, `news-01.png` · ev `ev_f41d9f2de2ade67bd713d802e22379801ba09ce8b8bfaffb7a1f6559df4a610e`

1. Page head, rồi **thanh tab chuyên mục dính** (ALL · DELIVERY JOURNAL · TIPS AND ADVICE · LIFESTYLES · GUIDES, 11px/700 in hoa, có viền trên/dưới). Tab dính ngay dưới header khi cuộn.
2. Nền X, container ~950px. Nhịp lặp lại theo chu kỳ: **1 thẻ ngang** (ảnh trái 50%, phải gồm ngày, H3 23/500, tóm tắt 2 dòng, "VIEW DETAILS ›") rồi **2 thẻ dọc**. Thẻ nền trắng, viền trong ~8px, không bo.
3. Ảnh đại diện bài có dấu hiệu **AI-generated** (hoàng hôn, lều glamping, ánh sáng điện ảnh đồng loạt) [SL].

#### Bài tin `/commercial-patio-furniture-buying-guide/`

Ảnh: `screenshots/atc/news-detail-00.png`, `news-detail-01.png`, `news-detail-03.png` · ev `ev_00fc1b1cfb17057087e5e35d8a16c0b052ac0738bbd8c4d10780bd04d3e4b2b1`

Thanh tab chuyên mục giữ nguyên (mục GUIDES active). Bố cục:
1. H1 **căn giữa 33/600 sentence case** (khác page head in hoa của các trang khác), ngày đăng.
2. Ảnh bìa ~900px, rồi khối lead nền X.
3. Thân bài ~740px, **chữ căn đều (justify)**, đề mục đánh số "3.", "3.1".
4. Ảnh 900px xen kẽ, có **infographic minh hoạ (AI)** và chú thích in nghiêng.

Bài dài 19.841px nhưng **không có mục lục, không có CTA giữa bài, không có bài liên quan** trong phần đã chụp (12 viewport đầu).

#### Product's videos `/products-videos/`

Ảnh: `screenshots/atc/products-videos-00.png` · ev `ev_3d5f978b29a17a18803fcf9050135e3d4443dfdb578325adb9c41c89227eafe0`

Page head, rồi tab dính gồm 4 loại. Nền X, lưới **2 cột** thumbnail YouTube ~557×313. Dưới mỗi thumbnail là tên sản phẩm 25/400 in hoa và **2 nút viền chữ nhật nhỏ "PLAY" / "STOP"** (bo ~5px). Thumbnail mang banner "ATC CHANNEL" chữ đậm, lệch tông với phần còn lại của site.

#### Jobs & Career `/jobs-career/`

Ảnh: `screenshots/atc/jobs-00.png`, `jobs-01.png` · ev `ev_79ae7596c2d6f832b2fdf1ef4cb17d1a68c4495401d91efb2cc8c7381834da42`

1. "Work Environment" căn trái 57/100, quote 33/300.
2. Nền X với "Recruitment Position" kèm kẻ ngang.
3. Danh sách vị trí dạng **hàng ngăn bởi đường kẻ**: ngày (cột trái nhỏ), "Position" và tên vị trí 33/700, "VIEW DETAILS →" bên phải.

#### Factory Gallery `/factory-gallery-en/`

Ảnh: `screenshots/atc/factory-gallery-00.png`, `factory-gallery-01.png` · ev `ev_baafad8ce5daf2ea3b855a0348d57fd396b82e8434ed60fcaacbe40e87247cf0`

1. Page head, rồi **carousel ảnh full-bleed** (ảnh giữa ~784px, hai bên ló ra). Ảnh nhà xưởng thật: dàn ghế treo xếp hàng, tường đá có logo.
2. Một dải ảnh khác.
3. Khối X lặp lại carousel video "OUR FACTORY" của Home.

#### Products index `/products/`

Ảnh: `screenshots/atc/products-00.png`, `products-01.png` · ev `ev_5cc2a386ef2e1d1fa3bfbd927753fdf730d40dd0d30de7f338f991a2fc11dfa6`

Page head "DISCOVER ATC PRODUCTS", rồi 2 vùng:
- **Sidebar filter** rộng ~220px: "Filters" và "Clear Filters", accordion Category (mở, mục đang chọn vàng đồng), Type, Material, Fabric Color (+/−), mỗi nhóm ngăn bằng đường kẻ.
- Lưới 3 thẻ nhóm vật liệu (ảnh ~340×264, tên 20/500 in hoa, "VIEW MORE →").

Cuối trang là khối X "Reliable Patio Furniture Manufacturer…" với chữ **mờ dần (fade mask)** và nút tròn "EXPAND CONTENT".

#### Danh mục cấp 2 `/products/wicker-furniture/`

Ảnh: `screenshots/atc/product-cat-l2-00.png`, `product-cat-l2-01.png` · ev `ev_495b9a17662ea320fdb1bb07f7c552b8e001499389a9ca0c75cdc6184f73475c`

1. Page head, rồi **breadcrumb bar nền X** (icon nhà › PRODUCTS › WICKER FURNITURE), dính dưới header khi cuộn.
2. Lưới **3 cột thẻ ảnh dọc** (~360×395, gần vuông hơi đứng), tên 20/500 sentence case, "VIEW MORE →" cùng hàng. **Khác cấp 3**: ở đây không có sidebar filter.
3. Khối SEO thu gọn ở cuối trang.

#### Danh mục cấp 3 `/products/wicker-furniture/sofa-sets/`

Ảnh: `screenshots/atc/product-cat-00.png`, `product-cat-01.png` · ev `ev_9eb3291db7c70978829188024354de96628dc7a3e35bc264d5a9463765c2d0b1`

Breadcrumb bar dính, rồi lưới 3 cột (ảnh ~360×264, khoảng 15/11), tên 20/500 in hoa, dòng phụ "Outdoor Sofa Set" 15/300, "MORE DETAILS →". Hiện 39 sản phẩm trong 7.117px, không có phân trang. Ảnh lifestyle đồng tông (đất nung, olive, hoàng hôn) với gối logo lặp lại, có **dấu hiệu ghép nền hoặc AI** [SL].

#### Chi tiết sản phẩm `/products/…/bora-en/`

Ảnh: `screenshots/atc/product-detail-00.png`, `product-detail-02.png` · ev `ev_81cb0fb12cf35c85c806142c770062611593ed07d6f06866ebfbab14e4444360`

1. Breadcrumb dính, mục cuối là tên sản phẩm chạy marquee.
2. 2 cột: ảnh ~590×430 bên trái kèm "All Photos"; bên phải H1 vàng đồng 33/400, mô tả 15/400, rồi accordion 4 tab (SPECIFICATIONS mở sẵn với kích thước, NW/GW, CBM từng món).
3. Khối X "RELATED PRODUCTS" (32.7/300) dạng carousel 3.5 thẻ.

Không có nút hỏi giá hay nút thêm vào danh sách báo giá.

#### Menu (trạng thái mở)

Ảnh: `screenshots/atc/menu-00.png` · ev `ev_05aa5bd7cdeb664608f864c1088a9124e730fe5666799e2e77596c2694d9e0fe`

Xem đính chính ở mục 2.3.

### 10.3 Ngôn ngữ thiết kế tổng hợp (rút từ ảnh mọi trang)

| Khía cạnh | Quan sát |
|---|---|
| **Lưới & container** | Có 3 bề rộng lặp lại. **(1) Cột đọc** ~820px (x=302→1121) cho quote, thân bài USP, intro, jobs. **(2) Container nội dung** ~1140px (x=142→1282, tức gutter 10vw) cho lưới dự án, exhibition, video, Core Values. **(3) Full-bleed** cho hero, Core Values Home, carousel, slider Factory Visit. Zig-zag 50/50 nằm trong khoảng ~1075px. Lưới chủ đạo là **2 cột** (projects, videos, zig-zag) và **3 cột** (exhibition, danh mục sản phẩm); 4 và 6 cột chỉ dùng cho thẻ giá trị/USP và logo |
| **Nhịp khoảng trắng** | Page head luôn cao 298px. Khoảng cách giữa các section rất rộng (~140–200px, khoảng 10–14vw). Trong một khối, tiêu đề cách nội dung ~50–70px. Ảnh trong chuỗi so le cách nhau ~140px. Các trang dài theo chiều dọc (Sustainability 6.263px, Project detail 11.462px) chủ yếu vì khoảng trắng |
| **Typography** | Một font Montserrat. Có 3 "giọng": **(a) mảnh in hoa** (H1 trang 42.7/200, tiêu đề section 42.7–57/100) cho nhận diện; **(b) đậm sentence case/in hoa** (H3 23–49/700) cho nội dung; **(c) micro-label** 10–13px in hoa (VIEW MORE, DISCOVER, breadcrumb, tab). Body 16.4/300, quote 24/300 có icon ngoặc kép. Tên sản phẩm/collection dùng **màu nhấn vàng đồng** |
| **Màu & nền xen kẽ** | Nền gần như chỉ có trắng ↔ `#f6f6f6` (X) ↔ `#ebebeb/#e3e3e3` (XĐ). Mẫu phổ biến: page head trắng → nội dung trắng → khối kết thúc X/XĐ (video, related, sub-nav) → footer trắng → copyright XĐ. Vàng đồng `#c0995d` chỉ dùng cho: logo, mục nav active, tên sản phẩm, năm milestone, link Ace/Trust/Care. **Không có nền tối** ngoài ảnh/video và khối Business Philosophy xám |
| **Hình ảnh** | Ảnh thật chiếm ưu thế ở: dự án (resort thật), nhà máy, sự kiện, hội chợ, khách thăm. Ảnh **render/AI hoặc ghép nền** [SL] xuất hiện ở: thẻ danh mục và sản phẩm (bối cảnh Địa Trung Hải đồng tông), ảnh bài tin, infographic, nền 3D Business Philosophy, ảnh nhà sáng lập lọc vẽ chì. Tỉ lệ khung: **16/9** (dự án, exhibition, video, banner); **~14/10–15/11** (thẻ sản phẩm cấp 3, thẻ collection); **~10/11 dọc** (thẻ cấp 2); **4/3** (ảnh vật liệu, chi tiết sản phẩm). Ảnh **không bo góc, không viền** |
| **Hình khối** | Hình tròn là motif chính: vòng tròn viền mảnh cho nút "Learn more/View/View more/Expand", số thứ tự (Mission, Project detail), huy hiệu chữ chạy vòng (scroll cue, back-to-top), chấm timeline. **Bo góc lớn chỉ cho thẻ chữ** (USP ~2rem, card story bo 1 góc 3rem, card form 1rem, nút pill 3rem). **Đường kẻ mảnh 1px** dùng rất nhiều: kẻ ngang nối tiêu đề, vạch dọc ngăn tên với CTA trên thẻ, gạch chân input, hàng danh sách Jobs, trục timeline |
| **Icon** | Icon line đơn sắc xám ~2px nét (USP, Core Values, liên hệ, pin bản đồ). Milestone dùng pictogram đặc. Mũi tên ← → mảnh, không có nền. Social icon xám đặc nhỏ |
| **Motion thấy được** | Có thể quan sát qua ảnh: header co lại khi cuộn (120 → 66px, logo to → nhỏ); **scroll-reveal fade/translate** (nhiều ảnh chụp nhanh còn mờ); carousel thẻ active (thẻ bên mờ 50% và nhỏ hơn); video autoplay khi tới viewport; breadcrumb chạy chữ; menu làm mờ nền. Chuyển động trượt chưa quan sát được vì ảnh là tĩnh [CXĐ] |
| **Nhất quán** | Page head, sub-nav cuối cụm, footer, motif vòng tròn, cặp "tên \| vạch dọc \| CTA micro" trên thẻ, tab/breadcrumb dính: lặp lại đều ở các trang |
| **Lệch nhau giữa các trang** | (1) H1 Contact đậm 600 chữ trắng trên banner, trong khi các trang khác mảnh 200. (2) H1 bài tin sentence case 33/600. (3) Tiêu đề khối zig-zag lúc 700 (Activities, Sustainability) lúc 300 (Factory Visit). (4) Nút có 4 kiểu: viền chữ nhật (RECEIVE CATALOGUE), viền chữ nhật nhỏ bo 5px (PLAY/STOP), pill đặc xám (form), vòng tròn (View more). (5) Tiêu đề section lúc căn giữa (Home, page head) lúc căn trái kèm kẻ ngang (Core Values, Jobs). (6) Thumbnail YouTube kiểu banner lệch tông. (7) Header ẩn ở một số ảnh (Showroom) [CXĐ] |

### 10.4 Phát hiện mới so với bản phân tích tĩnh

1. **Có hẳn một trang dịch vụ Factory Visit cho người mua** (đưa đón sân bay, F&B, nơi nghỉ, 100 lượt/năm). Đây là nội dung B2B mạnh mà bản tĩnh chưa nhắc tới.
2. **Milestone dùng pictogram tăng dần số lượng** và năm cỡ ~90px màu nhấn để kể chuyện quy mô bằng hình.
3. **Sustainability gộp chứng chỉ FSC/SMETA và 6 thẻ vật liệu dạng packshot**. Thực chất đây là trang "Materials" của ATC.
4. **Partners là lưới 24 logo màu gốc**, nhưng không xuất hiện trên Home. Social proof bằng logo bị giấu ở cấp 3 của menu.
5. **Danh sách dùng pattern "N POSTS LEFT" + nút tròn View more** (Projects 6/24, Exhibition 9/14) thay cho hiển thị toàn bộ.
6. **Sub-nav đặt ở cuối trang**: thanh ngang cho cụm About, dải icon cho cụm USP. Thanh tab chuyên mục và breadcrumb **dính dưới header** ở News, Videos, sản phẩm.
7. **Hệ "3 giọng" typography** (mảnh in hoa / đậm nội dung / micro-label) và **motif vòng tròn + kẻ mảnh** là xương sống nhận diện, không chỉ đơn giản là "chữ mảnh".
8. Ảnh sản phẩm và bài tin có **dấu hiệu render/AI**, trong khi ảnh dự án, nhà máy và sự kiện là ảnh thật. Scroll-reveal làm khối trống khi cuộn nhanh.

### 10.5 Tổng hợp đính chính (đã đính chính theo ảnh chụp)

| Mục | Nhận định tĩnh | Thực tế theo ảnh |
|---|---|---|
| 1 (tóm tắt) | Tiêu đề in hoa nét mảnh, gần như không có solid button | Mảnh chỉ ở H1/tiêu đề section; tiêu đề khối nội dung đậm 700; có nút pill đặc ở form |
| 2.3 | Menu fullscreen trượt từ dưới lên, danh sách căn phải | Panel trắng bên trái (~30%) + cột cấp 2 xám đậm, nền trang bị blur; không phải nền đặc phủ kín |
| 3.3 | Ảnh/thẻ không bo | Ảnh không bo; thẻ chữ có bo (1rem, ~2rem, 1 góc 3rem), nút pill 3rem |
| 4 #1 | H1 trắng in hoa gần đáy hero | Không thấy H1 trên hero ở 1424×805; chỉ có huy hiệu tròn scroll cue |
| 4 #2 | Intro 2 cột (quote trái, story phải) | Xếp dọc: quote, rồi card xám bo 1 góc chứa H2 đậm |
| 5.3 | Accordion 5 tab gồm DESCRIPTION | 4 tab; description là đoạn văn dưới H1; SPECIFICATIONS mở sẵn |
| 5.4 | Lưới 2 cột 24 dự án; chi tiết là lưới ~13 ảnh | Hiện 6 + "18 POSTS LEFT"; chi tiết là ảnh so le trái/phải có vòng số |
| 5.5 | (ngầm định sidebar mục con) | Không có sidebar; sub-nav ngang ở cuối trang |
| 5.6 | Lưới 8 ô 2×4 | 4 cột thẻ bo lớn so le dọc (masonry) |

---

## 11. Phụ lục

### 11.1 URL đã xem (tải bằng curl, 2026-11-04)

| URL | Nội dung chính |
|---|---|
| https://atc-craft.com/ | Trang chủ (HTML 205 KB) |
| https://atc-craft.com/vi/ | Trang chủ tiếng Việt |
| https://atc-craft.com/products/ | Tổng danh mục + filter |
| https://atc-craft.com/products/wicker-furniture/ | Danh mục cấp 2 |
| https://atc-craft.com/products/wicker-furniture/sofa-sets/ | Danh mục cấp 3 (40 sản phẩm) |
| https://atc-craft.com/products/wicker-furniture/sofa-sets/bora-en/ | Chi tiết sản phẩm |
| https://atc-craft.com/projects/ | Danh sách dự án |
| https://atc-craft.com/mia-resort-nha-trang-en/ | Chi tiết dự án |
| https://atc-craft.com/about-us/ | Giới thiệu |
| https://atc-craft.com/why-choose-atc/ | USP |
| https://atc-craft.com/showroom/ | Showroom |
| https://atc-craft.com/catalogue-en/ | Form nhận catalogue |
| https://atc-craft.com/contact/ | Liên hệ |
| https://atc-craft.com/template/css/app.css?ver=1.1.1 | CSS animation/hover |
| https://atc-craft.com/template/js/common.js?ver=1.1.1 | GSAP, ScrollTrigger, Splitting, smooth scroll |
| https://atc-craft.com/template/js/app.js?ver=1.1.1 | Logic trang (slider, filter AJAX, menu) |
| HEAD request các file media hero/ảnh | Đo dung lượng (video 23,9 MB / 24,5 MB; ảnh WebP ~312 KB; JPG dự án 579 KB desktop / 176 KB mobile) |

### 11.2 Hạn chế của phân tích

- (Áp dụng cho mục 1–9 bản tĩnh; mục 10 đã bổ sung ảnh chụp runtime) Không chụp màn hình và không thực thi JS: bố cục, chuyển động, màu thực tế trên ảnh/video đều **suy ra từ code**. Các giá trị CSS trích là giá trị khai báo; một số selector có nhiều giá trị theo breakpoint, tài liệu chỉ nêu giá trị chính.
- Không đo Core Web Vitals (Lighthouse/PageSpeed); nhận định hiệu năng dựa trên dung lượng file và thuộc tính `preload`/`loading`.
- Không gửi thử form (tránh tạo lead giả); hành vi validate/thank-you chỉ suy từ thuộc tính HTML.
- Script bên thứ ba nạp qua GTM (Termly, analytics…) không được liệt kê đầy đủ.
- Chỉ xem 1 sản phẩm, 1 dự án đại diện. Bản runtime đã bổ sung Milestone, Sustainability, News, Jobs (mục 10.2).
- Runtime: chỉ chụp desktop 1424×805, chưa xem mobile. Ảnh là tĩnh nên không quan sát được hướng hay tốc độ chuyển động. Do scroll-reveal, một số ảnh chụp nhanh còn mờ (đã chụp lại Core Values, USP detail). Bài tin dài 19.841px nên chỉ chụp 12 viewport đầu. Chưa chụp trang chi tiết hội chợ, chuyên mục tin, tab video, các USP và danh mục còn lại vì dùng chung template.
- Tần suất màu đếm theo số lần khai báo trong CSS, không phản ánh diện tích hiển thị (phần lớn diện tích là ảnh/video).
