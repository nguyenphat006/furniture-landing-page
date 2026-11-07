import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { ButtonLink } from "@/components/shared/button-link";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Container,
  Section,
  SectionHeading,
} from "@/components/shared/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { navHref } from "@/config/navigation";
import {
  catalogHref,
  containerTypes,
  type Assembly,
  type Dimensions,
  type Loading,
  type MaterialSummary,
  type Product,
  type SetItem,
} from "@/data/catalog";
import { Link } from "@/i18n/navigation";
import { ProductCarousel } from "./product-carousel";
import { ProductGallery } from "./product-gallery";

/*
 * Trang chi tiết sản phẩm /products/<nhóm>/<slug> (làm lại 2026-11-06), bố cục học Gloster + Nghĩa Sơn
 * (chỉ học cách bố trí, không chép chữ / ảnh / màu):
 *   1. ProductHero: breadcrumb chung → 2 cột: trái bộ ảnh (ảnh lớn + dải ảnh nhỏ), phải cột thông tin
 *      (loại, tên H1, mã mẫu, đoạn OEM, bảng thông số ngắn, nút "Yêu cầu báo giá" + ghi chú). Cột phải dính
 *      (sticky) khi cuộn ở lg.
 *   2. ProductDetail (2026-11-06 chia 2 tab theo yêu cầu):
 *      - Mô tả: HTML từ CMS (descriptionHtml) hoặc chữ thường (description), chưa có thì dùng mô tả nhóm
 *        + đoạn OEM;
 *      - Thông số kỹ thuật: khối mở/đóng kiểu Gloster (details/summary): Thành phần bộ (chỉ bộ: quy cách
 *        từng món), Kích thước (sản phẩm lẻ), Đóng gói và xếp container (KD/FA, pcs/thùng, carton và
 *        pcs/container nếu có), Chất liệu (thẻ dẫn sang /materials/<slug>), Tùy chỉnh theo đơn hàng.
 *      (2026-11-06) Bỏ heading "Thông tin chi tiết" theo yêu cầu: hàng tab nằm ngay dưới phần đầu trang.
 *      Nội dung cả 2 tab đều có trong HTML (TabsContent forceMount), tab ẩn chỉ bị display none.
 *   3. Cùng nhóm (nền stone): lưới 6 cột như trang Sản phẩm + nút "Xem tất cả" về trang nhóm.
 * Carton và loading là trường không bắt buộc: ERP chưa có nên mock để trống. Carton thiếu thì ẩn dòng,
 * loading thiếu thì ghi "Đang cập nhật".
 */

const linkCls =
  "text-ink hover:text-forest decoration-line underline underline-offset-4 transition-colors duration-(--duration-base)";

const dimKeysOf = (d?: Dimensions) =>
  d
    ? (["length", "width", "height", "diameter"] as const).filter((k) => d[k])
    : [];

type T = ReturnType<typeof useTranslations<"ProductsPage.detail">>;

/** "Dài 216 · Rộng 78 · Cao 68 cm", null nếu không có số nào */
function dimText(t: T, d?: Dimensions) {
  const keys = dimKeysOf(d);
  return keys.length
    ? `${keys.map((k) => `${t(`dims.${k}`)} ${d![k]}`).join(" · ")} ${t("unit")}`
    : null;
}

/** "20GP 120 pcs · 40HC 300 pcs", null nếu chưa có */
function loadingText(t: T, l?: Loading) {
  const parts = containerTypes
    .filter((c) => l?.[c])
    .map((c) => `${c} ${t("loadingValue", { n: l![c]! })}`);
  return parts.length ? parts.join(" · ") : null;
}

type Row = { label: string; value: ReactNode };

function packingRows(
  t: T,
  p: {
    assembly?: Assembly;
    pcsPerBox?: number;
    carton?: Dimensions;
    loading?: Loading;
  },
  { loadingFallback }: { loadingFallback: boolean },
): Row[] {
  const rows: Row[] = [];
  if (p.assembly)
    rows.push({
      label: t("assembly"),
      value: t(`assemblyValue.${p.assembly}`),
    });
  if (p.pcsPerBox)
    rows.push({
      label: t("pcsPerBox"),
      value: t("pcsPerBoxValue", { n: p.pcsPerBox }),
    });
  const carton = dimText(t, p.carton);
  if (carton) rows.push({ label: t("carton"), value: carton });
  const loading = loadingText(t, p.loading);
  if (loading || loadingFallback)
    rows.push({ label: t("loading"), value: loading ?? t("none") });
  return rows;
}

