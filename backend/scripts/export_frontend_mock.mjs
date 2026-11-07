// Xuất mock catalog của frontend ra JSON để `manage.py import_mock` nhập vào CMS.
// Chạy (Node >= 22.6, cần bỏ kiểu TypeScript):
//   node --experimental-strip-types backend/scripts/export_frontend_mock.mjs
// Node cũ hơn: frontend/node_modules/.bin/jiti backend/scripts/export_frontend_mock.mjs
// Kết quả: backend/apps/catalog/fixtures/mock_catalog.json (phân loại, nội dung trang vật liệu, sản phẩm).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fe = join(root, "frontend");
const taxonomy = await import(pathToFileURL(join(fe, "src/data/catalog/taxonomy.ts")).href);
const mock = await import(pathToFileURL(join(fe, "src/data/catalog/products.mock.ts")).href);
const covers = await import(pathToFileURL(join(fe, "src/data/catalog/covers.ts")).href);
const materialPages = await import(pathToFileURL(join(fe, "src/features/materials/data.ts")).href);
const messages = (lang) => JSON.parse(readFileSync(join(fe, `messages/${lang}.json`), "utf8"));
const viAll = messages("vi");
const enAll = messages("en");
const vi = viAll.Common;
const en = enAll.Common;

// Nội dung trang /materials/<slug>: đoạn văn nối bằng dòng trống (định dạng ô nhập trong admin)
const paras = (list) => (list ?? []).join("\n\n");
function materialPage(slug) {
  const card = materialPages.getMaterialCard(slug);
  const page = (all) => ({
    heading: all.MaterialsPage.items[slug]?.name ?? "",
    ...all.MaterialDetail.items[slug],
  });
  const v = page(viAll);
  const e = page(enAll);
  return {
    heading: v.heading,
    heading_en: e.heading,
    lede: v.lede ?? "",
    lede_en: e.lede ?? "",
    ...Object.fromEntries(
      ["properties", "craft", "care"].flatMap((k) => [
        [k, paras(v[k])],
        [`${k}_en`, paras(e[k])],
      ]),
    ),
    image: card?.img,
    detail_image: card?.detail,
    use_image: card?.use,
    craft_image: card?.craft,
  };
}

const label = (group, slug) => ({ name: vi[group][slug], name_en: en[group][slug] });
const menuEntry = (item) => ({
  material: item.page,
  ...(item.isMaterial ? { name: "", name_en: "" } : label("materialTypes", item.key)),
});

const out = {
  categories: taxonomy.categorySlugs.map((slug) => ({
    slug,
    ...label("products", slug),
    // Mô tả ngắn dưới tên nhóm (ô bento trang chủ, đầu trang nhóm)
    description: viAll.HomePage.products.items[slug],
    description_en: enAll.HomePage.products.items[slug],
    cover: covers.categoryCovers[slug],
  })),
  types: Object.entries(taxonomy.productTypes).map(([slug, category]) => ({
    slug,
    category,
    is_set: taxonomy.setTypeSlugs.includes(slug),
    ...label("productTypes", slug),
  })),
  materials: taxonomy.materialSlugs.map((slug) => ({
    slug,
    ...label("materials", slug),
    ...materialPage(slug),
  })),
  features: taxonomy.featureSlugs.map((slug) => ({ slug, ...label("features", slug) })),
  // Menu Vật liệu của header (materialNavGroups): mục trùng vật liệu để tên trống (CMS dùng tên
  // vật liệu), mục chỉ là loại (Teak, Inox, nhóm Kim loại) mang tên riêng và trỏ về trang gần nhất
  material_menu: taxonomy.materialNavGroups.map((group) => ({
    ...menuEntry(group),
    items: group.items.map(menuEntry),
  })),
  products: mock.mockProducts,
};

for (const group of ["categories", "types", "materials", "features"]) {
  for (const item of out[group]) {
    if (!item.name || !item.name_en) throw new Error(`Thiếu nhãn ${group}.${item.slug}`);
  }
}

const file = join(root, "backend/apps/catalog/fixtures/mock_catalog.json");
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`Đã ghi ${out.products.length} sản phẩm vào ${file}`);

