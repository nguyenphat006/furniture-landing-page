export const siteConfig = {
  name: "BINH BFC",
  legalName: "Công ty TNHH Bình B.F.C",
  url: "https://bfcfurniture.com",
  phone: "+84 - 914 642 008",
  phoneHref: "tel:+84914642008",
  email: "office@bfcfurniture.com",
  emailHref: "mailto:office@bfcfurniture.com",
  /**
   * Kênh nhắn tin và giờ làm việc (trang Liên hệ). null = chưa xác nhận, trang sẽ ẩn mục đó.
   * whatsapp/zalo: link đầy đủ, vd "https://wa.me/84914642008", "https://zalo.me/0914642008".
   * hours: { vi, en }, vd { vi: "Thứ 2 đến Thứ 7, 8:00 đến 17:00", en: "Mon to Sat, 8:00 to 17:00" }.
   */
  whatsappUrl: null as string | null,
  zaloUrl: null as string | null,
  hours: null as { vi: string; en: string } | null,
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=C%C3%B4ng%20Ty%20TNHH%20B%C3%ACnh%20BFC%2C%20%C4%90%E1%BB%93ng%20Kh%E1%BB%9Fi%2C%20Thi%E1%BB%87n%20T%C3%A2n%2C%20V%C4%A9nh%20C%E1%BB%ADu%2C%20%C4%90%E1%BB%93ng%20Nai",
  /** Bản đồ nhúng — dạng output=embed nên không cần API key */
  mapsEmbedUrl:
    "https://www.google.com/maps?q=C%C3%B4ng%20Ty%20TNHH%20B%C3%ACnh%20BFC%2C%20%C4%90%E1%BB%93ng%20Kh%E1%BB%9Fi%2C%20Thi%E1%BB%87n%20T%C3%A2n%2C%20V%C4%A9nh%20C%E1%BB%ADu%2C%20%C4%90%E1%BB%93ng%20Nai&z=16&output=embed",
} as const;

export type SiteConfig = typeof siteConfig;
