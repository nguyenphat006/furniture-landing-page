import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Model 3D do img2threejs sinh ra từ spec (3d/swivel-chair/rebuild.py) — không sửa tay
    "src/features/capabilities/three/createSwivelLoungeChairModel.ts",
  ]),
]);

export default eslintConfig;
