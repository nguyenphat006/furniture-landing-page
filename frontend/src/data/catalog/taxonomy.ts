/*
 * Phân loại sản phẩm của landing page (chốt 2026-11-04).
 * (2026-11-07) Phân loại là dữ liệu: khi nối CMS, danh sách nhóm / loại / chất liệu / tính năng lấy
 * từ CMS (taxonomy-source.ts), thêm trong admin là có trang, menu, bộ lọc, sitemap. Các danh sách
 * dưới đây chỉ là MOCK khi chạy không có CMS. Kiểu slug vì thế là string, không còn union cố định.
 *
 * Quy tắc slug (áp dụng cho mọi bảng, kể cả khi lên DB):
 *  - chữ thường ASCII, nối bằng "-", không dấu, không khoảng trắng: ^[a-z0-9]+(-[a-z0-9]+)*$
 *  - tiếng Anh, giống nhau ở mọi ngôn ngữ; nhãn hiển thị nằm trong messages/{vi,en}.json
 *  - nhóm và loại dùng danh từ số nhiều (là trang danh sách): "dining-chairs"
 *  - duy nhất trong bảng của nó; đã public thì không đổi, muốn đổi phải thêm redirect
 *  - không mang mã nội bộ, mùa, tên khách hàng (mã ERP để ở trường riêng nếu cần)
 *
 * Hai tầng: Nhóm (category, theo không gian dùng) → Loại (type).
 * Mỗi loại thuộc đúng một nhóm. Chất liệu và tính năng là bộ lọc, không phải tầng.
 * ERP (backend/products/models.py, PRODUCT_TYPE_BY_BASE) chỉ dùng để tham khảo danh sách.
 */

/** Tầng 1. Thứ tự mảng = thứ tự hiển thị (ô đầu là ô lớn trên bento trang chủ) */
export const categorySlugs = [
  "sunloungers-daybeds",
  "sofas-sectionals",
  "dining",
  "lounge-chairs",
  "tables",
  "accessories",
] as const;

export type CategorySlug = string;

/** Tầng 2. Khoá là slug loại, giá trị là nhóm chứa nó */
export const productTypes = {
  // sunloungers-daybeds
  sunloungers: "sunloungers-daybeds",
  daybeds: "sunloungers-daybeds",
  // sofas-sectionals
  sofas: "sofas-sectionals",
  loveseats: "sofas-sectionals",
  "sectional-modules": "sofas-sectionals",
  ottomans: "sofas-sectionals",
  "lounge-sets": "sofas-sectionals",
  // dining
  "dining-tables": "dining",
  "dining-chairs": "dining",
  "dining-sets": "dining",
  "bar-tables": "dining",
  "bar-stools": "dining",
  // lounge-chairs
  "lounge-chairs": "lounge-chairs",
  benches: "lounge-chairs",
  // tables
  "coffee-tables": "tables",
  "side-tables": "tables",
  // accessories
  umbrellas: "accessories",
  "fire-pits": "accessories",
  storage: "accessories",
  carts: "accessories",
  shelving: "accessories",
  covers: "accessories",
} as const satisfies Record<string, CategorySlug>;

export type ProductTypeSlug = string;

/** Loại có sản phẩm là một bộ nhiều món (sản phẩm thuộc loại này khai báo setItems) */
export const setTypeSlugs = [
  "dining-sets",
  "lounge-sets",
] as const satisfies readonly ProductTypeSlug[];

/** Bộ lọc chất liệu, nối sang /materials#<slug> */
export const materialSlugs = [
  "wood",
  "aluminum",
  "rope",
  "wicker",
  "steel",
  "fabric",
  "glass",
  "ceramic",
] as const;

export type MaterialSlug = string;

/** Bộ lọc tính năng (ERP để swivel/rocking là loại, ở đây là thuộc tính) */
export const featureSlugs = [
  "swivel",
  "rocking",
  "stackable",
  "modular",
  "adjustable",
] as const;

export type FeatureSlug = string;

/**
 * Nhóm hiển thị trong menu Vật liệu (2026-11-05): nhóm cha in hoa, bên dưới là loại con nếu có.
 * Nhôm và sắt thép gom chung nhóm Kim loại (nhóm này không có trang riêng, dẫn về /materials#aluminum).
 * Loại con lấy theo lựa chọn có thật trong ERP (ProductionOrderItem.WOOD_TYPE_CHOICES,
 * METAL_TYPE_CHOICES). Loại chưa có trang riêng thì dẫn về trang vật liệu gần nhất (page).
 * Nhãn: nhóm/loại trùng slug vật liệu dùng Common.materials, còn lại dùng Common.materialTypes.
 */
export type MaterialNavItem = {
  key: string;
  /** Trang chi tiết /materials/<page>; null = nhóm không có trang riêng */
  page: MaterialSlug | null;
  /** Lấy nhãn ở Common.materials (true) hay Common.materialTypes (false) */
  isMaterial: boolean;
};

const mat = (slug: MaterialSlug): MaterialNavItem => ({
  key: slug,
  page: slug,
  isMaterial: true,
});
const sub = (key: string, page: MaterialSlug | null): MaterialNavItem => ({
  key,
  page,
  isMaterial: false,
});

export const materialNavGroups: (MaterialNavItem & {
  items: MaterialNavItem[];
})[] = [
  {
    ...mat("wood"),
    items: [
      sub("teak", "wood"),
      sub("acacia", "wood"),
      sub("eucalyptus", "wood"),
    ],
  },
  {
    ...sub("metal", null),
    items: [mat("aluminum"), mat("steel"), sub("stainless-steel", "steel")],
  },
  { ...mat("rope"), items: [] },
  { ...mat("wicker"), items: [] },
  { ...mat("fabric"), items: [] },
  { ...mat("glass"), items: [] },
  { ...mat("ceramic"), items: [] },
];
