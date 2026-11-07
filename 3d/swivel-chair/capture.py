"""Chụp render review bằng Chrome headless từ trang dev /dev/chair-review (renderer thuần, không composer).

Dùng:  python capture.py <out-dir> [--views all|ref] [--explode 0]
Yêu cầu: dev server frontend đang chạy ở http://localhost:4000
"""
from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://localhost:4000/dev/chair-review"
WIDTH, HEIGHT = 890, 932          # cùng khung với reference/chair-*.png

VIEWS = {
    # tên: (azimuth, elevation) — hệ ghế: +Z trước, +X trái; az=135 khớp chair-right.png
    "rear-left-3q": (135, 18),     # = reference/chair-right.png
    "rear-right-3q": (-135, 18),   # = reference/chair-left.png
    "left-side": (90, 10),
    "front-left-3q": (40, 16),     # không có ảnh tham chiếu — suy luận
}


def capture(out_dir: Path, name: str, az: float, el: float, explode: float, mode: str, strip: bool = False) -> Path:
    out = (out_dir / f"{name}{'-mapstripped' if strip else ''}.png").resolve()
    profile = Path(tempfile.gettempdir()) / "img2threejs-chrome-profile"
    url = f"{BASE}?az={az}&el={el}&explode={explode}&mode={mode}" + ("&maps=0" if strip else "")
    subprocess.run(
        [CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
         "--hide-scrollbars", "--no-first-run", f"--user-data-dir={profile}",
         f"--window-size={WIDTH},{HEIGHT}", "--virtual-time-budget=25000",
         f"--screenshot={out}", url],
        capture_output=True, text=True, timeout=180, check=False,
    )
    if not out.is_file():
        raise SystemExit(f"capture failed: {name}")
    print(f"captured {name} ({out.stat().st_size // 1024} KB) <- {url}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--views", default="all", choices=["all", "ref"])
    parser.add_argument("--explode", type=float, default=0.0)
    parser.add_argument("--mode", default="reference", choices=["reference", "neutral", "grazing"])
    parser.add_argument("--strip-maps", action="store_true")
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    names = list(VIEWS) if args.views == "all" else ["rear-left-3q", "rear-right-3q"]
    for name in names:
        az, el = VIEWS[name]
        capture(args.out_dir, name, az, el, args.explode, args.mode, args.strip_maps)


if __name__ == "__main__":
    main()
