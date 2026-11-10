// Sinh SVG cho ô chọn icon trong admin (Cài đặt → Thông tin chung → Nút nổi → Icon) từ đúng bộ icon
// web dùng (frontend/src/config/action-icons.ts: lucide + simple-icons). Chạy lại khi thêm icon:
//   frontend/node_modules/.bin/jiti backend/scripts/export_admin_icons.mjs
// Kết quả: backend/apps/sitesettings/static/sitesettings/icons/<tên>.svg (màu theo currentColor).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fe = join(root, "frontend");
const require = createRequire(join(fe, "package.json"));
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const icons = await import(pathToFileURL(join(fe, "src/config/action-icons.ts")).href);

const out = join(root, "backend/apps/sitesettings/static/sitesettings/icons");
mkdirSync(out, { recursive: true });
for (const file of readdirSync(out)) if (file.endsWith(".svg")) rmSync(join(out, file));

for (const [name, Icon] of Object.entries(icons.LINE_ICONS)) {
  const svg = renderToStaticMarkup(createElement(Icon, { size: 24, "aria-hidden": "true" }));
  writeFileSync(join(out, `${name}.svg`), `${svg}\n`);
}
for (const [name, icon] of Object.entries(icons.BRAND_ICONS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="${icon.path}"/></svg>`;
  writeFileSync(join(out, `${name}.svg`), `${svg}\n`);
}
console.log(`Đã sinh ${readdirSync(out).filter((f) => f.endsWith(".svg")).length} icon vào ${out}`);
