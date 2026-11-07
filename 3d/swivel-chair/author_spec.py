"""Tác giả ObjectSculptSpec cho ghế xoay BFC 3BFC1514.

Mọi quyết định tái tạo nằm ở đây (không nằm trong file TS sinh ra), đúng hợp đồng img2threejs:
"generated code must not be the only copy of reconstruction decisions".

Hệ toạ độ: mét, gốc ở sàn dưới tâm trục xoay, +Y lên, +Z phía trước (hướng người ngồi nhìn),
+X là bên TRÁI của ghế. Góc/tỉ lệ đo trên reference/chair-*.png, xem analysis/image-analysis.md.

Chạy sau new_sculpt_spec.py:  python author_spec.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

WS = Path(__file__).resolve().parent
SPEC_PATH = WS / "object-sculpt-spec.json"
ASSESSMENT_PATH = WS / "assessment.json"
sys.path.insert(0, str(Path.home() / ".claude/skills/img2threejs/forge/stage1_intake"))
from build_detail_inventory import read_png  # noqa: E402

# ---------------------------------------------------------------------------
# Tham số đo từ ảnh (xem analysis/image-analysis.md, Layer 2 + zone close-ups)
# ---------------------------------------------------------------------------
H = 0.92                      # sàn -> đỉnh nệm lưng (tỉ lệ đo từ ảnh; thang tuyệt đối suy luận)
Y0 = 0.14                     # đáy hộp ghế: khe ~0.09 m trên đỉnh vòng đế (đo phía trước-trái; review blockout #1)
SPLAY = math.radians(6.0)     # khung hông xoè ra ngoài
RECLINE = math.radians(12.0)  # khung lưng ngả ra sau
FRONT_LEAN = math.radians(3.0)
XB = 0.30                     # mặt ngoài khung hông tại đáy (rộng/sâu ~0.85 theo cạnh đã hiệu chỉnh phối cảnh)
ZRB = -0.31                   # mặt sau cột sau khung hông tại đáy
ZFB = 0.31                    # mặt trước cột trước tại đáy (sâu trong/cao trong ~1.2 = 11.5 x 9.5 mắt lưới)
T_MEMBER = 0.04               # độ dày thanh gỗ (vuông góc mặt khung)
W_POST = 0.05                 # bề rộng mặt cột
H_RAIL = 0.05                 # chiều cao thanh ngang
Y_ARM_REAR, Y_ARM_FRONT, ARM_T, ARM_W = 0.62, 0.605, 0.032, 0.075
ARM_OVERHANG_OUT, ARM_OVERHANG_FRONT, ARM_REAR_STUB = 0.025, 0.03, 0.035
Y_REAR_TOP = 0.76
H_TOP_RAIL = 0.065
REAR_FRAME_OFFSET = 0.03      # khung lưng nằm trước cột sau khung hông (zone r0c2)
RING_R, RING_TUBE = 0.225, 0.020    # đường kính ngoài ~0.82 bề rộng khung lưng
Y_DECK_TOP = 0.30
SEAT_CUSHION_H = 0.14
BACK_CUSHION_H, BACK_CUSHION_D = 0.50, 0.16
ROPE_R = 0.009                # đường kính dây ~0.55 bước lưới
LATERAL_PITCH, REAR_PITCH = 0.032, 0.024    # ~11.5 mắt dọc thanh dưới panel hông (ảnh gốc)
DECK_ORIGIN = (0.0, Y_DECK_TOP - 0.015, 0.0)
WHY_ROOT_LEVEL = 'A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.'


def x_outer(y: float) -> float:
    return XB + (y - Y0) * math.tan(SPLAY)


def z_lat_rear(y: float) -> float:
    return ZRB - (y - Y0) * math.tan(RECLINE)


def z_front(y: float) -> float:
    return ZFB + (y - Y0) * math.tan(FRONT_LEAN)


def z_rear_frame_back(y: float) -> float:
    return z_lat_rear(y) + REAR_FRAME_OFFSET


# ---------------------------------------------------------------------------
# Vector helpers
# ---------------------------------------------------------------------------
def add(a, b): return [a[i] + b[i] for i in range(3)]
def sub(a, b): return [a[i] - b[i] for i in range(3)]
def mul(a, k): return [a[i] * k for i in range(3)]
def dot(a, b): return sum(a[i] * b[i] for i in range(3))
def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def length(a): return math.sqrt(dot(a, a))
def norm(a):
    n = length(a)
    return [a[0] / n, a[1] / n, a[2] / n]
def rnd(v, n=4): return [round(x, n) for x in v]
def lerp(a, b, t): return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def euler_xyz(x_axis, y_axis, z_axis):
    """Ma trận quay (cột = trục local trong world) -> Euler 'XYZ' của three.js."""
    m11, m12, m13 = x_axis[0], y_axis[0], z_axis[0]
    m22, m23 = y_axis[1], z_axis[1]
    m32, m33 = y_axis[2], z_axis[2]
    ry = math.asin(max(-1.0, min(1.0, m13)))
    if abs(m13) < 0.9999999:
        rx = math.atan2(-m23, m33)
        rz = math.atan2(-m12, m11)
    else:
        rx = math.atan2(m32, m22)
        rz = 0.0
    return [round(rx, 5), round(ry, 5), round(rz, 5)]


def member_frame(p0, p1, normal_hint):
    """Trục local: Y dọc thanh (p0->p1), X là bề rộng trong mặt khung, Z ~ pháp tuyến khung."""
    a = norm(sub(p1, p0))
    x = norm(cross(a, normal_hint))
    z = cross(x, a)
    return x, a, z


def to_local(world, parent_origin):
    return rnd(sub(world, parent_origin))


# ---------------------------------------------------------------------------
# Component builders
# ---------------------------------------------------------------------------
PASS_ORDER = ["blockout", "structural-pass", "form-refinement", "material-pass",
              "surface-pass", "lighting-pass", "interaction-pass", "optimization-pass"]


def action_profile(role, group, explode, pivot=(0, 0, 0), collider="box", sockets=None, detachable=True):
    return {
        "animationRole": role,
        "pivot": {"mode": "center", "localPosition": rnd(list(pivot)), "axis": [0, 1, 0], "confidence": 0.7},
        "transformChannels": {"translate": True, "rotate": role in {"swivel-root", "root"}, "scale": False,
                              "bend": False, "twist": False, "detach": detachable, "visibility": True,
                              "materialState": True},
        "sockets": sockets or [],
        "collider": {"type": collider, "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False,
                     "notes": "Proxy sized to the component bounds."},
        "constraints": [],
        "destruction": {"breakable": False, "fractureGroup": group, "seamRefs": [],
                        "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "none",
                        "explodeVector": rnd(list(explode))},
    }


def component(cid, name, level, role, primitive, topology, rationale, parent, material, dims, position,
              rotation, group, explode, descriptor=None, attachment=None, local_features=None,
              evidence=None, confidence=0.7, sockets=None, fidelity="structural"):
    geometry_descriptor = {
        "topologyIntent": rationale,
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [],
        "uvStrategy": "generated procedural coordinates",
        "normalStrategy": "vertex normals from generated geometry",
    }
    if descriptor:
        geometry_descriptor.update(descriptor)
    return {
        "id": cid,
        "name": name,
        "level": level,
        "role": role,
        "importance": {"macro": 1.0, "meso": 0.75, "micro": 0.4}[level],
        "confidence": confidence,
        "primitive": primitive,
        "topologyClass": topology,
        "topologyRationale": rationale,
        "geometryDescriptor": geometry_descriptor,
        "parent": parent,
        "attachment": attachment,
        "dimensions": {"width": round(dims[0], 4), "height": round(dims[1], 4), "depth": round(dims[2], 4),
                       "units": "meters", "confidence": confidence},
        "transform": {"position": rnd(position), "rotation": rotation,
                      # generator đọc transform.scale TRƯỚC dimensions (scale_vector) -> phải trùng kích thước
                      "scale": [round(dims[0], 4), round(dims[1], 4), round(dims[2], 4)]},
        "actionProfile": action_profile(role, group, explode, sockets=sockets),
        "material": material,
        "materialLayers": [material],
        "deformations": [],
        "joints": [],
        "seams": [],
        "localFeatures": local_features or [],
        "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0,
                          "normalPattern": "", "displacementPattern": "", "occlusionPattern": "",
                          "edgeWearPattern": "", "notes": ""},
        "evidenceRefs": evidence or ["reference/chair-right.png", "reference/chair-left.png"],
        "details": [],
        "fidelityTier": fidelity,
    }


def cushion_sdf(width, height, depth, crown=0.12, resolution=32):
    """Nệm hộp: lõi box (cạnh được surface-nets vát ~1 ô, pháp tuyến gradient làm mềm) hoà trộn với một
    ellipsoid để hai mặt lớn phồng ~crown*depth ở giữa, như nệm mút bọc vải thật."""
    margin = depth * crown + 0.02
    return {
        "primitives": [
            {"id": "core", "type": "box", "size": [round(width - 0.02, 4), round(height - 0.02, 4), round(depth * 0.86, 4)]},
            {"id": "crown", "type": "ellipsoid", "radii": [round(width * 0.47, 4), round(height * 0.45, 4), round(depth * (0.5 + crown), 4)]},
        ],
        "operations": [{"id": "cushion", "type": "smooth-union", "left": "core", "right": "crown", "radius": 0.05}],
        "resolution": resolution,
        "bounds": {"min": [round(-width / 2 - 0.02, 4), round(-height / 2 - 0.02, 4), round(-depth / 2 - margin, 4)],
                   "max": [round(width / 2 + 0.02, 4), round(height / 2 + 0.02, 4), round(depth / 2 + margin, 4)]},
    }


def attach(socket, start, end, contact="butt", embed=0.004, gap=0.003):
    return {"parentSocket": socket, "localStart": rnd(start), "localEnd": rnd(end), "contactType": contact,
            "embedDepth": embed, "overlap": embed, "gapTolerance": gap}


def feature(fid, kind, description, pass_id, effect=None):
    item = {"id": fid, "kind": kind, "description": description, "realizedInPass": pass_id}
    if effect:
        item["effect"] = effect
    return item


def box_member(cid, name, p0, p1, width, thick, normal_hint, material, group, explode, socket,
               features=None, confidence=0.7, level="meso"):
    """Thanh gỗ hộp nối đúng 2 đầu mút world p0->p1, con của sàn ghế."""
    x, y, z = member_frame(p0, p1, normal_hint)
    centre = lerp(p0, p1, 0.5)
    return component(
        cid, name, level, "frame-member", "box", "assembled-solid",
        "Rigid planed teak member with flat faces and eased edges.",
        "seat-deck", material, (width, length(sub(p1, p0)), thick),
        to_local(centre, DECK_ORIGIN), euler_xyz(x, y, z), group, explode,
        attachment=attach(socket, to_local(p0, DECK_ORIGIN), to_local(p1, DECK_ORIGIN), contact="embed"),
        local_features=features, confidence=confidence,
    )


# ---------------------------------------------------------------------------
# Weave lattice -> tapered-sweep stations (dây đan lên/xuống tại mỗi điểm giao)
# ---------------------------------------------------------------------------
def lattice_sweeps(p00, p10, p01, p11, pitch, normal, amplitude, embed=0.002, turn_out=0.006):
    """Trả về 2 danh sách station (hướng +45° và -45°) chạy zig-zag liên tục như dây quấn qua khung.

    p00 = dưới-sau, p10 = dưới-trước, p01 = trên-sau, p11 = trên-trước (world).
    Toạ độ panel (u, v) theo mét; điểm world = nội suy song tuyến + pháp tuyến * offset.
    """
    width = (length(sub(p10, p00)) + length(sub(p11, p01))) / 2
    height = (length(sub(p01, p00)) + length(sub(p11, p10))) / 2
    step = pitch * math.sqrt(2)          # khoảng cách giữa các đường theo trục u
    n = norm(normal)

    def world(u, v, offset=0.0):
        s = u / width
        t = v / height
        bottom = lerp(p00, p10, s)
        top = lerp(p01, p11, s)
        return add(lerp(bottom, top, t), mul(n, offset))

    def line_segment(c, sign):
        # sign=+1: v = u - c  (đi lên về phía trước); sign=-1: v = c - u
        pts = []
        for u in (-embed, width + embed):
            v = u - c if sign > 0 else c - u
            if -embed - 1e-9 <= v <= height + embed + 1e-9:
                pts.append((u, v))
        for v in (-embed, height + embed):
            u = v + c if sign > 0 else c - v
            if -embed - 1e-9 <= u <= width + embed + 1e-9:
                pts.append((u, v))
        pts = sorted(set((round(a, 6), round(b, 6)) for a, b in pts))
        return (pts[0], pts[-1]) if len(pts) >= 2 else None

    def build(sign):
        other = -sign
        if sign > 0:
            cs = [(-height) + step * (k + 0.5) for k in range(int((width + height) / step) + 1)]
            others = [step * (k + 0.5) for k in range(int((width + height) / step) + 1)]
        else:
            cs = [step * (k + 0.5) for k in range(int((width + height) / step) + 1)]
            others = [(-height) + step * (k + 0.5) for k in range(int((width + height) / step) + 1)]
        stations = []
        prev_end = None
        for idx, c in enumerate(cs):
            seg = line_segment(c, sign)
            if not seg:
                continue
            (ua, va), (ub, vb) = seg
            if idx % 2:
                (ua, va), (ub, vb) = (ub, vb), (ua, va)
            # các điểm giao với họ đường kia, sắp theo chiều đi
            crossings = []
            for j, c2 in enumerate(others):
                if sign > 0:   # v = u - c  và  v = c2 - u
                    u = (c + c2) / 2
                else:          # v = c - u  và  v = u - c2
                    u = (c + c2) / 2
                v = u - c if sign > 0 else c - u
                if -1e-9 <= u <= width and -1e-9 <= v <= height:
                    parity = 1 if (idx + j) % 2 == 0 else -1
                    crossings.append((u, v, parity * sign))
            direction = 1 if ub >= ua else -1
            crossings.sort(key=lambda p: p[0] * direction)
            path = [(ua, va, 0.0)]
            for u, v, s_ in crossings:
                path.append((u, v, amplitude * s_))
            path.append((ub, vb, 0.0))
            if prev_end is not None:
                # Dây quấn qua thanh khung giữa hai lượt: CẦU PHẲNG 2 điểm ôm sát mép panel (ở 30% và 70%
                # quãng nối), đẩy ra ngoài mép turn_out. Một điểm giữa duy nhất (#1) vẫn để Catmull-Rom vọt
                # quá tay vịn 32 mm (render blockout #2: lỗ oval trên mặt tay vịn).
                pu, pv = prev_end
                for frac in (0.3, 0.7):
                    mu, mv = pu + (ua - pu) * frac, pv + (va - pv) * frac
                    ou = -turn_out if mu <= 0 else (turn_out if mu >= width else 0.0)
                    ov = -turn_out if mv <= 0 else (turn_out if mv >= height else 0.0)
                    stations.append({"position": rnd(world(mu + ou, mv + ov, 0.0)), "rx": ROPE_R, "rz": ROPE_R})
            prev_end = (ub, vb)
            for u, v, off in path:
                stations.append({"position": rnd(world(u, v, off)), "rx": ROPE_R, "rz": ROPE_R})
        return stations

    return build(+1), build(-1), {"width": round(width, 4), "height": round(height, 4)}


# ---------------------------------------------------------------------------
# Palette sampled from reference pixels (chair-right.png, 890x932)
# ---------------------------------------------------------------------------
def sample_palette():
    w, h, px = read_png(WS / "reference/chair-right.png")

    def region(x0, y0, x1, y1, keep=lambda r, g, b: True):
        vals = []
        for y in range(y0, y1):
            for x in range(x0, x1):
                r, g, b, a = px[y * w + x]
                if keep(r, g, b):
                    vals.append((r, g, b))
        vals.sort(key=lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
        def at(q):
            c = vals[int(q * (len(vals) - 1))]
            return "#%02X%02X%02X" % c
        return {"median": at(0.5), "dark": at(0.2), "light": at(0.8), "samples": len(vals)}

    luma = lambda r, g, b: 0.2126 * r + 0.7152 * g + 0.0722 * b

    def slanted_band():
        # Thanh đỉnh sau nằm xiên trong ảnh: tâm dải y = 170 - 0.25 * (x - 620), cao 12 px
        vals = []
        for x in range(620, 780):
            yc = 170 - 0.25 * (x - 620)
            for y in range(int(yc - 6), int(yc + 6)):
                vals.append(px[y * w + x][:3])
        vals.sort(key=lambda c: luma(*c))
        pick = lambda q: "#%02X%02X%02X" % vals[int(q * (len(vals) - 1))]
        return {"median": pick(0.5), "dark": pick(0.2), "light": pick(0.8), "samples": len(vals)}

    return {
        "teak": slanted_band(),                                                       # mặt thanh đỉnh sau (dải xiên)
        "rope": region(150, 330, 420, 560, keep=lambda r, g, b: luma(r, g, b) < 125 and r > g > b),
        "cushion": region(470, 60, 720, 140),                                         # nệm lưng
    }


# ---------------------------------------------------------------------------
# Build the spec
# ---------------------------------------------------------------------------
def build():
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    assessment = json.loads(ASSESSMENT_PATH.read_text(encoding="utf-8"))
    palette = sample_palette()
    comps: list[dict] = []

    # --- Base (explode group: base) --------------------------------------------------
    ring_profile = [[round(RING_R + RING_TUBE * math.cos(a), 5), round(RING_TUBE + RING_TUBE * math.sin(a), 5)]
                    for a in [2 * math.pi * i / 16 for i in range(17)]]
    comps.append(component(
        "base-ring", "Swivel base ring", "macro", "swivel-base", "lathe", "continuous-sculpt",
        "Bent-laminated teak ring with a round section; a revolved circular profile, not a torus primitive, so it lies flat without a rotated pivot.",
        None, "teak-satin", (1, 1, 1), [0, 0, 0], [0, 0, 0], "base", (0, -0.28, 0),
        descriptor={"latheProfile": {"points": ring_profile, "segments": 64}},
        local_features=[feature("ring-rounded-section", "contour", "Round ring section ~0.048 m, grain following the ring.", "form-refinement")],
        evidence=["analysis/detail-inventory/zone-r2c1.png"], confidence=0.8,
        sockets=[{"id": "swivel-plate-mount", "localPosition": [0, 0.045, 0], "localRotation": [0, 0, 0]}],
        fidelity="form",
    ))
    for sid, angle in (("base-stretcher-a", 45), ("base-stretcher-b", -45)):
        a = math.radians(angle)
        half = RING_R * 0.96
        p0 = [-half * math.sin(a), 0.028, -half * math.cos(a)]
        p1 = [half * math.sin(a), 0.028, half * math.cos(a)]
        comps.append(component(
            sid, f"Base cross stretcher ({angle:+d} deg)", "meso", "swivel-base", "box", "assembled-solid",
            "Straight teak stretcher spanning the ring interior; flat rectangular section.",
            "base-ring", "teak-satin", (0.045, 0.03, RING_R * 1.92), [0, 0.028, 0], [0, round(a, 5), 0],
            "base", (0, -0.28, 0),
            attachment=attach("swivel-plate-mount", p0, p1, contact="embed"), confidence=0.45,
            evidence=["analysis/detail-inventory/zone-r2c1.png"],
        ))
    comps.append(component(
        "swivel-plate", "Swivel bearing plate", "meso", "swivel-base", "lathe", "assembled-solid",
        "Hidden disc bearing between stretchers and seat box, inferred (see unknowns: swivel-mechanism).",
        "base-ring", "teak-satin", (1, 1, 1), [0, 0, 0], [0, 0, 0], "base", (0, -0.14, 0),
        # Cột xoay hẹp (r 0.09) để khe dưới hộp ghế đọc là khoảng trống như ảnh, không phải trống đặc
        descriptor={"latheProfile": {"points": [[0.0001, 0.035], [0.09, 0.035], [0.09, Y0], [0.0001, Y0]], "segments": 40}},
        attachment=attach("swivel-plate-mount", [0, 0.043, 0], [0, Y0, 0], contact="socket"), confidence=0.35,
    ))

    # --- Seat deck: swivel root of everything above the base ------------------------------
    deck_w = 2 * (x_outer(Y_DECK_TOP) - T_MEMBER)
    deck_z0 = z_rear_frame_back(Y_DECK_TOP) + T_MEMBER
    deck_z1 = z_front(Y_DECK_TOP) - W_POST
    comps.append(component(
        "seat-deck", "Seat deck (swivel root)", "macro", "swivel-root", "box", "assembled-solid",
        "Flat structural deck under the seat cushion; hidden, carries the frame and pivots about Y on the swivel plate.",
        None, "teak-satin", (deck_w, 0.03, deck_z1 - deck_z0), list(DECK_ORIGIN), [0, 0, 0], "frame", (0, 0, 0),
        sockets=[
            {"id": "lateral-frame-left-mount", "localPosition": rnd([x_outer(Y0), Y0 - DECK_ORIGIN[1], 0]), "localRotation": [0, 0, 0]},
            {"id": "lateral-frame-right-mount", "localPosition": rnd([-x_outer(Y0), Y0 - DECK_ORIGIN[1], 0]), "localRotation": [0, 0, 0]},
            {"id": "rear-frame-mount", "localPosition": rnd([0, Y0 - DECK_ORIGIN[1], z_rear_frame_back(Y0)]), "localRotation": [0, 0, 0]},
            {"id": "weave-mount", "localPosition": [0, 0, 0], "localRotation": [0, 0, 0]},
            {"id": "cushion-mount", "localPosition": [0, 0.015, (deck_z0 + deck_z1) / 2], "localRotation": [0, 0, 0]},
        ],
        confidence=0.4, evidence=["analysis/image-analysis.md#layer-8"],
    ))
    comps[-1]["transform"]["position"] = rnd(list(DECK_ORIGIN))

    # --- Lateral frames (explode group: frame) -------------------------------------------
    for side, sx, sname in ((1, 1.0, "left"), (-1, -1.0, "right")):
        socket = f"lateral-frame-{sname}-mount"
        nh = [sx, 0, 0]
        xm = lambda y: sx * (x_outer(y) - T_MEMBER / 2)
        y_arm_bottom = Y_ARM_REAR - ARM_T
        rear_post_z = lambda y: z_lat_rear(y) + W_POST / 2
        front_post_z = lambda y: z_front(y) - W_POST / 2
        explode_out = (sx * 0.22, 0, 0)
        comps.append(box_member(
            f"lateral-rear-post-{sname}", f"Lateral rear post ({sname})",
            [xm(Y0), Y0, rear_post_z(Y0)], [xm(y_arm_bottom), y_arm_bottom, rear_post_z(y_arm_bottom)],
            W_POST, T_MEMBER, nh, "teak-satin", "frame", explode_out, socket,
            features=[feature("eased-edges", "bevel", "Eased long edges catching a thin highlight line.", "form-refinement",
                              {"edgeTreatment": {"type": "chamfer", "bevelRadius": 0.004, "segments": 2}})],
        ))
        comps.append(box_member(
            f"front-post-{sname}", f"Front post ({sname})",
            [xm(Y0), Y0, front_post_z(Y0)], [xm(Y_ARM_FRONT - ARM_T), Y_ARM_FRONT - ARM_T, front_post_z(Y_ARM_FRONT - ARM_T)],
            W_POST, T_MEMBER, nh, "teak-satin", "frame", explode_out, socket, confidence=0.5,
        ))
        yr = Y0 + H_RAIL / 2
        comps.append(box_member(
            f"lateral-bottom-rail-{sname}", f"Lateral bottom rail ({sname})",
            [xm(yr), yr, z_lat_rear(yr)], [xm(yr), yr, z_front(yr)],
            H_RAIL, T_MEMBER, nh, "teak-satin", "frame", explode_out, socket,
        ))
        # Armrest: extrude a side profile (u = rear->front, v = up) with a slight concave dip
        rear_u = z_lat_rear(Y_ARM_REAR) - ARM_REAR_STUB
        front_u = z_front(Y_ARM_FRONT) + ARM_OVERHANG_FRONT
        span = front_u - rear_u
        top = []
        for i in range(9):
            t = i / 8
            dip = 0.012 * math.sin(math.pi * t)                    # võng nhẹ giữa tay vịn
            ytop = (Y_ARM_REAR + (Y_ARM_FRONT - Y_ARM_REAR) * t) - dip
            top.append([round(t * span, 4), round(ytop - Y_ARM_REAR + ARM_T, 4)])
        stub = []                                                   # đầu sau bo tròn
        for i in range(1, 6):
            a = math.pi / 2 + math.pi * i / 6
            stub.append([round(ARM_T / 2 + (ARM_T / 2) * math.cos(a) - ARM_T / 2 + 0.0, 4),
                         round(ARM_T / 2 + (ARM_T / 2) * math.sin(a), 4)])
        profile = [[0.0, 0.0], [span, round(Y_ARM_FRONT - Y_ARM_REAR, 4)], *reversed(top[1:]), top[0], *stub]
        x_outer_edge = sx * (x_outer(Y_ARM_REAR) + ARM_OVERHANG_OUT)
        node = [x_outer_edge if sx > 0 else x_outer_edge + ARM_W, Y_ARM_REAR - ARM_T, rear_u]
        # local X = +Z world (rear->front), local Y = up, local Z = X x Y = -X world (extrude inward/-X)
        comps.append(component(
            f"armrest-{sname}", f"Armrest ({sname})", "meso", "frame-member", "extrude", "assembled-solid",
            "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
            "seat-deck", "teak-satin", (1, 1, 1), to_local(node, DECK_ORIGIN),
            euler_xyz([0, 0, 1], [0, 1, 0], [-1, 0, 0]), "frame", (sx * 0.22, 0.05, 0),
            descriptor={"profile2D": {"points": profile, "depth": ARM_W}},
            attachment=attach(socket, to_local([node[0], Y_ARM_REAR - ARM_T, rear_u], DECK_ORIGIN),
                              to_local([node[0], Y_ARM_FRONT - ARM_T, front_u], DECK_ORIGIN), contact="overlap"),
            local_features=[
                feature("concave-sweep", "contour", "Top edge dips ~12 mm mid-length (d05).", "form-refinement"),
                feature("rear-end-protrusion", "contour", "Round-ended rear stub protrudes ~35 mm behind the rear frame (d06).", "form-refinement"),
            ],
            evidence=["reference/chair-right.png#armrest", "analysis/detail-inventory/zone-r0c2.png"], confidence=0.65,
            fidelity="form",
        ))
        # Fastener caps: upper (armrest joint) + lower (bottom rail joint), outer face of rear post
        for level_name, yc in (("upper", Y_ARM_REAR - 0.06), ("lower", Y0 + 0.03)):
            centre = [sx * (x_outer(yc) + 0.002), yc, z_lat_rear(yc) + W_POST / 2]
            comps.append(component(
                f"fastener-cap-{sname}-{level_name}", f"Fastener cap ({sname}, {level_name})", "micro", "fastener",
                "sphere", "assembled-solid", "Low domed fastener cap proud of the post face.",
                "seat-deck", "teak-satin", (0.016, 0.016, 0.006), to_local(centre, DECK_ORIGIN),
                [0, round(math.pi / 2, 5), 0], "frame", explode_out,
                attachment=attach(socket, to_local(centre, DECK_ORIGIN), to_local(add(centre, [sx * 0.004, 0, 0]), DECK_ORIGIN), contact="embed", embed=0.002),
                evidence=["analysis/detail-inventory/zone-r2c1.png", "reference/chair-right.png#armrest-joint"], confidence=0.6,
            ))

        # Lateral weave panel (explode group: weave)
        yb, yt = Y0 + H_RAIL, Y_ARM_REAR - ARM_T
        xw = lambda y: sx * (x_outer(y) - T_MEMBER / 2)
        p00 = [xw(yb), yb, z_lat_rear(yb) + W_POST]
        p10 = [xw(yb), yb, z_front(yb) - W_POST]
        p01 = [xw(yt), yt, z_lat_rear(yt) + W_POST]
        p11 = [xw(yt), yt, z_front(yt) - W_POST]
        outward = norm([sx * math.cos(SPLAY), -math.sin(SPLAY), 0])
        up_a, up_b, dims = lattice_sweeps(p00, p10, p01, p11, LATERAL_PITCH, outward, 0.006)
        for suffix, stations in (("a", up_a), ("b", up_b)):
            local = [{**s, "position": to_local(s["position"], DECK_ORIGIN)} for s in stations]
            feats = []
            if suffix == "a":
                feats = [
                    feature("lattice-openings", "hole", "See-through diamond openings between strands (d01).", "structural-pass"),
                    feature("over-under-interlace", "ridge", "Strands alternate +/-7.5 mm about the panel plane at every crossing (d02).", "form-refinement"),
                ]
            comps.append(component(
                f"weave-lateral-{sname}" if suffix == "a" else f"weave-lateral-{sname}-b",
                f"Lateral rope lattice ({sname}, {'+45' if suffix == 'a' else '-45'} deg run)", "meso", "weave-panel",
                "tube", "fiber-strand",
                "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
                None, "rope-braided", (1, 1, 1), [0, 0, 0], [0, 0, 0], "weave", (sx * 0.12, 0, 0),
                descriptor={"tubePath": {"points": [st["position"] for st in stations], "radius": ROPE_R, "radialSegments": 7, "closed": False},
                            "attachmentIntent": {"parent": "seat-deck", "parentSocket": "weave-mount", "contactType": "embed", "embedDepth": 0.012,
                                                 "localStart": to_local(p00, DECK_ORIGIN), "localEnd": to_local(p11, DECK_ORIGIN),
                                                 "whyRootLevel": WHY_ROOT_LEVEL},
                            "lattice": {"pitch": LATERAL_PITCH, "angleDeg": 45 if suffix == "a" else -45,
                                        "ropeRadius": ROPE_R, "interlaceAmplitude": 0.006, "panelSize": dims}},
                attachment=None,
                local_features=feats, evidence=["reference/chair-right.png#lateral-panel", "analysis/detail-inventory/zone-r1c1.png"],
                confidence=0.75, fidelity="form",
            ))

    # --- Rear frame (between lateral frames) --------------------------------------------
    nh_rear = [0, 0, -1]
    zmid = lambda y: z_rear_frame_back(y) + T_MEMBER / 2
    stile_x = lambda y: x_outer(y) - T_MEMBER - W_POST / 2
    y_top_rail_bottom = Y_REAR_TOP - H_TOP_RAIL
    for sx, sname in ((1.0, "left"), (-1.0, "right")):
        comps.append(box_member(
            f"rear-stile-{sname}", f"Rear frame stile ({sname})",
            [sx * stile_x(Y0), Y0, zmid(Y0)], [sx * stile_x(y_top_rail_bottom), y_top_rail_bottom, zmid(y_top_rail_bottom)],
            W_POST, T_MEMBER, nh_rear, "teak-satin", "frame", (0, 0, -0.2), "rear-frame-mount",
            features=[feature("eased-edges", "bevel", "Eased edges.", "form-refinement",
                              {"edgeTreatment": {"type": "chamfer", "bevelRadius": 0.004, "segments": 2}})],
        ))
    yr = Y0 + H_RAIL / 2
    comps.append(box_member(
        "rear-bottom-rail", "Rear frame bottom rail",
        [-stile_x(yr) - W_POST / 2, yr, zmid(yr)], [stile_x(yr) + W_POST / 2, yr, zmid(yr)],
        H_RAIL, T_MEMBER, nh_rear, "teak-satin", "frame", (0, 0, -0.2), "rear-frame-mount",
    ))
    # Rear top rail: extrude with rounded outer top corners (d13), laid in the reclined rear plane
    yc = Y_REAR_TOP - H_TOP_RAIL / 2
    half = stile_x(yc) + W_POST / 2
    radius = 0.045
    rail_pts = [[-half, -H_TOP_RAIL / 2], [half, -H_TOP_RAIL / 2]]
    for i in range(7):                                   # góc phải trên bo tròn
        a = -math.pi / 2 + (math.pi / 2) * i / 6 + math.pi / 2
        a = (math.pi / 2) * i / 6
        rail_pts.append([half - radius + radius * math.cos(a), H_TOP_RAIL / 2 - radius + radius * math.sin(a)])
    for i in range(7):                                   # góc trái trên bo tròn
        a = math.pi / 2 + (math.pi / 2) * i / 6
        rail_pts.append([-half + radius + radius * math.cos(a), H_TOP_RAIL / 2 - radius + radius * math.sin(a)])
    rail_pts = [[round(p[0], 4), round(max(-H_TOP_RAIL / 2, p[1]), 4)] for p in rail_pts]
    up = norm([0, math.cos(RECLINE), -math.sin(RECLINE)])
    back = norm([0, math.sin(RECLINE), math.cos(RECLINE)])          # pháp tuyến hướng trước
    centre = [0, yc, zmid(yc)]
    node = sub(centre, mul(back, T_MEMBER / 2))                        # extrude đi theo +Z local
    comps.append(component(
        "rear-top-rail", "Rear frame top rail", "meso", "frame-member", "extrude", "assembled-solid",
        "Wide planed teak rail with large outer top corner radii; profile extruded through the frame thickness.",
        "seat-deck", "teak-satin", (1, 1, 1), to_local(node, DECK_ORIGIN), euler_xyz([1, 0, 0], up, back),
        "frame", (0, 0.12, -0.2),
        descriptor={"profile2D": {"points": rail_pts, "depth": T_MEMBER}},
        attachment=attach("rear-frame-mount", to_local([-half, yc, zmid(yc)], DECK_ORIGIN), to_local([half, yc, zmid(yc)], DECK_ORIGIN), contact="embed"),
        local_features=[feature("rounded-outer-corners", "contour", "Outer top corners radiused ~45 mm (d13).", "form-refinement")],
        evidence=["analysis/detail-inventory/zone-r0c2.png"], confidence=0.75, fidelity="form",
    ))
    comps.append(box_member(
        "front-apron-rail", "Front apron rail (inferred)",
        [-(x_outer(Y0 + 0.03) - T_MEMBER), Y0 + 0.03, z_front(Y0) - T_MEMBER / 2],
        [x_outer(Y0 + 0.03) - T_MEMBER, Y0 + 0.03, z_front(Y0) - T_MEMBER / 2],
        0.06, T_MEMBER, [0, 0, 1], "teak-satin", "frame", (0, 0, 0.2), "rear-frame-mount", confidence=0.35,
    ))

    # Rear weave panel (dense lattice approximating the chevron loop motif)
    yb, yt = Y0 + H_RAIL, y_top_rail_bottom
    xin = lambda y: x_outer(y) - T_MEMBER - W_POST
    p00 = [xin(yb), yb, zmid(yb)]
    p10 = [-xin(yb), yb, zmid(yb)]
    p01 = [xin(yt), yt, zmid(yt)]
    p11 = [-xin(yt), yt, zmid(yt)]
    rear_a, rear_b, dims = lattice_sweeps(p00, p10, p01, p11, REAR_PITCH, [0, -math.sin(RECLINE), -math.cos(RECLINE)], 0.005)
    for suffix, stations in (("a", rear_a), ("b", rear_b)):
        local = [{**s, "position": to_local(s["position"], DECK_ORIGIN)} for s in stations]
        comps.append(component(
            "weave-rear" if suffix == "a" else "weave-rear-b",
            f"Rear rope lattice ({'+45' if suffix == 'a' else '-45'} deg run)", "meso", "weave-panel",
            "tube", "fiber-strand",
            "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
            None, "rope-braided", (1, 1, 1), [0, 0, 0], [0, 0, 0], "weave", (0, 0, -0.12),
            descriptor={"tubePath": {"points": [st["position"] for st in stations], "radius": ROPE_R, "radialSegments": 7, "closed": False},
                        "attachmentIntent": {"parent": "seat-deck", "parentSocket": "weave-mount", "contactType": "embed", "embedDepth": 0.012,
                                             "localStart": to_local(p00, DECK_ORIGIN), "localEnd": to_local(p11, DECK_ORIGIN),
                                             "whyRootLevel": WHY_ROOT_LEVEL},
                        "lattice": {"pitch": REAR_PITCH, "angleDeg": 45 if suffix == "a" else -45, "ropeRadius": ROPE_R,
                                    "interlaceAmplitude": 0.005, "panelSize": dims,
                                    "approximation": "reference motif is stacked chevron loops; modelled as a denser diamond lattice"}},
            attachment=None,
            local_features=[feature("dense-lattice", "ridge", "Denser rear lattice (d03), documented approximation of the chevron motif.", "form-refinement")] if suffix == "a" else [],
            evidence=["analysis/detail-inventory/zone-r1c1.png"], confidence=0.5, fidelity="form",
        ))

    # --- Cushions (explode group: cushions) ------------------------------------------------
    ys = Y_DECK_TOP + SEAT_CUSHION_H / 2
    seat_w = 2 * (x_outer(ys) - T_MEMBER) - 0.03
    seat_z0 = z_rear_frame_back(ys) + T_MEMBER + 0.01
    seat_z1 = z_front(ys) - 0.01
    seat_centre = [0, ys, (seat_z0 + seat_z1) / 2]
    comps.append(component(
        "cushion-seat", "Seat cushion", "macro", "cushion", "box", "implicit",
        "Boxed foam cushion with softly radiused edges and a slightly crowned top: implicit box core smooth-unioned with an ellipsoid crown. Render blockout #1 showed a Catmull-Clark 1x1x1 cage collapsing into a blob, so the rounded form is carried by the SDF instead.",
        "seat-deck", "cushion-fabric", (1, 1, 1), to_local(seat_centre, DECK_ORIGIN),
        # SDF dựng theo trục (rộng X, cao Y, sâu Z); nệm ngồi nằm ngang nên hoán Y/Z qua xoay -90° quanh X
        [round(-math.pi / 2, 5), 0, 0], "cushions", (0, 0.32, 0.18),
        descriptor={"sdf": cushion_sdf(seat_w, seat_z1 - seat_z0, SEAT_CUSHION_H, crown=0.10)},
        attachment=attach("cushion-mount", to_local([0, Y_DECK_TOP, seat_centre[2]], DECK_ORIGIN), to_local([0, Y_DECK_TOP + SEAT_CUSHION_H, seat_centre[2]], DECK_ORIGIN), contact="butt"),
        evidence=["reference/chair-right.png#lateral-panel"], confidence=0.5, fidelity="form",
    ))
    recline_c = RECLINE + math.radians(2)
    up_c = norm([0, math.cos(recline_c), -math.sin(recline_c)])
    fwd_c = norm([0, math.sin(recline_c), math.cos(recline_c)])
    base_y = Y_DECK_TOP + SEAT_CUSHION_H - 0.04
    base_pt = [0, base_y, z_rear_frame_back(base_y) + T_MEMBER + BACK_CUSHION_D / 2 + 0.005]
    back_centre = add(base_pt, mul(up_c, BACK_CUSHION_H / 2))
    comps.append(component(
        "cushion-back", "Back cushion", "meso", "cushion", "box", "implicit",
        "Tall boxed back cushion with a perimeter seam (d12) and a soft crown, reclined against the rear lattice; implicit box core smooth-unioned with an ellipsoid crown (see cushion-seat).",
        "seat-deck", "cushion-fabric", (1, 1, 1), to_local(back_centre, DECK_ORIGIN),
        euler_xyz([1, 0, 0], up_c, fwd_c), "cushions", (0, 0.38, 0.05),
        descriptor={"sdf": cushion_sdf(seat_w - 0.02, BACK_CUSHION_H, BACK_CUSHION_D, crown=0.14)},
        attachment=attach("cushion-mount", to_local(base_pt, DECK_ORIGIN), to_local(add(base_pt, mul(up_c, BACK_CUSHION_H)), DECK_ORIGIN), contact="butt"),
        local_features=[feature("perimeter-seam", "seam", "Boxed perimeter seam along the cushion faces (d12).", "surface-pass")],
        evidence=["reference/chair-right.png#back-cushion", "analysis/detail-inventory/zone-r0c2.png"], confidence=0.6, fidelity="form",
    ))

    spec["componentTree"] = comps

    regions = {  # vùng chuẩn hoá trên ảnh tham chiếu tương ứng
        "reference/chair-right.png": (0.0, 0.0, 1.0, 1.0),
        "reference/chair-left.png": (0.0, 0.0, 1.0, 1.0),
        "reference/chair-right.png#lateral-panel": (0.08, 0.30, 0.48, 0.40),
        "reference/chair-right.png#rear-panel": (0.52, 0.18, 0.38, 0.48),
        "reference/chair-right.png#armrest": (0.05, 0.26, 0.58, 0.07),
        "reference/chair-right.png#armrest-joint": (0.55, 0.30, 0.04, 0.03),
        "reference/chair-right.png#rear-top-rail": (0.60, 0.08, 0.35, 0.14),
        "reference/chair-right.png#rear-post": (0.45, 0.10, 0.10, 0.65),
        "reference/chair-right.png#back-cushion": (0.47, 0.04, 0.40, 0.25),
        "reference/chair-left.png#rear-panel": (0.10, 0.18, 0.38, 0.48),
        "reference/chair-left.png#rear-post": (0.35, 0.10, 0.10, 0.65),
        "reference/chair-left.png#back-cushion": (0.14, 0.04, 0.40, 0.25),
        "analysis/detail-inventory/zone-r0c2.png": (0.667, 0.0, 0.333, 0.333),
        "analysis/detail-inventory/zone-r1c1.png": (0.333, 0.333, 0.333, 0.333),
        "analysis/detail-inventory/zone-r2c1.png": (0.333, 0.667, 0.333, 0.333),
        "analysis/image-analysis.md#layer-8": (0.0, 0.0, 1.0, 1.0),
    }
    used = set()
    for c in comps:
        used.update(c["evidenceRefs"])
    for mat_over in [o for m in []]:
        pass
    view_evidence = [{"id": "full-object", "view": "primary", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
                      "observations": ["studio white background, rear-left 3/4 of the chair"], "confidence": 0.85}]
    for ref in sorted(used | set(regions)):
        if ref not in regions:
            raise SystemExit(f"evidence ref without a region: {ref}")
        x, y, rw, rh = regions[ref]
        view_evidence.append({
            "id": ref,
            "view": "rear-right-3/4" if "chair-left" in ref else "rear-left-3/4",
            "imageRegion": {"x": x, "y": y, "width": rw, "height": rh, "units": "normalized"},
            "observations": [], "confidence": 0.7,
        })
    spec["viewEvidence"] = view_evidence

    # --- Materials ----------------------------------------------------------------------
    def material(mid, name, registry, colour, roughness, overrides, notes, normal_strength, bands):
        return {
            "id": mid, "name": name, "type": "physical", "shaderModel": "MeshPhysicalMaterial",
            "materialProfileId": registry,
            "baseColor": colour["median"], "color": colour["median"],
            "albedo": {"dominant": colour["median"], "secondary": [colour["dark"], colour["light"]],
                       "samplingNotes": f"Sampled from reference pixels ({colour['samples']} px): median / 20th / 80th luma percentile."},
            "colorVariation": {"palette": [colour["median"], colour["dark"], colour["light"]], "pattern": "grain" if mid.startswith("teak") else "mottled",
                               "amplitude": 0.12, "heightCorrelation": 0.3},
            "textureResolution": 1024,
            "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8,
                                  "texelDensityIntent": "Stable object-scale detail."},
            "surfaceFrequencyBands": bands,
            "roughness": {"base": roughness, "variation": 0.08, "map": "independent-procedural-field",
                          "localResponse": "see localOverrides"},
            "metalness": {"base": 0.0, "variation": 0.0},
            "normal": {"pattern": "derived-from-independent-height-field", "strength": normal_strength, "scale": 24.0, "space": "tangent"},
            "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
            "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": False},
            "ambientOcclusion": {"cavityStrength": 0.3, "contactShadowBias": 0.35, "notes": "Darken joints and lattice crossings."},
            "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
            "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"},
            "localOverrides": overrides,
            "shaderNotes": notes,
        }

    spec["materials"] = [
        material("teak-satin", "Satin teak", "wood.unfinished", palette["teak"], 0.52, [
            {"id": "upward-face-sheen", "kind": "gloss", "region": "upward-facing faces of rails and armrests",
             "roughness": 0.28, "evidenceRef": "reference/chair-right.png#rear-top-rail"},
            {"id": "longitudinal-grain", "kind": "linework", "region": "all teak members, along the member axis",
             "albedoShift": -0.08, "pattern": "straight grain lines", "evidenceRef": "analysis/detail-inventory/zone-r0c2.png"},
        ], ["Satin wood: MeshPhysicalMaterial, low clearcoat 0.15, anisotropy along grain."], 0.25, [
            {"id": "macro", "frequency": 2.0, "amplitude": 0.18, "role": "board-to-board tone variation"},
            {"id": "meso", "frequency": 18.0, "amplitude": 0.12, "role": "longitudinal grain lines"},
            {"id": "micro", "frequency": 90.0, "amplitude": 0.05, "role": "pore breakup under grazing light"},
        ]),
        material("rope-braided", "Braided outdoor rope", "fabric.woven-matte", palette["rope"], 0.86, [
            {"id": "braid-twist-relief", "kind": "ridge", "region": "every rope strand, helical along the strand",
             "normalStrength": 0.6, "pattern": "helical braid, 3 plies", "evidenceRef": "analysis/detail-inventory/zone-r1c1.png"},
        ], ["Matte fibre: no clearcoat, sheen 0.2 for fibre highlight."], 0.55, [
            {"id": "macro", "frequency": 1.5, "amplitude": 0.1, "role": "dye tone variation across runs"},
            {"id": "meso", "frequency": 40.0, "amplitude": 0.3, "role": "braid ply ridges"},
            {"id": "micro", "frequency": 160.0, "amplitude": 0.08, "role": "fibre fuzz"},
        ]),
        material("cushion-fabric", "Slub outdoor upholstery", "fabric.woven-matte", palette["cushion"], 0.93, [
            {"id": "slub-flecks", "kind": "stain", "region": "cushion faces", "dirtAmount": 0.12, "cavityBias": 0.0,
             "pattern": "sparse darker slub flecks", "evidenceRef": "reference/chair-right.png#back-cushion"},
        ], ["Matte woven fabric: sheen 0.3 with light sheenColor, no clearcoat."], 0.3, [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.08, "role": "soft fold shading"},
            {"id": "meso", "frequency": 30.0, "amplitude": 0.15, "role": "woven slub texture"},
            {"id": "micro", "frequency": 120.0, "amplitude": 0.06, "role": "yarn breakup"},
        ]),
    ]

    # Fasteners: documented as one system; members are authored micro components above.
    spec["repetitionSystems"] = [
        {"id": "rear-post-fastener-caps", "level": "micro", "parent": "seat-deck", "primitive": "sphere", "count": 4,
         "material": "teak-satin", "instanceScale": [0.016, 0.016, 0.006],
         "elementComponentIds": ["fastener-cap-left-upper", "fastener-cap-left-lower", "fastener-cap-right-upper", "fastener-cap-right-lower"],
         "placement": {"mode": "authored", "note": "2 per lateral rear post (armrest joint + bottom rail joint), mirrored."},
         "distributionRule": "bilateral mirror pair of vertical pairs", "evidenceRefs": ["analysis/detail-inventory/zone-r2c1.png"]},
        {"id": "rope-lattice-runs", "level": "meso", "parent": "seat-deck", "primitive": "tapered-sweep", "count": 6,
         "material": "rope-braided",
         "elementComponentIds": ["weave-lateral-left", "weave-lateral-left-b", "weave-lateral-right", "weave-lateral-right-b", "weave-rear", "weave-rear-b"],
         "placement": {"mode": "authored", "note": "Each panel = two interlaced continuous runs (+/-45 deg). Built as tapered-sweep components because the InstancedMesh emitter only supports radial placement, not a lattice."},
         "distributionRule": "diagonal lattice, pitch 0.056 m lateral / 0.040 m rear, alternating over/under",
         "evidenceRefs": ["analysis/detail-inventory/zone-r1c1.png"]},
    ]

    # --- Review targets, passes, runtime ----------------------------------------------------
    spec["featureReviewTargets"] = [
        {"id": "overall-silhouette", "name": "Splayed + reclined seat box on an open swivel ring", "tier": "critical",
         "passIds": ["blockout", "structural-pass", "form-refinement"], "minimumScore": 0.8, "mustPass": True,
         "componentRefs": ["seat-deck", "base-ring", "rear-top-rail", "cushion-back"], "evidenceRefs": ["reference/chair-right.png", "reference/chair-left.png"]},
        {"id": "weave-lattice", "name": "See-through interlaced rope lattice", "tier": "critical",
         "passIds": ["structural-pass", "form-refinement", "material-pass"], "minimumScore": 0.75, "mustPass": True,
         "componentRefs": ["weave-lateral-left", "weave-lateral-right", "weave-rear"], "evidenceRefs": ["analysis/detail-inventory/zone-r1c1.png"]},
        {"id": "frame-joinery", "name": "Teak frame members meet at joints with splay and recline", "tier": "critical",
         "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.75, "mustPass": True,
         "componentRefs": ["lateral-rear-post-left", "rear-stile-left", "rear-top-rail", "armrest-left"], "evidenceRefs": ["analysis/detail-inventory/zone-r0c2.png"]},
        {"id": "back-cushion-crown", "name": "Back cushion rises above the rear rail", "tier": "important",
         "passIds": ["blockout", "form-refinement"], "minimumScore": 0.7, "mustPass": False,
         "componentRefs": ["cushion-back", "cushion-seat"], "evidenceRefs": ["reference/chair-right.png#back-cushion"]},
        {"id": "material-palette", "name": "Satin teak / matte rope / matte beige fabric", "tier": "important",
         "passIds": ["material-pass", "surface-pass", "lighting-pass"], "minimumScore": 0.7, "mustPass": False,
         "componentRefs": ["rear-top-rail", "weave-lateral-left", "cushion-back"], "evidenceRefs": ["reference/chair-right.png"]},
    ]
    all_ids = [c["id"] for c in comps]
    for build_pass in spec["buildPasses"]:
        build_pass["componentRefs"] = all_ids

    spec["qualityContract"] = assessment["qualityContract"]
    spec["preSpecAssessment"] = assessment["preSpecAssessment"]
    spec["suitability"] = "conditional"
    spec["scores"] = {"object_isolation": 3, "silhouette_readability": 3, "depth_inference": 2,
                      "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 2, "interaction_fit": 3}
    spec["coordinateFrame"] = {"front": "+Z (direction a seated person faces)", "up": "+Y", "left": "+X (chair's own left)",
                               "units": "meters", "origin": "floor, under the swivel axis",
                               "scaleReference": "overall height 0.86 m (class convention for a deep swivel lounge chair; inferred)"}
    spec["assumptions"] = [
        "Real-world scale inferred from class convention (H 0.86 m); proportions measured from the reference.",
        "Front face, seat deck, front apron rail and swivel mechanism are hidden and inferred.",
        "Rear weave motif (stacked chevron loops) approximated by a denser interlaced lattice.",
    ]
    spec["assumptions"] += ["Resolved unknown -> " + u for u in spec["preSpecAssessment"].get("resolvedUnknowns", [])]
    spec["qualityTargets"]["reviewViewpoints"] = ["rear-left-3/4 (chair-right.png azimuth)", "rear-right-3/4 (chair-left.png azimuth)", "side elevation", "front 3/4 (inferred, no reference)"]
    spec["performanceBudget"].update({"qualityPriority": "real-time-web", "targetTriangles": 60000, "maxDrawCalls": 60, "fpsTarget": 60,
                                      "optimizationPolicy": "Interactive /capabilities prop: standard tessellation tier, one draw call per member."})
    spec["animationAnchors"] = [
        "seat-deck pivot at the swivel axis: rotate about +Y to swivel the whole upper chair (frame, weave, cushions).",
        "base-ring stays static on the floor.",
    ]
    spec["destructionAnchors"] = [
        "Exploded view by actionProfile.destruction.fractureGroup: base, frame, weave, cushions.",
        "Per-component actionProfile.destruction.explodeVector gives the separation direction (meters) for the /capabilities scroll animation.",
    ]
    spec["proceduralStrategy"] = [
        "Primitives + lathe + extrude for the teak frame; every member is solved from its two world endpoints so splay and recline joints meet.",
        "Tapered-sweep zig-zag runs for the interlaced rope: one continuous run per direction per panel, +/- offset about the panel plane at each crossing.",
        "Subdivided (Catmull-Clark) box cages for the cushions.",
        "Generator gap: the InstancedMesh repetition emitter supports radial placement only, so the lattice is authored as tapered-sweep components.",
    ]
    spec["lightingFromPhoto"] = [
        {"id": "key", "type": "area/softbox", "role": "key", "direction": "upper front-left of the camera, ~45 deg elevation",
         "intensity": 2.4, "color": "#FFF8F0", "softness": "large source, soft shadow edges",
         "evidence": "lit teak faces #9F6A42 vs shadowed teak faces #6E4529 (ratio ~0.68): soft key with strong fill"},
        {"id": "fill", "type": "area/bounce", "role": "fill", "direction": "camera right, near eye level",
         "intensity": 1.1, "color": "#FFFFFF", "softness": "very broad",
         "evidence": "shadow sides of posts keep readable grain; no crushed blacks"},
        {"id": "top", "type": "area", "role": "rim/top", "direction": "overhead",
         "intensity": 0.8, "color": "#FFFFFF", "softness": "broad",
         "evidence": "bright crowns on cushion tops and armrest upper faces"},
        {"id": "environment", "type": "environment", "role": "environment", "direction": "white seamless cyclorama",
         "intensity": 1.0, "color": "#FFFFFF", "exposure": 1.0, "toneMapping": "ACESFilmic",
         "evidence": "pure white background and floor, soft floor bounce"},
        {"id": "contact-shadow", "type": "shadow", "role": "contact-shadow", "direction": "straight down under the base ring",
         "intensity": 0.35, "color": "#000000", "softness": "blur radius ~0.08 m",
         "evidence": "soft low-opacity contact shadow on the ground under the swivel ring (zone r2c1)"},
    ]

    spec["risks"] = [
        {"id": "hidden-front", "risk": "Front 3/4 view has no reference; front posts/apron inferred.", "mitigation": "Default camera on the rear 3/4 azimuth that matches the reference."},
        {"id": "rear-motif", "risk": "Rear chevron loop motif approximated.", "mitigation": "Denser pitch keeps the openings small and dark as in the reference."},
    ]

    SPEC_PATH.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    tris = sum(len(c["geometryDescriptor"].get("taperedSweep", {}).get("stations", [])) * 7 * 2 for c in comps)
    print(f"spec written: {len(comps)} components, palette={ {k: v['median'] for k, v in palette.items()} }, weave tris~{tris}")


if __name__ == "__main__":
    build()