function SpecList({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <dl className={className ?? "border-line border-t"}>
      {rows.map((r) => (
        <div
          key={r.label}
          className="border-line grid grid-cols-[8.5rem_minmax(0,1fr)] gap-4 border-b py-3.5 text-[15px]"
        >
          <dt className="text-ink-mute pt-0.5 text-xs font-semibold tracking-[.14em] uppercase">
            {r.label}
          </dt>
          <dd className="text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductHero({ product }: { product: Product }) {
  const t = useTranslations("ProductsPage.detail");
  const tc = useTranslations("Common");
  const category = product.category;
  const dims = dimText(t, product.dimensions);

  const rows: Row[] = [
    {
      label: t("category"),
      value: (
        <Link href={catalogHref.category(category)} className={linkCls}>
          {tc(`products.${category}`)}
        </Link>
      ),
    },
    {
      label: t("type"),
      value: (
        <Link
          href={catalogHref.type(product.category, product.type)}
          className={linkCls}
        >
          {tc(`productTypes.${product.type}`)}
        </Link>
      ),
    },
    {
      label: t("materials"),
      value: product.materials.length
        ? product.materials.map((m) => tc(`materials.${m}`)).join(" · ")
        : t("none"),
    },
    {
      label: t("dimensions"),
      value: dims ?? (product.setItems ? t("dimsBySet") : t("none")),
    },
    ...(product.features.length
      ? [
          {
            label: t("features"),
            value: product.features.map((f) => tc(`features.${f}`)).join(" · "),
          },
        ]
      : []),
    ...(product.setItems
      ? [
          {
            label: t("setItems"),
            value: (
              <ul>
                {product.setItems.map((s) => (
                  <li key={s.type}>
                    {t("setItem", {
                      qty: s.qty,
                      type: tc(`productTypes.${s.type}`),
                    })}
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
  ];

  return (
    <header className="bg-white pt-[calc(72px+1.75rem)] pb-14 xl:pt-[calc(80px+2.25rem)] xl:pb-20">
      <Container>
        <Breadcrumb
          parents={[
            { label: tc("nav.products"), href: navHref.products },
            {
              label: tc(`products.${category}`),
              href: catalogHref.category(category),
            },
          ]}
          current={product.name}
        />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12 xl:gap-20">
          <ProductGallery images={product.images} name={product.name} />

          <div className="lg:sticky lg:top-[calc(80px+1.5rem)] lg:self-start">
            <p className="text-eyebrow text-forest mb-3 font-semibold uppercase">
              {tc(`productTypes.${product.type}`)}
            </p>
            <h1 className="text-ink text-[clamp(1.875rem,3vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.015em] text-balance">
              {product.name}
            </h1>
            {product.code && (
              <p className="text-ink-mute mt-3 text-sm tracking-[.08em]">
                {t("code")}:{" "}
                <span className="text-ink font-semibold">{product.code}</span>
              </p>
            )}
            <p className="text-ink-soft mt-5 leading-relaxed">{t("oem")}</p>

            <SpecList rows={rows} className="border-line mt-8 border-t" />

            <ButtonLink
              className="mt-8"
              href={{
                pathname: navHref.contact,
                query: product.code
                  ? { purpose: "quote", model: product.code }
                  : { purpose: "quote" },
                hash: "contact-form",
              }}
            >
              {t("quote")}
            </ButtonLink>
            <p className="text-ink-mute mt-4 max-w-[44ch] text-sm leading-relaxed">
              {t("quoteNote")}
            </p>
          </div>
        </div>
      </Container>
    </header>
  );
}

function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group/acc border-line border-b">
      <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-medium tracking-[.06em] uppercase marker:hidden [&::-webkit-details-marker]:hidden">
        {title}
        <Plus
          aria-hidden="true"
          strokeWidth={1.75}
          className="ease-out-soft size-5 shrink-0 transition-transform duration-(--duration-base) group-open/acc:rotate-45"
        />
      </summary>
      <div className="pb-8">{children}</div>
    </details>
  );
}

/** Thẻ quy cách một món trong bộ: số lượng + loại, kích thước, chất liệu, tính năng, đóng gói */
function SetItemCard({ item }: { item: SetItem }) {
  const t = useTranslations("ProductsPage.detail");
  const tc = useTranslations("Common");
  const dims = dimText(t, item.dimensions);
  const rows: Row[] = [
    { label: t("dimensions"), value: dims ?? t("none") },
    ...(item.materials?.length
      ? [
          {
            label: t("materials"),
            value: item.materials.map((m) => tc(`materials.${m}`)).join(" · "),
          },
        ]
      : []),
    ...(item.features?.length
      ? [
          {
            label: t("features"),
            value: item.features.map((f) => tc(`features.${f}`)).join(" · "),
          },
        ]
      : []),
    ...packingRows(t, item, { loadingFallback: false }),
  ];

  return (
    <li className="border-line flex flex-col border">
      {item.image && (
        <div className="relative aspect-[3/2] overflow-hidden">
          <ImagePlaceholder
            label={item.image}
            sizes="(min-width: 1280px) 30vw, (min-width: 640px) 50vw, 100vw"
            className="[&_img]:object-contain"
          />
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-3">
        <h3 className="text-ink text-lg font-medium">
          {tc(`productTypes.${item.type}`)}
        </h3>
        <span className="text-forest text-sm font-semibold tabular-nums">
          {t("setPieceQty", { qty: item.qty })}
        </span>
      </div>
      <SpecList rows={rows} className="border-line mx-5 mb-2 border-t" />
    </li>
  );
}

export function ProductDetail({
  product,
  related,
  materials: mats,
}: {
  product: Product;
  /** Mẫu cùng nhóm (trang tự lấy, tối đa 6) */
  related: Product[];
  /** Vật liệu của sản phẩm có trang /materials (trang tự lấy, theo thứ tự trang Vật liệu) */
  materials: MaterialSummary[];
}) {
  const t = useTranslations("ProductsPage.detail");
  const tc = useTranslations("Common");
  const th = useTranslations("HomePage.products.items");
  const category = product.category;
  const d = product.dimensions;
  const dimKeys = dimKeysOf(d);
  const customize = t.raw("customizeItems") as string[];
  const isSet = Boolean(product.setItems?.length);
  const packing = isSet
    ? packingRows(t, { loading: product.loading }, { loadingFallback: true })
    : packingRows(t, product, { loadingFallback: true });
  const description = product.description
    ? product.description.split(/\n{2,}/)
    : [...(th.has(category) ? [th(category)] : []), t("oem")];

  return (
    <>
      <Section id="details" className="pt-0 lg:pt-0">
        <Container>
          <Tabs defaultValue="description">
            <TabsList aria-label={t("details")}>
              <TabsTrigger value="description">
                {t("tabs.description")}
              </TabsTrigger>
              <TabsTrigger value="specifications">
                {t("tabs.specifications")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="pt-8 lg:pt-10">
              {product.descriptionHtml ? (
                // Rich text của CMS: Wagtail chỉ lưu các thẻ đã cho phép (đậm, nghiêng, danh sách, link)
                <div
                  className="text-ink-soft [&_a]:text-forest max-w-3xl space-y-5 text-[17px] leading-relaxed [&_a]:underline [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6"
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                />
              ) : (
                <div className="text-ink-soft max-w-3xl space-y-5 text-[17px] leading-relaxed">
                  {description.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="specifications">
              {isSet && (
                <Accordion title={t("setSection")} defaultOpen>
                  <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {product.setItems!.map((s) => (
                      <SetItemCard key={s.type} item={s} />
                    ))}
                  </ul>
                  <p className="text-ink-mute mt-4 text-sm">{t("dimNote")}</p>
                </Accordion>
              )}

              {dimKeys.length > 0 && (
                <Accordion title={t("dimensions")} defaultOpen>
                  <dl className="border-line flex flex-wrap border-t border-l">
                    {dimKeys.map((k) => (
                      <div
                        key={k}
                        className="border-line min-w-36 border-r border-b px-6 py-5"
                      >
                        <dt className="text-ink-mute text-xs font-semibold tracking-[.14em] uppercase">
                          {t(`dims.${k}`)}
                        </dt>
                        <dd className="text-ink mt-2 text-2xl font-semibold tabular-nums">
                          {d?.[k]}
                          <span className="text-ink-mute ml-1 text-sm font-normal">
                            {t("unit")}
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-ink-mute mt-4 text-sm">{t("dimNote")}</p>
                </Accordion>
              )}

              <Accordion title={t("packing")}>
                <SpecList
                  rows={packing}
                  className="border-line max-w-2xl border-t"
                />
                <p className="text-ink-mute mt-4 max-w-2xl text-sm">
                  {isSet ? `${t("packingBySet")} ` : ""}
                  {t("packingNote")}
                </p>
              </Accordion>

              {mats.length > 0 && (
                <Accordion title={t("materialsSection")}>
                  <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    {mats.map((m) => {
                      return (
                        <li key={m.slug}>
                          <Link
                            href={`${navHref.materials}/${m.slug}`}
                            className="group/mat block hover:no-underline"
                          >
                            <div className="bg-surface-stone relative aspect-[4/3] overflow-hidden">
                              <ImagePlaceholder
                                label={m.image}
                                sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                                className="ease-out-soft transition-transform duration-(--duration-slow) group-hover/mat:scale-[1.04]"
                              />
                            </div>
                            <p className="text-ink group-hover/mat:text-forest mt-4 font-medium tracking-[.06em] uppercase transition-colors">
                              {tc(`materials.${m.slug}`)}
                            </p>
                            <p className="text-ink-soft mt-2 line-clamp-3 text-sm leading-relaxed">
                              {m.lede}
                            </p>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Accordion>
              )}

              <Accordion title={t("customize")}>
                <ul className="text-ink-soft max-w-3xl space-y-3 leading-relaxed">
                  {customize.map((c) => (
                    <li key={c} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-gold mt-2.5 size-1.5 shrink-0 rounded-full"
                      />
                      {c}
                    </li>
                  ))}
                </ul>
              </Accordion>
            </TabsContent>
          </Tabs>
        </Container>
      </Section>

      {related.length > 0 && (
        <Section id="related" tone="stone">
          <Container>
            <SectionHeading
              eyebrow={t("relatedEyebrow")}
              title={t("related")}
              action={
                <ButtonLink href={catalogHref.category(category)}>
                  {t("viewAll")}
                </ButtonLink>
              }
            />
            <ProductCarousel products={related} label={t("related")} />
          </Container>
        </Section>
      )}
    </>
  );
}
