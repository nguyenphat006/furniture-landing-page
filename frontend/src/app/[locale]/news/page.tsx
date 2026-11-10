import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PageHeader } from "@/components/shared/page-header";
import { reveal } from "@/components/shared/reveal";
import { Container, Section } from "@/components/shared/section";
import { navHref } from "@/config/navigation";
import { getNewsPage, newsKinds, type NewsKind } from "@/data/news";
import { NewsCard } from "@/features/news";
import { Link } from "@/i18n/navigation";
import { pageLinks } from "@/lib/seo";
import { cn } from "@/lib/utils";

/*
 * Trang /news "Cuộc sống tại BFC" (2026-11-09): đầu trang chung + chip lọc Tất cả / Tin tức / Thông báo
 * (link ?kind=, chạy cả khi chưa có JS) → lưới thẻ 3 cột, 9 bài mỗi trang (?page=), mới nhất trước.
 * Trang lọc / trang 2 trở đi trỏ canonical về /news để Google chỉ lập chỉ mục một trang danh sách.
 */

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string | string[]; page?: string | string[] }>;
};

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

function readParams(sp: Awaited<Props["searchParams"]>) {
  const k = first(sp.kind);
  const kind = (newsKinds as readonly string[]).includes(k ?? "")
    ? (k as NewsKind)
    : null;
  const page = Number.parseInt(first(sp.page) ?? "1", 10);
  return { kind, page: Number.isFinite(page) && page > 0 ? page : 1 };
}

const hrefFor = (kind: NewsKind | null, page = 1) => {
  const q = new URLSearchParams();
  if (kind) q.set("kind", kind);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${navHref.news}?${s}` : navHref.news;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "News" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(await pageLinks(navHref.news, locale)),
  };
}

export default async function NewsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { kind, page } = readParams(await searchParams);
  const [t, tc, data] = await Promise.all([
    getTranslations("News"),
    getTranslations("Common"),
    getNewsPage(locale, kind, page),
  ]);
  const filters: { kind: NewsKind | null; label: string }[] = [
    { kind: null, label: t("all") },
    ...newsKinds.map((k) => ({ kind: k, label: t(`kinds.${k}`) })),
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageHeader
          current={tc("nav.news")}
          title={t("title")}
          lede={t("lede")}
        >
          <nav aria-label={t("filterLabel")}>
            <ul className="flex flex-wrap gap-3">
              {filters.map((f) => {
                const active = f.kind === kind;
                return (
                  <li key={f.kind ?? "all"}>
                    <Link
                      href={hrefFor(f.kind)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-[2px] border px-5 text-sm font-semibold transition-colors hover:no-underline",
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-line text-ink hover:border-forest hover:text-forest bg-white",
                      )}
                    >
                      {f.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </PageHeader>

        <Section tone="stone">
          <Container>
            <p className="text-ink-soft mb-8 text-sm" role="status">
              {data.total ? t("count", { count: data.total }) : t("empty")}
            </p>
            <ul
              {...reveal("stagger")}
              className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
            >
              {data.items.map((p, i) => (
                <li key={p.slug}>
                  <NewsCard post={p} priority={i < 3} />
                </li>
              ))}
            </ul>

            {data.pageCount > 1 ? (
              <nav
                aria-label={t("pagination")}
                className="mt-16 flex items-center justify-center gap-2"
              >
                <PageLink
                  href={data.page > 1 ? hrefFor(kind, data.page - 1) : null}
                  label={t("prev")}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </PageLink>
                {Array.from({ length: data.pageCount }, (_, i) => i + 1).map(
                  (n) => (
                    <PageLink
                      key={n}
                      href={hrefFor(kind, n)}
                      label={t("pageN", { page: n })}
                      current={n === data.page}
                    >
                      {n}
                    </PageLink>
                  ),
                )}
                <PageLink
                  href={
                    data.page < data.pageCount
                      ? hrefFor(kind, data.page + 1)
                      : null
                  }
                  label={t("next")}
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </PageLink>
              </nav>
            ) : null}
          </Container>
        </Section>
      </main>
      <SiteFooter crossKeys={["about", "capabilities", "contact"]} />
    </>
  );
}

function PageLink({
  href,
  label,
  current,
  children,
}: {
  href: string | null;
  label: string;
  current?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex size-11 items-center justify-center rounded-[2px] border text-sm font-semibold tabular-nums transition-colors hover:no-underline";
  if (!href)
    return (
      <span
        aria-hidden="true"
        className={cn(cls, "border-line text-ink-mute/50 bg-white")}
      >
        {children}
      </span>
    );
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        cls,
        current
          ? "border-ink bg-ink text-white"
          : "border-line text-ink hover:border-forest hover:text-forest bg-white",
      )}
    >
      {children}
    </Link>
  );
}
