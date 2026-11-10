"""Xử lý chữ dùng chung."""

from __future__ import annotations

import re
import unicodedata


def slugify_text(text: str, max_length: int = 100) -> str:
    """Slug chữ thường không dấu từ tiêu đề, kể cả tiếng Việt ("Ngày hội" -> "ngay-hoi", đ -> d)."""
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if len(slug) > max_length:
        slug = (
            slug[:max_length].rsplit("-", 1)[0] if "-" in slug[:max_length] else slug[:max_length]
        )
    return slug
