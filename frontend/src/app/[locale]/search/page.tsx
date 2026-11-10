import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Search } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { reveal } from "@/components/shared/reveal";
import { Container, EYEBROW, Section } from "@/components/shared/section";
import { catalogHref } from "@/data/catalog";
import { getTaxonomy } from "@/data/catalog/taxonomy-source";
import { NewsCard } from "@/features/news";
import { ProductCard } from "@/features/products/components/product-card";
import { searchSite } from "@/features/search/search";
import { Link } from "@/i18n/navigation";
import { localePath } from "@/lib/seo";
import { cn } from "@/lib/utils";

/*
 * Trang kết quả tìm kiếm /search?q= (B7, 2026-11-09). noindex (trang kết quả không đưa lên Google),
 * không có trong sitemap. Đầu trang có ô tìm (form GET, chạy cả khi chưa có JS) → số kết quả →
 * nhóm & loại (chip) → sản phẩm (thẻ sản phẩm dùng chung) → vật liệu → tin tức → trang trên website.
 * Không có kết quả: gợi ý các nhóm sản phẩm. Logic tìm ở features/search/search.ts.
 */

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const readQuery = (q: string | string[] | undefined) =>
  (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? "";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Search" });
  return { title: t("metaTitle"), robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = readQuery((await searchParams).q);
  const [t, tc, results] = await Promise.all([
    getTranslations("Search"),
    getTranslations("Common"),
    searchSite(q, locale),
  ]);
  const hasQuery = q.length > 0;
  const categoryChips = [...results.categories, ...results.types];

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          current={t("title")}
          title={hasQuery ? t("resultsTitle", { q }) : t("title")}
          lede={hasQuery ? undefined : t("intro")}
        >
          <form
            role="search"
            action={localePath("/search", locale)}
            className="border-ink mt-8 flex max-w-2xl items-center gap-3 border-b-2 pb-2"
          >
            <Search aria-hidden="true" className="text-ink-mute size-5" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              aria-label={t("label")}
              placeholder={t("placeholder")}
              maxLength={100}
              enterKeyHint="search"
              className="placeholder:text-ink-mute h-12 min-w-0 flex-1 bg-transparent text-lg outline-none"
            />
            <button
              type="submit"
              className="bg-forest hover:bg-ink min-h-11 cursor-pointer rounded-sm px-5 text-[13px] font-medium tracking-[.08em] text-white uppercase transition-colors"
            >
              {t("submit")}
            </button>
          </form>
          {hasQuery ? (
            <p className="text-ink-soft mt-5 text-sm" role="status">
              {results.tooShort
                ? t("tooShort")
                : t("count", { count: results.total })}
            </p>
          ) : null}
        </PageHeader>

        {hasQuery && !results.tooShort && results.total === 0 ? (
          <Section tone="stone">
            <Container>
              <p className="text-ink-soft max-w-[60ch] text-lg">
                {t("empty", { q })}
              </p>
              <AllCategories locale={locale} />
            </Container>
          </Section>
        ) : null}

        {results.total > 0 ? (
          <Section tone="stone">
            <Container className="grid gap-16">
              {categoryChips.length ? (
                <Group title={t("categories")}>
                  <ul className="flex flex-wrap gap-3">
                    {categoryChips.map((c) => (
                      <li key={c.href}>
                        <Chip href={c.href}>
                          {c.name}
                          {"categoryName" in c ? (
                            <span className="text-ink-mute font-normal">
                              {" "}
                              · {c.categoryName}
                            </span>
                          ) : null}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </Group>
              ) : null}

              {results.products.length ? (
                <Group title={t("products")} count={results.products.length}>
                  <ul
                    {...reveal("stagger")}
                    className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
                  >
                    {results.products.map((p) => (
                      <li key={p.slug}>
                        <ProductCard product={p} />
                      </li>
                    ))}
                  </ul>
                </Group>
              ) : null}

              {results.materials.length ? (
                <Group title={t("materials")}>
                  <ul className="grid gap-4 md:grid-cols-2">
                    {results.materials.map((m) => (
                      <li key={m.slug}>
                        <Link
                          href={`/materials/${m.slug}`}
                          className="group/row flex items-center gap-5 rounded-[2px] bg-white p-4 hover:no-underline"
                        >
                          <span className="bg-surface-stone relative size-20 shrink-0 overflow-hidden rounded-[2px]">
                            <ImagePlaceholder label={m.image} sizes="80px" />
                          </span>
                          <span className="min-w-0">
                            <span className="text-ink group-hover/row:text-forest block font-bold uppercase transition-colors">
                              {m.name}
                            </span>
                            <span className="text-ink-soft mt-1 line-clamp-2 block text-sm">
                              {m.lede}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Group>
              ) : null}

              {results.news.length ? (
                <Group title={t("news")}>
                  <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2">
                    {results.news.map((p) => (
                      <li key={p.slug}>
                        <NewsCard post={p} variant="compact" />
                      </li>
                    ))}
                  </ul>
                </Group>
              ) : null}

              {results.pages.length ? (
                <Group title={t("pages")}>
                  <ul className="border-line border-t">
                    {results.pages.map((p) => (
                      <li key={p.href} className="border-line border-b">
                        <Link
                          href={p.href}
                          className="group/row flex items-center gap-6 py-5 hover:no-underline"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="text-ink group-hover/row:text-forest block text-lg font-bold transition-colors">
                              {p.title}
                            </span>
                            <span className="text-ink-soft mt-1 line-clamp-2 block text-sm">
                              {p.description}
                            </span>
                          </span>
                          <ArrowRight
                            aria-hidden="true"
                            className="text-forest size-5 shrink-0 transition-transform group-hover/row:translate-x-1"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Group>
              ) : null}
            </Container>
          </Section>
        ) : null}

        {!hasQuery ? (
          <Section tone="stone">
            <Container>
              <p className={cn(EYEBROW, "text-forest mb-6")}>
                {tc("nav.products")}
              </p>
              <AllCategories locale={locale} />
            </Container>
          </Section>
        ) : null}
      </main>
      <SiteFooter crossKeys={["products", "materials", "contact"]} />
    </>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className={cn(EYEBROW, "text-forest mb-6")}>
        {title}
        {count ? (
          <span className="text-ink-mute tabular-nums">({count})</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border-line text-ink hover:border-forest hover:text-forest inline-flex min-h-11 items-center rounded-[2px] border bg-white px-4 text-sm font-semibold transition-colors hover:no-underline"
    >
      {children}
    </Link>
  );
}

async function AllCategories({ locale }: { locale: string }) {
  const [{ categories }, tc] = await Promise.all([
    getTaxonomy(locale),
    getTranslations("Common"),
  ]);
  return (
    <ul className="mt-6 flex flex-wrap gap-3">
      {categories.map((c) => (
        <li key={c.slug}>
          <Chip href={catalogHref.category(c.slug)}>
            {tc.has(`products.${c.slug}`) ? tc(`products.${c.slug}`) : c.slug}
          </Chip>
        </li>
      ))}
    </ul>
  );
}
