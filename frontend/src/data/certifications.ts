/*
 * Chứng nhận của BFC, dùng chung cho section QC trang Năng lực và dải logo ở footer.
 * - FSC: đã xác nhận (gỗ teak có chứng nhận FSC).
 * - ISO 9001 / ISO 14001: MẪU để dựng giao diện (2026-11-05), chưa xác nhận BFC có hay không.
 *   Footer chỉ hiện mục confirmed nên không lộ mẫu ra toàn site.
 * Logo tải từ Wikimedia làm mẫu (2026-11-05):
 *   fsc-logo.svg  ← en.wikipedia.org/wiki/File:FSC_logo.svg (nhãn hiệu đăng ký của FSC)
 *   iso-logo.svg  ← commons.wikimedia.org/wiki/File:ISO_logo_red.svg
 * Trước khi lên production: dùng file logo BFC được cấp kèm mã license (FSC bắt buộc),
 * và thay "giấy chứng nhận" minh hoạ bằng ảnh scan / PDF thật.
 */

export type Certification = {
  /** Khoá text trong messages (CapabilitiesPage.qc.certs.items) */
  key: string;
  /** Tên viết tắt, dùng khi chưa có logo */
  short: string;
  confirmed: boolean;
  /** true = mục mẫu chỉ để dựng giao diện */
  sample?: boolean;
  /** Đường dẫn logo trong public/ */
  logo?: string;
  /** Số chứng nhận, đơn vị cấp, hiệu lực: null = chờ xác nhận */
  number: string | null;
  issuer: string | null;
  validUntil: string | null;
  /** Đường dẫn PDF trong public/ */
  file: string | null;
};

export const certifications: Certification[] = [
  {
    key: "fsc",
    short: "FSC",
    confirmed: true,
    logo: "/Assets/certs/fsc-logo.svg",
    number: null,
    issuer: null,
    validUntil: null,
    file: null,
  },
  {
    key: "iso9001",
    short: "ISO 9001",
    confirmed: false,
    sample: true,
    logo: "/Assets/certs/iso-logo.svg",
    number: null,
    issuer: null,
    validUntil: null,
    file: null,
  },
  {
    key: "iso14001",
    short: "ISO 14001",
    confirmed: false,
    sample: true,
    logo: "/Assets/certs/iso-logo.svg",
    number: null,
    issuer: null,
    validUntil: null,
    file: null,
  },
];

export const confirmedCertifications = certifications.filter(
  (c) => c.confirmed,
);
