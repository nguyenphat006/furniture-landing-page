# Hướng dẫn quản trị nội dung website BFC

Cho người sửa nội dung trong admin `https://<CMS_DOMAIN>/admin/` (local: `http://127.0.0.1:9000/admin/`).
Việc của server (deploy, sao lưu, sự cố) xem [deploy/README.md](../deploy/README.md).

## Nguyên tắc chung

- Sửa trong admin **không cần deploy**: bấm **Xuất bản** là web làm mới trang liên quan trong vài giây.
- **Lưu nháp** chưa lên web. Muốn xem trước khi xuất bản: nút **Xem trước** (mở web thật với bản đang sửa,
  có dải "Bản nháp" để thoát).
- Tiếng Việt là bản gốc. Bản tiếng Anh dịch từ bản gốc; mục chưa dịch thì web tiếng Anh hiện tiếng Việt và
  báo Google không lập chỉ mục trang đó.
- Mọi thay đổi có lịch sử (Lịch sử / Bản sửa) để xem ai sửa gì và quay về bản cũ.
- Trang (mục Trang) hẹn giờ xuất bản / gỡ được ở bảng trạng thái bên phải màn sửa; server chạy lịch mỗi
  5 phút. Sản phẩm và các mục khác xuất bản ngay khi bấm.
- Không viết số liệu chưa có thật. Chỗ chưa có nội dung để trống hoặc để "NULL" cho dễ tìm.

## Menu admin

| Mục | Dùng để |
| --- | --- |
| **Sản phẩm** | Sản phẩm, và các danh mục phân loại: Nhóm, Loại, Chất liệu, Menu vật liệu, Tính năng |
| **Tin tức** | Bài "Cuộc sống tại BFC": tin hoạt động và thông báo, hiện ở trang chủ, `/news` và trang từng bài |
| **Section dùng chung** | Các khối nội dung dùng lại ở nhiều trang (vd khối kêu gọi liên hệ) |
| **Trang** | Cây trang: Trang chủ, Chính sách bảo mật, Điều khoản sử dụng |
| **Liên hệ** | Yêu cầu khách gửi qua form, tệp đính kèm đã quét virus |
| **Rà soát SEO** | Chấm SEO từng trang công khai theo cả hai ngôn ngữ |
| **Cài đặt → Thông tin chung** | Công ty, liên hệ, mạng xã hội, logo, menu chính, footer, SEO mặc định, xác minh Search Console, Google Analytics |
| **Cài đặt → Liên hệ** | Email nhận thông báo khi có yêu cầu mới, email cảm ơn gửi khách, chống spam |
| **Cài đặt → Người dùng** | Thêm / khoá tài khoản quản trị (nhóm Quản trị) |

## Việc thường làm

**Thêm sản phẩm.** Sản phẩm → Sản phẩm → Thêm. Chọn Loại (quyết định Nhóm và đường dẫn), Chất liệu, Tính năng,
ảnh, mô tả, SEO. Xuất bản thì sản phẩm hiện ở trang danh sách, bộ lọc, sitemap. Gỡ xuất bản thì trang sản phẩm
trả về "không tìm thấy" ngay.

**Thêm nhóm / loại / chất liệu / tính năng.** Thêm trong mục tương ứng ở Sản phẩm. Web tự có trang, mục menu,
bộ lọc và mục sitemap cho mục mới; thứ tự trên web theo thứ tự trong admin. Xoá mục đang có sản phẩm dùng thì
chuyển sản phẩm sang mục khác trước.

**Menu vật liệu.** Sản phẩm → Menu vật liệu: chia chất liệu thành các nhóm hiện trong menu con "Vật liệu".

**Trang chủ và trang nội dung.** Trang → chọn trang → sửa từng khối (section), kéo để đổi thứ tự. Khối dùng
chung sửa ở Section dùng chung, sửa một lần đổi mọi trang dùng nó.

**Câu hỏi thường gặp (FAQ).** Section dùng chung → "Câu hỏi thường gặp": sửa nhãn, tiêu đề, dòng ghi chú, chữ
nút và từng câu hỏi / trả lời (thêm, xoá, kéo đổi thứ tự), xuất bản rồi đồng bộ bản dịch tiếng Anh. Trang Năng
lực hiện section chọn ở Cài đặt → Thông tin chung → Section trên trang; trống thì web dùng 4 câu mặc định.
Trang chủ cũng chèn được FAQ này bằng khối "Section dùng chung".

**Thông tin công ty, menu, footer.** Cài đặt → Thông tin chung, từng tab. Đổi xong web đổi ở mọi trang.

