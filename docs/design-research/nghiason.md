# Phân tích UI/UX: nghiason.com.vn

> Mục đích: rút ra pattern UI/UX để BFC học hỏi. **Không** sao chép logo, ảnh, copy hay nhận diện thương hiệu của Nghĩa Sơn.
>
> Quy ước nhãn trong tài liệu:
> - **[QS]** Quan sát: có dẫn chứng trực tiếp từ HTML/CSS/JS đã tải (tên class, giá trị CSS, file nguồn).
> - **[SL]** Suy luận: rút ra từ code, chưa nhìn thấy trên màn hình thật.
> - **[CXĐ]** Chưa xác định: không đủ dữ liệu để kết luận.
>
> **Lưu ý quan trọng:** không chụp được màn hình. Mọi nhận định về bố cục, màu sắc hay cảm giác thị giác đều **suy ra từ HTML/CSS**, chưa quan sát trực tiếp trên trình duyệt.

---

## 1. Tổng quan

| Mục | Nội dung |
|---|---|
| Ngày phân tích | 2026-11-04 |
| Định vị | Nhà sản xuất nội thất gỗ đặc (teak, bạch đàn, keo) ở Đồng Nai, hoạt động từ 2006, bán B2B xuất khẩu theo container và có thêm dịch vụ dropship tại Mỹ **[QS]** (title: "Wooden Furniture Manufacturer", meta description, topbar "Furniture manufacturing in Vietnam · Since 2006") |
| Đối tượng | Nhà nhập khẩu/nhà phân phối, chuỗi bán lẻ quốc gia, người bán TMĐT, designer/brand **[QS]** (select "I am a" trong form báo giá; menu "Programs") |
| Ngôn ngữ chính | Tiếng Anh (`<html lang="en-US">`); bản dịch máy qua GTranslate (zh-CN, en, fr, de, ja, vi), `url_structure: none`, không có `hreflang` **[QS]** |
| Nền tảng | WordPress (đường dẫn `/wp/` và `/public/` kiểu Bedrock/tùy biến) + **WooCommerce 11.2** (chỉ làm catalog, không có giá/giỏ hàng) + **Elementor 4.2 / Elementor Pro 4.1** + theme tùy biến `nghiason` v1.4.13 dựng trên **Bootstrap 5** **[QS]** |
| SEO plugin | Rank Math (comment "Search Engine Optimization by Rank Math") **[QS]** |
| Server | LiteSpeed, PHP 8.3 **[QS]** (response header) |
| JS chính | jQuery 3.7 + migrate, Swiper 8.4.5 (gói của Elementor), Fancybox, Lucide icons, Motion 11.13 (Elementor interactions), Contact Form 7, script WooCommerce, GTM, YouTube IFrame API **[QS]** |

File CSS chính (đều đã tải về để trích token):
- `public/themes/nghiason/assets/dist/style.css?ver=1.4.13` (≈151 KB, gồm Bootstrap 5 + token và component của theme)
- `public/uploads/elementor/css/base-desktop.css`, `base-mobile.css`, `local-66-frontend-desktop.css` (CSS sinh từ Elementor cho trang chủ, id 66)
- Inline `<style data-nghiason-style="widget-hero|widget-capability|widget-category">` (CSS riêng từng widget tùy biến) và `<style id="dolazo-menus-mega-css">` (mega menu)

File JS chính: `public/themes/nghiason/assets/dist/app.js`, `contact-widget.js` (nạp động qua `addScript`), cùng các script inline `nghiason-app-js-after`.

---

## 2. Information architecture & navigation

### 2.1 Sitemap **[QS]** (từ menu và `sitemap_index.xml` của Rank Math)

```
Home
├── Products (mega menu) → /catalog/
│   ├── Outdoor Furniture
│   │   ├── Outdoor Seating (8 nhóm con: Dining Chairs, Lounge, Adirondack, Rocking, Folding, Recliners, Benches, Stools)
│   │   ├── Outdoor Furniture Sets (5 nhóm con)
│   │   ├── Outdoor Tables (2 nhóm con trong menu, 5 nhóm trong bộ lọc)
│   │   ├── Chaise Lounges
│   │   └── Garden & Outdoor Living (6 nhóm con, gồm Decking Tiles)
│   └── Indoor & Home (6 nhóm con)
├── Programs (link "#", chỉ là nhóm)
│   ├── For Importers & Distributors   /furniture-sourcing-for-importers/
│   ├── For National Retailers          /furniture-for-retailers/
│   └── U.S. Dropshipping               /furniture-dropshipping-usa/
├── Resources (link "#")
│   ├── Buyer Resources → Furniture Sourcing, Materials & Specifications (blog category)
│   └── News & Updates  /news/
├── About Us
├── Contact Us
└── (footer) Terms and Services, Privacy Policy, Terms of Trade
```

- Product sitemap có khoảng 180 URL sản phẩm; catalog hiển thị "180 products" **[QS]**.
- URL sản phẩm phẳng, không có tiền tố danh mục (`/vlaso-table/`); URL danh mục lồng nhau (`/outdoor-furniture/outdoor-seating/dining-chairs/`) **[QS]**.
- Không có trang "Projects/Case study" riêng. Phần "dự án" được thay bằng ảnh nhà máy, tin tức và tile "Our works" ở trang chủ **[QS]**.
- Điểm đáng chú ý về IA: tách **"Programs" theo loại khách hàng** (importer, retailer, dropship) thay vì chỉ theo sản phẩm **[QS]**. Mỗi trang program là một landing page riêng, viết cho đúng câu hỏi của nhóm khách đó.

### 2.2 Header **[QS]** (`.nghiason-header`, style.css)

