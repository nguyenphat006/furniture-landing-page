import "server-only";
import { getTranslations } from "next-intl/server";
import { navHref } from "@/config/navigation";
import {
  catalogHref,
  categorySlugs,
  materialNavGroups,
  materialSlugs,
  productTypes,
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
 * Slug frontend chưa khai báo (chưa có trang) bị bỏ qua, nên menu không có link chết.
 */

type ApiMenu = components["schemas"]["Menu"];

const isMaterial = (s: string) =>
  (materialSlugs as readonly string[]).includes(s);
const isCategory = (s: string) =>
  (categorySlugs as readonly string[]).includes(s);

const materialPage = (slug: string) => `${navHref.materials}/${slug}`;
/** Nhóm không có trang riêng (Kim loại) dẫn về thẻ của mục con đầu tiên trên trang Vật liệu */
const materialAnchor = (slug: string | undefined) =>
  `${navHref.materials}#${slug ?? ""}`;

export async function cmsSubmenus(locale: string): Promise<Submenus | null> {
  const menu = await cmsGet<ApiMenu>("catalog/menu", { locale });
  if (!menu) return null;
  const products: SubmenuGroup[] = menu.products
    .filter((c) => isCategory(c.slug))
    .map((c) => ({
      key: c.slug,
      label: c.name,
      href: catalogHref.category(c.slug as never),
      items: c.types
        .filter(
          (t) => (productTypes as Record<string, string>)[t.slug] === c.slug,
        )
        .map((t) => ({
          key: t.slug,
          label: t.name,
          href: catalogHref.type(t.slug as never),
        })),
    }));
  const materials: SubmenuGroup[] = menu.materials.flatMap((g, i) => {
    const items = g.items
      .filter((m) => isMaterial(m.material))
      .map((m, n) => ({
        key: `${m.material}-${n}`,
        label: m.name,
        href: materialPage(m.material),
      }));
    if (g.material && !isMaterial(g.material)) return [];
    if (!g.material && items.length === 0) return [];
    return [
      {
        key: `${g.material ?? "group"}-${i}`,
        label: g.name,
        href: g.material
          ? materialPage(g.material)
          : materialAnchor(
              g.items.find((m) => isMaterial(m.material))?.material,
            ),
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
        href: catalogHref.type(type),
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
