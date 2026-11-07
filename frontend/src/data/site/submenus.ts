import "server-only";
import { getTranslations } from "next-intl/server";
import { navHref } from "@/config/navigation";
import {
  catalogHref,
  categorySlugs,
  materialNavGroups,
  typesInCategory,
  type MaterialNavItem,
} from "@/data/catalog";
import { cmsGet } from "@/lib/cms/client";
import type { components } from "@/lib/cms/schema";
import type { SubmenuGroup, Submenus } from "./types";

/*
 * Menu con của header (Sản phẩm, Vật liệu), docs/adr/0012 phía backend.
 * CMS: GET /catalog/menu (nhóm, loại có "hiện trong menu"; menu vật liệu sửa trong admin).
 * Mock: taxonomy.ts + messages, đúng như menu trước khi nối CMS.
 * Mọi nhóm, loại, vật liệu CMS trả về đều có trang (2026-11-07), nên menu theo nguyên CMS.
 */

type ApiMenu = components["schemas"]["Menu"];

const materialPage = (slug: string) => `${navHref.materials}/${slug}`;
/** Nhóm không có trang riêng (Kim loại) dẫn về thẻ của mục con đầu tiên trên trang Vật liệu */
const materialAnchor = (slug: string | undefined) =>
  `${navHref.materials}#${slug ?? ""}`;

export async function cmsSubmenus(locale: string): Promise<Submenus | null> {
  const menu = await cmsGet<ApiMenu>("catalog/menu", { locale });
  if (!menu) return null;
  const products: SubmenuGroup[] = menu.products.map((c) => ({
    key: c.slug,
    label: c.name,
    href: catalogHref.category(c.slug),
    items: c.types.map((t) => ({
      key: t.slug,
      label: t.name,
      href: catalogHref.type(c.slug, t.slug),
    })),
  }));
  const materials: SubmenuGroup[] = menu.materials.flatMap((g, i) => {
    const items = g.items.map((m, n) => ({
      key: `${m.material}-${n}`,
      label: m.name,
      href: materialPage(m.material),
    }));
    if (!g.material && items.length === 0) return [];
    return [
      {
        key: `${g.material ?? "group"}-${i}`,
        label: g.name,
        href: g.material
          ? materialPage(g.material)
          : materialAnchor(g.items[0]?.material),
        items,
      },
    ];
  });
  return { products, materials };
}

export async function mockSubmenus(locale: string): Promise<Submenus> {
  const t = await getTranslations({ locale, namespace: "Common" });
  const label = (item: MaterialNavItem) =>
    item.isMaterial
      ? t(`materials.${item.key}` as "materials.wood")
      : t(`materialTypes.${item.key}` as "materialTypes.metal");
  const href = (item: MaterialNavItem & { items?: MaterialNavItem[] }) =>
    item.page
      ? materialPage(item.page)
      : materialAnchor(item.items?.[0]?.page ?? undefined);

  return {
    products: categorySlugs.map((c) => ({
      key: c,
      label: t(`products.${c}`),
      href: catalogHref.category(c),
      items: typesInCategory(c).map((type) => ({
        key: type,
        label: t(`productTypes.${type}`),
        href: catalogHref.type(c, type),
      })),
    })),
    materials: materialNavGroups.map((g) => ({
      key: g.key,
      label: label(g),
      href: href(g),
      items: g.items.map((i) => ({
        key: i.key,
        label: label(i),
        href: href(i),
      })),
    })),
  };
}
