"""Kích thước ảnh (rendition Wagtail) mà API catalog trả về, dạng WebP.

`url` cho ảnh lớn / lightbox, `thumb` cho thẻ danh sách. Đổi ở đây thì chạy lại import_mock (hoặc
mở lại API) để tạo ảnh mới.
"""

RENDITION_LARGE = "max-1600x1600|format-webp|webpquality-82"
RENDITION_THUMB = "max-800x800|format-webp|webpquality-80"
