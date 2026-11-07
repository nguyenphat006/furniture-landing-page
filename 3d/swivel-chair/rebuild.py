"""Dựng lại toàn bộ chuỗi img2threejs cho ghế xoay sau khi sửa author_spec.py / author_assessment.py.

Thứ tự (giữ đúng các cổng của skill, không bỏ bước):
  1. author_assessment.py  -> assessment.json
  2. author_spec.py        -> object-sculpt-spec.json (cây bộ phận, vật liệu, đèn)
  3. apply_material_analysis.py (registry + referencePbr từ analysis/material-analysis.json)
  4. extract_part_color_recipe.py cho từng bộ phận (+ ghi nguồn gốc lớp vật liệu)
  5. đưa map PBR tham chiếu vào frontend/public và khai url phục vụ
  6. validate --strict-quality (fail-closed)
  7. generate_threejs_factory.py cho pass hiện tại

Dùng:  python rebuild.py [--pass-id blockout]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

WS = Path(__file__).resolve().parent
REPO = WS.parents[1]
SKILL = Path.home() / ".claude/skills/img2threejs"
SPEC = WS / "object-sculpt-spec.json"
FRONTEND = REPO / "frontend"
FACTORY = FRONTEND / "src/features/capabilities/three/createSwivelLoungeChairModel.ts"
PUBLIC_MAPS = FRONTEND / "public/3d/swivel-chair/maps"
MAP_URL_PREFIX = "/3d/swivel-chair/maps"

CROPS = {
    "teak-satin": ("teak-rear-top-rail.png", "wood", 0.751),
    "rope-braided": ("rope-rear-panel.png", "fabric", 0.806),
    "cushion-fabric": ("cushion-back.png", "fabric", 0.721),
}
HIDDEN = {"seat-deck", "swivel-plate", "front-apron-rail"}

ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}


def run(args: list[str], cwd: Path, label: str, quiet: bool = False) -> subprocess.CompletedProcess:
    result = subprocess.run(args, cwd=cwd, env=ENV, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        print(f"[FAIL] {label}\n{result.stdout[-2000:]}\n{result.stderr[-2000:]}")
        sys.exit(result.returncode)
    if not quiet:
        print(f"[ok] {label}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pass-id", default="blockout")
    args = parser.parse_args()

    run([sys.executable, "author_assessment.py"], WS, "assessment")
    run([sys.executable, "author_spec.py"], WS, "spec authoring")
    run([sys.executable, "forge/stage2_spec/apply_material_analysis.py", str(SPEC),
         str(WS / "analysis/material-analysis.json"), "--in-place"], SKILL, "material wiring")

    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    for component in spec["componentTree"]:
        crop, hint, _ = CROPS[component["material"]]
        run([sys.executable, "forge/stage1_intake/extract_part_color_recipe.py",
             str(WS / "analysis/material-crops" / crop), "--component-id", component["id"],
             "--material-class-hint", hint, "--spec", str(SPEC), "--in-place",
             "--target-threshold", "0.7", "--allow-low-confidence"], SKILL, f"recipe {component['id']}", quiet=True)
    print(f"[ok] colour recipes x{len(spec['componentTree'])}")

    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    for component in spec["componentTree"]:
        recipe = component.get("colorMaterialRecipe")
        if not recipe:
            continue
        conf = CROPS[component["material"]][2]
        recipe["materialClassProvenance"] = (
            "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted "
            f"class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence {conf}."
            + (" Component is hidden; recipe taken from the visible surface of the same material." if component["id"] in HIDDEN else "")
        )

    # Map PBR tham chiếu phải được phục vụ qua HTTP; đường dẫn Windows không tải được trên trình duyệt.
    PUBLIC_MAPS.mkdir(parents=True, exist_ok=True)
    copied = 0
    for material in spec["materials"]:
        maps = (material.get("referencePbr") or {}).get("maps") or {}
        for channel, record in maps.items():
            src = Path(record.get("path", ""))
            if not src.is_file():
                continue
            shutil.copyfile(src, PUBLIC_MAPS / src.name)
            record["url"] = f"{MAP_URL_PREFIX}/{src.name}"
            copied += 1
    SPEC.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] served {copied} reference maps from {MAP_URL_PREFIX}")

    run([sys.executable, "forge/stage2_spec/validate_sculpt_spec.py", str(SPEC), "--strict-quality"], SKILL, "strict-quality")
    run([sys.executable, "forge/stage3_build/generate_threejs_factory.py", str(SPEC), "--out", str(FACTORY),
         "--pass-id", args.pass_id, "--force", "--blocked-report", str(WS / "analysis/blocked-report.json")],
        SKILL, f"factory ({args.pass_id})")


if __name__ == "__main__":
    main()
