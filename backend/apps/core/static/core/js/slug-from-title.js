/*
 * Ô slug tự điền từ tiêu đề trong admin (10/11). Ô slug gắn data-slug-from="<tên trường nguồn>":
 * - đang trống (bài mới) thì gõ tiêu đề tới đâu slug điền tới đó;
 * - người dùng tự sửa slug thì thôi tự điền (xoá trống slug thì tự điền lại);
 * - bài đã có slug thì không đổi khi sửa tiêu đề (giữ link cũ).
 * Lưu mà slug trống thì server cũng tự tạo từ tiêu đề (NewsPost.fill_slug).
 * Cách bỏ dấu giống server (apps/core/text.py slugify_text).
 */
(function () {
  function slugify(text) {
    var slug = String(text)
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug.length <= 100) return slug;
    var cut = slug.slice(0, 100);
    return cut.indexOf("-") >= 0 ? cut.slice(0, cut.lastIndexOf("-")) : cut;
  }

  function bind(slugInput) {
    if (slugInput.dataset.slugBound) return;
    slugInput.dataset.slugBound = "1";
    var form = slugInput.form;
    var source = form && form.querySelector('[name="' + slugInput.dataset.slugFrom + '"]');
    if (!source) return;
    var auto = slugInput.value === "";
    source.addEventListener("input", function () {
      if (auto) slugInput.value = slugify(source.value);
    });
    slugInput.addEventListener("input", function () {
      auto = slugInput.value === "";
    });
  }

  function scan() {
    document.querySelectorAll("input[data-slug-from]").forEach(bind);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