Có 3 tầng xếp chồng:
1. **Stripe 3px** màu `--color-wood-500` (#931010, đỏ gỗ) ở trên cùng (`.nghiason-header__stripe{height:3px}`). Đây là một chi tiết nhận diện thương hiệu nhỏ.
2. **Topbar** (chỉ hiện từ desktop, `d-none d-lg-block`): email + điện thoại bên trái, câu trust "Furniture manufacturing in Vietnam · Since 2006" bên phải. Cỡ chữ `--text-xs` (12px), cao tối thiểu 36px.
3. **Main bar**: logo (106×60) | nav ngang | cụm CTA gồm nút chọn ngôn ngữ GTranslate, nút search (mở dialog), icon gọi điện (desktop), nút **"Request a quote"** (primary), hamburger.
   - `min-height: 64px` trên mobile, `76px` từ 992px.
   - `position: sticky; top: 0`; thêm class `.is-scrolled` thì có `box-shadow: var(--shadow-md)` (app.js nghe sự kiện scroll).

### 2.3 Menu
- **Mega menu** cho "Products" **[QS]**: panel rộng `min(820px, 100vw - 40px)`, viền trên 3px màu wood-500, mở bằng `:hover`, gồm 2 cột (25% mỗi cột theo `--mega-column-width`) liệt kê đủ 3 cấp danh mục. Ở ≤1024px thì tắt mega menu.
- Dropdown thường cho Programs/Resources (mục cha có `href="#"`) **[QS]**. **[SL]** Cách này có rủi ro về khả năng truy cập vì mục cha không phải trang thật.
- **Drawer mobile** **[QS]**: panel trượt từ phải (`translateX(100%)` → `0`, `250ms ease`), rộng `min(360px, 100% - 48px)`, viền trái 3px wood-500, có backdrop, `role="dialog" aria-modal`. Mỗi mục cha có link riêng và một nút chevron riêng để mở menu con (accordion nhiều cấp; keyframe `nghiason-drawer-sub`). Cuối drawer có **2 nút full-width**: "Request a quote" và "Call +84…", kèm email và câu trust.
- **Search overlay** **[QS]**: dialog modal, placeholder "Product name, SKU or category", gợi ý "Type at least two characters", kết quả trả về qua AJAX (`aria-live="polite"`), có trạng thái rỗng kèm icon `search-x`.

### 2.4 Footer **[QS]** (`.nghiason-footer`, nền `--color-bg-dark` #141f15)
Thứ tự các khối:
1. **Statement + CTA**: câu lede ngắn, đoạn mời gửi bản vẽ/spec, nút lớn "Request a quote". Desktop xếp hàng ngang, mobile xếp dọc.
2. **Products menu**: 6 danh mục.
3. **Locations**: kicker "Factories & contact", ghi chú "Buyers are welcome to visit…", **card cho từng nhà máy** (nhãn, địa chỉ, link "View on Google Maps" với icon pin) và card "Export desk" (Tel/WhatsApp/Zalo, email).
4. **Bottom bar**: links pháp lý, copyright và số giấy phép kinh doanh.

Footer dùng biến cục bộ (`--f-hairline: rgba(255,255,255,.12)`, `--f-ink: rgba(255,255,255,.75)`, `--f-accent: forest-300`). **[SL]** Đây là cách gọn để quản lý màu chữ trên nền tối.

### 2.5 Thành phần nổi toàn site **[QS]**
- **Floating contact widget** (`.nghiason-contact`, `position: fixed; bottom: 24px`): một nút toggle mở ra danh sách kênh Hotline / Request a quote / WhatsApp. Các mục hiện lần lượt (`transition-delay: calc(var(--nc-i) * .05s)`, easing có overshoot `cubic-bezier(.34,1.56,.64,1)`), có keyframe `nghiason-contact-pulse`, và một pill nhãn hiện khi hover trên desktop.
- **Quote popup** (`data-quote-popup`): mọi nút "Request a quote" đều mở cùng một modal chứa form CF7, kèm hotline "Prefer to talk?". Khi gửi thành công có animation `nghiason-success-pop` / `nghiason-success-check`.

---

## 3. Design tokens

Nguồn: khối `:root` đầu file `themes/nghiason/assets/dist/style.css` **[QS]**, trừ khi ghi khác.

### 3.1 Typography

| Token | Giá trị | Ghi chú |
|---|---|---|
| Font | `"Be Vietnam Pro"` cho cả `--font-display`, `--font-serif`, `--font-sans` | Google Fonts, trọng lượng 300/400/500/600/700 + italic 400, `display=swap`, có preconnect **[QS]** |
| Thang cỡ | xs 12 · sm 14 · base 16 · md 18 · lg 20 · xl 24 · 2xl 32 · 3xl 40 · 4xl 48 · 5xl 60 · 6xl 72 (px) | `--text-*` |
| Line-height | tight 1.2 · snug 1.35 · normal 1.5 · relaxed 1.65 · loose 1.8 | |
| Tracking | tight −0.02em · wide 0.04em · wider 0.08em · widest 0.16em | |
| H1 theme | 32px (mobile) → 48px (≥992) | `h1{font-size:var(--text-2xl)}` + media query |
| `.display` (title trang con) | 40px → 60px, semibold, tracking −0.02em | |
| Hero H1 (trang chủ) | 63px desktop / 38px tablet / 30px mobile, line-height 1.08 | CSS Elementor `local-66` **[QS]** |
| H2 section | 42px, line-height 1.08 (catalog); clamp(2rem, 4vw, 3.25rem) dùng 4 lần | Elementor + inline widget CSS |
| Eyebrow | 12px, uppercase, letter-spacing 0.16em, weight 600, màu brand | `.nghiason-page-header__eyebrow`, `.nghiason-cat__eyebrow` |
| Nút | 14px, **bold, uppercase, tracking 0.08em**; `.btn--lg` 16px, padding 16×36 | `.btn` |

### 3.2 Màu

Có 4 dải màu 50–900 và lớp alias ngữ nghĩa **[QS]**:

| Nhóm | Giá trị chính | Vai trò |
|---|---|---|
| `forest` | 500 `#3c8334` (primary), 600 `#2f6f2a` (hover), 700 `#235921` (active), 100 `#e5f2e3` | CTA, link, focus ring, `theme-color` |
| `wood` | 500 `#931010` | Accent: stripe header, viền mega menu/drawer, màu error |
| `sand` | 50 `#f2f8f4` (nền trang), 100/200 `#e9f2ec`/`#ceded3` (border) | Nền ấm ánh xanh và đường kẻ |
| `dark` | 800 `#141f15` (chữ chính, nền footer), 500 `#435b47` (chữ phụ), 400 `#58745d` (muted) | Chữ và nền tối |
| Semantic | `--color-bg-page: sand-50`, `--color-bg-surface: #fff`, `--color-border: sand-200`, `--color-warning: #b07a20` | |

Tần suất hex trong CSS đã gộp (theme + inline + Elementor) **[QS]**: `#fff` 27, `#141f15` 16, `#3c8334` 12, `#706f6f` 9, `#d6d5d5` 8, `#435b47` 8. Các biến dùng nhiều nhất: `--color-border` 33, `--color-primary` 31, `--color-text-primary` 25.

**[SL]** Bảng màu trung tính đều pha sắc xanh lá (chữ #141f15 thay cho đen thuần, nền #f2f8f4 thay cho trắng thuần), nhờ vậy toàn site có tông "gỗ và rừng" thống nhất. Overlay ảnh dùng nâu đen `rgba(16,10,4,.32–.62)` thay cho đen thuần.

### 3.3 Spacing & layout

| Token | Giá trị |
|---|---|
| `--space-*` | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128 px (bước 4px) |
| Container | Bootstrap: 540 / 720 / 960 / 1140 / **1280** (≥1400); `--container-xl: 1280px` |
| Gutter | `--gutter: 24px` |
| Section padding | `.section{padding-block:32px}`; Elementor ghi đè trên trang chủ thành 80px dưới và 20–80px trên |
| Breakpoints | 576 / 768 / **992** (dùng nhiều nhất, 37 lần) / 1200 / 1400; thêm `max-width:359.98px` cho máy rất nhỏ |
| Hero | `min-height: 760px`, nội dung `max-width: 800px` |
| Category grid | 2 cột (mobile) → 3 (≥768) → 4 (desktop); hàng cao 172 / 210 / 244px; gap 12px; `grid-auto-flow: dense` |

### 3.4 Radius, border, shadow

| Token | Giá trị | Dùng nhiều nhất |
|---|---|---|
| Radius | sm 2 · md 4 · lg 8 · xl 12 · full 9999 | `--radius-sm` cho nút (11 lần), 999px cho pill/indicator, 8px cho tile, 10–12px cho card tin/video |
| Border | thin 1 · base 1.5 · thick 2 | Nút viền 2px |
| Shadow | xs → xl, màu bóng `rgba(20,31,21,…)` (ánh xanh), 2 lớp | Header khi cuộn dùng `shadow-md`, drawer dùng `shadow-xl`; tile hover `0 2px 4px … , 0 20px 44px …` |

**[SL]** Radius nhỏ (2–4px) trên nút cho cảm giác "công nghiệp, chắc chắn". Radius lớn hơn chỉ dùng cho card ảnh.

### 3.5 Motion

| Token / hiệu ứng | Giá trị |
|---|---|
| `--transition-fast/base/slow` | 150 / 250 / 400ms ease |
| Tile zoom | `transform 620ms cubic-bezier(0.16, 1, 0.3, 1)` (easeOutExpo), scale 1.06 |
| Hero video fade-in | `opacity 500ms ease` khi có class `.is-playing` |
| Keyframes | `hero-video-wash` (vệt sáng quét ngang khi chờ video), `hero-video-pulse` (thanh loading 2px ở đáy hero), `nghiason-contact-pulse`, `nghiason-drawer-sub`, `nghiason-success-pop/check` |
| Counter | Đếm số với easeOutCubic trong 1200ms, kích hoạt bằng IntersectionObserver ở ngưỡng 0.35 (app.js `initCounters`) |
| Reduced motion | 10 khối `@media (prefers-reduced-motion: reduce)`; hero video **không chạy** khi người dùng bật reduce motion |
| Thư viện | Swiper 8, Fancybox (lightbox có thumbs, kéo để đóng), Motion 11 (Elementor interactions). **Không có** GSAP, AOS hay Lenis **[QS]** |

---

## 4. Trang chủ: phân tích từng section theo thứ tự

Thứ tự lấy từ `data-widget_type` trong HTML **[QS]**. Mọi widget đều là widget Elementor tùy biến (`nghiason-*`), không dùng widget Elementor mặc định.

### 4.1 Hero (`nghiason-hero`)
- **Mục đích:** nói rõ "là ai, làm gì, có chứng chỉ gì" và đưa người xem tới báo giá.
- **Bố cục [QS/SL]:** một slide duy nhất (code hỗ trợ nhiều slide qua Swiper nhưng chỉ dùng 1), cao 760px, nội dung căn giữa, max-width 800px. Nền là **video YouTube muted autoplay loop**, poster là ảnh webp được `preload` với `fetchpriority="high"`. Overlay `#100A049E` (nâu đen, alpha khoảng 62%).
- **Nội dung [QS]:** eyebrow ("Sustainable Wood"), H1 chứa từ khóa SEO ("Solid Wood Furniture Manufacturer in Vietnam"), sub nêu cụ thể **ISO 9001, ISO 14001, EUDR, Lacey Act**, sau đó là 2 CTA: primary "Request a quote →" (mở popup) và outline-inverse "View catalog" (cuộn xuống `#explore-the-catalogue`).
- **Tương tác [QS]:** iframe dùng `data-src` và chỉ gán `src` sau `DOMContentLoaded` + rAF + 80ms. Video fade-in khi player báo PLAYING và tự tua lại khi ENDED. Trong lúc chờ có hiệu ứng sweep sáng và thanh pulse. Tắt hoàn toàn khi `prefers-reduced-motion`. Iframe phóng to `scale(1.4)` để che UI của YouTube.

### 4.2 Capability strip (`nghiason-capability-strip`)
- **Mục đích:** trả lời ngay 4 câu hỏi mua hàng B2B: năng lực, fulfillment, compliance, OEM/ODM.
- **Bố cục [QS]:** header (eyebrow "Manufacturing capability" + H2 + intro), dưới là **4 card** dạng grid 4 cột trên desktop. Mỗi card: icon Lucide, metric đậm 20px ("100+", "Dropshipping", "OEM / ODM"…), label nhỏ, mô tả 1 câu. Mỗi card có một **gạch accent 48×2px** màu forest ở mép trên (`::before`). Nền card trắng trên nền trang sand-50, `min-height: 178px`.
- **Mobile [QS]:** biến thành **thanh cuộn ngang có scroll-snap** (`flex: 0 0 min(78vw, 300px)`, `scroll-snap-type: x mandatory`, ẩn scrollbar), kèm **gradient mờ 56px ở mép phải** để gợi ý còn nội dung bên phải.

### 4.3 Category grid (`nghiason-category-grid`, `id="explore-the-catalogue"`)
- **Mục đích:** lối vào catalog bằng hình ảnh.
- **Bố cục [QS]:** header 2 cột: trái là eyebrow + H2 42px + intro, phải là `<dl>` gồm 2 chỉ số ("3 hardwood species", "100+ containers/month"), có counter animation. Dưới là **bento grid** 7 tile: 1 tile `--feature` (span 2×2), 2 tile `--wide`, 4 tile `--regular`, cuối grid có nút "View All Products".
- **Tile [QS]:** cả tile là một `<a>`; ảnh nền là `background-image` (không phải `<img>`); scrim nâu 32%; tên danh mục + dòng meta nhóm con ("Seating · Sets · Tables · Garden"); **mũi tên `arrow-up-right` trong ô tròn** ở góc.
- **Hover (chỉ khi `hover: hover`) [QS]:** tile nhấc lên 3px, bóng sâu hơn, ảnh scale 1.06 trong 620ms easeOutExpo, scrim đậm lên 50%, mũi tên chuyển nền forest-600. Tile feature và wide luôn hiện mũi tên, tile regular chỉ hiện khi hover. Có `:focus-visible` tương đương hover, tốt cho người dùng bàn phím.

### 4.4 Video / factory (`nghiason-video`)
- **Mục đích:** "See how we work", tạo tin cậy bằng hình ảnh nhà máy thật.
- **Nội dung [QS]:** eyebrow "Company & factory", H2, intro, **3 trust chip** (Exporting since 2006 · US · Europe · Japan · Factory audits welcome), sau đó là khối video feature 16:9, radius 12px, scrim 42%, có eyebrow/heading đè lên ảnh và nút "About Us" (btn--light). Video lazy (iframe `data-src`) và có Fancybox. **[CXĐ]** Video phát inline hay mở trong lightbox.

### 4.5 Newsroom (`nghiason-newsroom`)
- **Mục đích:** chứng minh công ty đang hoạt động và có câu chuyện văn hóa.
- **Bố cục [QS]:** eyebrow "Newsroom" + H2 "Life at …" + intro. Trái là 3 bài viết (title, excerpt, "Read more"). Phải là **gallery tile** 4:3 (các album "20th Anniversary", "Our Certifications", "Our works"; tile cuối `--full` span cả hàng), mỗi tile hiển thị **số lượng ảnh** (22, 2, 24) và mở lightbox Fancybox. Radius 10px. Trên mobile, gallery chuyển thành thanh cuộn ngang có snap.

### 4.6 Footer
Xem mục 2.4. **[SL]** Trang chủ kết thúc bằng CTA lớn trong footer nên không cần thêm một section CTA riêng.

**Nhịp tổng thể [SL]:** Hero tối → nền sáng (capability) → nền sáng (catalog) → khối ảnh tối (video) → nền sáng (news) → footer tối. Mọi section đều theo một công thức header thống nhất: **eyebrow uppercase 12px tracking 0.16em màu brand, H2 lớn line-height 1.08, intro 1 câu**.

---

## 5. Template trang con

### 5.1 Catalog / danh mục (`/catalog/`, `/outdoor-furniture/outdoor-seating/`) **[QS]**
- Page header gọn: breadcrumb và H1 `.display`, không có hero ảnh.
- **Sidebar filter** dạng form (`.nghiason-filter`): checkbox danh mục lồng 3 cấp (`check-label--depth-1/2`), **màu** (Black, Natural, Weather Grey, White), **chất liệu** (Acacia, Eucalyptus…). Trên mobile, filter mở trong **bottom sheet** (`shop-sheet-head`, `shop-sheet-foot__apply` với nút "Show results 180" cập nhật số kết quả).
- Toolbar: đếm "180 products", chọn số mục mỗi trang, **chọn mật độ lưới 3/4/5/6 cột** (`<details>` dropdown). Mặc định 6 cột.
- **Product card** (`.nghiason-pcard`): ảnh 1:1 (300px, có srcset, lazy), meta gồm **danh mục (link) và SKU**, title H2, excerpt. **Không có giá và không có nút giỏ hàng.**
- Phân trang dạng số (24 sản phẩm mỗi trang).
- Schema: `CollectionPage` + `BreadcrumbList`. Trang danh mục có title SEO riêng ("Wholesale Wooden Outdoor Seating | …").

### 5.2 Chi tiết sản phẩm (`/vlaso-table/`) **[QS]**
- Breadcrumb 4 cấp, gallery 6 ảnh 1:1 (ảnh đầu `loading="eager" fetchpriority="high"`, các ảnh còn lại lazy), Fancybox nhóm theo sản phẩm.
- Summary: H1, **SKU**, excerpt, **bảng spec tóm tắt** gồm: Material, Product dimensions **cm kèm inch**, Carton dimensions, **CBM per carton**, Color, **Loading 20′ / 40′ / 40′HQ (số chiếc)**, Custom color.
- 2 CTA có nhãn phụ: "Request a quote / Discuss specifications and quantities" (primary) và "Call us / +84…" (outline).
- **Tabs** Description / Specification. Description là nội dung SEO dài có H2 theo khung cố định: Product Configuration → Material and Color → Carton and Container Planning → Wholesale Inquiry Requirements → **Buyer Questions (H3 dạng FAQ)** → Request a Quote. Sau đó là một băng `quote-cta` (thông điệp + nút + hotline).
- Widget **"Supplier at a glance"** (`nghiason-wfacts`): Capacity, Materials, Sustainability, Compliance, Export markets, kèm link báo giá.
- Related products (4 card).
- **Điểm yếu:** chỉ có schema `BreadcrumbList`, **không có `Product` schema** **[QS]**. Ảnh sản phẩm là JPG gốc 1500px (≈ không chuyển sang webp) **[QS]**.

### 5.3 About (`/about-us/`) **[QS]**
Dựng bằng widget HTML thô (class `ns-*`), là một trang dài nhiều chương:
1. Intro: eyebrow, H1, 3 đoạn, nút báo giá, ảnh, **3 chỉ số lớn** (2006 / 2 nhà máy / 4 kho).
2. **"Explore our capabilities"**: mục lục 4 thẻ (Manufacturing, OEM/ODM, Quality control, How to start), mỗi thẻ có tiêu đề và mô tả 1 dòng. **[SL]** Đây là anchor nav nội trang.
3. Products & materials (nền trắng): danh sách 14 nhóm sản phẩm.
4. Manufacturing scale (nền sand): con số "100+", ảnh, rồi 3 cột năng lực (Preparation & machining / Assembly & finishing / Packaging & QC) dạng bullet.
5. **Gallery nhà máy có figcaption** cho từng ảnh (cổng, xưởng máy, kho gỗ sấy, lò sấy, dây chuyền, lắp ráp, QC, hoàn thiện, kho thành phẩm).
6. OEM/ODM: 11 bullet dịch vụ.
7. **Quality (nền dark)**: 4 giai đoạn (Incoming → In-process → Assembly & packaging → Final assurance) và "Standards & documentation".
8. Responsible sourcing: mã chứng chỉ FSC theo từng pháp nhân.
9. U.S. fulfillment: bản đồ kho và danh sách khả năng.
10. Customer programs.

**[SL]** Các section được phân biệt bằng nền xen kẽ white / sand / dark (`ns-section--white|--sand|--dark`).

### 5.4 Program landing (`/furniture-sourcing-for-importers/`) **[QS]**
Đây là template đáng học nhất cho B2B:
- Hero split: kicker, H1, đoạn mô tả, **4 "term" dạng label/value** (Product range: Outdoor & indoor · Dimensions: cm + inch · Order planning: Carton & loading data · Location), CTA "Discuss your import requirements" và 2 link phụ, ảnh, badge "Since 2006".
- "Build your product shortlist": 3 card danh mục, mỗi card có nút.
- Split "An existing range. A brief of your own.": 2 khối (Product & material / Packing & presentation).
- **Process "Four steps to a useful import brief"**: các bước đánh số 01–04.
- "Specifications you can review": 5 mục giải thích cách đọc spec (dimensions, materials, carton & CBM, container loading, commercial).
- FAQ 3 câu (MOQ, thời gian mẫu và sản xuất, gộp hoặc chỉnh sản phẩm).
- Closing CTA "Start your … brief".

### 5.5 Contact (`/contact-us/`) **[QS]**
- H1 và đoạn tóm tắt năng lực (2 nhà máy, 100+ container/tháng, thị trường).
- **Card cho từng nhà máy**: ảnh, địa chỉ, giờ làm việc (Mon–Fri 08:00–17:00), email, Tel/WhatsApp/Zalo.
- Form "Ask a question" ngắn (4 trường: tên, email, công ty, tin nhắn) với cam kết "follow up within one working day".
- **FAQ accordion** 7 câu (cách lấy báo giá, sản xuất gì, công suất, thị trường **kèm tên khách hàng lớn**, làm theo thiết kế riêng, số năm hoạt động, có được thăm nhà máy không).
- **Form báo giá (popup, dùng toàn site)**: Full name*, Business email*, Phone/WhatsApp, Company, **I am a\*** (6 loại người mua), **Interested in\*** (6 nhóm), Product/SKU, Message, kèm ghi chú "We reply within one working day. Your details are used only to prepare this quote."

### 5.6 Blog / Resources (`/news/`, `/resources/materials-specifications/`) **[QS]**
Page header có eyebrow "Newsroom" + H1 + mô tả. Sidebar "Categories" có trạng thái `is-current`. Có khối "Featured" (feature card lớn), rồi danh sách "Articles" dạng **row card** (category, title, excerpt), phân trang có "Next page". Nội dung thiên về **hướng dẫn cho người mua** (ví dụ so sánh các loại gỗ) bên cạnh tin công ty.

---

## 6. Pattern tương tác & motion (tổng hợp)

| Pattern | Chi tiết | Nhãn |
|---|---|---|
| Sticky header có trạng thái scrolled | Thêm shadow khi cuộn, không thu nhỏ chiều cao | QS |
| Một CTA thống nhất → một modal | Mọi nút "Request a quote" (header, hero, footer, drawer, product, floating) đều mở chung một popup form; khi không có JS thì fallback về `/contact-us/` | QS |
| Video hero lazy kèm skeleton | Poster preload, iframe nạp sau, có hiệu ứng sweep/pulse trong lúc chờ, fade-in khi phát | QS |
| Hover tile kiểu "lift + zoom + scrim + arrow" | Chỉ áp dụng khi `@media (hover: hover)`, có focus-visible tương đương | QS |
| Counter số khi vào viewport | IntersectionObserver ngưỡng 0.35, 1200ms easeOutCubic | QS |
| Cuộn ngang có snap trên mobile | Capability strip, news gallery; có gradient mép báo còn nội dung | QS |
| Lightbox gallery | Fancybox kèm thumbs, slideshow, kéo để đóng; tile hiện số ảnh | QS |
| Floating multi-channel contact | Hotline / Quote / WhatsApp, mở lần lượt với easing overshoot | QS |
| Search overlay AJAX | Tối thiểu 2 ký tự, `aria-live`, có trạng thái rỗng | QS |
| Bottom-sheet filter (mobile) | Nút apply hiển thị số kết quả | QS |
| Scroll reveal khi cuộn | Không thấy class reveal hay AOS. Motion 11 của Elementor có được nạp nhưng **[CXĐ]** có tương tác nào thực sự được cấu hình | CXĐ |
| Tôn trọng reduced motion | 10 media query và tắt video hero | QS |

---

## 7. Mobile / responsive

- **Mobile-first theo Bootstrap** **[QS]**: phần lớn query là `min-width`, mốc chính 992px (37 lần). Topbar, icon gọi điện và mega menu ẩn dưới 992/1024px.
- **Viewport khóa zoom** **[QS]**: `maximum-scale=1, user-scalable=no`. Đây là **lỗi accessibility** (WCAG 1.4.4), không nên học theo.
- Hero H1 giảm 63 → 38 → 30px. Category grid đi từ 4 xuống 3 rồi 2 cột, chiều cao hàng giảm 244 → 210 → 172px **[QS]**.
- Nút trong hero full-width trên mobile (`.nghiason-hero__actions .btn{width:100%}`), có xử lý riêng cho màn hình < 360px **[QS]**.
- Drawer gom đủ menu 3 cấp và đặt 2 CTA lớn ở cuối. Floating contact luôn trong tầm ngón cái **[QS/SL]**.
- `@media screen and (max-height: 640px)` có xử lý cho màn hình thấp **[QS]**. **[CXĐ]** Đang áp dụng cho thành phần nào.

---

## 8. Điểm mạnh / điểm yếu UX

### Điểm mạnh
1. **Nói đúng ngôn ngữ của người mua B2B.** Mỗi sản phẩm có SKU, kích thước cm/inch, CBM, số lượng đóng container 20′/40′/40′HQ. Người mua có thể tự tính logistics mà chưa cần liên hệ, nên cuộc trao đổi đầu tiên có chất lượng cao hơn.
2. **Một luồng chuyển đổi duy nhất, xuất hiện ở mọi nơi.** "Request a quote" ở 6 vị trí nhưng tất cả mở cùng một form. Form có trường phân loại người mua và nhu cầu, giúp đội sales phân luồng ngay khi nhận lead.
3. **IA phân theo loại khách hàng** (Programs), mỗi nhóm có landing riêng với quy trình 4 bước và FAQ. Cách này giảm tải nhận thức hơn so với một trang "Services" chung.
4. **Tín hiệu tin cậy cụ thể và kiểm chứng được**: ISO, BSCI, EUDR, Lacey Act ngay trong hero; mã FSC theo pháp nhân; địa chỉ từng nhà máy có link bản đồ; lời mời thăm nhà máy; ảnh nhà máy có chú thích.
5. **Hệ token chặt chẽ** (dải màu 50–900 với alias ngữ nghĩa, spacing bước 4px, motion token). Các trung tính pha sắc thương hiệu tạo cá tính mà không cần nhiều màu.
6. **Chú ý accessibility và hiệu năng**: dialog có aria, focus-visible, reduced-motion, preload poster hero, video lazy, ảnh catalog lazy kèm srcset.
7. **Content SEO có cấu trúc**: khung H2 cố định trên mỗi trang sản phẩm, FAQ, blog hướng dẫn người mua, title SEO riêng cho từng danh mục.

### Điểm yếu
1. **Nặng script**: 48 thẻ `<script>`, nạp cả jQuery, WooCommerce cart/order-attribution, Elementor runtime và YouTube API trên một trang không bán hàng **[QS]**. **[SL]** Ảnh hưởng tới TBT/INP trên thiết bị yếu.
2. **Poster hero 688 KB** (webp) và ảnh tile khoảng 200 KB, dùng `background-image` nên không có srcset/responsive **[QS]**. Mobile vẫn tải ảnh desktop.
3. **Đa ngôn ngữ bằng dịch máy phía client** (GTranslate, `url_structure: none`, không có hreflang) **[QS]**. Bản dịch không được index và chất lượng không kiểm soát được.
4. **Khóa zoom trên mobile** (`user-scalable=no`) **[QS]**.
5. **Thiếu `Product` schema** trên trang sản phẩm **[QS]**, bỏ lỡ rich result.
6. **Mục cha menu là `href="#"`** (Programs, Resources) **[QS]**: không có trang tổng quan, không tốt cho SEO và người dùng bàn phím.
7. **Tile danh mục dùng `background-image`** nên ảnh không có alt và chỉ được gắn `aria-hidden` **[QS]**. Không ảnh hưởng nhiều tới a11y (đã có text), nhưng không được index như ảnh.
8. **Copy sản phẩm có dấu hiệu sinh hàng loạt** (excerpt lặp mẫu "is a product reference for … assortments") **[QS]**. **[SL]** Đọc thiếu tự nhiên và có rủi ro bị đánh giá là nội dung mỏng.
9. **Không có trang Projects/case study** **[QS]**: thiếu bằng chứng dạng "đã làm cho ai, kết quả thế nào", chỉ có tên khách hàng trong FAQ.
10. **Nút uppercase bold tracking rộng ở mọi nơi** **[SL]**: đọc chậm hơn khi nhãn dài, ví dụ "Discuss your import requirements".

---

## 9. Áp dụng cho BFC

Bối cảnh BFC: Next.js 16 + Tailwind + shadcn, token ink/forest/gold, font Inter, header 72px (logo + CTA + hamburger → menu fullscreen), hero slider 4 ảnh crossfade + Ken Burns, IA: Home, Capabilities, About, Contact, Materials (+5), Products (+6), Projects.

### 9.1 Pattern nên lấy

| # | Pattern | Áp dụng vào BFC | Ưu tiên |
|---|---|---|---|
| 1 | **Một "Request a quote" toàn site → một Dialog form dùng chung** (shadcn `Dialog`, fallback link `/contact`) | Nút CTA header, cuối menu fullscreen, hero, footer, trang Product, trang Capabilities | **Cao** |
| 2 | **Form báo giá có trường phân loại**: "Bạn là" (Importer/Distributor, Retailer, Hospitality/Project, Brand/Designer, E-commerce, Khác) và "Quan tâm" (gỗ, nhôm, thép, nệm, OEM/ODM). Thêm trường SKU, ghi chú "phản hồi trong 1 ngày làm việc" và câu về quyền riêng tư | `features/contact` và Dialog quote | **Cao** |
| 3 | **Spec block chuẩn B2B** trên trang sản phẩm: SKU, vật liệu, kích thước cm (in), kích thước carton, CBM, số lượng 20′/40′/40′HQ, tùy chọn màu/hoàn thiện, MOQ | Template Products (+6 nhóm) và chi tiết sản phẩm | **Cao** |
| 4 | **Capability strip 4 card** (icon + metric + label + 1 câu), gạch accent 48×2px dùng **gold #C9A227** của BFC; mobile chuyển thành **cuộn ngang có scroll-snap và gradient mép** | Ngay sau hero ở Home (`capabilities-section` hoặc chen trước `about-section`) | **Cao** |
| 5 | **Công thức header section thống nhất**: eyebrow uppercase 12px tracking 0.16em màu forest, H2 lớn line-height khoảng 1.08, intro 1 câu. Tạo thành component `SectionHeading` | Mọi section full-screen của Home, Capabilities, Materials | **Cao** |
| 6 | **Bento grid danh mục** (1 tile 2×2, 2 tile wide, phần còn lại regular), hover "lift + zoom 1.06 + scrim + arrow-up-right" chỉ khi `hover:hover`, có focus-visible tương đương. Dùng `next/image` thay cho `background-image` | `products-section` ở Home (6 nhóm sản phẩm) và `materials-section` (5 vật liệu) | **Cao** |
| 7 | **Landing theo loại khách hàng** (Hospitality/Project, Retailer/Importer, OEM/ODM brand), mỗi trang có quy trình 4 bước đánh số, khung "chúng tôi cần gì từ brief của bạn", FAQ và closing CTA | Mục mới trong menu fullscreen hoặc sub-section của Capabilities; có thể bổ sung vào IA sau | Trung bình |
| 8 | **Card cho từng nhà máy trong footer và trang Contact** (địa chỉ, giờ làm, link Google Maps, kênh Zalo/WhatsApp) và lời mời "Factory visits welcome" | `site-footer.tsx`, trang Contact | Trung bình |
| 9 | **Gallery nhà máy có figcaption cho từng ảnh** và lightbox (shadcn Dialog hoặc thư viện nhẹ như `yet-another-react-lightbox`) | About, Capabilities (`inhouse-section`, `workshops-flow`) | Trung bình |
| 10 | **Chỉ số đếm khi vào viewport** (IntersectionObserver, easeOutCubic, tôn trọng reduced-motion) | Hero/About (năm thành lập, diện tích xưởng, container/tháng) | Trung bình |
| 11 | **FAQ accordion** (MOQ, lead time mẫu và sản xuất, OEM theo bản vẽ, thị trường, thăm nhà máy) với `FAQPage` schema | Contact, cuối trang Capabilities, mỗi trang Materials | Trung bình |
| 12 | **Sticky header thêm shadow khi cuộn** (giữ cao 72px, chỉ đổi shadow hoặc border) | `site-header.tsx` | Thấp (rẻ) |
| 13 | **Trung tính pha sắc thương hiệu**: cân nhắc nền trang ấm nhẹ thay vì trắng thuần, shadow dùng màu ink thay vì đen. Overlay ảnh dùng màu tối ấm thay vì đen | Token `globals.css` | Thấp, cần thử nghiệm |
| 14 | **Catalog filter** (vật liệu, màu, nhóm) mở bằng shadcn `Sheet` trên mobile, nút apply hiển thị số kết quả; card hiển thị SKU + nhóm | Khi Products có danh sách SKU | Thấp (phụ thuộc dữ liệu) |
| 15 | **Hero ưu tiên LCP**: ảnh slide đầu `priority`/`fetchPriority="high"`, các slide sau lazy; nếu thêm video thì nạp sau và tắt khi reduced-motion | `hero-section.tsx` (slider 4 ảnh hiện tại) | Trung bình |
| 16 | **Floating contact gọn** (Zalo/WhatsApp/Quote) chỉ trên mobile, không che CTA | Layout | Thấp, cân nhắc kỹ với thiết kế tối giản |

### 9.2 Pattern nên tránh

| Pattern của họ | Lý do tránh | Thay bằng |
|---|---|---|
| `user-scalable=no, maximum-scale=1` | Vi phạm WCAG 1.4.4 | Viewport mặc định của Next |
| Dịch máy client-side (GTranslate) | Không index được, chất lượng kém, không có hreflang | Tiếp tục dùng `next-intl` với route `[locale]` và `alternates.languages` |
| Mục cha menu `href="#"` | Không có trang đích, kém cho SEO và a11y | Mục cha là trang tổng quan thật (ví dụ `/products`, `/materials`) |
| Ảnh lớn qua `background-image` không có srcset | Mobile tải ảnh desktop, poster 688 KB | `next/image` với `sizes` và AVIF/WebP |
| Nạp WooCommerce/jQuery/YouTube API trên trang không cần | Thừa JS | Server Components, chỉ client hóa phần tương tác |
| Copy sản phẩm sinh theo mẫu lặp | Nội dung mỏng, giọng văn máy móc | Mô tả ngắn viết riêng cho từng sản phẩm và spec dạng bảng |
| Nút uppercase bold tracking rộng cho mọi nhãn | Khó đọc với nhãn dài | Giữ nút sentence-case của BFC; chỉ dùng uppercase cho eyebrow |
| Thiếu Product schema | Mất rich result | Thêm JSON-LD `Product`/`ProductGroup`, `Organization`, `BreadcrumbList` |
| Đưa nhiều tên khách hàng lớn vào FAQ dạng văn bản | Rủi ro pháp lý nếu không có sự đồng ý | Section Projects/case study có sự cho phép của khách (BFC đã có route Projects, đây là lợi thế so với họ) |
| Mega menu mở bằng `:hover` | Không dùng được trên touch, khó với bàn phím | BFC đã dùng menu fullscreen, giữ nguyên, có thể nhóm 3 cấp bên trong |

### 9.3 Ghi chú khớp với design BFC hiện tại
- Header 72px của BFC (logo + CTA + hamburger) đã tối giản hơn header 3 tầng của họ. **Không cần topbar.** Có thể đưa hotline/Zalo và câu trust vào cuối menu fullscreen, tương tự cách họ đặt 2 CTA ở cuối drawer.
- Hero slider 4 ảnh crossfade + Ken Burns của BFC tương đương video nền của họ về mặt cảm xúc nhưng nhẹ hơn. Nên học cách họ **đưa chứng chỉ cụ thể vào sub-heading** và dùng **2 CTA** (Quote primary + Xem sản phẩm/năng lực outline-inverse).
- Gold #C9A227 của BFC có thể đóng vai trò giống "wood-500" của họ: chỉ dùng làm accent mảnh (gạch 2px, viền trên, chấm), không dùng cho nền lớn.

---

## 10. Phụ lục

### 10.1 URL đã xem (tải HTML bằng curl ngày 2026-11-04)
- https://nghiason.com.vn/ (trang chủ, ≈203 KB HTML)
- https://nghiason.com.vn/catalog/
- https://nghiason.com.vn/outdoor-furniture/outdoor-seating/
- https://nghiason.com.vn/vlaso-table/ (chi tiết sản phẩm, lấy từ product-sitemap)
- https://nghiason.com.vn/about-us/
- https://nghiason.com.vn/contact-us/
- https://nghiason.com.vn/furniture-sourcing-for-importers/
- https://nghiason.com.vn/resources/materials-specifications/
- https://nghiason.com.vn/news/
- https://nghiason.com.vn/sitemap_index.xml, `page-sitemap.xml`, `product-sitemap.xml`
- CSS/JS: `themes/nghiason/assets/dist/style.css`, `app.js`, `uploads/elementor/css/base-desktop.css`, `base-mobile.css`, `local-66-frontend-desktop.css`, cùng các khối `<style>` inline trong HTML trang chủ
- HEAD request ảnh: poster hero (688 KB webp), tile danh mục (≈201 KB webp)

### 10.2 Hạn chế của phân tích
- **Không chụp màn hình, không render JS.** Bố cục, màu và cảm giác thị giác đều suy ra từ HTML/CSS. Thứ tự và kích thước hiển thị thực tế có thể khác do CSS Elementor ghi đè theo breakpoint.
- Chưa đo Core Web Vitals (LCP/INP/CLS); nhận định hiệu năng chỉ dựa trên số script, kích thước file và thuộc tính lazy/preload.
- Chưa xem: trang For National Retailers, U.S. Dropshipping, chi tiết bài blog, các trang pháp lý, trang tìm kiếm, trạng thái lỗi/thành công thực tế của form (chỉ thấy keyframe).
- CSS riêng của trang catalog/product (ví dụ `.nghiason-pcard`) không nằm trong bộ CSS trang chủ đã trích, nên token cho card sản phẩm chưa xác định.
- Không xác định được widget Elementor nào dùng Motion interactions, cũng như hành vi chính xác của video trong section "See how we work".
- Nội dung site có thể thay đổi sau ngày phân tích.
