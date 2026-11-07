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

**Thông tin công ty, menu, footer.** Cài đặt → Thông tin chung, từng tab. Đổi xong web đổi ở mọi trang.

**Dịch sang tiếng Anh.** Ở màn sửa bản tiếng Việt, dùng chức năng dịch (chọn ngôn ngữ English) để mở màn dịch
từng trường, nhập bản dịch rồi xuất bản bản tiếng Anh. Sửa bản tiếng Việt sau đó thì đồng bộ lại bản dịch.
Khi server bật dịch máy (Google Cloud Translation, ADR 0003) có nút dịch máy điền sẵn để duyệt lại.

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
đặt ở Cài đặt → Thông tin chung → SEO.

## Tài khoản

- Mỗi người một tài khoản, không dùng chung. Người nghỉ việc thì khoá tài khoản ngay.
- Sai mật khẩu 5 lần thì tài khoản bị khoá 1 giờ (người quản lý server mở được sớm hơn).
- Quên mật khẩu: dùng "Quên mật khẩu" ở trang đăng nhập (cần server đã cấu hình email).
