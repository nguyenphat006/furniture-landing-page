"""Tin tức: nhập bài mẫu (bản dịch qua wagtail-localize), API danh sách / chi tiết, bài chưa dịch,
section trên Trang chủ, xem trước, admin, webhook revalidate."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, RequestFactory, override_settings
from django.urls import reverse
from PIL import Image as PILImage
from rest_framework.test import APIClient
from wagtail.models import Locale

from apps.accounts.tests.factories import create_user
from apps.core.revalidate import sign
from apps.news.blocks import parse_video_url
from apps.news.models import NewsPost
from apps.news.services import (
    NewsImportResult,
    body_pairs,
    compact_html,
    import_news,
    stream_blocks,
)
from apps.pages.models import HomePage
from apps.pages.services import import_pages
from apps.pages.tests.test_pages import pages_data

pytestmark = pytest.mark.django_db

Capture = Callable[..., Any]


@pytest.fixture
def assets(tmp_path: Path) -> Path:
    (tmp_path / "Assets").mkdir()
    for name in ("gate.png", "hero-1.png", "hero-2.png", "cta.png"):
        PILImage.new("RGB", (80, 50), "green").save(tmp_path / "Assets" / name, "PNG")
    return tmp_path


def _post(slug: str, kind: str, date: str, cover: str = "") -> dict[str, Any]:
    return {
        "slug": slug,
        "kind": kind,
        "date": date,
        "cover": cover,
        "vi": {"title": f"Tiêu đề {slug}", "excerpt": f"Tóm tắt {slug}"},
        "en": {"title": f"Title {slug}", "excerpt": f"Summary {slug}"},
        "blocks": [
            {
                "type": "paragraph",
                "html": {
                    "vi": f"<p>Đoạn một {slug}</p>\n<h2>Mục {slug}</h2>\n"
                    f"<ul>\n<li>Ý {slug}</li></ul>",
                    "en": f"<p>First {slug}</p><h2>Part {slug}</h2>\n"
                    f"<ul><li>Point {slug}</li></ul>",
                },
            }
        ],
    }


def _l(vi: str, en: str) -> dict[str, str]:
    return {"vi": vi, "en": en}


# Đủ các kiểu khối có trong bài mẫu (video / tệp không có trong bài mẫu, test riêng bên dưới)
DEMO_BLOCKS: list[dict[str, Any]] = [
    {"type": "image", "image": "/Assets/hero-1.png", "size": "wide", "caption": _l("Ảnh", "Photo")},
    {"type": "image", "image": "/Assets/missing.png", "size": "text"},
    {
        "type": "gallery",
        "layout": "slider",
        "images": [
            {"image": "/Assets/hero-1.png", "caption": _l("Một", "One")},
            {"image": "/Assets/hero-2.png"},
        ],
        "caption": _l("Bộ ảnh", "Photo set"),
    },
    {"type": "gallery", "layout": "grid-2", "images": [{"image": "/Assets/hero-1.png"}]},
    {
        "type": "image_text",
        "image": "/Assets/cta.png",
        "imagePosition": "right",
        "heading": _l("Tiêu đề phụ", "Subheading"),
        "html": _l("<p>Chữ <strong>đậm</strong></p>", "<p>Text <strong>bold</strong></p>"),
    },
    {
        "type": "quote",
        "quote": _l("Câu trích", "A quote"),
        "author": "BFC",
        "role": _l("Kinh doanh", "Sales"),
    },
    {
        "type": "table",
        "columns": {"vi": ["Cột A", "Cột B"], "en": ["Col A", "Col B"]},
        "rows": {"vi": [["Một", "Hai <3"]], "en": [["One", "Two <3"]]},
        "caption": _l("Chú thích bảng", "Table caption"),
    },
    {"type": "button", "label": _l("Liên hệ", "Contact"), "url": "/contact"},
]


def _with_demo(post: dict[str, Any]) -> dict[str, Any]:
    return {**post, "blocks": post["blocks"] + DEMO_BLOCKS}


def news_data() -> dict[str, Any]:
    return {
        "posts": [
            _with_demo(_post("tet", "notice", "2026-11-05", "/Assets/gate.png")),
            _post("visit", "news", "2026-10-28", "/Assets/missing.png"),
            _post("drill", "news", "2026-10-20"),
        ]
    }


@pytest.fixture
def imported(assets: Path) -> NewsImportResult:
    import_pages(pages_data(), assets_dir=assets)
    result = import_news(news_data(), assets_dir=assets)
    assert result.created == ["tet", "visit", "drill"]
    assert result.missing_images == ["/Assets/missing.png"]
    assert result.home_section is True
    return result


def _get(client: APIClient, url: str, status: int = 200, **params: Any) -> Any:
    res = client.get(url, params)
    assert res.status_code == status, res.content
    return res.json()


def test_helpers() -> None:
    assert compact_html("<p>a</p>\n  <ul>\n<li>b</li></ul>\n") == "<p>a</p><ul><li>b</li></ul>"
    assert body_pairs("<p>Một &amp; hai</p><li>Ba</li>", "<p>One &amp; two</p><li>Three</li>") == {
        "Một & hai": "One & two",
        "Ba": "Three",
    }


@pytest.mark.usefixtures("imported")
def test_list_api_newest_first_both_languages(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/news")
    assert vi["count"] == 3
    assert [p["slug"] for p in vi["results"]] == ["tet", "visit", "drill"]
    first = vi["results"][0]
    assert first["title"] == "Tiêu đề tet"
    assert first["kind"] == "notice"
    assert first["date"] == "2026-11-05"
    assert first["is_fallback"] is False
    assert first["slugs"] == {"vi": "tet", "en": "title-tet"}
    assert first["cover"]["url"].endswith(".webp")
    assert first["cover"]["alt"] == "Tiêu đề tet"
    assert vi["results"][1]["cover"] is None

    en = _get(api_client, "/api/v1/news", locale="en")
    assert [p["title"] for p in en["results"]] == ["Title tet", "Title visit", "Title drill"]
    assert all(p["is_fallback"] is False for p in en["results"])


@pytest.mark.usefixtures("imported")
def test_list_api_filter_and_paging(api_client: APIClient) -> None:
    news = _get(api_client, "/api/v1/news", kind="news")
    assert [p["slug"] for p in news["results"]] == ["visit", "drill"]
    page = _get(api_client, "/api/v1/news", page_size=2, page=2)
    assert page["total_pages"] == 2
    assert [p["slug"] for p in page["results"]] == ["drill"]
    _get(api_client, "/api/v1/news", 400, kind="event")


@pytest.mark.usefixtures("imported")
def test_detail_api(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/news/tet")
    para = vi["body"][0]
    assert para["type"] == "paragraph"
    assert para["value"]["html"] == "<p>Đoạn một tet</p><h2>Mục tet</h2><ul><li>Ý tet</li></ul>"
    assert vi["seo"] == {"title": "", "description": "", "noindex": False}
    assert vi["slugs"] == {"vi": "tet", "en": "title-tet"}
    # Bản tiếng Anh có slug riêng tạo từ tiêu đề đã dịch
    en = _get(api_client, "/api/v1/news/title-tet", locale="en")
    assert en["slug"] == "title-tet"
    assert en["title"] == "Title tet"
    # Slug của ngôn ngữ khác (bấm đổi ngôn ngữ trên trang bài): trả bản đúng ngôn ngữ, slug đúng
    assert _get(api_client, "/api/v1/news/tet", locale="en")["slug"] == "title-tet"
    assert _get(api_client, "/api/v1/news/title-tet")["slug"] == "tet"
    assert en["body"][0]["value"]["html"] == (
        "<p>First tet</p><h2>Part tet</h2><ul><li>Point tet</li></ul>"
    )
    assert en["date"] == "2026-11-05"
    _get(api_client, "/api/v1/news/none", 404)


@pytest.mark.usefixtures("imported")
def test_untranslated_and_unpublished(api_client: APIClient) -> None:
    en = Locale.objects.get(language_code="en")
    NewsPost.objects.get(slug="title-visit", locale=en).unpublish()
    drill = NewsPost.objects.get(slug="drill")
    for post in NewsPost.objects.filter(translation_key=drill.translation_key):
        post.unpublish()

    data = _get(api_client, "/api/v1/news", locale="en")
    # Bản dịch đã gỡ: trả bản gốc; gỡ cả hai bản: biến mất (giống sản phẩm)
    assert [(p["slug"], p["is_fallback"]) for p in data["results"]] == [
        ("title-tet", False),
        ("visit", True),
    ]
    assert _get(api_client, "/api/v1/news/visit", locale="en")["title"] == "Tiêu đề visit"
    _get(api_client, "/api/v1/news/drill", 404)


@pytest.mark.usefixtures("imported")
def test_home_section_added_once(api_client: APIClient, assets: Path) -> None:
    for locale in ("vi", "en"):
        body = _get(api_client, "/api/v1/pages/home", locale=locale)["body"]
        types = [b["type"] for b in body]
        sections = [b["value"]["section"] for b in body if b["type"] == "section"]
        assert sections == ["products", "news"]
        # Ngay trước CTA cuối trang
        assert types[-1] == "cta"
        assert body[-2]["type"] == "section"
        assert body[-2]["value"]["section"] == "news"

    again = import_news(news_data(), assets_dir=assets)
    assert again.skipped == ["tet", "visit", "drill"]
    assert again.home_section is False
    home = HomePage.objects.get(locale=Locale.get_default())
    assert sum(1 for b in home.body if b.block_type == "section") == 2


def test_import_without_home_page(assets: Path) -> None:
    result = import_news(news_data(), assets_dir=assets)
    assert result.home_section is False
    assert NewsPost.objects.filter(locale=Locale.get_default()).count() == 3


@pytest.mark.usefixtures("imported")
def test_force_overwrites(assets: Path) -> None:
    post = NewsPost.objects.get(slug="tet", locale=Locale.get_default())
    post.title = "Đã sửa"
    post.save_revision().publish()
    result = import_news(news_data(), assets_dir=assets, force=True, home_section=False)
    assert result.updated == ["tet", "visit", "drill"]
    post.refresh_from_db()
    assert post.title == "Tiêu đề tet"


@pytest.mark.usefixtures("imported")
def test_slug_per_locale() -> None:
    vi = Locale.get_default()
    en = Locale.objects.get(language_code="en")
    # Trùng slug trong cùng ngôn ngữ: không hợp lệ
    clash = NewsPost(slug="tet", locale=vi, title="Khác", excerpt="x", body=[], date="2026-01-01")
    with pytest.raises(ValidationError):
        clash.full_clean()
    # Ngôn ngữ khác dùng được slug đó
    NewsPost(
        slug="tet", locale=en, title="Other", excerpt="x", body=[], date="2026-01-01"
    ).full_clean()


def test_slug_from_title_when_blank() -> None:
    vi = Locale.get_default()

    def make(title: str) -> NewsPost:
        post = NewsPost(locale=vi, title=title, excerpt="x", body=[], date="2026-01-01")
        post.full_clean(exclude=["translation_key"])
        post.save()
        return post

    assert make("Ngày hội thể thao: Đoàn kết!").slug == "ngay-hoi-the-thao-doan-ket"
    # Trùng thì thêm số
    assert make("Ngày hội thể thao, đoàn kết").slug == "ngay-hoi-the-thao-doan-ket-2"
    assert make("!!!").slug == "bai-viet"


@pytest.mark.usefixtures("imported")
def test_translation_slug_follows_translated_title(assets: Path) -> None:
    from apps.pages.services import translate

    vi = NewsPost.objects.get(slug="tet", locale=Locale.get_default())
    en_locale = Locale.objects.get(language_code="en")
    en = vi.get_translation(en_locale)
    assert en.slug == "title-tet"
    # Đồng bộ lại (bản gốc đổi slug): bản dịch vẫn giữ slug theo tiêu đề tiếng Anh
    vi.slug = "tet-moi"
    vi.save_revision().publish()
    translate(vi, en_locale, {})
    assert vi.get_translation(en_locale).slug == "title-tet"
    # Người dịch ghi đè slug: giữ nguyên
    en = vi.get_translation(en_locale)
    en.slug = "lunar-new-year"
    en.save()
    assert NewsPost.objects.get(pk=en.pk).slug == "lunar-new-year"


def test_command(assets: Path, tmp_path: Path) -> None:
    file = tmp_path / "news.json"
    file.write_text(json.dumps(news_data()), "utf-8")
    call_command("import_news", file=file, assets=assets, no_home=True)
    assert NewsPost.objects.filter(live=True).count() == 6
    with pytest.raises(Exception, match="Không thấy file"):
        call_command("import_news", file=tmp_path / "none.json", assets=assets)
    with pytest.raises(Exception, match="Không thấy thư mục"):
        call_command("import_news", file=file, assets=tmp_path / "none")


def test_default_fixture_matches_structure() -> None:
    """Bài mẫu thật (fixtures/news.json): hai bản cùng cấu trúc để ghép chuỗi dịch."""
    path = Path(__file__).resolve().parents[1] / "fixtures" / "news.json"
    posts = json.loads(path.read_text("utf-8"))["posts"]
    assert len(posts) == 10
    for p in posts:
        stream, pairs = stream_blocks(p["blocks"], lambda src, title: None, p["vi"]["title"])
        assert stream[0][0] == "paragraph"
        assert len(pairs) > 0


@pytest.mark.usefixtures("imported")
@override_settings(FRONTEND_URL="http://front.test", CMS_SHARED_SECRET="preview-secret")
def test_preview(api_client: APIClient) -> None:
    post = NewsPost.objects.get(slug="title-tet", locale__language_code="en")
    post.title = "Editing"
    res = post.serve_preview(RequestFactory().get("/admin/"), "")
    assert res.status_code == 302
    query = {k: v[0] for k, v in parse_qs(urlparse(res["Location"]).query).items()}
    assert query["path"] == "/en/news/title-tet"
    timestamp = str(int(time.time()))
    data = api_client.get(
        f"/api/v1/pages/preview/{query['token']}",
        HTTP_X_BFC_TIMESTAMP=timestamp,
        HTTP_X_BFC_SIGNATURE=sign("preview-secret", timestamp, b""),
    ).json()
    assert data["kind"] == "news"
    assert data["content"]["title"] == "Editing"
    assert data["content"]["is_fallback"] is False


@pytest.mark.usefixtures("imported")
def test_admin_listing_one_row_per_post(client: Client) -> None:
    client.force_login(create_user(is_superuser=True, is_staff=True))
    base = "wagtailsnippets_news_newspost"
    html = client.get(reverse(f"{base}:list")).content.decode()
    assert html.count("data-bulk-action-checkbox class=") == 3
    assert "Bản tiếng Anh" in html
    assert "Thông báo" in html
    assert client.get(reverse(f"{base}:list"), {"kind": "notice"}).status_code == 200
    assert client.get(reverse(f"{base}:add")).status_code == 200
    post = NewsPost.objects.get(slug="tet", locale=Locale.get_default())
    assert client.get(reverse(f"{base}:edit", args=[post.pk])).status_code == 200


@pytest.mark.usefixtures("imported")
def test_publish_unpublish_delete_trigger_revalidate(
    django_capture_on_commit_callbacks: Capture,
) -> None:
    post = NewsPost.objects.get(slug="tet", locale=Locale.get_default())

    def calls(action: Callable[[], object]) -> int:
        with (
            patch("apps.core.revalidate.send_revalidate") as send,
            django_capture_on_commit_callbacks(execute=True),
        ):
            action()
        return send.call_count

    assert calls(post.save_revision) == 0
    assert calls(lambda: post.save_revision().publish()) >= 1
    assert calls(post.unpublish) >= 1
    assert calls(post.delete) >= 1


@pytest.mark.usefixtures("imported")
def test_blocks_api_both_languages(api_client: APIClient) -> None:
    vi = _get(api_client, "/api/v1/news/tet")["body"]
    # Ảnh thiếu và gallery còn 1 ảnh bị bỏ khi nhập
    assert [b["type"] for b in vi] == [
        "paragraph",
        "image",
        "gallery",
        "image_text",
        "quote",
        "table",
        "button",
    ]
    image, gallery, image_text, quote, table, button = (b["value"] for b in vi[1:])
    assert image["size"] == "wide"
    assert image["caption"] == "Ảnh"
    assert image["image"]["alt"] == "Ảnh"
    assert image["image"]["url"].endswith(".webp")
    assert gallery["layout"] == "slider"
    assert [i["caption"] for i in gallery["images"]] == ["Một", ""]
    # Ảnh không chú thích: alt là tiêu đề bài
    assert gallery["images"][1]["image"]["alt"] == "Tiêu đề tet"
    assert image_text["image_position"] == "right"
    assert image_text["html"] == "<p>Chữ <strong>đậm</strong></p>"
    assert quote == {"quote": "Câu trích", "author": "BFC", "role": "Kinh doanh"}
    assert table == {
        "columns": ["Cột A", "Cột B"],
        "rows": [["Một", "Hai &lt;3"]],
        "caption": "Chú thích bảng",
    }
    assert button == {"label": "Liên hệ", "url": "/contact"}

    en = _get(api_client, "/api/v1/news/title-tet", locale="en")["body"]
    values = [b["value"] for b in en]
    assert values[1]["caption"] == "Photo"
    assert values[2]["caption"] == "Photo set"
    assert values[2]["images"][1]["image"]["alt"] == "Title tet"
    assert values[3]["heading"] == "Subheading"
    assert "bold" in values[3]["html"]
    assert values[4]["role"] == "Sales"
    assert values[5] == {
        "columns": ["Col A", "Col B"],
        "rows": [["One", "Two &lt;3"]],
        "caption": "Table caption",
    }
    assert values[6]["label"] == "Contact"


def test_stream_blocks_rejects_unknown_type() -> None:
    with pytest.raises(ValueError, match="Khối lạ"):
        stream_blocks([{"type": "map"}], lambda src, title: None, "x")


def test_parse_video_url() -> None:
    yt = ("youtube", "dQw4w9WgXcQ")
    assert parse_video_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10") == yt
    assert parse_video_url("https://youtu.be/dQw4w9WgXcQ") == yt
    assert parse_video_url("https://m.youtube.com/shorts/dQw4w9WgXcQ") == yt
    assert parse_video_url("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ") == yt
    assert parse_video_url("https://vimeo.com/76979871") == ("vimeo", "76979871")
    assert parse_video_url("https://player.vimeo.com/video/76979871") == ("vimeo", "76979871")
    assert parse_video_url("https://www.youtube.com/watch?v=short") is None
    assert parse_video_url("https://www.youtube.com/channel/abc") is None
    assert parse_video_url("https://youtu.be/") is None
    assert parse_video_url("https://vimeo.com/channels/staff") is None
    assert parse_video_url("https://example.com/video.mp4") is None


def _document(name: str, size: int) -> Any:
    from django.core.files.base import ContentFile
    from wagtail.documents.models import Document

    doc = Document(title=name)
    doc.file.save(name, ContentFile(b"x" * size), save=False)
    doc.save()
    return doc


def test_video_block_validation() -> None:
    from wagtail.blocks.struct_block import StructBlockValidationError

    from apps.news.blocks import VideoBlock

    block = VideoBlock()

    def errors(**value: Any) -> dict[str, Any]:
        with pytest.raises(StructBlockValidationError) as exc:
            block.clean(block.to_python(value))
        return dict(exc.value.block_errors)

    assert "url" in errors()
    assert "url" in errors(url="https://example.com/a")
    pdf = _document("a.pdf", 10)
    assert "url" in errors(url="https://youtu.be/dQw4w9WgXcQ", file=pdf.pk)
    assert "file" in errors(file=pdf.pk)
    big = _document("big.mp4", 10)
    with patch("apps.news.blocks.VIDEO_MAX_BYTES", 5):
        assert "file" in errors(file=big.pk)
    ok = block.clean(block.to_python({"url": "https://youtu.be/dQw4w9WgXcQ"}))
    assert ok["url"] == "https://youtu.be/dQw4w9WgXcQ"
    assert block.clean(block.to_python({"file": big.pk}))["file"] == big


def test_button_link_validation() -> None:
    from apps.news.blocks import ButtonBlock

    block = ButtonBlock()
    for url in ("/contact", "https://bfc.vn", "mailto:a@b.vn", "tel:+84123"):
        block.clean(block.to_python({"label": "A", "url": url}))
    with pytest.raises(ValidationError):
        block.clean(block.to_python({"label": "A", "url": "javascript:alert(1)"}))


@pytest.mark.usefixtures("imported")
def test_video_and_file_blocks(api_client: APIClient) -> None:
    post = NewsPost.objects.get(slug="drill", locale=Locale.get_default())
    clip = _document("clip.mp4", 100)
    pdf = _document("lich.pdf", 2048)
    post.body = [
        ("video", {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "caption": "Phim"}),
        ("video", {"url": "https://vimeo.com/76979871", "size": "text"}),
        ("video", {"file": clip}),
        ("file", {"document": pdf, "label": "Tải lịch"}),
        ("file", {"document": pdf}),
        ("file", {"document": None}),
    ]
    post.save_revision().publish()
    body = [b["value"] for b in _get(api_client, "/api/v1/news/drill")["body"]]
    youtube, vimeo, upload, file, plain, empty = body
    assert youtube["provider"] == "youtube"
    assert youtube["video_id"] == "dQw4w9WgXcQ"
    assert youtube["src"].startswith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
    assert youtube["caption"] == "Phim"
    assert youtube["poster"] is None
    assert youtube["size"] == "wide"
    assert vimeo["src"].startswith("https://player.vimeo.com/video/76979871")
    assert vimeo["size"] == "text"
    assert upload["provider"] == "file"
    assert upload["src"].endswith(".mp4")
    assert file["label"] == "Tải lịch"
    assert file["file"]["extension"] == "pdf"
    assert file["file"]["size"] == 2048
    assert file["file"]["url"].startswith("http")
    assert plain["label"] == "lich.pdf"
    assert empty == {"file": None, "label": ""}


@pytest.mark.usefixtures("imported")
def test_table_block_translation_keeps_structure() -> None:
    """Sửa bảng ở bản gốc rồi đồng bộ: bản dịch giữ chữ đã dịch cho ô cũ (wagtail-localize)."""
    from apps.pages.services import translate

    vi = NewsPost.objects.get(slug="tet", locale=Locale.get_default())
    en = Locale.objects.get(language_code="en")
    translate(vi, en, {"Một": "One (again)"})
    target = NewsPost.objects.get(slug="title-tet", locale=en)
    table = next(b.value for b in target.body if b.block_type == "table")
    assert table.columns[0]["heading"] == "Col A"
    assert [row["values"] for row in table.row_data] == [["One (again)", "Two <3"]]


def test_line_text_block_normalizes_newlines() -> None:
    """Ô nhiều dòng lưu trong admin gửi "\r\n": luôn về "\n" để khớp chuỗi đã dịch."""
    from apps.core.blocks import LineTextBlock, normalize_newlines

    block = LineTextBlock()
    assert block.clean("Một,\r\nhai\rba") == "Một,\nhai\nba"
    assert block.to_python("Một,\r\nhai") == "Một,\nhai"
    assert normalize_newlines(None) is None


def test_slugify_text() -> None:
    from apps.core.text import slugify_text

    assert slugify_text("Lịch nghỉ Tết Nguyên đán 2027") == "lich-nghi-tet-nguyen-dan-2027"
    assert slugify_text("  BFC & đối tác  ") == "bfc-doi-tac"
    assert slugify_text("a-" * 80, max_length=10) == "a-a-a-a-a"
    assert slugify_text("x" * 20, max_length=10) == "x" * 10


@pytest.mark.usefixtures("imported")
def test_admin_slug_field_autofills_from_title(client: Client) -> None:
    client.force_login(create_user(is_superuser=True, is_staff=True))
    html = client.get(reverse("wagtailsnippets_news_newspost:add")).content.decode()
    assert 'data-slug-from="title"' in html
    assert "core/js/slug-from-title.js" in html
