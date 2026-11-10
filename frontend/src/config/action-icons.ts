import {
  Armchair,
  BookOpen,
  Building2,
  Calendar,
  CircleHelp,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Headphones,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Package,
  Phone,
  PhoneCall,
  Search,
  Send,
  Smartphone,
  Sofa,
  Star,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  siFacebook,
  siInstagram,
  siLine,
  siMessenger,
  siTelegram,
  siTiktok,
  siViber,
  siWechat,
  siWhatsapp,
  siYoutube,
  siZalo,
  type SimpleIcon,
} from "simple-icons";

/*
 * Bộ icon chọn được trong CMS (2026-11-10), hiện dùng cho nút nổi (Cài đặt → Thông tin chung → Nút
 * nổi → Icon). Icon nét lấy từ lucide, logo thương hiệu từ simple-icons (CC0).
 * Danh sách trùng ACTION_ICONS ở backend (sitesettings/models.py). Thêm icon: thêm ở đây và ở
 * backend, rồi chạy backend/scripts/export_admin_icons.mjs (frontend/node_modules/.bin/jiti) để ô chọn trong admin có hình.
 */

export const LINE_ICONS: Record<string, LucideIcon> = {
  search: Search,
  phone: Phone,
  "phone-call": PhoneCall,
  smartphone: Smartphone,
  mail: Mail,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  "messages-square": MessagesSquare,
  send: Send,
  headphones: Headphones,
  "file-text": FileText,
  "clipboard-list": ClipboardList,
  "book-open": BookOpen,
  download: Download,
  link: Link2,
  "external-link": ExternalLink,
  "map-pin": MapPin,
  calendar: Calendar,
  clock: Clock,
  "circle-help": CircleHelp,
  globe: Globe,
  users: Users,
  building: Building2,
  package: Package,
  sofa: Sofa,
  armchair: Armchair,
  video: Video,
  star: Star,
};

export const BRAND_ICONS: Record<string, SimpleIcon> = {
  whatsapp: siWhatsapp,
  zalo: siZalo,
  messenger: siMessenger,
  facebook: siFacebook,
  instagram: siInstagram,
  youtube: siYoutube,
  tiktok: siTiktok,
  telegram: siTelegram,
  viber: siViber,
  wechat: siWechat,
  line: siLine,
};

export const actionIconNames = [
  ...Object.keys(LINE_ICONS),
  ...Object.keys(BRAND_ICONS),
] as const;

export const isActionIcon = (s: string): boolean =>
  s in LINE_ICONS || s in BRAND_ICONS;