**Nút nổi (sát mép phải, dưới menu).** Cài đặt → Thông tin chung → Nút nổi: thêm, bỏ, kéo đổi thứ tự, tắt tạm
từng nút. Nút hiện hay ẩn trên web chỉ theo ô **Hiện**. Loại Gọi điện, WhatsApp, Zalo, Email tự lấy link ở tab
Liên hệ; Yêu cầu báo giá mở form Liên hệ; Messenger và Link riêng dán link (`https://...`, `tel:`, `mailto:`
hoặc đường dẫn trong site `/...`). Nút đang bật Hiện mà chưa có link (vd chưa nhập số WhatsApp) vẫn hiện nhưng
không bấm được. Nút Tìm kiếm mở ô tìm kiếm của website. Nhãn để trống thì dùng tên có sẵn theo loại, có ô nhãn
tiếng Anh riêng. Ô **Icon** bấm để thả danh sách icon có hình (điện thoại, thư, catalogue, WhatsApp,
Zalo, Facebook...) rồi chọn; "Theo loại" dùng icon có sẵn của loại đó.

**Tin tức ("Cuộc sống tại BFC").** Tin tức → Thêm. Nhập tiêu đề, slug (đường dẫn `/news/<slug>`; tự điền
từ tiêu đề khi gõ, để trống lúc lưu cũng tự tạo từ tiêu đề; bản tiếng Anh có slug riêng, tự tạo từ tiêu đề
tiếng Anh khi dịch, muốn đặt khác thì sửa ở màn Dịch; đổi slug bài đã đăng làm hỏng link cũ nên hạn chế), loại (**Tin tức** hoặc **Thông báo**; thông báo có nhãn vàng nổi hơn), ngày đăng (bài xếp mới nhất
trước), ảnh bìa ngang, tóm tắt 1 đến 2 câu (hiện trên thẻ tin và dưới tiêu đề bài) và nội dung. Nội dung xếp
từ các khối (bấm dấu + để thêm, kéo để đổi thứ tự):

| Khối | Dùng khi |
|---|---|
| Đoạn văn | Chữ: tiêu đề phụ, đậm, nghiêng, danh sách, link |
| Ảnh | Một ảnh kèm chú thích; cỡ "Nhỏ, căn giữa" hoặc "Rộng hết cột". Bấm ảnh trên web để xem lớn |
| Gallery | Từ 2 ảnh, mỗi ảnh có chú thích riêng; kiểu lưới 2 cột, lưới 3 cột hoặc slider tự chạy. Bấm ảnh để xem lớn, lướt qua lại |
| Video | Dán link YouTube / Vimeo (khuyên dùng), hoặc chọn tệp MP4 / WebM tối đa 50 MB trong thư viện tệp; ảnh bìa tuỳ chọn. Video chỉ tải khi người xem bấm phát |
| Ảnh + chữ | Ảnh một bên (trái hoặc phải), tiêu đề và chữ bên kia |
| Trích dẫn | Câu nói nổi bật kèm người nói, chức vụ |
| Bảng | Thêm cột (tên cột ở hàng đầu) rồi thêm hàng; ô chữ thường hoặc chữ định dạng; có chú thích dưới bảng |
| Nút liên kết | Nút tới trang trong site (`/contact`) hoặc link ngoài `https://...` |
| Tệp đính kèm | Tệp PDF, Word, Excel... trong thư viện tệp; web hiện tên, loại, dung lượng và nút tải về |

Chữ trong mọi khối được dịch ở màn "Dịch" như phần còn lại; ảnh, video, tệp dùng chung cho hai ngôn ngữ.
Xem trước rồi xuất bản; dịch tiếng Anh như sản phẩm (bài chưa dịch thì trang
tiếng Anh hiện bản tiếng Việt và không đưa lên Google). Trang chủ hiện 4 bài mới nhất ở section "Cuộc sống tại
BFC" (khối "Section lấy từ Sản phẩm / Tin tức" → Cuộc sống tại BFC, kéo để đổi vị trí hoặc xoá khối để ẩn). Muốn
có mục "Tin tức" trên menu chính: Cài đặt → Thông tin chung → Menu chính → thêm mục trỏ tới Tin tức.

**Tìm kiếm trên website.** Không cần quản trị: sản phẩm, nhóm, loại, vật liệu vừa xuất bản là tìm được ngay
(theo tên, mã mẫu, nhóm, loại, chất liệu; gõ không dấu cũng ra), bài tin tức tìm theo tiêu đề và tóm tắt. Trang kết quả `/search` không đưa lên Google.

**Dịch sang tiếng Anh.** Ở màn sửa bản tiếng Việt, dùng chức năng dịch (chọn ngôn ngữ English) để mở màn dịch
từng trường, nhập bản dịch rồi xuất bản bản tiếng Anh. Sửa bản tiếng Việt sau đó thì đồng bộ lại bản dịch.
Khi server bật dịch máy (biến `GOOGLE_TRANSLATE_API_KEY`, ADR 0003), màn dịch có nút **Dịch bằng Google
Translate**: điền mọi chuỗi chưa dịch từ bản tiếng Việt, chuỗi đã dịch tay giữ nguyên. Đọc lại, sửa thuật ngữ
(tên chất liệu, mã mẫu...) rồi mới xuất bản. Quy trình hay dùng: sửa bản tiếng Việt → đồng bộ bản dịch → bấm
dịch máy cho phần mới → duyệt → xuất bản.

