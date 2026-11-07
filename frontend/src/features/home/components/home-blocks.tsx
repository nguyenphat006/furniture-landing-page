import type { CategoryEntry, MaterialSummary } from "@/data/catalog";
import type { PageBlock } from "@/data/pages/types";
import type { CodedSection } from "../page-content";
import { CtaSection } from "./cta-section";
import { ExportSection } from "./export-section";
import { FactorySection } from "./factory-section";
import { HeroSection } from "./hero-section";
import { IntroSection } from "./intro-section";
import { MaterialsShowcaseSection } from "./materials-showcase-section";
import { ProductsSection } from "./products-section";
import type { SectionAnchor } from "./section-dots";

/*
 * Vẽ thân trang chủ theo danh sách block (thứ tự admin sắp trong CMS, hoặc mock).
 * Mỗi block là đúng một section có sẵn: admin đổi chữ, ảnh, thứ tự, bỏ section; bố cục giữ nguyên.
 */

type CatalogData = {
  categories: CategoryEntry[];
  materials: MaterialSummary[];
};

function Coded({
  section,
  data,
}: {
  section: CodedSection;
  data: CatalogData;
}) {
  switch (section) {
    case "products":
      return <ProductsSection categories={data.categories} />;
    case "materials":
      return <MaterialsShowcaseSection materials={data.materials} />;
  }
}

export function HomeBlocks({
  blocks,
  ...data
}: { blocks: PageBlock[] } & CatalogData) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "hero":
        return (
          <HeroSection
            key={block.id}
            content={block.value}
            nextId={sectionId(blocks[i + 1])}
          />
        );
      case "intro":
        return <IntroSection key={block.id} content={block.value} />;
      case "export":
        return <ExportSection key={block.id} content={block.value} />;
      case "factory":
        return <FactorySection key={block.id} content={block.value} />;
      case "cta":
        return <CtaSection key={block.id} content={block.value} />;
      case "section":
        return (
          <Coded key={block.id} section={block.value.section} data={data} />
        );
    }
  });
}

/** id của section mà block vẽ ra (dùng cho nút cuộn xuống của hero) */
function sectionId(block: PageBlock | undefined): string | undefined {
  if (!block || block.type === "hero") return undefined;
  return block.type === "section" ? block.value.section : block.type;
}

/** Chấm điều hướng bên phải theo thứ tự section trên trang; footer (liên hệ) luôn ở cuối */
export function homeAnchors(blocks: PageBlock[]): SectionAnchor[] {
  const anchors = blocks.flatMap((block): SectionAnchor[] => {
    if (block.type === "hero") return ["top"];
    if (block.type === "intro") return ["intro"];
    if (block.type === "factory") return ["factory"];
    if (block.type !== "section") return [];
    return [block.value.section];
  });
  return [...new Set([...anchors, "contact" as const])];
}
