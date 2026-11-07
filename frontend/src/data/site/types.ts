import type { NavKey } from "@/config/navigation";
import type { Taxonomy } from "@/data/catalog/types";

/*
 * Thông tin chung của site (header, footer, trang Liên hệ, SEO mặc định), dùng được ở cả server lẫn
 * client. Nguồn: CMS (Cài đặt → Thông tin chung) hoặc mock (config/site.ts + messages), xem ./index.ts.
 * Chuỗi rỗng / null = chưa có, component ẩn mục đó.
 */

export type NavEntry = {
  /** Trang có sẵn của web; null = link ngoài */
  key: NavKey | null;
  /** Rỗng: dùng tên trang trong messages (Common.nav.<key>) */
  label: string;
  href: string;
};

/** Mục trong menu con (dropdown) của header */
export type SubmenuLink = { key: string; label: string; href: string };
/** Nhóm trong menu con: tên in hoa có link, bên dưới là các mục */
export type SubmenuGroup = SubmenuLink & { items: SubmenuLink[] };
/** Menu con của hai mục có dropdown: Sản phẩm (nhóm → loại), Vật liệu (nhóm → mục) */
export type Submenus = { products: SubmenuGroup[]; materials: SubmenuGroup[] };

export type SocialNetwork =
  "facebook" | "linkedin" | "youtube" | "instagram" | "tiktok" | "pinterest";

/** Loại nút trong cụm nút nổi sát mép phải (CMS: Cài đặt → Thông tin chung → Nút nổi) */
export type FloatingKind =
  | "search"
  | "phone"
  | "whatsapp"
  | "zalo"
  | "email"
  | "messenger"
  | "quote"
  | "link";

export type FloatingAction = {
  kind: FloatingKind;
  /** Rỗng: dùng tên có sẵn theo loại (messages FloatingActions) */
  label: string;
  /** Link đã sẵn (tel:, mailto:, https://, /path); rỗng với search, quote */
  href: string;
};

export type Site = {
  name: string;
  /** Dòng nhỏ dưới tên cạnh logo */
  tagline: string;
  legalName: string;
  taxCode: string;
  address: string;
  phone: string;
  phoneHref: string;
  email: string;
  emailHref: string;
  whatsappUrl: string | null;
  zaloUrl: string | null;
  hours: string | null;
  mapsUrl: string;
  mapsEmbedUrl: string;
  social: { network: SocialNetwork; url: string }[];
  /** Logo trên nền sáng / nền tối: URL CMS hoặc file trong public */
  logo: string;
  logoOnDark: string;
  favicon: string | null;
  ogImage: string | null;
  /** Menu chính của header, theo thứ tự */
  nav: NavEntry[];
  submenus: Submenus;
  /** Thứ tự nhóm, loại, chất liệu và ảnh bìa nhóm (bộ lọc trang Sản phẩm, ô nhóm) */
  taxonomy: Taxonomy;
  footer: { blurb: string; links: { label: string; href: string }[] };
  seo: { title: string; description: string };
  /** Mã Google Analytics 4 (G-...), null = không gắn */
  gaMeasurementId: string | null;
  /** Mã xác minh Search Console / Bing (thẻ meta), rỗng = không gắn */
  verification: { google: string; bing: string };
  /** Cụm nút nổi, theo thứ tự, chỉ nút đang hiện */
  floating: FloatingAction[];
};
