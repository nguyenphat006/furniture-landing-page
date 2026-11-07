# Phân tích UI/UX: Gloster (gloster.com/en/)

> Mục đích: học pattern UI/UX và "cảm giác premium châu Âu" cho landing page BFC. **Không** sao chép logo, ảnh, copy, font bản quyền hay nhận diện thương hiệu của Gloster.

**Quy ước độ tin cậy** dùng xuyên suốt tài liệu:

- **[QS]** Quan sát: có dẫn chứng trực tiếp từ HTML/CSS/JS đã tải về (class, token, giá trị CSS, text trong DOM).
- **[SL]** Suy luận: rút ra từ dẫn chứng nhưng không quan sát trực tiếp (ví dụ cảm giác thị giác, hành vi JS lúc chạy).
- **[CXĐ]** Chưa xác định: không đủ dữ liệu.

> **Lưu ý quan trọng:** Không chụp được màn hình. Mọi nhận định về hình ảnh, bố cục, màu sắc hiển thị đều **suy ra từ HTML (bản SSR) và CSS**, không quan sát trực tiếp trên trình duyệt.
>
> **Cập nhật:** Mục 1–10 là bản phân tích tĩnh ban đầu. **Mục 11** bổ sung quan sát runtime (ảnh chụp + DOM đã render) cho 18 trang chính. Quan sát runtime bằng REA ngày 2026-11-04, viewport 1424×805 desktop; chưa xem mobile. Nhãn **[RT]** = quan sát runtime trên ảnh chụp/DOM render. Những chỗ ảnh chụp cho thấy bản tĩnh sai được sửa tại chỗ và ghi "đã đính chính theo ảnh chụp" (tổng hợp ở mục 11.5).

---

## 1. Tổng quan

| Hạng mục | Nội dung |
|---|---|
| Ngày phân tích | 2026-11-04 |
| Định vị | Thương hiệu nội thất ngoài trời cao cấp (teak + nhôm, gốm, dây, sling), có nguồn gốc từ năm 1960, trụ sở tại Lüneburg (Đức) [QS: footer, trang About] |
| Đối tượng | Chủ yếu B2C cao cấp (homeowner) qua mạng lưới đại lý, song song là kênh trade/contract (designer, specifier, khách sạn, du thuyền) [QS: menu "Programs → Contract", form quote có lựa chọn "Homeowner / Interior Designer / Trade / Specifier / Contract / Retailer"] |
| Mô hình chuyển đổi | Không có giỏ hàng/giá. CTA chính: **Request Quote** (giỏ báo giá), **Where to buy** (store finder), tải catalogue [QS] |
| Framework | **Angular 22.0.2** SSR + hydration (`ng-version="22.0.2"`, `ng-server-context="ssr"`, thuộc tính `ngh`, `jsaction` event replay) [QS] |
| Critical CSS | Beasties (`data-beasties-container`) inline CSS theo component, file ngoài `styles-6PROSQ55.css` chỉ ~8 KB [QS] |
| Server/CDN | Express (`x-powered-by: Express`) sau Cloudflare [QS: response header] |
| CMS | Nhiều khả năng là **headless WordPress** (đường dẫn `/wp/materials/...` trong `ng-state`, dữ liệu dạng `block_type`/`block_data`, trang dựng bằng `gw-block-renderer`) [SL] |
| Dịch vụ bên thứ ba | Cookiebot (consent), Vimeo background video (hero), HubSpot Forms (`gw-hsform-2112805-...` ở trang Contact), Google Maps (CSS `.gm-style` cho store finder), Instagram feed [QS] |
| Ảnh sản phẩm | Render server-side theo cấu hình: `imageservice.gloster.com/Render?model=...&frame=Meteor&Fabrics=176&angle=2&format=webp` → ảnh 360° và ảnh theo màu khung/vải [QS: JSON-LD Product] |
| Thư viện motion | **Không có** GSAP, Swiper, Lenis, Locomotive, Embla... Toàn bộ motion là CSS transition + component tự viết (carousel kéo, 360 spin, marquee kéo) [QS: grep toàn bộ 44 chunk JS] |

---

## 2. Information architecture & navigation

### 2.1 Sitemap (rút từ menu mobile SSR và footer) [QS]

```
/en/
├── Products  (/products: Explore, có filter)
│   ├── Seating: Bar Stools, Benches, Daybeds, Dining Chairs, Lounge Chairs, Loungers, Modular Lounge, Ottoman, Sofas
│   ├── Tables: Coffee, Dining, Serving, Side
│   ├── Accessories: Fire Bowls, Parasols, Pillows, Rugs, Showers, Storage Chests
│   └── Lighting: Floor Lamps, Pendants, Remote Control, Table Lights
├── Collections (/products/collections: ~38 collection, nhóm Novelties/Bestsellers/Lounge/Dining...)
├── Resources
│   ├── Inspiration: Blog, Catalogue, Newsletter, Videos
│   ├── Tools & Downloads: Planner, Product Care, Media Library
│   └── Design: Designers, Materials, Textiles
├── Programs → Contract (/programs/contractor)
├── Locations → Store Finder
├── About → Teak Story, Contact
├── Quote (/quote: giỏ báo giá)
└── Legal: Privacy, Cookies, Imprint, Jobs
```

URL có ngữ nghĩa và phân tầng rõ: `/products/types/{type}`, `/products/collections/{collection}`, `/products/p/{collection}-{product}`, `/resources/materials/{material}` [QS].

**Nhận xét [SL]:** IA tách 2 trục duyệt sản phẩm song song: **theo loại** (Sofas, Dining Chairs...) và **theo collection** (dòng thiết kế). Đây là cấu trúc kinh điển của nội thất cao cấp: người mua lẻ tìm theo loại, designer/specifier tìm theo collection để đồng bộ một không gian.

### 2.2 Header desktop [QS: `.navbar*` trong inline CSS]