**Nút đổi ngôn ngữ.** Cài đặt → Thông tin chung → Ngôn ngữ: mỗi dòng một ngôn ngữ, chọn cờ (vd tiếng Anh
chọn Anh hoặc Mỹ), sửa tên hiển thị (trống thì dùng tên gốc: English, Deutsch...), tắt Hiện để bỏ khỏi danh
sách, kéo để đổi thứ tự. Tiếng Việt luôn hiện. Header hiện cờ + mã ngôn ngữ, bấm mở danh sách; menu điện
thoại liệt kê thẳng. Ô Ngôn ngữ chỉ có những ngôn ngữ web đã cài; muốn thêm ngôn ngữ mới (vd tiếng Đức) thì
báo bộ phận kỹ thuật: cần thêm chữ giao diện của ngôn ngữ đó vào web, khai báo `CMS_LANGUAGES` trên server
rồi mới bật được ở đây và dịch nội dung như tiếng Anh.

**Xử lý yêu cầu liên hệ.** Liên hệ → mở yêu cầu → đổi trạng thái khi đã xử lý. Tệp đính kèm chỉ tải được khi
đã quét sạch; tệp "chờ quét" sẽ được quét lại tự động.

**Google Analytics.** Cài đặt → Thông tin chung → SEO → Google Analytics: dán Measurement ID dạng
`G-XXXXXXXXXX` (trong Google Analytics: Quản trị → Luồng dữ liệu → chọn luồng web). Lưu là web gắn mã ở mọi
trang, cả tiếng Việt và tiếng Anh; xoá trống là gỡ. Lượt xem trước bản nháp không được tính. Số liệu xem
trên analytics.google.com (Báo cáo → Thời gian thực để thử ngay). Khi bật, đoạn Cookie trong Chính sách bảo
mật phải nhắc tới Google Analytics.

**Xác minh Google Search Console / Bing.** Search Console → Thêm tài sản → Tiền tố URL → chọn cách Thẻ HTML,
chép thẻ meta, dán vào Cài đặt → Thông tin chung → SEO → Xác minh công cụ tìm kiếm (dán cả thẻ hoặc chỉ phần
content đều được), lưu rồi bấm Xác minh bên Google. Giữ nguyên mã sau khi xác minh. Xong thì gửi sitemap
`https://<domain>/sitemap.xml` trong Search Console.

**Thông tin doanh nghiệp cho Google.** Trang chủ tự kèm dữ liệu có cấu trúc (schema.org Organization) lấy từ
Thông tin chung: tên, tên pháp lý, địa chỉ, điện thoại, email, mã số thuế, logo, mạng xã hội. Điền đủ các ô
này là đủ; kiểm tra bằng https://search.google.com/test/rich-results.

**Email cảm ơn khách.** Khách gửi form xong nhận ngay email cảm ơn bằng tiếng Anh (Cài đặt → Liên hệ → Email
cảm ơn người gửi: bật / tắt, sửa tiêu đề và nội dung). Chỗ chèn: `{name}` tên khách, `{company}` tên công ty,
`{purpose}` mục đích, `{model_codes}` mã mẫu, `{website}` địa chỉ web. Email không nhắc lại nội dung khách viết;
khách bấm Trả lời thì thư về email công ty ở Thông tin chung. Yêu cầu bị đánh dấu Rác không nhận email cảm ơn.

**Kiểm tra SEO trước khi công bố.** Rà soát SEO → lọc **Lỗi** → bấm Sửa ở từng dòng. Mục tiêu: không còn Lỗi,
xem lại các Cảnh báo (tiêu đề quá dài, mô tả quá ngắn hoặc quá dài, thiếu ảnh chia sẻ). Ảnh chia sẻ mặc định
đặt ở Cài đặt → Thông tin chung → SEO; chưa đặt thì web dùng ảnh chung có sẵn (ảnh nhà máy + logo).

## Tài khoản

- Mỗi người một tài khoản, không dùng chung. Người nghỉ việc thì khoá tài khoản ngay.
- Sai mật khẩu 5 lần thì tài khoản bị khoá 1 giờ, màn hình báo "Tạm khoá đăng nhập" (người quản lý server mở
  được sớm hơn).
- Quản trị viên xuất bản trực tiếp, không có bước gửi duyệt.
- Quên mật khẩu: dùng "Quên mật khẩu" ở trang đăng nhập (cần server đã cấu hình email).
