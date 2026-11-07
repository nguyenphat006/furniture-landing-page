"""Dữ liệu mẫu nhỏ cho test catalog: 2 nhóm, 3 loại (1 loại bộ), 3 sản phẩm, ảnh PNG tạo tại chỗ."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from PIL import Image as PILImage

from apps.catalog.services import ImportResult, import_catalog


def make_png(path: Path, color: str, size: tuple[int, int] = (40, 30)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    PILImage.new("RGB", size, color).save(path, "PNG")


@pytest.fixture
def assets_dir(tmp_path: Path) -> Path:
    make_png(tmp_path / "products" / "atlas.png", "red")
    make_png(tmp_path / "products" / "atlas-2.png", "orange")
    make_png(tmp_path / "products" / "dining-set.png", "blue")
    make_png(tmp_path / "products" / "chair.png", "green")
    make_png(tmp_path / "Assets" / "cover-lounge.png", "gray")
    make_png(tmp_path / "Assets" / "material-wood.png", "brown")
    return tmp_path


def sample_data() -> dict[str, Any]:
    return {
        "categories": [
            {
                "slug": "sunloungers-daybeds",
                "name": "Ghế nằm",
                "name_en": "Sunloungers",
                "description": "Khung nhôm, đan tay.",
                "description_en": "Aluminium frames, hand woven.",
                "cover": "cover-lounge.png",
            },
            {"slug": "dining", "name": "Bàn ghế ăn", "name_en": "Dining"},
        ],
        "types": [
            {
                "slug": "sunloungers",
                "category": "sunloungers-daybeds",
                "is_set": False,
                "name": "Ghế tắm nắng",
                "name_en": "Sunloungers",
            },
            {
                "slug": "dining-chairs",
                "category": "dining",
                "is_set": False,
                "name": "Ghế ăn",
                "name_en": "Dining chairs",
            },
            {
                "slug": "dining-sets",
                "category": "dining",
                "is_set": True,
                "name": "Bộ bàn ăn",
                "name_en": "Dining sets",
            },
        ],
        "materials": [
            {
                "slug": "wood",
                "name": "Gỗ",
                "name_en": "Wood",
                "heading": "Gỗ teak",
                "heading_en": "Teak",
                "lede": "Teak FSC.",
                "lede_en": "FSC teak.",
                "properties": "Nhiều dầu.\nÍt cong vênh.\n\nChuyển màu bạc.",
                "properties_en": "Rich in oils.\n\nWeathers to silver.",
                "craft": "Sấy và CNC.",
                "care": "Không sơn.",
                "care_en": "",
                "image": "material-wood.png",
                "detail_image": "material-wood.png",
                "craft_image": "missing-craft.png",
            },
            {"slug": "aluminum", "name": "Nhôm", "name_en": "Aluminium"},
            {"slug": "rope", "name": "Dây đan", "name_en": "Rope"},
        ],
        "features": [
            {"slug": "stackable", "name": "Xếp chồng", "name_en": "Stackable"},
            {"slug": "adjustable", "name": "Chỉnh tựa lưng", "name_en": "Adjustable"},
        ],
        "products": [
            {
                "slug": "atlas-sunlounger",
                "name": "Atlas Sunlounger",
                "code": "2BFC2756",
                "type": "sunloungers",
                "materials": ["wood", "aluminum"],
                "features": ["adjustable"],
                "dimensions": {"length": 221, "width": 77.5, "height": 33},
                "assembly": "fa",
                "pcsPerBox": 1,
                "carton": {"length": 225, "width": 80, "height": 40},
                "loading": {"40HC": 60},
                "images": ["/products/atlas.png", "/products/atlas-2.png"],
            },
            {
                "slug": "stack-chair",
                "name": "Stack Chair",
                "code": "1BFC0001",
                "type": "dining-chairs",
                "materials": ["aluminum", "rope"],
                "features": ["stackable"],
                "images": ["/products/chair.png"],
            },
            {
                "slug": "dining-set-1551",
                "name": "Dining Set 1551",
                "code": "3BFC1551",
                "type": "dining-sets",
                "materials": ["wood", "rope"],
                "features": ["stackable"],
                "images": ["/products/dining-set.png", "/products/missing.png"],
                "setItems": [
                    {
                        "type": "dining-chairs",
                        "qty": 4,
                        "materials": ["rope"],
                        "features": ["stackable"],
                        "dimensions": {"height": 80},
                        "assembly": "kd",
                        "pcsPerBox": 2,
                    },
                    {"type": "dining-chairs", "qty": 1, "materials": ["wood"]},
                ],
            },
        ],
    }


@pytest.fixture
def catalog(db: None, assets_dir: Path) -> ImportResult:
    return import_catalog(sample_data(), assets_dir=assets_dir)