- Cao **88px** (≥1024px), nền trắng, padding ngang = gutter (80/48/24px). Host component `position: sticky; top: 0; z-index: 100` → header **dính đầu trang** khi cuộn [QS].
- Bố cục 3 vùng: logo trái (cao 20px) / nav giữa (6 mục: Products, Collections, Resources, Programs, Locations, About) / phải: link **"Quote"** + icon search.
- Nav item: 14px, **uppercase, letter-spacing .1em, weight 300**. Hover: gạch chân 1px chạy `scaleX(0→1)` từ giữa.
- Link "Quote" được kẻ **border trên + dưới 1px** (#d5d5d5); hover có 2 vạch 2px quét theo hướng ngược nhau. Có trạng thái `--filled` (đã có sản phẩm trong quote, chữ đậm hơn) và `--received` (đã gửi) [QS: class trong JS].
- **Search "lật 3D":** bấm icon search thì cả thanh header xoay `rotateX(-90deg)` để lộ mặt thứ hai là ô search (`perspective:1800px`, 420ms, ease emphasized); với `prefers-reduced-motion` thì chuyển sang fade [QS].
- **Mega dropdown** (`nav-dropdown`, lazy chunk): **chỉ có chữ, không ảnh**. Hai biến thể: `--two-pane` (grid 5 cột nhóm: Seating/Tables/Accessories/Lighting) và `--collections` (CSS `columns:5` liệt kê tên collection). Nhãn nhóm 16px uppercase màu **olive #8d8b72**; cuối panel có link "Explore all..." ngăn bởi divider [QS]. Ở 1024–1330px rút còn 3 cột.

### 2.3 Header & menu mobile [QS: `.mnav*`]

- <1024px: header 72px, grid `44px 1fr 44px` (hamburger / logo giữa / search), border đáy 1px.
- Drawer trượt **từ trái**, rộng `min(88vw, 420px)`, nền **xám than #3d3d3d** chữ trắng, dùng `<dialog>` + `::backdrop` đen 40%.
- Menu dạng **accordion lồng 2 cấp**, mở/đóng bằng `grid-template-rows: 0fr → 1fr` (220ms). Dòng cấp 1 cỡ 20px; cấp lá 16px uppercase, có **vạch dọc 1px (rail)** bên trái nhóm con. Nội dung drawer có animation vào trễ 260ms.
- Mỗi nhóm kết thúc bằng link "Explore all products/collections" nhỏ, gạch chân.

### 2.4 Footer [QS: `.footer*`]

- Padding 80px, max-width 1800px, grid 5 cột `1.4fr 1fr 1fr 1fr 1.4fr`.
- Cột 1: **Contact** (tên công ty, địa chỉ, tel, mail) + nút "Contact us". Cột 2–4: Customer Service / Company / Resources. Cột 5: **Newsletter** (First name, Last name, Email, nút "Sign up") + Follow (4 icon mạng xã hội).
- Hàng legal: © + **"Your region: Global"** (mở modal chọn khu vực 2 pane: Region → Country) + Privacy/Cookies/Imprint.
- Tiêu đề cột 22px uppercase tracking .06em, weight 300; input viền 1px `currentColor`, **radius 0**.
- Mobile: các cột link chuyển thành `<details>` disclosure có chevron xoay.
- **Footer reveal** [QS]: ở `(width>=1024px) and (height>=700px)`, `gw-footer.footer--v2 { position: sticky; bottom: 0 }`, khối nội dung cuối trang có class `gw-block-renderer--page-end`. [SL] Nội dung trang cuộn trượt lên rồi "mở" ra footer nằm phía dưới; kết hợp với nền body nửa dưới màu xanh xám #dce2e6 để không lộ khoảng trắng.
  - **[RT] Đã xác minh bằng ảnh chụp:** ở `home-12`, `catalogue-01`, `media-library-01`, `contact-02`, mép dưới khối nội dung (trắng hoặc taupe) đè lên phần trên của footer đang đứng yên phía dưới, đúng hiệu ứng reveal.
  - [RT] Tiêu đề cột footer dùng **Gotham 22px/300 uppercase** (sans), không phải serif như heading trong trang. Nút "Contact us"/"Sign up" là nền xám #646363 chữ trắng, không phải đen.

---

## 3. Design tokens

Nguồn: `:root` trong `https://www.gloster.com/styles-6PROSQ55.css` (trùng với khối inline đầu trang) và CSS component inline trong HTML trang chủ, trang collection, PDP. Tên token dùng kiểu Figma (`--color\/neutral-dark`) [SL: token được export từ Figma Variables].

### 3.1 Typography [QS]

| Token | Giá trị | Ghi chú |
|---|---|---|
| Font heading | **Cardillac** (serif), weight 200/300/500 | Self-hosted woff2, `font-display: swap`. Font thương mại, **không dùng lại** |
| Font body | **Gotham** (sans geometric), 300/400/500/600 | Self-hosted woff2. Font thương mại |
| Body mặc định | 16px / 1.5, **weight 300 (light)** | Toàn site dùng light làm mặc định |
| Display (hero) | `clamp(48px, 6.067vw + 24.34px, 102px)`, lh 1.02, ls -0.01em, `text-wrap: balance` | |
| H1 | `clamp(36px, 3.146vw + 23.73px, 64px)`, lh 1 | |
| H2 | `clamp(30px, .899vw + 26.49px, 38px)`, lh 1.1 | |
| H3/H4 | 26px, lh 1.1 | |
| H5/H6, card header | 20px, lh 1.1 | |
| Subheader | 22px, lh 1.3 | |
| Small / tiny | 14px / 12px, lh 1.5 | |
| Heading style | Serif **light 300, UPPERCASE, letter-spacing 1px** | Áp dụng cho mọi h1–h6 |
| Letter-spacing scale | .02 / .04 / .05 / .06 / .08 / .1 / .12em, -.01em | Nhãn/nav/nút đều uppercase tracking rộng |

`text-transform: uppercase` xuất hiện **30 lần** trong CSS trang chủ [QS].

### 3.2 Màu [QS: token + đếm tần suất]

| Vai trò | Token | Hex |
|---|---|---|
| Nền chính / chữ chính | white / neutral-darkest | #fff / #000 |
| Chữ phụ | neutral-dark | #3d3d3d |
| Xám trung | neutral-medium / muted-grey | #8a8a8a / #646363 |
| Xám nhạt | neutral-light / neutral-lightest | #b8b8b8 / #eee |
| Divider | divider | #d5d5d5 |
| **Surface taupe** (be ấm) | taupe-bg | **#d5cec6** |
| **Surface xanh xám** | light-blue-bg | **#dce2e6** |
| **Surface olive** | green-bg (chữ trên nó: sage-light #edf1dc) | **#8d8b72** |
| Lỗi (muted) | danger-muted | #a35c45 |
| Overlay | overlay-dark 40%, soft 18%, tint 85%; chữ trên nền tối 70%/50% | rgb(0 0 0 / x) |

**Nhận xét [SL]:** Bảng màu gần như **đơn sắc đen/trắng/xám**; "màu" chỉ đến từ 3 **surface trầm, độ bão hoà thấp** (be, xanh xám, olive) và từ ảnh. Không có màu nhấn (accent) bão hoà. Đây là yếu tố chính tạo cảm giác "premium, yên tĩnh". Mỗi surface có cặp `--surface` / `--on-surface` để component tự đổi màu chữ (theming theo hàng).

Chi tiết thú vị [QS]: `body` có nền `linear-gradient(white 50%, #dce2e6 50%) fixed`. [SL] Mục đích là phục vụ hiệu ứng footer reveal (mục 2.4) và overscroll: phần lộ ra phía dưới luôn là màu xanh xám đồng bộ với footer thay vì trắng.

### 3.3 Spacing, grid, layout [QS]

| Token | Giá trị |
|---|---|
| Grid | 12 cột, gap `clamp(16px, …, 24px)`, gap-lg `clamp(24px, …, 48px)` |
| Max width | **1800px** (`--grid/max-width`); cap `narrow` 768px |
| Gutter (lề trang) | **80px** desktop ≥1330 / 48px (768–1329) / 24px (<768) |
| Section padding | large `clamp(80px, …, 112px)`; medium `clamp(64px, …, 80px)` |
| Row rhythm (khoảng cách giữa hàng) | `clamp(64px, …, 112px)`; row-pad (hàng có nền) `clamp(48px, …, 96px)` |
| Gap scale | 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48px |
| Header | 88px (≥1024) / 72px |
| Scroll padding top | `clamp(96px, 6vw + 60px, 128px)` |

Layout chạy bằng `subgrid`: mỗi block (`media-text`, `offset-composition`, `posts`) kế thừa 12 cột của `gd-global-grid` [QS]. Hàng (`gd-row`) có modifier: `--bleed` (tràn viền), `--gutter`, `--flush`, `--themed --theme-taupe/light-blue/green`, cap `default/narrow/wide/none`.

### 3.4 Radius, shadow, border [QS]

| Token | Giá trị | Thực tế dùng |
|---|---|---|
| radius xs/sm/md/circle | 2 / 4 / 8px / 50% | Gần như **không dùng**: nút, input, card, ảnh đều **góc vuông (0)**. Chỉ nút 360° tròn, tooltip map 2px |
| shadow sm/md/lg | `0 2px 8px /12%`, `0 4px 16px /8%`, `0 16px 32px /6%` | Rất ít dùng; chiều sâu tạo bằng nền surface và ảnh, không bằng bóng |
| Stroke | 1px | Divider, viền nút, viền input, viền mũi tên carousel |

### 3.5 Motion [QS]

| Token | Giá trị |
|---|---|
| duration micro / fast / base / slow | **120 / 140 / 220 / 420ms** |
| ease-out | `cubic-bezier(.22, 1, .36, 1)` |
| ease-in-out | `cubic-bezier(.65, 0, .35, 1)` |
| ease-emphasized | `cubic-bezier(.2, 0, 0, 1)` |
| lift-hover-card | `-6px` (translateY) |
| Reduced motion | Rule global `prefers-reduced-motion: reduce` đưa mọi animation/transition về .01ms; các component còn có nhánh riêng |

Breakpoints [QS]: **768px**, **1024px**, **1330px** (media query dạng range `width<768px`), có `(width>=1024px) and (height>=700px)`.

---

## 4. Trang chủ: phân tích từng section (theo thứ tự DOM)

Tổng cộng 12 khối + footer, xen kẽ nền trắng / taupe / olive / ảnh tràn viền [QS].

| # | Section (component) | Mục đích | Bố cục & nội dung | Tương tác |
|---|---|---|---|---|
| 1 | **Hero video** (`gw-hero-block` → `gd-hero-banner--full --theme-dark`) | Tạo không khí, kể câu chuyện thương hiệu ngay | Video Vimeo nền (`background=1&muted=1&loop=1`), poster ảnh làm fallback. Cao `min(125vw, 100dvh - header)`. Gradient tối từ đáy lên (50% → 5%). Nội dung **căn trái-dưới** (`data-valign=bottom`, `data-halign=left`), max 960px: heading display + 1 đoạn sub + 1 CTA "Explore New Collections" [QS] | Video tự chạy, không có nút điều khiển [QS: iframe `tabindex=-1`, `aria-hidden`]. Không slider |
| 2 | **Intro + H1** (`gw-section-media-split` → `media-text--image-right --ratio-1-2`) | SEO (chứa **H1** của trang) + định vị | Ảnh 4 cột / chữ 8 cột (ảnh bên phải), H1 + 2 đoạn + CTA "Explore All Products" [QS] | |
| 3 | **Highlighted categories** (`gw-text-block` + `gw-carousel-block`) | Lối tắt duyệt theo loại | Tiêu đề + carousel tràn viền 7 card (Sofas, Lounge Chairs, Loungers, Dining Tables, Dining Chairs, Lighting, Accessories), card ảnh vuông 1:1, tên + nhãn "Collection" căn giữa [QS]. *Đã đính chính theo ảnh chụp:* ảnh card là **ảnh lifestyle** (khung cảnh ngoài trời), không phải ảnh sản phẩm nền trắng; card thứ 6 bị cắt ở mép phải để gợi ý cuộn [RT] | Kéo ngang (drag), mũi tên vuông 44px (nút "trước" xám nhạt khi vô hiệu, nút "sau" viền đen). *Đã đính chính theo ảnh chụp:* ở 1424px hiển thị **dots** (chấm đen = trang hiện tại) bên trái, không thấy thanh progress 1px [RT] |
| 4 | **Featured collection** (`gw-section-offset` + carousel) | Đẩy 1 collection chủ lực | **Bố cục offset chồng lớp**: ảnh 4:5 chiếm 6 cột nằm trên, panel màu **olive** chiếm cột 3→12 lùi xuống (`--offset-top: clamp(180px,14vw,240px)`), chứa eyebrow "FEATURED COLLECTION", H2, đoạn mô tả, CTA ở đáy. Tiếp theo là carousel 23 sản phẩm của collection [QS] | Như carousel ở trên |
| 5 | **Catalogue / Look Book** (`gd-row--theme-taupe` + media-split) | Thu lead / dẫn sang catalogue | Hàng nền taupe, ảnh + H2 + đoạn + CTA "View the Catalogue" [QS] | |
| 6 | **Ảnh tràn viền** (`gw-image-block` bleed) | Nhịp nghỉ thị giác | Một ảnh lifestyle full width, không chữ [QS] | |
| 7 | **2 card hành động** (`gw-cards-grid`) | Phân luồng: B2C → "Find a location", B2B → "Contract" | Card chỉ có chữ: H3 + 1 câu + link có mũi tên "→"; link `cta-link--stretched` phủ toàn card [QS]. [RT] Card không có khung: chỉ có **divider 1px ở trên và dưới**, heading 38px, link "LOCATE A STORE →" / "CONTRACT SERVICES →" nằm sát đáy | Toàn card bấm được |
| 8 | **2 overlay card** (`gw-cards-full-image` → `gd-overlay-card`) | Dẫn sang câu chuyện bền vững (Teak Story) và About | Ảnh vuông, gradient tối nửa dưới, tiêu đề serif lớn + excerpt (line-clamp) + CTA primary chữ trắng [QS] | Hover: ảnh **scale 1.04** (420ms), vạch trên của CTA quét đầy [QS] |
| 9 | **As seen in** (`gw-as-seen-in-block`, nền taupe) | Social proof bằng báo chí (11 tạp chí kiến trúc/thiết kế) | Logo cao `clamp(28px, …, 44px)`, **lọc về đen** (`filter: brightness(0)`), lặp 3 lần để chạy vòng [QS] | Rail kéo được (`cursor: grab`, `touch-action: pan-y`), [SL] có tự chạy kiểu marquee |
| 10 | **Inspiration / Blog** (`gw-section-heading-only` + `gw-posts-block`) | Nội dung, sự kiện (Salone del Mobile, ORGATEC) | Eyebrow + H2 + nút outlined "View all posts"; 3 bài dạng ảnh vuông + tiêu đề uppercase + excerpt + "Read more →". **Cột giữa bị đẩy xuống** bằng spacer `aspect-ratio: 2/1` (`nth-child(3n+2)::before`) tạo lưới so le [QS] | Hover ảnh scale 1.04, mũi tên dịch 3px |
| 11 | **Instagram** (`gw-instagram-feed-block`) | Cộng đồng, cập nhật | 8 ảnh vuông `clamp(120px,15vw,220px)`, cuộn ngang, ẩn scrollbar [QS]. [RT] Lúc chụp **ảnh feed bị lỗi tải**: các ô chỉ hiện alt text (caption Instagram dài, kèm emoji) trên nền xám #f4f4f4, phá vỡ nhịp thị giác cuối trang (`home-11`, `home-12`) | Cuộn ngang, hover scale |
| 12 | **Footer** | Xem mục 2.4 | | Modal chọn region |

Toàn trang chỉ có **10 nút CTA**, mỗi section tối đa 1 CTA [QS: danh sách nhãn nút: Request Quote, Explore New Collections, Explore All Products, Explore the Grid Collection, View the Catalogue, The Teak Story, About Gloster, View all posts, Follow Us, Contact us, Sign up].

### 4.1 Hệ thống nút [QS: `.gd-button*`]

| Biến thể | Hình thức | Hover |
|---|---|---|
| `primary` | **Không nền, không viền**, chỉ có **vạch 1px phía trên** + chữ uppercase + icon mũi tên (SVG mask, stroke 1.25) | Vạch dày 2px quét từ trái sang, mũi tên dịch 6px. Card cha có thể kích hoạt hiệu ứng này (`--gd-button-cta-hover`) |
| `secondary` | Nền đen chữ trắng, padding 12×24 | Nền nhạt 18% (color-mix), nhấc -2px |
| `outlined` / `ghost` | Viền 1px currentColor | Lớp nền quét ngang + `mix-blend-mode: difference` (đảo màu chữ) |
| `taupe` | Nền taupe | Dùng cho "Add to Quote", "Submit request" |
| `link` | Gạch chân offset 4px | opacity .6 |

Mọi nút: uppercase, letter-spacing .05em, weight 300, `:active scale(.97)`, có vùng `aria-live` cho trạng thái và animation **vẽ dấu tick** khi xác nhận (ví dụ đã thêm vào quote).

---

## 5. Các template trang con

| Template | URL mẫu | Cấu trúc chính [QS] | Ghi chú |
|---|---|---|---|
| **Explore Products** (listing) | `/en/products` | H1 → toolbar chip danh mục (View all / Accessory / Seating / Table) → filter band: ô Keyword, select Subcategory / Materials / Designer → chip filter đang bật + "Clear all" + "Showing 240 of 240" → grid 1/2/4/6 cột (mobile/tablet/desktop/wide). *Đã đính chính theo ảnh chụp:* H1 **căn giữa**; filter band **ẩn mặc định** sau nút viền "FILTERS" bên trái, chip danh mục căn giữa (chip đang chọn nền taupe), "CLEAR ALL" gạch chân bên phải; 4 cột ở 1424px [RT] | **Cả 240 sản phẩm render sẵn trong SSR** (HTML ~390 KB). JS có IntersectionObserver tăng `visibleCount` theo batch, `rootMargin 800px` [QS] |
| **Collections landing** | `/en/products/collections` | H1 + chip (Novelties, Bestsellers, Lounge, Dining, Side Tables, Lighting, Accessories) → mỗi nhóm: heading căn giữa + đoạn giới thiệu + lưới card collection (tên + →). *Đã đính chính theo ảnh chụp:* heading nhóm **căn trái**; card là **ảnh lifestyle lớn dạng mosaic** (1 ô lớn + 4 ô nhỏ, hoặc 1 ảnh full width) với nhãn chữ "GRID →" trên nền taupe đặt ở góc trái-dưới ảnh; các nhóm xen kẽ nền trắng / taupe [RT] | Trang dài ~23.400px |
| **Collection detail** | `/en/products/collections/grid` | Hero `--large` có breadcrumb trên ảnh + H1 → media-text giới thiệu với **ảnh progressive (LQIP blur 20px → ảnh thật)** → chip lọc → grid sản phẩm 4 cột → **slider lifestyle 13 ảnh 16:9** → block designer (quote + bio + CTA) → carousel "Collections by [designer]" + link sang listing đã lọc theo designer | Cross-link designer ↔ collection ↔ product rất chặt |
| **Product detail (PDP)** | `/en/products/p/grid-sofa` | Breadcrumb (thu gọn bằng "…" trên mobile) → **ảnh 360°** (21 frame, "Drag to Rotate", "Click to Zoom" với zoom pane 4000px, nút Expand, **Download image**) → tên + collection → **cấu hình Frame + Fabric** với swatch → modal chọn vải theo nhóm (Outdoor Performance / UKFR Fire Resistant / Water Resistant) → nút **"Where to buy"** (outlined) + **"Add to Quote"** (taupe) → accordion **Dimensions / Details / Downloads** → slider lifestyle → carousel "Discover more in this Collection" → 2 overlay card: Designer + Material (Aluminium) | Không hiển thị giá. JSON-LD Product có name, sku, brand, image, **không có offers** |
| **Quote** | `/en/quote` | Danh sách quote (empty state "Your quote is empty.") → modal form: Title, Contact name*, Company (optional), ZIP (optional), Country*, Phone, Email, **"I am a…"*** (Homeowner / Interior Designer–Trade / Specifier–Contract / Retailer) → nút Submit (disabled tới khi hợp lệ) | Mô hình "giỏ báo giá" thay giỏ hàng |
| **Materials index** | `/en/resources/materials` | H1 căn giữa + 2 đoạn intro (nói về lượng nguyên liệu, số công đoạn, thời gian làm) → 8 card: ảnh **swatch cận chất liệu** + tên + nút ghost "→" (Aluminium, Ceramic, Glass, Rope, Sling, Stainless Steel, Teak, Wicker). *Đã đính chính theo ảnh chụp:* H1 + intro **căn trái** (cột ~8/12); 8 card xếp **2 cột** trên một dải nền taupe; nút là **outlined "READ MORE →"** (viền 1px), không phải ghost chỉ có mũi tên [RT] | |
| **Material detail** | `/en/resources/materials/teak` | Media-split H1 + mô tả lão hoá tự nhiên → mosaic ảnh → "Indoor Use" → "Outdoor Use" → "Protection" (sealer, protector, lưu kho mùa đông) → carousel "Collections using Teak" | Kể chuyện chất liệu theo **vòng đời sử dụng & bảo dưỡng**, không chỉ thông số |
| **Teak Story** | `/en/about/teak-story` | Hero full ảnh + H1 + sub → long-form **dạng hỏi đáp phỏng vấn** (nguồn gốc teak, điều kiện đồn điền ở Java, cách chọn gỗ theo tuổi/vân/dầu, chu kỳ 35–50 năm) | Câu chuyện tay nghề/nguồn gốc kể bằng chuyên gia |
| **About** | `/en/about/about` | Ảnh → text block dài: lịch sử từ 1960, 3 trụ giá trị "Skills & loyalty / Tradition & progress / Transparency & honesty", designer | Khá "văn bản", ít component |
| **Contract / Hospitality** | `/en/programs/contractor` | Hero full + H1 → text block (liệt kê phân khúc: boutique, independent, chuỗi khách sạn, tàu du lịch; 50 năm làm hospitality; kiểm soát toàn bộ sản xuất) → CTA catalogue → ảnh. *Đã đính chính theo ảnh chụp:* CTA duy nhất là link primary **"VIEW 2026 EUROPE & ROW TECH SPEC →"**, sau đó là footer, **không có ảnh cuối trang**; H1 hiển thị là **"CONTACT / HOSPITALITY"** (lỗi chính tả "Contact" thay vì "Contract", cũng có trong meta description) [RT] | **Mỏng**: không có case study, không form riêng, không số liệu |
| **Store finder** | `/en/locations/store-finder` | H1 + hướng dẫn → ô tìm theo vùng + nút **"Use my location"** → list 236 địa điểm nhóm theo loại ("Store [191]") + Google Map. *Đã đính chính theo ảnh chụp:* "Use my location" là **icon định vị bên trong ô tìm** (cạnh icon kính lúp), không phải nút có chữ; list cuộn trong khung riêng (scrollbar nội bộ) bên trái, bản đồ bên phải có 2 nút lọc "STORE" / "PREMIUM STORE"; bản đồ dùng **style Google mặc định** (nước xanh cyan), pin đen [RT] | |
| **Contact** | `/en/about/contact-us` | Text block + link chuyển khách châu Mỹ sang site US → form HubSpot nhúng (render client) | |

Đa ngôn ngữ [QS]: chỉ **tiếng Anh theo vùng**: `en`, `en-us`, `en-gb`, `en-sg`, `en-au`, `en-jp` + `x-default`; `/de/` trả 404. Sitemap index tách theo locale, `robots.txt` cho phép toàn bộ. Chuỗi UI nằm trong dictionary i18n (`product.dimensions_empty`, `explore.products_count_aria`...) trong `ng-state`.

SEO [QS]:
- Title có pattern `{Tên} | {Từ khoá} | Gloster` cho trang quan trọng (vd. "Grid Sofa | Luxury Teak Outdoor Furniture | Gloster"); một số trang dùng title chung "Explore Products - Gloster EN" và **thiếu meta description** (products, collections, quote).
- Có canonical, hreflang, OG + Twitter card.
- JSON-LD: WebSite + SearchAction, Organization + ContactPoint, BreadcrumbList, CollectionPage, Product, ProfilePage/Person (designer).
- Trang chủ: heading của hero là **H2**, còn **H1** nằm ở section 2.

Hiệu năng sơ bộ [QS, đo bằng curl, không phải Lighthouse]: HTML trang chủ ~380 KB (chưa nén), thời gian tải 0.5–1.6s/trang; 82 ảnh, 77 ảnh `loading="lazy"`, 2 ảnh `fetchpriority="high"`; preconnect tới image service; 7 file font woff2 self-host; JS initial ~230 KB qua 11 module (`modulepreload`), tổng 44 chunk ~1.3 MB (chưa nén, lazy). HTML nặng một phần vì **toàn bộ menu mobile (38 collection + 30 loại) nằm sẵn trong DOM** và listing render đủ 240 card.

---

## 6. Pattern tương tác & motion

1. **Motion "ít mà chuẩn"** [QS]: chỉ 4 duration, 3 easing. Hover chủ yếu là: gạch chân scaleX, opacity .6–.7, ảnh scale 1.04, card nhấc -6px, mũi tên dịch 3–6px. Không thấy parallax, scroll-jacking hay reveal-on-scroll hàng loạt. [SL] Chính sự tiết chế này tạo cảm giác premium.
2. **Line-sweep** là "chữ ký" chuyển động: vạch 1–2px quét trên nav, nút Quote, nút primary, breadcrumb.
3. **Search flip 3D** ở header (mục 2.2).
4. **Carousel tự viết**: drag (`cursor: grab/grabbing`), mũi tên vuông 44px viền đen (hover đảo đen), **progress bar 1px** đen trên nền #eee.
5. **Ảnh progressive** (`gd-progressive-image`): LQIP blur 20px + scale 1.06, ảnh thật fade in 220ms.
6. **360° spin + zoom** trên PDP, có download ảnh (hữu ích cho designer/đại lý).
7. **Accordion bằng `grid-template-rows`** (menu mobile, PDP) thay vì đo chiều cao bằng JS.
8. **`<dialog>` native + `::backdrop`** với `transition-behavior: allow-discrete` (overlay/display) cho drawer và modal [QS].
9. **View Transitions API**: bundle có `startViewTransition` và hook `onViewTransitionCreated` của Angular router [QS]; [SL] chuyển trang có crossfade khi trình duyệt hỗ trợ.
10. **Nút có trạng thái xác nhận**: dấu tick vẽ bằng `stroke-dashoffset`, kèm `aria-live`.
11. **Reduced motion** được tôn trọng ở cả cấp global lẫn từng component.
12. **Sticky header + footer reveal** (mục 2.2, 2.4): hiệu ứng "kết trang" chỉ bằng CSS sticky, không cần JS.

---

## 7. Mobile / responsive

- 3 breakpoint 768 / 1024 / 1330; gutter 24 → 48 → 80px; header 72 → 88px [QS].
- Typography và spacing **fluid bằng `clamp()`** nên ít cần override theo breakpoint [QS].
- Hero `--full` cao `min(125vw, 100dvh - header)` → [SL] trên mobile hero gần như full màn hình dọc, desktop bị giới hạn bởi viewport.
- `media-text--mobile-content-first`: cho phép đảo thứ tự chữ lên trước ảnh trên mobile [QS].
- Overlay card: trên mobile gradient đổi thành **lớp phủ đều 40%** để chữ dễ đọc trên ảnh nhỏ [QS].
- Footer → disclosure; breadcrumb → thu gọn "…"; modal region → 1 pane có nút Back [QS].
- Vùng chạm 44px cho icon, carousel `touch-action: pan-y` (không chặn cuộn dọc) [QS].
- Listing grid: 1 cột mobile, 2 tablet, 4 desktop, 6 wide [QS].

---

## 8. Điểm mạnh / điểm yếu UX

### Điểm mạnh

| Điểm | Lý do |
|---|---|
| Hệ token chặt, nhất quán | Mọi giá trị đi qua biến (màu, chữ, khoảng cách, motion); fluid clamp giúp giao diện "đều tay" mọi kích thước [QS] |
| Tương phản serif light uppercase × sans light | Tạo chất "editorial châu Âu" mà không cần trang trí [SL] |
| Bảng màu trầm + surface màu tự nhiên | Ảnh sản phẩm/lifestyle là nhân vật chính; các hàng nền be/olive tạo nhịp mà không ồn [SL] |
| Mỗi section 1 ý, 1 CTA | Giảm nhiễu, hướng dẫn rõ [QS: 10 CTA/12 section] |
| Phân luồng B2C/B2B ngay trang chủ | Card "Find a location" vs "Contract" [QS] |
| Liên kết chéo sản phẩm ↔ collection ↔ designer ↔ material | Tăng chiều sâu duyệt, hỗ trợ SEO nội bộ [QS] |
| Giỏ báo giá + phân loại người hỏi | Mô hình chuyển đổi phù hợp hàng giá cao, không bán online [QS] |
| PDP phục vụ chuyên gia | Download ảnh, Downloads (spec), tiêu chuẩn vải chống cháy UKFR [QS] |
| A11y tốt | Skip link, `aria-label`, `aria-live`, focus-visible, reduced motion, `<dialog>` [QS] |

### Điểm yếu

| Điểm | Lý do |
|---|---|
| Uppercase + weight 300 ở khắp nơi | Đoạn dài/nhãn dày đặc giảm khả năng đọc; chữ light trên nền taupe #d5cec6 có nguy cơ tương phản thấp [SL] |
| Hero dùng H2, H1 nằm dưới | Thứ bậc heading không tối ưu cho SEO/a11y [QS] |
| Một số trang thiếu meta description, title chung chung | Products, Collections, Quote [QS] |
| HTML nặng | Menu mobile đầy đủ + 240 card SSR; payload lớn trên mạng di động [QS] |
| Trang Contract mỏng | Không case study, không số liệu, không form B2B riêng, đúng kiểu brand B2C [QS] |
| Mega menu chỉ có chữ | Gọn nhưng thiếu gợi ý thị giác cho người chưa biết tên collection (tên collection như "Grid", "Bay" không tự mô tả) [SL] |
| Ngôn ngữ chỉ tiếng Anh | Thị trường châu Âu nhưng không có DE/FR/NL [QS] |
| Video hero không có nút tạm dừng | Không đạt WCAG 2.2.2 nếu video chạy > 5s [SL] |

---

## 9. Áp dụng cho BFC

Bối cảnh khác biệt cần nhớ: **Gloster là brand B2C bán qua đại lý**; **BFC là nhà sản xuất B2B/OEM**. Người mua của BFC (buyer, sourcing manager, brand owner, chuỗi khách sạn) cần **bằng chứng năng lực**: nhà máy, chất liệu, quy trình, QC, chứng nhận, công suất, MOQ, lead time. Vì vậy chỉ lấy **ngôn ngữ thị giác và cấu trúc**, còn nội dung phải hướng về năng lực.

### 9.1 Pattern nên lấy

Mức ưu tiên: **P1** làm ngay (ảnh hưởng lớn, chi phí thấp) / **P2** nên làm / **P3** cân nhắc.

| # | Pattern (từ Gloster) | Áp dụng vào BFC | Ưu tiên |
|---|---|---|---|
| 1 | **Motion tokens tối giản**: 120/220/420ms, `ease-out cubic-bezier(.22,1,.36,1)`, `emphasized (.2,0,0,1)`; hover = gạch chân scaleX, ảnh scale 1.04, card nhấc -6px; rule reduced-motion global | Khai báo trong Tailwind theme (`globals.css` `@theme`), dùng cho `arrow-link.tsx`, `ui/button.tsx`, card ở `products-section.tsx`, `projects-section.tsx` | P1 |
| 2 | **Nút primary dạng "line-top" + mũi tên** (không nền, vạch 1px phía trên, hover vạch 2px quét + mũi tên dịch 6px); nút secondary nền ink góc vuông | Thêm variant `line` cho `ui/button.tsx` hoặc nâng cấp `arrow-link.tsx`; dùng cho CTA phụ trong các section, giữ nút đặc (forest/ink) cho CTA chính "Request a quote" | P1 |
| 3 | **Góc vuông + viền 1px + gần như không bóng** | Đặt `--radius` của shadcn về 0–2px cho card/nút/input; dùng line #e8e8e8 làm divider; bỏ shadow trên card | P1 |
| 4 | **Hàng nền "surface" trầm** (be, xanh xám, olive) xen kẽ hàng trắng, mỗi surface có cặp on-surface | Bổ sung 2–3 surface của riêng BFC, ví dụ be ấm gần màu gỗ và một tông forest rất nhạt; áp vào `materials-section.tsx`, `certifications-section.tsx`, `process-section.tsx`. Không dùng đúng hex của Gloster | P1 |
| 5 | **Fluid type/spacing bằng `clamp()`** (H1 36→64px, section padding 80→112px, gutter 24/48/80) | Chuẩn hoá thang chữ và padding section trong `globals.css`; thay các giá trị cố định theo breakpoint | P1 |
| 6 | **Trang Material index + detail**: card swatch cận chất liệu → trang chi tiết kể theo vòng đời (đặc tính → dùng trong nhà/ngoài trời → bảo dưỡng/hoàn thiện) → carousel "sản phẩm dùng chất liệu này" | Map trực tiếp vào **Materials (+5)** (gỗ, nhôm, thép, nệm...): thêm khối "Xử lý bề mặt & hoàn thiện", "Tiêu chuẩn/kiểm định", "Sản phẩm/dự án dùng chất liệu này". `materials-section.tsx` trên Home dùng dạng card swatch | P1 |
| 7 | **PDP kiểu chuyên gia**: accordion Dimensions / Details / Downloads, swatch hoàn thiện, nút tải ảnh, cross-link chất liệu | Template **Products (+6)**: accordion Kích thước / Chất liệu & hoàn thiện / Đóng gói & loadability (pcs/40HQ) / MOQ & lead time / Tải spec sheet. Bỏ "Where to buy" | P1 |
| 8 | **Giỏ báo giá (Quote list) + form có trường "I am a…"** và trạng thái nút Quote ở header (filled/received) | "Thêm vào RFQ" trên card/PDP, trang RFQ tổng hợp; form có loại khách: Importer / Retailer / Brand owner (OEM/ODM) / Hospitality / Designer, kèm số lượng dự kiến, thị trường đích. CTA trong `site-header.tsx` hiển thị số mục RFQ | P1 (form), P2 (giỏ RFQ) |
| 9 | **H1 rõ ràng, JSON-LD (Organization, BreadcrumbList, Product không giá), hreflang, title pattern `{Trang} \| {Từ khoá} \| BFC`** | `[locale]/layout.tsx` + metadata từng trang; đảm bảo hero Home dùng H1 (tránh lỗi của Gloster) | P1 |
| 10 | **Hero: một khung cảnh, chữ căn trái-dưới, gradient tối từ đáy**; chiều cao `min(125vw, 100dvh - header)` | `hero-section.tsx`: giữ slider nhưng giảm nhịp (thời gian mỗi ảnh dài, Ken Burns biên độ nhỏ) hoặc dùng 1 video nhà máy/xưởng ngắn; đặt chữ trái-dưới; thêm nút pause nếu có video/auto-play | P2 |
| 11 | **Offset composition** (ảnh 4:5 chồng lên panel màu lệch xuống) cho nội dung nổi bật | "Năng lực nổi bật" trong `capabilities-section.tsx` hoặc 1 dự án tiêu biểu trong `projects-section.tsx` | P2 |
| 12 | **Lưới so le 3 cột** (cột giữa lùi xuống bằng spacer) | `projects-section.tsx` / trang Projects: tạo nhịp editorial cho case study | P2 |
| 13 | **Rail logo kéo được, lọc đơn sắc** ("As seen in") | `certifications-section.tsx`: logo chứng nhận (FSC, BSCI, ISO...) và logo khách hàng **nếu được phép** | P2 |
| 14 | **Card phân luồng đối tượng** ("Find a location" / "Contract") | Trên Home: 2–3 card chỉ chữ + mũi tên: "OEM/ODM cho thương hiệu", "Dự án hospitality", "Nhà nhập khẩu/bán lẻ", mỗi card dẫn tới trang/anchor phù hợp | P2 |
| 15 | **Ảnh progressive (LQIP blur → ảnh thật)** | `next/image` với `placeholder="blur"`; thay dần `image-placeholder.tsx` khi có ảnh thật | P2 |
| 16 | **Cross-link sâu**: sản phẩm ↔ chất liệu ↔ dự án ↔ năng lực | Mỗi trang con kết thúc bằng 1 carousel/khối "liên quan" | P2 |
| 17 | **Header desktop có nav hiển thị** (4–6 mục uppercase tracking rộng) + mega dropdown chỉ chữ chia cột | Cân nhắc cho `site-header.tsx`: ≥1024px hiện Capabilities / Materials / Products / Projects / About + CTA; giữ `menu-dialog.tsx` fullscreen cho mobile. Lý do: buyer B2B quét nhanh năng lực, hamburger trên desktop giấu IA. Đây là thay đổi so với design hiện tại, cần duyệt | P2 |
| 18 | **Menu mobile accordion** (rail dọc 1px cho cấp con, animation `grid-template-rows`) | `menu-dialog.tsx` cho nhóm Materials (+5) và Products (+6) | P3 |
| 19 | **Footer disclosure trên mobile**, cột Contact đầy đủ địa chỉ/tel/mail; **footer reveal** bằng `position: sticky; bottom: 0` (chỉ desktop, đủ chiều cao) | `site-footer.tsx`; thay newsletter bằng form ngắn "Nhận company profile / catalogue". Footer reveal là điểm nhấn rẻ (chỉ CSS) cho cảm giác premium | P3 |
| 20 | **Typography editorial**: display serif light cho H1/H2, body sans | Giữ Inter cho body; thử thêm 1 display serif có giấy phép mở và **hỗ trợ đầy đủ dấu tiếng Việt** (kiểm tra kỹ dấu chồng ở chữ hoa) qua `next/font`, chỉ cho heading lớn. Nếu không, dùng Inter weight 300 cỡ lớn + tracking âm nhẹ | P3 (cần thử nghiệm) |

### 9.2 Pattern nên tránh hoặc điều chỉnh

| Pattern Gloster | Vì sao không hợp BFC | Thay bằng |
|---|---|---|
| Instagram feed, newsletter làm trọng tâm footer, Blog sự kiện ở Home | Phục vụ cộng đồng B2C; buyer B2B không cần | Khối "Dự án/khách hàng đã làm", tải company profile |
| Store finder, "Where to buy", region selector | BFC không có đại lý bán lẻ | Bản đồ/thông tin nhà máy, đặt lịch thăm xưởng/virtual tour |
| Trang Contract mỏng, chỉ văn bản | Với BFC, đây chính là trang quan trọng nhất | `capabilities` giàu bằng chứng: số liệu công suất, diện tích xưởng, máy móc, QC, chứng nhận, lead time, case OEM |
| PDP không có thông số thương mại | Buyer B2B cần MOQ, lead time, đóng gói, loadability, chứng chỉ vật liệu | Đưa các trường này vào accordion PDP |
| Uppercase + weight 300 cho mọi heading và đoạn | Tiếng Việt có dấu ở chữ hoa dễ rối, chữ light giảm tương phản (BFC đã có ink-soft #444/ink-mute #6b6b6b) | Uppercase chỉ cho nhãn ngắn/eyebrow/nav; body weight 400; kiểm tra contrast ≥ 4.5:1 trên mọi surface |
| Hero heading là H2 | Sai thứ bậc heading | H1 trong hero |
| SSR toàn bộ menu + toàn bộ listing | HTML nặng | Next.js: render menu khi mở (hoặc rút gọn), phân trang/stream listing |
| Video hero không có nút pause | Vấn đề a11y | Có nút pause, tôn trọng `prefers-reduced-motion` (tắt Ken Burns/autoplay) |
| Font Gotham/Cardillac, đúng mã màu taupe/olive, ảnh 360 dựng bằng render service | Bản quyền/nhận diện của Gloster; render service đắt so với nhu cầu landing | Font và palette riêng; ảnh studio nhiều góc nếu cần |
| Chỉ có tiếng Anh theo vùng | BFC đã có next-intl | Giữ đa ngôn ngữ thật (vi/en, có thể thêm ngôn ngữ thị trường đích) |

### 9.3 Bổ sung từ quan sát runtime (2026-11-04) [RT]

Gloster là brand B2C; các pattern dưới đây được chọn vì chúng **chuyển được sang ngữ cảnh B2B** (bằng chứng năng lực, tài liệu kỹ thuật, tải về), không phải vì chúng bán hàng tốt.

| # | Phát hiện runtime | Trang BFC | Áp dụng cụ thể | Ưu tiên |
|---|---|---|---|---|
| R1 | **Khung trang lặp lại gần như 100%**: breadcrumb 14px uppercase → H1 serif 64px căn trái → intro 8/12 cột → khối nội dung → footer reveal. Chỉ hero full-bleed (102px) dành cho trang "cảm xúc" (Home, Collection, Contract, Teak Story) | Tất cả trang con | Dựng 2 template layout: `PageHeader` (breadcrumb + H1 + intro trái) cho Capabilities/Materials/Products/Contact; `HeroPage` (ảnh full-bleed + H1 trái-dưới) chỉ cho Home, Projects detail, About | P1 |
| R2 | **Lưới 2 cột "overlay card chất liệu"** tràn viền ở cuối trang loại sản phẩm, collection và PDP (ảnh macro vân/sợi, gradient đen đáy, tên 40px + mô tả 3 dòng + "READ MORE ABOUT THE MATERIAL") | Products (+6), Projects, Capabilities | Cuối mỗi trang sản phẩm/dự án: khối "Chất liệu sử dụng" gồm card ảnh macro gỗ/nhôm/thép/nệm dẫn sang **Materials (+5)**. Đây là cầu nối rẻ nhất giữa sản phẩm và năng lực | P1 |
| R3 | **Catalogue = 2 card ngang (ảnh bìa trái, panel trắng phải) trên dải taupe**, mỗi card 2 nút outlined "VIEW HERE" / "DOWNLOAD PDF"; có riêng một bản **Tech Spec** | Home, Capabilities, Contact | Khối "Tài liệu": Company profile + Catalogue sản phẩm + **Spec sheet/Tech pack** (B2B cần bản kỹ thuật hơn bản lookbook) | P1 |
| R4 | **Media Library dạng DAM** (thư mục: Brochures, Care Sheets, Corporate ID, Materials & Fabrics, Press, Training, Warranty...; mỗi thư mục có nút tải) | Contact hoặc trang tài nguyên mới | Khu "Tải về cho đối tác": chứng nhận (FSC, BSCI...), báo cáo test, hướng dẫn đóng gói, bảng màu hoàn thiện. Phù hợp B2B hơn Gloster | P2 |
| R5 | **Collections landing dùng mosaic ảnh lớn (1 lớn + 4 nhỏ) với nhãn chữ trên nền taupe ở góc ảnh**, xen kẽ nhóm nền trắng/taupe | Projects (danh sách), Products (trang tổng) | Danh sách dự án theo nhóm (Hospitality / Retail / OEM): mỗi nhóm 1 ảnh lớn + 4 ảnh nhỏ, nhãn "TÊN DỰ ÁN →". Thay cho lưới card đều nhau | P2 |
| R6 | **PDP: panel ảnh xám #eee + cấu hình bằng dropdown có swatch tròn + 2 nút ngang (outlined "Where to buy" / taupe "Add to quote") + accordion chỉ có divider** | Products (+6) | Giữ đúng cấu trúc: ảnh trái (nền xám nhạt), phải: tên, collection, chọn hoàn thiện (swatch), nút "Thêm vào RFQ" (nền surface) + "Tải spec" (outlined), accordion Kích thước / Chất liệu / Đóng gói / MOQ & lead time | P1 |
| R7 | **Bài blog**: hero ảnh không chữ (chỉ breadcrumb) → H1 64px + ngày → thân 8/12 cột → **quote block có vạch dọc trái, chữ sans 26px** → ảnh 8/12 → "Related posts" | Projects detail (case study) | Case study: hero ảnh công trình → H1 + khách hàng/năm → đoạn bối cảnh → **trích lời khách hàng** dạng quote block → ảnh → "Dự án liên quan" | P2 |
| R8 | **Những chỗ Gloster mất nhất quán** khi nhúng công cụ bên thứ ba: Planner (nút bo tròn, font hệ thống), form HubSpot ở Contact (input gạch chân, font khác, nút Submit xám bo góc), Google Map style mặc định | Contact, Capabilities | Form liên hệ/RFQ của BFC tự dựng bằng shadcn theo token chung (input viền 1px, radius 0–2px, cùng font); nếu nhúng bản đồ nhà máy thì dùng ảnh tĩnh hoặc map đã style trầm | P1 |
| R9 | **Trang Contract chỉ 1 màn hình chữ + 1 link tech spec, H1 sai chính tả ("CONTACT / HOSPITALITY")** | Capabilities | Bằng chứng ngược: trang B2B của brand B2C rất mỏng. Trang Capabilities của BFC cần số liệu, ảnh xưởng, quy trình, chứng nhận; và cần QA copy cho heading lớn | P1 |
| R10 | **Trang About/Teak Story là text dài một cột, không ảnh giữa bài, giá trị cốt lõi viết thành đoạn văn** | About | Không bắt chước. About của BFC nên chia khối: mốc thời gian, con số, ảnh con người/xưởng, 3–4 giá trị dạng thẻ | P2 |

---

## 10. Phụ lục

### 10.1 URL đã xem (tải HTML bằng curl, User-Agent trình duyệt, ngày 2026-11-04)

- https://www.gloster.com/en/ (trang chủ)
- https://www.gloster.com/en/products
- https://www.gloster.com/en/products/collections
- https://www.gloster.com/en/products/collections/grid
- https://www.gloster.com/en/products/p/grid-sofa
- https://www.gloster.com/en/products/types/sofas (chỉ xem title/meta)
- https://www.gloster.com/en/resources/materials
- https://www.gloster.com/en/resources/materials/teak
- https://www.gloster.com/en/about/teak-story
- https://www.gloster.com/en/about/about
- https://www.gloster.com/en/programs/contractor
- https://www.gloster.com/en/locations/store-finder
- https://www.gloster.com/en/about/contact-us
- https://www.gloster.com/en/quote
- https://www.gloster.com/en/resources/designers, /en/resources/catalogue (chỉ xem title/meta)
- https://www.gloster.com/en/resources/blog/the-stories-behind-our-2026-collections (tải, chưa phân tích sâu)
- Tài nguyên: `styles-6PROSQ55.css`, `main-RLK65H6Q.js` + 43 chunk JS lazy, `robots.txt`, `sitemap.xml`, response header của `https://www.gloster.com/`

### 10.2 Hạn chế của phân tích

1. ~~**Không chụp màn hình, không chạy trình duyệt**~~ → **Đã khắc phục một phần (mục 11):** 18 trang đã được chụp ở desktop 1424×805. Vẫn **chưa xem mobile/tablet**; các nhận định responsive ở mục 7 vẫn chỉ dựa trên CSS.
2. Hành vi JS lúc chạy. Trạng thái sau khi chụp runtime:
   - **Đã xác minh:** header **dính và giữ nền trắng đặc** ở mọi vị trí cuộn, **không ẩn khi cuộn xuống** (có mặt trong 100% ảnh của mọi trang); **footer reveal** hoạt động (mục 2.4); hero trang chủ [SL] nhiều khả năng là **video đang phát** (khung hình ở lần chụp đầu khác hẳn lần chụp sau); carousel hiển thị **dots + 2 mũi tên**, không thấy autoplay trong các khung hình (vị trí slide đầu giữ nguyên giữa các lần chụp); trạng thái nav đang chọn (đậm + gạch chân 1px) theo mục cha của trang.
   - **Chưa xác minh:** marquee "As seen in" có tự chạy hay không (ảnh tĩnh không phân biệt được); view transition; mega menu mở bằng hover hay click. Trên desktop, 6 mục nav là **`<button>` chứ không phải link** (vùng `header.navbar` chỉ có 3 link: logo ×2 và QUOTE), nội dung mega menu nằm trong chunk lazy và **không có trong DOM khi chưa mở**; route của menu được lấy từ drawer mobile (77 link, có sẵn trong DOM) và footer.
3. Nội dung render phía client: **form HubSpot ở Contact đã thấy** (mục 11.3.16); bản đồ Google ở Store finder đã thấy; nội dung bên trong accordion Dimensions/Details/Downloads của PDP và modal chọn vải **vẫn chưa mở** để xem.
4. Kích thước file đo bằng curl **không nén** (không gửi `Accept-Encoding`), thời gian tải phụ thuộc mạng; đây không phải số đo Core Web Vitals.
5. Chỉ xem phiên bản `/en/`; các phiên bản vùng (en-us, en-gb...) có thể khác nội dung/IA.
6. Một số CSS component nằm trong chunk lazy (ví dụ mega dropdown) nên chỉ đọc được rule, chưa thấy dữ liệu thật hiển thị trong đó.

---

## 11. Quan sát runtime (ảnh chụp + DOM đã render)

> Quan sát runtime bằng REA ngày 2026-11-04, viewport 1424×805 desktop; chưa xem mobile.

### 11.1 Phương pháp

- Trình duyệt Chrome điều khiển qua CDP; REA CLI 6.8.0 `capture-web-screenshot` chụp từng viewport khi cuộn hết trang (bước cuộn 684px). Mỗi ảnh có `evidence_id` REA (ghi bên dưới cho ảnh chính).
- Cookiebot được đóng bằng nút "Use necessary cookies only" ở lần đầu. Lần chụp đầu tiên của trang chủ (`home-00` trong repo, ảnh cũ) vẫn còn lớp backdrop tối của Cookiebot nên header và hero bị xám; khung hình sạch là `home-00` của lần chụp thứ hai (để ở scratchpad, evidence bên dưới). Các ảnh `home-NN` còn lại trong repo trùng vị trí cuộn với lần chụp thứ hai.
- Outline lấy từ DOM đã render: thứ tự khối theo trục dọc, `font-family/size/weight/transform` thật của heading (`getComputedStyle`), CTA, số ảnh, màu nền.
- Route lấy từ DOM (header, drawer mobile, nội dung trang, footer) trên trang chủ và trang Blog; hai trang cho cùng bộ nav (không có sidebar riêng).
- Ảnh trong repo: `docs/design-research/screenshots/gloster/`, tối đa 3 ảnh/trang (riêng trang chủ giữ 7 ảnh cũ + ảnh banner cookie theo yêu cầu). Toàn bộ ảnh còn lại nằm ở scratchpad của phiên phân tích (không commit).

### 11.2 Sơ đồ routes thực tế (từ DOM)

Tổng **118 URL cùng origin** trên trang chủ. Vùng chứa link: `header.navbar` (3 link: logo ×2, QUOTE), `dialog.mnav-drawer` (77 link, render sẵn dù ẩn), nội dung `#main` (51 link), `gw-footer` (19 link). Trên desktop, 6 mục nav (Products, Collections, Resources, Programs, Locations, About) là **nút mở mega menu**, không phải link; nội dung mega menu không có trong DOM khi chưa mở, nên route của menu được đối chiếu từ drawer mobile.

| Route | Tên | Vùng nav chứa nó | Template | Đã chụp? |
|---|---|---|---|---|
| `/en/` | Trang chủ | Logo header | Home | Có (`home`, 14 ảnh) |
| `/en/products` | Explore Products | Drawer › Products ("Explore all products"), CTA trang chủ | Listing sản phẩm | Có (`products`, 10 ảnh; trang dài ~24.200px) |
| `/en/products/types/{type}` (23 route: sofas, dining-chairs, fire-bowls, pendants...) | Loại sản phẩm | Drawer › Products (4 nhóm Seating/Tables/Accessories/Lighting) | Product type | Đại diện `/types/sofas` (8 ảnh) |
| `/en/products/p/{collection}-{product}` | Chi tiết sản phẩm | Carousel trong trang (23 link trên trang chủ) | PDP | Đại diện `/p/grid-sofa` (6 ảnh) |
| `/en/products/collections` | Collections | Drawer › Collections ("Explore all collections"), CTA "Explore new collections" (`#novelties`) | Collections landing | Có (`collections`, 12 ảnh; trang dài ~23.400px) |
| `/en/products/collections/{slug}` (38 route trong drawer) | Chi tiết collection | Drawer › Collections; carousel trong trang | Collection detail | Đại diện `/collections/grid` (13 ảnh) |
| `/en/products/collections/sofas` ... (7 route của "Highlighted categories") | Nhóm loại được trình bày như collection | Nội dung trang chủ | Khác URL với `/products/types/sofas`, chưa rõ có trùng nội dung [CXĐ] | Không |
| `/en/resources/blog` | Blog | Drawer › Resources › Inspiration; footer › Resources | Blog index | Có (`blog`, 6 ảnh) |
| `/en/resources/blog/{slug}` | Bài blog | Trang chủ, Blog index | Blog post | Đại diện `the-stories-behind-our-2026-collections` (11 ảnh) |
| `/en/resources/catalogue` | Catalogue | Drawer › Inspiration; footer | Trang tải tài liệu | Có (`catalogue`, 3 ảnh) |
| `/en/resources/catalogue/2026-look-book` | Look Book online | CTA trang chủ | Trình xem catalogue | Không |
| `/en/resources/newsletter`, `/en/resources/videos` | Newsletter, Videos | Drawer › Inspiration | Trang phụ | Không (ngoài phạm vi) |
| `/en/resources/planner` | 2D/3D Planner | Drawer › Tools & Downloads; footer | Công cụ nhúng | Có (`planner`, 4 ảnh) |
| `/en/resources/care-sheets` | Product Care | Drawer › Tools; footer › Customer Service | Trang phụ | Không |
| `/en/resources/media-library` | Media Library | Drawer › Tools; footer | DAM / tải file | Có (`media-library`, 3 ảnh) |
| `/en/resources/designers` | Designers | Drawer › Design | Danh sách designer | Không (ngoài phạm vi) |
| `/en/resources/materials` | Materials | Drawer › Design | Materials index | Có (`materials`, 6 ảnh) |
| `/en/resources/materials/{material}` (8) | Chi tiết chất liệu | Card trên Materials index, overlay card chất liệu cuối PDP/collection/loại | Material detail | Đại diện `/materials/teak` (7 ảnh) |
| `/en/resources/textiles` | Textiles | Drawer › Design | Trang phụ | Không |
| `/en/programs/contractor` | Contract / Hospitality | Drawer › Programs; footer › Company; card trang chủ | Trang chương trình | Có (`contract`, 4 ảnh) |
| `/en/locations/store-finder` | Store Finder | Drawer › Locations; card trang chủ | Store finder | Có (`store-finder`, 3 ảnh) |
| `/en/store-finder` | Store Finder (link footer) | Footer › Company | URL khác với drawer, có thể redirect [CXĐ] | Không |
| `/en/about/about` | About Gloster | Footer › Company | Trang văn bản | Có (`about`, 4 ảnh) |
| `/en/about` | About (overlay card trang chủ) | Nội dung trang chủ | URL khác với footer [CXĐ] | Không |
| `/en/about/teak-story` | Teak Story (bền vững) | Drawer › About; overlay card trang chủ | Long-form | Có (`teak-story`, 4 ảnh) |
| `/en/about/contact-us` | Contact | Drawer › About; footer | Contact + form HubSpot | Có (`contact`, 4 ảnh) |
| `/en/quote` | Quote | Header | Giỏ báo giá | Không (ngoài danh sách trang chính) |
| `/en/jobs`, `/en/privacy-statement`, `/en/about-cookies`, `/en/imprint` | Jobs, pháp lý | Footer | Pháp lý | Bỏ qua theo phạm vi |

Nhận xét [RT]: IA có **3 cặp URL gần như trùng nghĩa** (`/products/types/sofas` và `/products/collections/sofas`; `/locations/store-finder` và `/store-finder`; `/about/about` và `/about`). Với BFC nên chốt một URL chuẩn cho mỗi trang ngay từ đầu.

### 11.3 Phân tích từng trang chính

Ghi chú chung cho mọi trang (không nhắc lại): header trắng 88px dính đầu trang, mục nav cha của trang hiện tại **đậm + gạch chân 1px**; nút tròn xám nổi ở góc trái-dưới là **widget Cookiebot (mở lại cài đặt cookie)**, không phải nút chat; footer xanh xám #dce2e6 5 cột với hiệu ứng reveal. Font đo được: heading **Cardillac weight 300 uppercase**, body **Gotham**.

#### 11.3.1 Trang chủ `/en/`

Ảnh: [`home-cookie-banner`](screenshots/gloster/home-cookie-banner.png), [`home-00`](screenshots/gloster/home-00.png), [`home-01`](screenshots/gloster/home-01.png), [`home-03`](screenshots/gloster/home-03.png), [`home-05`](screenshots/gloster/home-05.png), [`home-08`](screenshots/gloster/home-08.png), [`home-11`](screenshots/gloster/home-11.png), [`home-13`](screenshots/gloster/home-13.png). Evidence chính (lần chụp sạch): hero `ev_38f90b8be1cbd52575d3a846b44ea2dc89cecf752fff581136e09ddc783ddf81`, offset `ev_66211946bbae3e673f85349315aa12bb7f5b775ab283211dfc3a451a0e079454`, overlay card `ev_161671264ea6946e371bd3c019313564435db970feecde469a468ca88c0296aa`. Title "Teak Furniture | Modern Luxury Outdoor Furniture | Gloster". Cao 9.224px.

| # | Section | Mục đích | Bố cục / nền | Typography (đo) | CTA | Tương tác thấy được |
|---|---|---|---|---|---|---|
| 0 | Banner Cookiebot | Consent | Modal giữa màn hình, 3 tab (Consent/Details/About), 4 công tắc, 3 nút; **che toàn bộ hero** ở lần vào đầu | Font hệ thống của Cookiebot (không phải Gotham) | "Use necessary cookies only" / "Allow selection" / "Allow all cookies" | Backdrop tối toàn trang |
| 1 | Hero video | Không khí thương hiệu | Full-bleed, cao 717px (= viewport − header), gradient tối đáy; chữ **căn trái-dưới** | H2 Cardillac **102px**/300 uppercase, 2 dòng; sub Gotham 16px trắng | "EXPLORE NEW COLLECTIONS" dạng primary: **vạch 1px phía trên**, không mũi tên | [SL] Video nền đang chạy (khung hình khác nhau giữa 2 lần chụp) |
| 2 | Intro + H1 | SEO + định vị | Chữ trái ~8 cột, ảnh vuông 400px bên phải (cận chân bàn teak) | **H1 64px** | "EXPLORE ALL PRODUCTS →" (line-top) | |
| 3 | Highlighted categories | Duyệt theo loại | Tiêu đề trái, carousel card ảnh lifestyle vuông ~243px, tên + "COLLECTION" căn giữa | H2 38px; tên card Gotham 16px, nhãn 14px uppercase | Toàn card | Dots trái + 2 mũi tên vuông phải |
| 4 | Featured collection (offset) | Đẩy 1 collection | **Ảnh 4:5 (cột 1–6) chồng lên panel olive #8d8b72** chạy từ cột 3 đến 12, panel lùi xuống ~130px; eyebrow + H2 ở trên, đoạn mô tả và CTA dồn đáy panel | Eyebrow Gotham 16px uppercase; H2 38px màu sage nhạt | "EXPLORE THE GRID COLLECTION →" chữ sáng trên olive | |
| 5 | Carousel sản phẩm collection | Hiện sản phẩm thật | 23 ảnh **cutout sản phẩm nền trắng** (render), tên + "GRID" | Gotham 16/14px | Toàn card | Dots (5 trang) + mũi tên |
| 6 | Look Book | Dẫn sang catalogue | **Dải taupe #d5cec6 full-bleed**, chữ trái căn giữa theo chiều dọc, ảnh bìa catalogue bên phải | H2 38px | "VIEW THE CATALOGUE →" | |
| 7 | Ảnh tràn viền | Nhịp nghỉ | Ảnh kiến trúc ngoài trời full-bleed cao ~717px, nối liền đáy dải taupe | | | |
| 8 | 2 card phân luồng | B2C / B2B | 2 cột, chỉ divider trên và dưới, nhiều khoảng trắng | H3 38px; câu mô tả 16px | "LOCATE A STORE →" / "CONTRACT SERVICES →" | |
| 9 | 2 overlay card | Bền vững + About | 2 ảnh vuông **sát nhau, không gap**, gradient đen nửa dưới, chữ trắng trái-dưới | Tiêu đề 38px, excerpt 16px | "THE TEAK STORY →" / "ABOUT GLOSTER →" (line-top trắng) | Hover scale ảnh (CSS) |
| 10 | As seen in | Social proof | Dải taupe cao 405px, nhãn nhỏ căn giữa, 1 hàng logo tạp chí đen (dezeen, dwell, Elle Decor, Frame, Monocle, Wallpaper*, Luxe...) bị cắt ở 2 mép | Nhãn Gotham 16px uppercase tracking rộng | | Rail ngang (tự chạy chưa xác minh) |
| 11 | Inspiration | Nội dung | Eyebrow + H2 trái, nút outlined "VIEW ALL POSTS" phải; 3 bài, **cột giữa thấp hơn ~200px** (lưới so le) | H2 38px; tiêu đề bài 20px; excerpt 16px | "READ MORE →" | |
| 12 | Instagram | Cộng đồng | Eyebrow + H2 + nút outlined "FOLLOW US"; hàng ô vuông, **ảnh lỗi, chỉ hiện alt text** | H2 38px | | Cuộn ngang |
| 13 | Footer | | Xem 2.4 | Gotham 22px/300 | "CONTACT US →", "SIGN UP →" nền xám | Reveal |

#### 11.3.2 Explore Products `/en/products`

Ảnh: [`products-00`](screenshots/gloster/products-00.png), [`products-01`](screenshots/gloster/products-01.png). Evidence: `ev_5a5c8737699dece0737d2a08f1d58632c200db33bc4a0a84210d96cc2219dfde`. Title "Explore Products - Gloster EN", **không có meta description** (xác nhận lại).

1. **Breadcrumb** (`gw-breadcrumb-bar`): HOME › PRODUCTS, Gotham 14px uppercase tracking rộng, mục cuối đậm.
2. **Header** (`gw-explore-page-header`): H1 "EXPLORE PRODUCTS" **64px căn giữa**, nhiều khoảng trắng phía trên (~80px).
3. **Toolbar** (`gw-explore-toolbar`): trái nút outlined "FILTERS" có icon; giữa 4 chip chữ (chip đang chọn nền taupe); phải "CLEAR ALL" gạch chân. Bảng filter (Search, Subcategory, Materials, Designer) có trong DOM nhưng **ẩn tới khi bấm FILTERS**; dòng "Showing 240 of 240" cũng có trong DOM.
4. **Grid**: 4 cột, ô ~300×355px, ảnh **cutout render nền trắng** (bóng đổ mềm dưới chân), tên collection Gotham 16px + loại sản phẩm 14px uppercase căn giữa. Không viền, không nền card, không giá. Trang ~24.200px (render dần theo batch khi cuộn).

#### 11.3.3 Loại sản phẩm (đại diện `/en/products/types/sofas`)

Ảnh: [`product-type-00`](screenshots/gloster/product-type-00.png), [`product-type-01`](screenshots/gloster/product-type-01.png), [`product-type-05`](screenshots/gloster/product-type-05.png). Evidence: `ev_9ca9b3fb823d171ff9b0ca7b5e29db45dcc8f01aa44d90c6847042b4843aa5dc`. Title "Luxury Outdoor Sofas | Gloster", có meta.

1. **Hero full-bleed** 712px: breadcrumb trắng **đè lên ảnh** ở góc trái-trên; H1 "SOFAS COLLECTION" **102px** trái-dưới.
2. **Media-text**: ảnh **tràn sát mép trái màn hình** (bleed một phía) ~454px, chữ phải: H2 38px + 2 đoạn. Không CTA.
3. **Grid sản phẩm** 4 cột (20 sản phẩm), cùng card như listing nhưng dòng trên là tên sản phẩm, dòng dưới là collection.
4. **Lưới overlay card chất liệu** 2 cột **tràn viền, không gap** (Aluminium, Rope, Sling, Stainless Steel, Teak, Wicker): ảnh macro chất liệu, gradient đen đáy, tên Cardillac **40px** + mô tả 3 dòng (line-clamp) + "READ MORE ABOUT THE MATERIAL →" (line-top trắng). Khối cao ~2.100px.

#### 11.3.4 Chi tiết sản phẩm (đại diện `/en/products/p/grid-sofa`)

Ảnh: [`pdp-00`](screenshots/gloster/pdp-00.png), [`pdp-01`](screenshots/gloster/pdp-01.png), [`pdp-03`](screenshots/gloster/pdp-03.png). Evidence: `ev_6bf4ec2dc458d981b1aa750afb2921be166ff42c23bb5c19ad8fe597a4a24971`. Cao 3.767px (ngắn).

1. **Breadcrumb 5 cấp** HOME › PRODUCTS › COLLECTIONS › GRID › GRID SOFA (không đè ảnh).
2. **Khối sản phẩm 2 cột**: trái là panel ảnh **nền xám #eee** ~600×760px, icon expand góc phải-trên, thanh dưới: "Click to Zoom", "Drag to Rotate", "↓ Download image" (gạch chân). Phải: H1 "GRID SOFA" 64px, tên collection 16px, nhãn "FRAME" + **dropdown viền 1px có swatch tròn** (Meteor), nhãn "FABRIC" + ô có swatch tròn và dấu "+" (mở modal), 2 nút ngang rộng bằng nhau: outlined "WHERE TO BUY" và **nền taupe "ADD TO QUOTE"**, rồi accordion DIMENSIONS / DETAILS / DOWNLOADS chỉ có divider 1px và chevron.
3. **Slider lifestyle full-bleed** (~13 ảnh): dots trắng đè ảnh ở trái-dưới, mũi tên vuông đè ảnh ở phải-dưới.
4. **"Discover more in this collection"**: heading 26px trái + nút outlined "VIEW ALL" phải; carousel cutout.
5. **2 overlay card** sát nhau trong container: "DESIGNED BY HENRIK PEDERSEN" (ảnh chân dung đen trắng) + "ALUMINIUM" (ảnh macro), tiêu đề 40px.
6. Modal chọn vải (`DIALOG`) có trong DOM: tab nhóm "Outdoor Performance / UKFR (Fire resistant) / Water resistant", lưới swatch có tên.

#### 11.3.5 Collections landing `/en/products/collections`

Ảnh: [`collections-00`](screenshots/gloster/collections-00.png), [`collections-01`](screenshots/gloster/collections-01.png), [`collections-04`](screenshots/gloster/collections-04.png). Evidence: `ev_b1e4eeecdfe38bcff0537f5dfd268122059ccef8d9b146b9342ddd49700143a2`. Title "Collections - Gloster EN", **không có meta**.

1. Breadcrumb → H1 "COLLECTIONS" 64px **căn trái** → hàng chip anchor (VIEW ALL nền taupe / NOVELTIES / BESTSELLERS / LOUNGE / DINING / SIDE TABLES / LIGHTING / ACCESSORIES) sát ngay dưới H1.
2. Mỗi nhóm: H2 38px trái + đoạn mô tả ~6 cột → **mosaic ảnh lifestyle**: Novelties dùng 1 ảnh full container ~1249×570px rồi lưới 2 cột; Bestsellers (nền taupe) dùng bố cục **1 ảnh lớn dọc bên trái + lưới 2×2 bên phải**. Nhãn "TÊN →" là **chip chữ nền taupe** đặt ở góc trái-dưới mỗi ảnh.
3. Nền các nhóm xen kẽ **trắng → taupe → trắng → taupe**. Trang rất dài (~23.400px), không có nút "lên đầu trang".

#### 11.3.6 Chi tiết collection (đại diện `/en/products/collections/grid`)

Ảnh: [`collection-detail-00`](screenshots/gloster/collection-detail-00.png), [`collection-detail-07`](screenshots/gloster/collection-detail-07.png), [`collection-detail-10`](screenshots/gloster/collection-detail-10.png). Evidence: `ev_c77d98851d6225905c9ed1a3554b1cdbf5e10491faef17ffd845f395f6a04ac1`. Cao 8.495px.

1. **Hero full-bleed** 712px, breadcrumb đè ảnh (trên nền trời sáng nên **gần như không đọc được**), H1 "GRID COLLECTION" 102px trái-dưới.
2. **Media-text** ảnh bleed trái + 1 đoạn giới thiệu (không heading).
3. **Chip lọc** VIEW ALL / SEATING / TABLE → **grid 4 cột** 23 sản phẩm cutout.
4. **Slider lifestyle full-bleed** (dots + mũi tên đè ảnh).
5. **Designer block trên taupe**: chữ trái (H2 38px + bio + nút **outlined** "READ MORE ABOUT THE DESIGNER →"), ảnh chân dung đen trắng **bleed sát mép phải**.
6. **"Collections by Henrik Pedersen"** vẫn trên taupe: heading 26px + "VIEW ALL" outlined, carousel collection.
7. **Overlay card chất liệu** (Aluminium, Ceramic, Teak) lưới 2 cột tràn viền; vì số card lẻ (3) nên có **1 ô trống trắng** cạnh card đầu.

#### 11.3.7 Materials index `/en/resources/materials`

Ảnh: [`materials-00`](screenshots/gloster/materials-00.png), [`materials-01`](screenshots/gloster/materials-01.png). Evidence: `ev_0db9b7e6f22194313c9be49a3889d773777cb31b4dcc0a6ab0621392289274e5`. Cao 3.735px.

1. Breadcrumb → H1 "MATERIALS" 64px trái + 2 đoạn intro (~8 cột) có số liệu tay nghề (gần 200m dây, hơn 4,5 giờ đan một mặt ghế).
2. **Dải taupe**: 8 card 2 cột, ảnh **swatch macro** ~613×376px (nhám nhôm, vân đá ceramic, kính, dây đan...), tên Cardillac **20px** bên dưới, nút outlined "READ MORE →".

#### 11.3.8 Chi tiết chất liệu (đại diện `/en/resources/materials/teak`)

Ảnh: [`material-teak-00`](screenshots/gloster/material-teak-00.png), [`material-teak-01`](screenshots/gloster/material-teak-01.png), [`material-teak-03`](screenshots/gloster/material-teak-03.png). Evidence: `ev_331fd8b8a10bbff42e29b2041662b780d98f92e0faebcba94142638b69d94c8a`. Cao 4.502px.

1. Breadcrumb 4 cấp → **media-text**: H1 "TEAK" 64px + đoạn dài bên trái, ảnh vuông macro mép bàn teak bên phải.
2. **"INDOOR USE"**: bố cục 3 cột lệch: chữ (H2 38px + 2 đoạn) cột trái, 2 ảnh chi tiết (tay vịn, ghế) ở cột giữa và phải với **chiều cao khác nhau** (mosaic).
3. **"OUTDOOR USE"**: đảo chiều, ảnh lớn bên trái ~8 cột, chữ bên phải.
4. **"PROTECTION"**: H2 cỡ **64px** cột trái, chữ **cỡ lớn (~22px, subheader)** cột phải. Chữ lớn hơn body làm phần hướng dẫn bảo dưỡng đọc như một tuyên bố.
5. **Dải taupe "COLLECTIONS USING TEAK"**: carousel card collection.

#### 11.3.9 Catalogue `/en/resources/catalogue`

Ảnh: [`catalogue-00`](screenshots/gloster/catalogue-00.png), [`catalogue-01`](screenshots/gloster/catalogue-01.png). Evidence: `ev_c6363c3c23a1a6189111fa236423fa327bee7713cf8ee9f7b2a6fe89f0a8cbfa`.

1. Breadcrumb → H1 "CATALOGUE" 64px + dòng phụ uppercase "RECEIVE OUR CATALOGUE YOUR WAY…" + 1 đoạn.
2. **Dải taupe**: 2 card ngang (ảnh bìa ~255px bên trái, panel **trắng** bên phải) "THE 2026 LOOK BOOK" và "THE 2026 TECH SPEC", tiêu đề 20px, mỗi card 2 nút outlined xếp dọc "VIEW HERE →" / "DOWNLOAD PDF →". Không có form chặn trước khi tải (không gate lead).

#### 11.3.10 Planner `/en/resources/planner`

Ảnh: [`planner-00`](screenshots/gloster/planner-00.png), [`planner-01`](screenshots/gloster/planner-01.png). Evidence: `ev_d566e6af709e218a7744f005fd247e63bde44ea6554826412e73346e6d34fd1a`. Title chỉ là "Planner".

1. Breadcrumb → H1 "2D / 3D PLANNER" 64px → khoảng trống lớn → nút outlined căn giữa "DOWNLOAD PLANNER USER GUIDE".
2. **Ứng dụng planner nhúng**: sidebar trái là danh mục accordion (LOUNGE › 180, Archi, Bay...), canvas lưới xám, tab "2D FLOOR PLAN / 3D VIEW / PRODUCT LIST" có **góc bo tròn**, thanh công cụ dùng nút **pill bo tròn** (Measure, Undo, Save, Load, Send, Print, Help), font sans hệ thống. Đây là chỗ **lệch ngôn ngữ thiết kế rõ nhất** của site.

#### 11.3.11 Media Library `/en/resources/media-library`

Ảnh: [`media-library-00`](screenshots/gloster/media-library-00.png). Evidence: `ev_adbe9285c717077a904670471e969fae8a7c5b91bde3c8fb1855491bece01b29`.

1. Breadcrumb → H1 64px + 1 câu.
2. **Trình duyệt file kiểu DAM**: thanh "⌂ Media Library … 12 items ☰", nhãn nhóm "FOLDERS" / "FILES" (**Gotham 12px/600**), thẻ thư mục 4 cột **viền 1px, bo ~4px**, icon thư mục xám + nút tải vuông nhỏ; file có thumbnail + dung lượng. Thư mục: Branded Social Media Content, Brochures, Care Sheets, Corporate ID & Logos, Materials & Fabrics, Press Releases, Product Collections, Training Materials, Videos, Warranty Information.

#### 11.3.12 Contract / Hospitality `/en/programs/contractor`

Ảnh: [`contract-00`](screenshots/gloster/contract-00.png), [`contract-01`](screenshots/gloster/contract-01.png). Evidence: `ev_44d11b964fb5678c4c63c151d3adfcc7ba512d909b98c77589caf37f8fdaceee`. Cao chỉ ~2.300px.

1. Breadcrumb **nằm trên nền trắng phía trên hero** (khác trang loại/collection có breadcrumb đè ảnh).
2. **Hero full-bleed** ảnh biệt thự trên vách đá lúc đêm, H1 "CONTACT / HOSPITALITY" 102px (lỗi chính tả, đúng ra là "Contract").
3. **Text block**: H2 38px liệt kê phân khúc ("Unique boutiques. Large independents. Prestige hotel chains. Globetrotting cruise liners.") + 2 đoạn.
4. **1 link primary** "VIEW 2026 EUROPE & ROW TECH SPEC →". Hết trang. Không form, không dự án, không logo khách hàng, không số liệu.

#### 11.3.13 Store finder `/en/locations/store-finder`

Ảnh: [`store-finder-00`](screenshots/gloster/store-finder-00.png). Evidence: `ev_f75760b2ac35b728e94a4e85337062a06ec9b8df3f52b901273bfb7831579ee9`.

1. Breadcrumb → H1 "FIND STORE" 64px + 2 câu hướng dẫn.
2. **2 cột cao bằng nhau (~613px)**: trái là ô tìm viền 1px (placeholder "France", icon kính lúp + icon định vị), "236 LOCATIONS", nhóm "STORE [191]" 26px, danh sách cửa hàng (tên uppercase 16px, địa chỉ 3 dòng, mũi tên "→" bên phải, divider) cuộn trong khung; phải là Google Map style mặc định, 2 nút lọc vuông trắng "STORE" / "PREMIUM STORE", pin đen.

#### 11.3.14 About `/en/about/about`

Ảnh: [`about-00`](screenshots/gloster/about-00.png), [`about-01`](screenshots/gloster/about-01.png). Evidence: `ev_eb94c45f2ca22dc173bce400f3300cae40e1e98d1fdc1695ba3e81c4a491ea2f`.

1. Breadcrumb HOME › ABOUT GLOSTER. Mục "ABOUT" trên nav **không** ở trạng thái active trên trang này (khác Teak Story và Contact).
2. **Ảnh trong container** (không full-bleed) ~1249×573px: tay cầm khung tựa ghế teak trên nền xám studio.
3. **Text block một cột ~8/12**: H1 64px, câu mở đầu đậm hơn (weight 400), rồi 7 đoạn văn. Ba giá trị "Skills & loyalty / Tradition & progress / Transparency & honesty" **chỉ là chữ đầu đoạn**, không có thẻ, icon hay heading riêng.

#### 11.3.15 Teak Story `/en/about/teak-story`

Ảnh: [`teak-story-00`](screenshots/gloster/teak-story-00.png), [`teak-story-01`](screenshots/gloster/teak-story-01.png). Evidence: `ev_790b2e53dcc0c022dc21d6939d3f42b4ae10b387302184b1021b6a6fb69ba668`.

1. Breadcrumb trên nền trắng → **hero full-bleed** ảnh người trong rừng teak, H1 "THE TEAK STORY" 102px + 1 câu phụ trái-dưới.
2. **Long-form Q&A một cột ~8/12**: câu hỏi là dòng **Gotham đậm hơn** (không phải heading serif), trả lời là đoạn 16px. Không có ảnh giữa bài, không làm nổi bật số liệu dù nội dung có nhiều con số (22 người chọn gỗ, hơn 30 địa điểm, cây 35–50 năm, 1,1 triệu ha).

#### 11.3.16 Contact `/en/about/contact-us`

Ảnh: [`contact-00`](screenshots/gloster/contact-00.png), [`contact-01`](screenshots/gloster/contact-01.png). Evidence: `ev_b897f9dd7eae33445b70d43057e4da9c34cc1d9f60628a0dd45b93e7017a52fa`.

1. Breadcrumb → H1 "CONTACT" 64px + 3 câu + link "Click here" gạch chân (chuyển khách châu Mỹ sang site US).
2. **Form HubSpot trong iframe**, cột ~825px **lệch vào giữa** (không bám trục trái của trang): nhãn chữ thường, font khác (không phải Gotham), input **chỉ có gạch chân xanh xám**; các trường First/Last name, Email*, Street, Town, Postal code, Country (select), Phone (có gợi ý mã quốc gia), Company, Message, "Which best describes you?" (select), link "Looking for Trade Sales Application? Apply Here", reCAPTCHA, nút "Submit" xám bo góc nhỏ.
3. Không có địa chỉ, bản đồ hay số điện thoại trong thân trang (chỉ ở footer).

#### 11.3.17 Blog index `/en/resources/blog`

Ảnh: [`blog-00`](screenshots/gloster/blog-00.png), [`blog-01`](screenshots/gloster/blog-01.png). Evidence: `ev_ea692fdcb73ff905140c8d6a64496f42347fe4e04539295019dd80524f632f65`. **Không có meta description**.

1. Breadcrumb → H1 "BLOG" **80px** (cỡ riêng, khác 64px của các trang khác).
2. Chip lọc chủ đề (VIEW ALL nền taupe / COLLECTIONS / INSPIRATION / COMPANY / CRAFTSMANSHIP / AWARDS / EVENTS).
3. **Bài nổi bật**: ảnh trái 6 cột, bên phải là **tag viền 1px** ("EVENTS") + tiêu đề Cardillac **44px**.
4. **Lưới 2 cột** `gd-link-card` (ảnh ~613×460px, tiêu đề 20px, tag), 8 bài → nút "LOAD MORE".

#### 11.3.18 Bài blog (đại diện `the-stories-behind-our-2026-collections`)

Ảnh: [`blog-post-00`](screenshots/gloster/blog-post-00.png), [`blog-post-02`](screenshots/gloster/blog-post-02.png). Evidence: `ev_c09af84926818fbd4eb6ef171909bc33cc9513c170493e3b865daf0ac1278ecf`. Cao 7.385px.

1. **Hero ảnh full-bleed không có tiêu đề** (`gw-blog-hero`), chỉ có breadcrumb 4 cấp trắng đè ảnh.
2. `header`: H1 64px + ngày đăng Gotham 14px xám.
3. Thân bài một cột ~8/12: lead 16px, các H2 38px ("WRAP BY HENRIK PEDERSEN"...), link nội bộ gạch chân tới collection/sản phẩm.
4. **Quote block**: lùi vào ~2 cột, **vạch dọc đen 1px bên trái**, chữ **Gotham ~26px weight 300**, tên người nói 14px xám.
5. Ảnh trong cột 8/12 có caption, lặp lại theo từng collection.
6. CTA primary "EXPLORE OUR 2026 COLLECTIONS" → "RELATED POSTS" (3 bài, so le như trang chủ) + "VIEW ALL POSTS".

### 11.4 Ngôn ngữ thiết kế tổng hợp (rút từ ảnh của 18 trang)

| Khía cạnh | Quan sát [RT] |
|---|---|
| **Lưới và container** | Lề trái/phải **80px** ở 1424px, container ~1249px; mọi heading, breadcrumb, đoạn văn đều bám **một trục trái duy nhất (x=80)**. Chữ dài giới hạn ~8/12 cột (~825px), phần bên phải để trống. Ảnh có 3 chế độ: trong container; **tràn viền hai bên** (hero, slider, overlay card chất liệu); **tràn một bên** (ảnh media-text bleed trái, chân dung designer bleed phải). |
| **Nhịp khoảng trắng** | Khoảng cách giữa các section ~110px (ví dụ 800→912, 1366→1478 trong outline), dải màu có padding trong ~96px. Card trong lưới cách nhau ~24px; overlay card thì **gap 0**. Khoảng trắng lớn quanh H1 (~80px phía trên) là một nguồn chính của cảm giác "đắt". |
| **Typography** | 4 cỡ heading serif lặp lại: **102px** (hero), **64px** (H1 trang), **38–40px** (H2, overlay card), **20–26px** (tiêu đề card/carousel). Ngoại lệ: Blog index H1 80px, bài nổi bật 44px. Tất cả Cardillac **300 uppercase**. Body Gotham 16px; nhãn, nav, nút, breadcrumb Gotham 14–16px uppercase tracking rộng. Footer heading là Gotham 22px (sans) nên footer "nhẹ" hơn phần trang. |
| **Palette nền xen kẽ** | Trắng là nền mặc định; **taupe #d5cec6** cho các dải phụ (catalogue, as seen in, designer, collections using, nhóm collection xen kẽ); **olive #8d8b72** chỉ xuất hiện **một lần** (panel featured collection trang chủ); **xanh xám #dce2e6** chỉ ở footer; **xám #eee** chỉ ở panel ảnh PDP. Không có màu nhấn bão hoà. Ảnh tối + gradient là mảng tối duy nhất. |
| **Art direction ảnh** | 3 loại tách bạch: (1) **lifestyle kiến trúc** ánh sáng tự nhiên, bối cảnh Địa Trung Hải/ven biển, bê tông, gỗ, cây ô liu, giờ vàng hoặc đêm xanh; ít người, người thường ở xa; (2) **cutout render nền trắng** đồng nhất góc 3/4 cho mọi sản phẩm; (3) **macro chất liệu** (vân gỗ, sợi dây, nhám nhôm, vân đá). Thêm chân dung designer **đen trắng**. Không ảnh stock văn phòng, không minh hoạ. |
| **Radius / viền** | **Góc vuông** cho ảnh, card, nút, input, chip, tag. Ngoại lệ: swatch tròn (PDP), widget Cookiebot tròn, các công cụ nhúng (Planner, Media Library, HubSpot). Viền 1px cho nút outlined, input, divider accordion, tag blog, mũi tên carousel. |
| **Icon** | Rất ít, nét mảnh 1–1.25px: mũi tên "→", chevron, kính lúp, expand, download, icon mạng xã hội viền tròn. Không có icon minh hoạ tính năng. |
| **Nút** | 4 kiểu thấy được: **line-top** (vạch 1px trên chữ + "→") cho CTA trong nội dung; **outlined** (VIEW ALL, READ MORE, FILTERS); **nền taupe** (ADD TO QUOTE, chip đang chọn, nhãn trên ảnh collection); **nền xám #646363** (footer). Không có nút đen đặc nào trong 18 trang. |
| **Motion thấy được** | Video hero; carousel dots + mũi tên (không thấy autoplay); slider lifestyle có dots đè ảnh; header không ẩn khi cuộn; footer reveal; ảnh progressive (bìa catalogue đổi từ bản placeholder sang bản thật giữa 2 ảnh). Không thấy parallax hay reveal khi cuộn. |
| **Mức nhất quán** | **Rất cao** ở các trang do CMS dựng (block renderer): cùng breadcrumb, thang chữ, nút, dải taupe. **Lệch** ở 4 chỗ dùng công cụ ngoài: Cookiebot, Planner, form HubSpot, Google Map. Cộng thêm lỗi nội dung: H1 "Contact / Hospitality", ảnh Instagram lỗi, breadcrumb trắng khó đọc trên nền trời sáng, nav About không active ở `/about/about`. |
| **Yếu tố tạo cảm giác premium** | (1) Serif mảnh in hoa cỡ rất lớn giữa nhiều khoảng trắng; (2) một trục trái duy nhất, chữ chỉ chiếm 2/3 chiều ngang; (3) palette gần như không màu, màu đến từ vật liệu thật trong ảnh; (4) ảnh lifestyle chất lượng cao, đồng bộ ánh sáng; cutout đồng bộ góc chụp; (5) không giá, badge, sale hay popup marketing; (6) mỗi section một ý, CTA dạng chữ thay vì nút màu; (7) chi tiết tay nghề bằng con số trong văn bản (200m dây, 4,5 giờ, cây 35–50 năm). |

### 11.5 Đính chính so với bản phân tích tĩnh

| Mục | Bản tĩnh nói | Ảnh chụp cho thấy |
|---|---|---|
| 4 #3 Highlighted categories | Card ảnh vuông nền trắng; progress bar 1px thay cho dots | Ảnh lifestyle; ở desktop hiển thị **dots** + 2 mũi tên |
| 5 Explore Products | (ngầm định) filter band hiển thị sẵn | Filter **ẩn sau nút FILTERS**; H1 căn giữa |
| 5 Collections landing | Heading nhóm căn giữa; card "tên + →" | Heading **căn trái**; card là **mosaic ảnh lifestyle** có nhãn taupe; nhóm xen kẽ trắng/taupe |
| 5 Materials index | H1 căn giữa; nút ghost "→" | H1 **căn trái**; 2 cột trên dải taupe; nút **outlined "READ MORE →"** |
| 5 Contract | Kết thúc bằng CTA catalogue → ảnh | CTA là **Tech Spec**, **không có ảnh cuối**; H1 sai chính tả "CONTACT / HOSPITALITY" |
| 5 Store finder | Nút "Use my location" | **Icon định vị trong ô tìm** |
| 2.4 Footer | (không nói font) | Tiêu đề cột là **Gotham sans**; nút footer **xám #646363** |
| 4.1 Nút `secondary` | Nền đen chữ trắng | Trong 18 trang **không thấy** nút đen đặc; nút đặc thấy được chỉ có xám (footer) và taupe |
| Nút tròn góc trái-dưới | (chưa biết) | Là **widget Cookiebot** để mở lại cài đặt cookie, có trên mọi trang |

### 11.6 Hạn chế của phần runtime

1. Chỉ desktop 1424×805; chưa xem mobile/tablet, chưa xem hover/focus.
2. Không tương tác: chưa mở mega menu, accordion PDP, modal vải, search flip, region selector; chưa bấm filter.
3. Ảnh chụp theo từng viewport khi cuộn; trang rất dài (Products ~24.200px, Collections ~23.400px) chỉ được chụp phần đầu (10–12 ảnh).
4. Ảnh Instagram lỗi và bìa catalogue mờ có thể là trạng thái tạm thời do mạng hoặc thời điểm chụp.
