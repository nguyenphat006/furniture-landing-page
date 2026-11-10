import type { PageSeo } from "@/lib/seo";
import type {
  CategorySlug,
  FeatureSlug,
  MaterialSlug,
  ProductTypeSlug,
} from "./taxonomy";

/*
 * Kiểu dữ liệu sản phẩm dùng chung cho UI. Nguồn dữ liệu là CMS (khi đặt CMS_API_URL) hoặc mock
 * (products.mock.ts); src/lib/cms/catalog.ts đổi dữ liệu API sang đúng kiểu này.
 */

/** Kích thước cm: dài, rộng, cao, đường kính (bàn tròn); trường nào thiếu thì bỏ */
export type Dimensions = {
  length?: number;
  width?: number;
  height?: number;
  diameter?: number;
};

export type Assembly = "kd" | "fa";

/** Số pcs mỗi container theo loại container */
export const containerTypes = ["20GP", "40GP", "40HC"] as const;
export type Loading = Partial<Record<(typeof containerTypes)[number], number>>;

export type SetItem = {
  type: ProductTypeSlug;
  qty: number;
  dimensions?: Dimensions;
  materials?: MaterialSlug[];
  features?: FeatureSlug[];
  assembly?: Assembly;
  pcsPerBox?: number;
  carton?: Dimensions;
  loading?: Loading;
  /** Ảnh riêng của món, chưa có (ảnh món con trong ERP chỉ là ảnh cả bộ thu nhỏ) */
  image?: string;
};

export type Product = {
  slug: string;
  name: string;
  type: ProductTypeSlug;
  /** Nhóm chứa loại `type` (CMS trả sẵn; mock tính từ productTypes) */
  category: CategorySlug;
  materials: MaterialSlug[];
  features: FeatureSlug[];
  /** Mã mẫu (product base) của BFC */
  code?: string;
  dimensions?: Dimensions;
  /** Mô tả sản phẩm (tab Mô tả); chưa có thì trang dùng đoạn giới thiệu OEM chung. ERP chỉ có mô tả nội bộ nên để trống */
  description?: string;
  /** Mô tả dạng HTML từ CMS (rich text Wagtail đã lọc thẻ); có thì dùng thay `description` */
  descriptionHtml?: string;
  /** CMS chưa có bản dịch ở ngôn ngữ đang xem, đây là bản gốc: trang đặt noindex */
  isFallback?: boolean;
  /** Quản trị viên ẩn trang khỏi Google (sitemap bỏ qua) */
  noindex?: boolean;
  /** Lần xuất bản gần nhất (ISO 8601), lastmod trong sitemap */
  updated?: string;
  /** SEO riêng nhập trong CMS (chỉ có ở trang chi tiết) */
  seo?: PageSeo;
  /** Kiểu đóng gói theo ERP: kd = tháo rời (knock-down), fa = lắp sẵn (fully assembled) */
  assembly?: Assembly;
  /** Số sản phẩm mỗi thùng carton (ERP PCSPerBox) */
  pcsPerBox?: number;
  /** Kích thước thùng carton cm, không bắt buộc (ERP chưa có) */
  carton?: Dimensions;
  /** Số pcs xếp được mỗi container, không bắt buộc (ERP chưa có) */
  loading?: Loading;
  /**
   * Chỉ có ở sản phẩm thuộc loại bộ (setTypeSlugs): từng món con kèm quy cách riêng (kích thước, chất liệu,
   * đóng gói, carton, loading). Bộ không có kích thước / pcsPerBox chung, xem theo từng món.
   */
  setItems?: SetItem[];
  /**
   * Ảnh, ảnh đầu là ảnh đại diện: URL tuyệt đối từ CMS, đường dẫn trong public (vd /products/<slug>.webp)
   * hoặc tên file public/Assets
   */
  images: string[];
};

/**
 * Thẻ vật liệu (trang Vật liệu, trang chủ, mục chất liệu của trang sản phẩm).
 * Ảnh: URL từ CMS hoặc tên file public/Assets; chưa có ảnh thì là tên file cần chụp (hiện khung kẻ sọc).
 */
export type MaterialSummary = {
  slug: MaterialSlug;
  /** Tên trên trang Vật liệu (vd "Gỗ teak"), khác nhãn ngắn của bộ lọc ở Common.materials */
  name: string;
  lede: string;
  image: string;
  /** Quản trị viên ẩn trang vật liệu khỏi Google (sitemap bỏ qua) */
  noindex?: boolean;
};

/** Nội dung trang /materials/<slug>: các mục là danh sách đoạn văn */
export type MaterialPage = MaterialSummary & {
  seo?: PageSeo;
  properties: string[];
  craft: string[];
  care: string[];
  /** Ảnh dọc ở mục Đặc tính, khác ảnh đại diện `image` */
  detailImage: string;
  useImage: string;
  craftImage: string;
};

/** Ô nhóm sản phẩm: ảnh bìa là URL CMS hoặc tên file trong public/Assets (ImagePlaceholder) */
export type CategoryEntry = { slug: CategorySlug; cover: string };

/**
 * Phân loại đang dùng, theo thứ tự trong CMS (mock: thứ tự trong taxonomy.ts). Tên hiển thị không
 * nằm ở đây mà ở messages (Common.products...), CMS đè lên khi nạp messages.
 */
export type Taxonomy = {
  categories: CategoryEntry[];
  types: ProductTypeSlug[];
  materials: MaterialSlug[];
  features: FeatureSlug[];
};
