import { useLocale, useTranslations } from "next-intl";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { ButtonLink } from "@/components/shared/button-link";
import { navHref } from "@/config/navigation";
import type { MaterialPage, Product } from "@/data/catalog";
import { ProductCarousel } from "@/features/products";
import { reveal } from "@/components/shared/reveal";

/*
 * Nội dung trang chi tiết vật liệu (2026-11-05), bám bố cục trang vật liệu của Gloster:
 *   1. Đặc tính: chữ | ảnh cận dọc 2:3 (detailImage, khác ảnh đại diện ở đầu trang) | ảnh ứng dụng ngang 4:3 (ba cột từ lg)
 *   2. Gia công tại BFC: ảnh xưởng lớn 3:2 bên trái, chữ bên phải
 *   3. Bảo quản (nền stone): tiêu đề lớn bên trái, các đoạn chữ cỡ lớn bên phải
 *   4. Sản phẩm dùng vật liệu (2026-11-07): carousel một hàng chuyển theo trang các sản phẩm có
 *      vật liệu này (ProductCarousel), nút xem tất cả mở /products lọc sẵn vật liệu; ẩn nếu chưa có
 * Đầu trang (PageHeader) và footer dùng component chung ở page.tsx.
 */

const textCol = "text-ink-soft space-y-5 leading-relaxed";

export function MaterialDetail({
  material,
  products,
}: {
  material: MaterialPage;
  /** Sản phẩm dùng vật liệu này (trang lấy từ catalog) */
  products: Product[];
}) {
  const t = useTranslations("MaterialDetail");
  const locale = useLocale();
  const { name } = material;
  const productsTitle = t("products", {
    name: locale === "vi" ? name.toLocaleLowerCase("vi") : name,
  });

  return (
    <>
      {/* 1. Đặc tính */}
      <Section id="properties" className="pt-0 lg:pt-0">
        <Container>
          <div
            {...reveal("fade-up")}
            className="grid gap-8 lg:grid-cols-3 lg:gap-8"
          >
            <div className="lg:pt-10">
              <SectionHeading
                eyebrow={name}
                title={t("properties")}
                className="mb-0 lg:mb-0"
              />
              <div className={`${textCol} mt-6`}>
                {material.properties.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 items-start gap-4 sm:gap-6 lg:col-span-2 lg:gap-8">
              <div className="bg-surface-stone relative aspect-[2/3] overflow-hidden">
                <ImagePlaceholder
                  label={material.detailImage}
                  sizes="(min-width: 1024px) 30vw, 50vw"
                />
              </div>
              <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
                <ImagePlaceholder
                  label={material.useImage}
                  sizes="(min-width: 1024px) 30vw, 50vw"
                />
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* 2. Gia công tại BFC */}
      <Section id="craft" className="pt-0 lg:pt-0">
        <Container>
          <div
            {...reveal("fade-up")}
            className="grid items-center gap-8 lg:grid-cols-3 lg:gap-8"
          >
            <div className="bg-surface-stone relative aspect-[3/2] overflow-hidden lg:col-span-2">
              <ImagePlaceholder
                label={material.craftImage}
                sizes="(min-width: 1024px) 64vw, 100vw"
              />
            </div>
            <div>
              <SectionHeading
                eyebrow={t("craftKicker")}
                title={t("craft")}
                className="mb-0 lg:mb-0"
              />
              <div className={`${textCol} mt-6`}>
                {material.craft.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* 3. Bảo quản */}
      <Section id="care" tone="stone">
        <Container>
          <div
            {...reveal("fade-up")}
            className="grid items-start gap-8 lg:grid-cols-2 lg:gap-8"
          >
            <SectionHeading
              eyebrow={t("careKicker")}
              title={t("care")}
              className="mb-0 lg:mb-0"
            />
            <div className="text-ink space-y-6 text-lg leading-relaxed lg:text-xl">
              {material.care.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* 4. Sản phẩm dùng vật liệu */}
      {products.length > 0 ? (
        <Section id="products">
          <Container>
            <SectionHeading
              eyebrow={t("productsKicker")}
              title={productsTitle}
              action={
                <ButtonLink
                  href={`${navHref.products}?material=${encodeURIComponent(material.slug)}`}
                >
                  {t("productsViewAll")}
                </ButtonLink>
              }
            />
            <ProductCarousel products={products} label={productsTitle} />
          </Container>
        </Section>
      ) : null}
    </>
  );
}
