"""Cắt ảnh bộ sofa thành ảnh tham chiếu riêng cho từng ghế xoay (dùng helper PNG stdlib của forge)."""
import sys
from pathlib import Path

SKILL = Path.home() / ".claude/skills/img2threejs/forge/stage1_intake"
sys.path.insert(0, str(SKILL))
from build_detail_inventory import read_png, write_png_rgb  # noqa: E402

SRC = Path(__file__).resolve().parents[2] / "frontend/public/Assets/img3js/3BFC1514-1.png"
OUT = Path(__file__).resolve().parent / "reference"

# Toạ độ trên ảnh gốc 2390x1792 (x0, y0, x1, y1)
CROPS = {
    "chair-right.png": (1500, 860, 2390, 1792),  # ghế phải: nhìn lưng + hông trái của ghế
    "chair-left.png": (20, 860, 900, 1792),      # ghế trái: đối xứng, nhìn lưng + hông phải
}

w, h, px = read_png(SRC)
print("source", w, h)
for name, (x0, y0, x1, y1) in CROPS.items():
    x1, y1 = min(x1, w), min(y1, h)
    out = []
    for y in range(y0, y1):
        row = y * w
        for x in range(x0, x1):
            r, g, b, a = px[row + x]
            m = a / 255.0
            out.append((round(r * m + 255 * (1 - m)), round(g * m + 255 * (1 - m)), round(b * m + 255 * (1 - m))))
    write_png_rgb(OUT / name, x1 - x0, y1 - y0, out)
    print(name, x1 - x0, "x", y1 - y0)
