import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cmsTaxonomyMessages } from "@/data/catalog/taxonomy-source";
import { routing, type Locale } from "./routing";

const loaders = {
  vi: () => import("../../messages/vi.json"),
  en: () => import("../../messages/en.json"),
} satisfies Record<Locale, () => Promise<unknown>>;

/*
 * Dev: đọc thẳng file JSON mỗi request. Turbopack dev trên máy này giữ bản en.json cũ
 * (MISSING_MESSAGE dù khoá đã có, lặp lại cả sau khi restart), nên không dựa vào module cache.
 * Production: import tĩnh như bình thường để JSON được bundle cùng app.
 */
async function loadMessages(locale: Locale) {
  if (process.env.NODE_ENV === "development") {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const file = join(process.cwd(), "messages", `${locale}.json`);
    return JSON.parse(await readFile(file, "utf8"));
  }
  return (await loaders[locale]()).default;
}

type Tree = { [key: string]: unknown };
const isTree = (v: unknown): v is Tree =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Ghép override vào messages (chỉ khoá lá có trong override bị thay) */
function merge(base: Tree, override: Tree): Tree {
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] =
      isTree(value) && isTree(out[key]) ? merge(out[key], value) : value;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // Tên nhóm, loại, chất liệu, tính năng và mô tả nhóm nhập trong CMS đè lên messages
    messages: merge(
      await loadMessages(locale),
      (await cmsTaxonomyMessages(locale)) ?? {},
    ),
  };
});
