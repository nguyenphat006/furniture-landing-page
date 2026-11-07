"""Thao tác ghi của catalog."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from django.core.files import File
from django.db import transaction
from wagtail.images import get_image_model
from wagtail.images.models import AbstractImage
from wagtail.models import Locale

from apps.core.services import ensure_locales

from .models import (
    CONTAINER_TYPES,
    DIMENSION_FIELDS,
    Category,
    Feature,
    Material,
    MaterialMenuGroup,
    MaterialMenuItem,
    Product,
    ProductImage,
    ProductType,
    SetItem,
)
from .renditions import RENDITION_LARGE, RENDITION_THUMB

if TYPE_CHECKING:
    from apps.accounts.models import User


# Nội dung trang vật liệu trong mock_catalog.json (scripts/export_frontend_mock.mjs)
MATERIAL_TEXT_FIELDS = tuple(
    f"{field}{suffix}"
    for field in ("heading", "lede", "properties", "craft", "care")
    for suffix in ("", "_en")
)
MATERIAL_IMAGE_FIELDS = ("image", "detail_image", "use_image", "craft_image")


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    images: int = 0
    missing_images: list[str] = field(default_factory=list)


def _spec_values(item: dict[str, Any]) -> dict[str, Any]:
    """Đổi quy cách dạng frontend (dimensions, carton, loading, pcsPerBox) sang trường model."""
    dims = item.get("dimensions") or {}
    carton = item.get("carton") or {}
    loading = item.get("loading") or {}
    values: dict[str, Any] = {f: dims.get(f) for f in DIMENSION_FIELDS}
    values |= {f"carton_{f}": carton.get(f) for f in DIMENSION_FIELDS}
    values |= {f"loading_{c.lower()}": loading.get(c) for c in CONTAINER_TYPES}
    values["assembly"] = item.get("assembly") or ""
    values["pcs_per_box"] = item.get("pcsPerBox")
    return values


def get_or_create_image(path: Path, *, title: str) -> tuple[AbstractImage, bool]:
    """Tạo ảnh Wagtail từ file; file đã có (cùng nội dung) thì dùng lại."""
    image_model = get_image_model()
    digest = hashlib.sha1(path.read_bytes(), usedforsecurity=False).hexdigest()
    existing = image_model.objects.filter(file_hash=digest).first()
    if existing is not None:
        return existing, False
    with path.open("rb") as fh:
        image = image_model(title=title, file=File(fh, name=path.name))
        image.save()
    image.file_hash = digest
    image.save(update_fields=["file_hash"])
    return image, True


def warm_renditions(image: AbstractImage) -> None:
    """Tạo sẵn ảnh WebP mà API trả về, để lần gọi API đầu tiên không phải chờ tạo ảnh."""
    image.get_renditions(RENDITION_LARGE, RENDITION_THUMB)


def _resolve_asset(assets_dir: Path, ref: str) -> Path:
    """'/products/a.webp' nằm trong public/, tên file trần nằm trong public/Assets/."""
    return assets_dir / ref.lstrip("/") if ref.startswith("/") else assets_dir / "Assets" / ref


@transaction.atomic
def import_catalog(
    data: dict[str, Any], *, assets_dir: Path, actor: User | None = None
) -> ImportResult:
    """Nhập phân loại + sản phẩm (định dạng mock_catalog.json) rồi xuất bản.

    Chạy lại nhiều lần được: phân loại và sản phẩm khớp theo slug thì cập nhật, ảnh trùng nội dung
    thì dùng lại. Ảnh và món con của sản phẩm được thay toàn bộ theo dữ liệu nhập.
    """
    ensure_locales()
    result = ImportResult()
    locale = Locale.get_default()

    def image_for(ref: str, title: str) -> AbstractImage | None:
        path = _resolve_asset(assets_dir, ref)
        if not path.is_file():
            result.missing_images.append(ref)
            return None
        image, created = get_or_create_image(path, title=title)
        result.images += int(created)
        warm_renditions(image)
        return image

    categories: dict[str, Category] = {}
    for order, c in enumerate(data["categories"]):
        cover = image_for(c["cover"], c["name"]) if c.get("cover") else None
        categories[c["slug"]], _ = Category.objects.update_or_create(
            slug=c["slug"],
            defaults={
                "name": c["name"],
                "name_en": c["name_en"],
                "description": c.get("description", ""),
                "description_en": c.get("description_en", ""),
                "sort_order": order,
                "cover": cover,
            },
        )

    types: dict[str, ProductType] = {}
    for order, t in enumerate(data["types"]):
        types[t["slug"]], _ = ProductType.objects.update_or_create(
            slug=t["slug"],
            defaults={
                "name": t["name"],
                "name_en": t["name_en"],
                "category": categories[t["category"]],
                "is_set": t["is_set"],
                "sort_order": order,
            },
        )

    materials: dict[str, Material] = {}
    for order, m in enumerate(data["materials"]):
        page = {f: m.get(f, "") for f in MATERIAL_TEXT_FIELDS}
        images = {
            f: image_for(m[f], m.get("heading") or m["name"]) if m.get(f) else None
            for f in MATERIAL_IMAGE_FIELDS
        }
        materials[m["slug"]], _ = Material.objects.update_or_create(
            slug=m["slug"],
            defaults={
                "name": m["name"],
                "name_en": m["name_en"],
                "sort_order": order,
                **page,
                **images,
            },
        )
    features = {
        f["slug"]: Feature.objects.update_or_create(
            slug=f["slug"], defaults={"name": f["name"], "name_en": f["name_en"], "sort_order": i}
        )[0]
        for i, f in enumerate(data["features"])
    }

    if "material_menu" in data:
        MaterialMenuGroup.objects.all().delete()
        _create_material_menu(data["material_menu"], materials)

    for order, p in enumerate(data["products"]):
        product = Product.objects.filter(slug=p["slug"], locale=locale).first()
        is_new = product is None
        if product is None:
            product = Product(slug=p["slug"], locale=locale)
        product.name = p["name"]
        product.code = p.get("code", "")
        product.product_type = types[p["type"]]
        product.description = p.get("description", "")
        product.sort_order = order
        for name, value in _spec_values(p).items():
            setattr(product, name, value)
        product.materials = [materials[s] for s in p["materials"]]
        product.features = [features[s] for s in p["features"]]

        gallery = [image_for(ref, p["name"]) for ref in p["images"]]
        # Gán danh sách con theo API của modelcluster (lưu cùng product.save())
        product.images = [ProductImage(image=img) for img in gallery if img is not None]  # type: ignore[misc]

        set_items = []
        for item in p.get("setItems", []):
            set_item = SetItem(
                product_type=types[item["type"]],
                qty=item["qty"],
                image=image_for(item["image"], p["name"]) if item.get("image") else None,
                **_spec_values(item),
            )
            set_item.materials = [materials[s] for s in item.get("materials", [])]
            set_item.features = [features[s] for s in item.get("features", [])]
            set_items.append(set_item)
        product.set_items = set_items  # type: ignore[misc]

        product.full_clean(exclude=["translation_key"])
        product.save()
        product.save_revision(user=actor, log_action=True).publish(user=actor)
        if is_new:
            result.created += 1
        else:
            result.updated += 1

    return result


def _create_material_menu(groups: list[dict[str, Any]], materials: dict[str, Material]) -> None:
    for order, g in enumerate(groups):
        group = MaterialMenuGroup(
            name=g.get("name", ""),
            name_en=g.get("name_en", ""),
            material=materials.get(g["material"]) if g.get("material") else None,
            sort_order=order,
        )
        group.items = [  # type: ignore[misc]  # ParentalKey: gán danh sách con trước khi lưu
            MaterialMenuItem(
                material=materials[i["material"]],
                name=i.get("name", ""),
                name_en=i.get("name_en", ""),
                sort_order=n,
            )
            for n, i in enumerate(g.get("items", []))
        ]
        group.save()


@dataclass
class SyncResult:
    created: dict[str, list[str]] = field(default_factory=dict)
    menu_created: bool = False

    @property
    def total(self) -> int:
        return sum(len(v) for v in self.created.values())


@transaction.atomic
def sync_taxonomy(data: dict[str, Any]) -> SyncResult:
    """Tạo phân loại frontend mới khai báo mà CMS chưa có. Không sửa, không xoá mục đã có.

    Dùng khi deploy (docs/adr/0012): dev thêm slug ở frontend rồi đẩy lên, lệnh này tạo bản ghi
    với tên mặc định; nội dung, thứ tự, ẩn / hiện do quản trị viên chỉnh tiếp trong admin.
    Menu vật liệu chỉ được tạo khi CMS chưa có nhóm nào.
    """
    result = SyncResult()

    def missing(model: Any, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        existing = set(model.objects.values_list("slug", flat=True))
        return [i for i in items if i["slug"] not in existing]

    def next_order(model: Any) -> int:
        last = model.objects.order_by("-sort_order").values_list("sort_order", flat=True).first()
        return (last or 0) + 1

    new = missing(Category, data["categories"])
    for c in new:
        Category.objects.create(
            slug=c["slug"],
            name=c["name"],
            name_en=c["name_en"],
            description=c.get("description", ""),
            description_en=c.get("description_en", ""),
            sort_order=next_order(Category),
        )
    result.created["categories"] = [c["slug"] for c in new]

    categories = {c.slug: c for c in Category.objects.all()}
    new = missing(ProductType, data["types"])
    for t in new:
        ProductType.objects.create(
            slug=t["slug"],
            name=t["name"],
            name_en=t["name_en"],
            category=categories[t["category"]],
            is_set=t["is_set"],
            sort_order=next_order(ProductType),
        )
    result.created["types"] = [t["slug"] for t in new]

    for key, model in (("materials", Material), ("features", Feature)):
        new = missing(model, data[key])
        for m in new:
            model.objects.create(
                slug=m["slug"], name=m["name"], name_en=m["name_en"], sort_order=next_order(model)
            )
        result.created[key] = [m["slug"] for m in new]

    if "material_menu" in data and not MaterialMenuGroup.objects.exists():
        _create_material_menu(data["material_menu"], {m.slug: m for m in Material.objects.all()})
        result.menu_created = True
    return result