// Thông tin chung (apps/sitesettings, `manage.py import_site`): từ src/config/site.ts và messages
const { siteConfig } = await import(pathToFileURL(join(fe, "src/config/site.ts")).href);
const site = {
  name: siteConfig.name,
  tagline: "Furniture Company",
  legal_name: siteConfig.legalName,
  address: viAll.Footer.address,
  address_en: enAll.Footer.address,
  phone: siteConfig.phone,
  email: siteConfig.email,
  whatsapp_url: siteConfig.whatsappUrl ?? "",
  zalo_url: siteConfig.zaloUrl ?? "",
  hours: siteConfig.hours?.vi ?? "",
  hours_en: siteConfig.hours?.en ?? "",
  maps_url: siteConfig.mapsUrl,
  maps_embed_url: siteConfig.mapsEmbedUrl,
  footer_blurb: viAll.Footer.blurb,
  footer_blurb_en: enAll.Footer.blurb,
  seo_title: viAll.Metadata.title,
  seo_title_en: enAll.Metadata.title,
  seo_description: viAll.Metadata.description,
  seo_description_en: enAll.Metadata.description,
  logo: "/bfc_logo_color.png",
  // Thứ tự menu header hiện tại (site-header.tsx); tên lấy sẵn từ messages nên để trống
  nav: ["capabilities", "materials", "products", "about"].map((target) => ({ target })),
};
const siteFile = join(root, "backend/apps/sitesettings/fixtures/site.json");
writeFileSync(siteFile, JSON.stringify(site, null, 2) + "\n");
console.log(`Đã ghi thông tin chung vào ${siteFile}`);

// Nội dung trang (apps/pages, `manage.py import_pages`): bố cục trang chủ và chữ trong messages.
// Hai bản vi / en cùng cấu trúc để ghép chuỗi dịch (wagtail-localize).
const content = await import(pathToFileURL(join(fe, "src/features/home/page-content.ts")).href);
const markets = await import(pathToFileURL(join(fe, "src/features/home/export-markets.ts")).href);
const homeBlocks = (all) => {
  const h = all.HomePage;
  const value = {
    hero: {
      slides: content.heroSlides,
      // <br></br> trong messages = ngắt dòng ở màn hình lớn; trong CMS là xuống dòng
      title: h.hero.title.replace(/\s*<br><\/br>\s*/g, "\n"),
      lede: h.hero.lede,
      button_label: "",
    },
    intro: { heading: h.intro.title, quote: h.intro.quote, body: h.intro.body, button_label: "" },
    export: {
      kicker: h.export.kicker,
      title: h.export.title,
      markets: markets.DEFAULT_MARKETS.map((m) => ({
        country: m.code,
        position: m.label ? m.label.join(",") : "",
        side: m.side,
      })),
      stats: h.export.stats,
    },
    factory: {
      kicker: h.factory.eyebrow,
      title: h.factory.title,
      lede: h.factory.lede,
      image: content.factoryImages.image,
      detail_image: content.factoryImages.detail,
      points: content.factoryPoints.map((k) => h.factory.chips[k]),
      button_label: "",
    },
  };
  return content.homeLayout.map((type) => {
    if (type === "cta") return { type: "shared", value: "cta" };
    if (content.codedSections.includes(type)) return { type: "section", value: { section: type } };
    return { type, value: value[type] };
  });
};
const ctaBlock = (all) => ({
  type: "cta",
  value: {
    kicker: all.HomePage.cta.kicker,
    title: all.HomePage.cta.title,
    image: content.ctaImage,
    quote_label: "",
    visit_label: "",
  },
});
const pages = {
  shared: { cta: { name: "CTA cuối trang (báo giá, thăm nhà máy)", vi: ctaBlock(viAll), en: ctaBlock(enAll) } },
  home: {
    title: "Trang chủ",
    title_en: "Home",
    vi: { body: homeBlocks(viAll) },
    en: { body: homeBlocks(enAll) },
  },
};
const pagesFile = join(root, "backend/apps/pages/fixtures/pages.json");
writeFileSync(pagesFile, JSON.stringify(pages, null, 2) + "\n");
console.log(`Đã ghi nội dung trang vào ${pagesFile}`);
