// Phân loại sản phẩm và chất liệu sống ở data/catalog (mock, sau thay bằng DB)
import { categorySlugs, catalogHref, materialSlugs } from "@/data/catalog";
export { materialSlugs, type MaterialSlug } from "@/data/catalog";

export const navKeys = [
  "about",
  "capabilities",
  "materials",
  "products",
  "projects",
  "contact",
] as const;

export type NavKey = (typeof navKeys)[number];

export const navHref: Record<NavKey, string> = {
  about: "/about",
  capabilities: "/capabilities",
  materials: "/materials",
  products: "/products",
  projects: "/projects",
  contact: "/contact",
};

/** Trang pháp lý (2026-11-07): link cố định ở footer, nội dung trong CMS */
export const legalHref = {
  privacy: "/privacy",
  terms: "/terms",
} as const;

export type LegalKey = keyof typeof legalHref;

// Menu chính: materials và products có dropdown con
export const mainNav: {
  key: NavKey;
  children?: { slug: string; href: string }[];
}[] = [
  { key: "about" },
  { key: "capabilities" },
  {
    key: "materials",
    children: materialSlugs.map((slug) => ({
      slug,
      href: `${navHref.materials}#${slug}`,
    })),
  },
  {
    key: "products",
    children: categorySlugs.map((slug) => ({
      slug,
      href: catalogHref.category(slug),
    })),
  },
  // { key: "projects" } bỏ khỏi menu (2026-11-06) theo yêu cầu
  { key: "contact" },
];
