import type { ReactNode } from "react";
import { Breadcrumb } from "./breadcrumb";
import { Container } from "./section";

/*
 * Đầu trang chung cho các trang con (2026-11-04), thay PageHero ảnh nền.
 * Học ATC / Gloster / Nghĩa Sơn: trang con không dùng hero ảnh, chỉ một khối chữ gọn trên nền trắng:
 * breadcrumb, H1 căn trái theo trục container chung, đoạn dẫn ngay dưới.
 * (2026-11-05) H1 là TÊN TRANG (vd "Năng lực sản xuất"), không phải slogan; desc nằm ngay dưới H1
 * (đã thử desc cột phải, người dùng muốn để dưới). eyebrow vẫn hỗ trợ nhưng mặc định không dùng vì trùng tên trang.
 * Header fixed cao 72px (80px từ xl) nên khối này tự chừa khoảng trên.
 * (2026-11-06) Giảm khoảng trên/dưới breadcrumb: trên 3rem→1.75rem (xl 4rem→2.25rem), dưới mb-10→mb-6 (xl mb-14→mb-8).
 * Breadcrumb tách ra component riêng (./breadcrumb) để trang chi tiết sản phẩm dùng chung.
 * PageHero vẫn giữ trong codebase cho trang cần ảnh lớn (câu chuyện, chương trình).
 */

type PageHeaderProps = {
  /** Tên trang hiện tại hiển thị trong breadcrumb */
  current: string;
  /** Các cấp cha giữa Trang chủ và trang hiện tại (vd Vật liệu trên trang chi tiết vật liệu) */
  parents?: { label: string; href: string }[];
  title: string;
  eyebrow?: string;
  lede?: string;
  /** Nội dung phụ dưới đoạn dẫn: CTA, số liệu... */
  children?: ReactNode;
  /** Ảnh nhỏ cạnh tên trang (vd ảnh cận bề mặt ở trang chi tiết vật liệu, như Gloster) */
  aside?: ReactNode;
};

export function PageHeader({
  current,
  parents = [],
  title,
  eyebrow,
  lede,
  children,
  aside,
}: PageHeaderProps) {
  return (
    <header className="bg-white pt-[calc(72px+1.75rem)] pb-14 xl:pt-[calc(80px+2.25rem)] xl:pb-20">
      <Container>
        <Breadcrumb current={current} parents={parents} />

        {/* Tên trang, mô tả ngay bên dưới; ảnh (nếu có) nằm cạnh bên phải, chữ canh mép trên */}
        <div
          className={
            aside
              ? "flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between sm:gap-12"
              : undefined
          }
        >
          <div className="max-w-[min(100%,62rem)]">
            {eyebrow ? (
              <p className="text-eyebrow text-forest mb-4 font-semibold uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-h1 text-ink font-semibold tracking-[-0.015em] text-balance">
              {title}
            </h1>
            {lede ? (
              <p className="text-lede text-ink-soft mt-6 max-w-[64ch]">
                {lede}
              </p>
            ) : null}
            {children ? <div className="mt-8">{children}</div> : null}
          </div>
          {aside ? (
            <div className="w-full shrink-0 sm:w-80 lg:w-[28rem] xl:w-[38rem]">
              {aside}
            </div>
          ) : null}
        </div>
      </Container>
    </header>
  );
}
