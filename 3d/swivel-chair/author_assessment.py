"""Điền pre-spec assessment cho ghế xoay từ analysis/image-analysis.md.

Các script forge chỉ dựng khung (primaryType = "unassessed", điểm = 0, detailInventory rỗng);
các giá trị dưới đây là phần đánh giá bằng mắt từ ảnh tham chiếu, không phải mặc định.
Chạy lại sau new_pre_spec_assessment.py:  python author_assessment.py
"""
import json
from pathlib import Path

WS = Path(__file__).resolve().parent
PATH = WS / "assessment.json"

doc = json.loads(PATH.read_text(encoding="utf-8"))
psa = doc["preSpecAssessment"]

psa["objectClass"] = {
    "primaryType": "swivel lounge chair",
    "primaryDomain": "object",
    "formLanguage": ["hard-surface", "architectural", "fabric-like"],
    "structureKind": ["compound object", "articulated assembly", "repeated modules"],
    "motionPotential": ["whole-object transform", "articulated", "detachable"],
    "materialFamilies": ["wood", "cloth", "mixed"],
    "notes": (
        "Club-style outdoor armchair: splayed + reclined teak box frame on a circular swivel ring, "
        "open diagonal rope lattice in the rear and both lateral frames, two loose cushions. "
        "Bilaterally symmetric about X=0; the set photo shows a mirrored pair, i.e. two rear 3/4 azimuths."
    ),
}

psa["complexity"] = {
    "tier": "complex",
    "scores": {
        "silhouetteComplexity": 2,   # splayed/reclined box + swept armrest + open lattice negative space
        "componentCount": 3,         # ~25 visible parts
        "hierarchyDepth": 2,         # base / seat box / frame members + weave + cushions
        "repetitionDensity": 3,      # hundreds of rope crossings across 3 panels
        "materialLayerCount": 2,     # teak, rope, cushion fabric (+ fastener plugs)
        "localDetailDensity": 2,     # grain, braid twist, slub flecks, eased edges, plugs
        "occlusionRisk": 2,          # front face, seat deck and swivel mechanism hidden
        "actionReadinessNeed": 2,    # swivel about Y + 4 explode groups
    },
    "estimatedCounts": {
        "macroComponents": 3,
        "mesoComponents": 18,
        "microFeatureGroups": 6,
        "materialLayers": 3,
        "repetitionSystems": 2,
    },
    "reasoning": [
        "Repetition density drives the tier: the lateral and rear lattices hold several hundred rope "
        "crossings, and their over/under interlacing and see-through openings are identity-defining.",
        "Structure is a compound hard-surface assembly (~11 teak members) whose splay and recline "
        "must be preserved from two rear 3/4 azimuths.",
        "Three distinct PBR responses (satin wood, matte braided rope, matte slub fabric) plus local "
        "overrides (rail-top sheen, grain, braid relief, flecks).",
        "Swivel rotation and a 4-group exploded view are required by the intended /capabilities use.",
    ],
}

psa["specDepthDecision"]["rationale"] = (
    "complex: deep enough for per-member teak frame parts, three procedural weave panels with "
    "interlaced strands, cushions and a swivel base, each tagged to an explode group."
)

psa["unknownsToResolveBeforeImplementation"] = []
# Mỗi ẩn số dưới đây ĐÃ được quyết định bằng suy luận có ghi độ tin cậy (không còn chặn triển khai);
# giữ nguyên văn để truy vết và báo cáo độ tin cậy theo vùng.
psa["resolvedUnknowns"] = [
    "HIDDEN front-face (conf 0.40): seat front edge, front posts' inner faces and a possible front apron rail are not visible in either view; inferred from class convention.",
    "HIDDEN swivel-mechanism (conf 0.35): swivel plate and stretcher-to-plate joint under the seat box; inferred as a disc on crossed stretchers.",
    "UNCERTAIN recline-splay-angles (conf 0.55): recline ~12 deg and splay ~6 deg estimated from perspective views, not an elevation.",
    "UNCERTAIN rear-weave-motif (conf 0.50): rear panel is stacked chevron rope loops (zone r1c1); modelled as a denser interlaced lattice.",
    "OCCLUDED armrest-front-termination (conf 0.55): only the far armrest front end is partly visible; square end with small forward overhang assumed.",
]

# Mỗi detail PHẢI trỏ tới component/localFeature hoặc material/localOverride có thật trong spec
# (author_spec.py tạo đúng các id này).
psa["detailInventory"]["scanMethod"] = "component-zones"
psa["detailInventory"]["details"] = [
    {"id": "d01-lateral-lattice-openings", "kind": "hole", "region": {"x": 0.08, "y": 0.30, "w": 0.48, "h": 0.40},
     "affects": ["silhouette", "negative-space"], "scale": "meso",
     "description": "Diamond openings between diagonal rope strands on the lateral panel; cushion and background visible through them.",
     "evidenceRef": "reference/chair-right.png#lateral-panel", "confidence": 0.9,
     "mapsTo": {"type": "component.localFeatures", "ref": "weave-lateral-left/lattice-openings"}},
    {"id": "d02-rope-over-under", "kind": "ridge", "region": {"x": 0.10, "y": 0.32, "w": 0.45, "h": 0.36},
     "affects": ["relief", "self-shadowing"], "scale": "meso",
     "description": "Strands alternate over/under at each crossing, producing raised crowns and shadowed dips.",
     "evidenceRef": "reference/chair-right.png#lateral-panel", "confidence": 0.8,
     "mapsTo": {"type": "component.localFeatures", "ref": "weave-lateral-left/over-under-interlace"}},
    {"id": "d03-rear-dense-weave", "kind": "ridge", "region": {"x": 0.52, "y": 0.18, "w": 0.38, "h": 0.48},
     "affects": ["relief", "negative-space"], "scale": "meso",
     "description": "Rear panel uses a DIFFERENT motif from the sides (zone r1c1 close-up): stacked rows of V-shaped rope loops (chevron/fish-scale) with small crescent openings. Modelled as a denser interlaced lattice - a documented approximation.",
     "evidenceRef": "reference/chair-right.png#rear-panel", "confidence": 0.6,
     "mapsTo": {"type": "component.localFeatures", "ref": "weave-rear/dense-lattice"}},
    {"id": "d04-braid-twist", "kind": "ridge", "region": {"x": 0.10, "y": 0.30, "w": 0.80, "h": 0.40},
     "affects": ["normal", "roughness"], "scale": "micro",
     "description": "Each rope strand shows a braided/twisted helical relief with lighter crowns.",
     "evidenceRef": "reference/chair-left.png#rear-panel", "confidence": 0.7,
     "mapsTo": {"type": "material.localOverrides", "ref": "rope-braided/braid-twist-relief"}},
    {"id": "d05-armrest-sweep", "kind": "contour", "region": {"x": 0.05, "y": 0.26, "w": 0.58, "h": 0.07},
     "affects": ["silhouette"], "scale": "macro",
     "description": "Armrest top edge dips slightly mid-length and overhangs the lateral panel outward.",
     "evidenceRef": "reference/chair-right.png#armrest", "confidence": 0.75,
     "mapsTo": {"type": "component.localFeatures", "ref": "armrest-left/concave-sweep"}},
    {"id": "d06-armrest-rear-protrusion", "kind": "contour", "region": {"x": 0.90, "y": 0.14, "w": 0.08, "h": 0.06},
     "affects": ["silhouette"], "scale": "micro",
     "description": "Close-up zone r0c2: the lateral frame (its rear post + armrest) sits OUTSIDE the rear frame, so the armrest's round-ended rear stub protrudes behind the rear panel. Earlier read as a top-rail 'ear' - corrected.",
     "evidenceRef": "analysis/detail-inventory/zone-r0c2.png", "confidence": 0.8,
     "mapsTo": {"type": "component.localFeatures", "ref": "armrest-left/rear-end-protrusion"}},
    {"id": "d13-rear-frame-rounded-corners", "kind": "contour", "region": {"x": 0.60, "y": 0.08, "w": 0.35, "h": 0.14},
     "affects": ["silhouette"], "scale": "meso",
     "description": "Rear top rail meets the rear stiles with a large outer corner radius.",
     "evidenceRef": "analysis/detail-inventory/zone-r0c2.png", "confidence": 0.75,
     "mapsTo": {"type": "component.localFeatures", "ref": "rear-top-rail/rounded-outer-corners"}},
    {"id": "d07-eased-edges", "kind": "bevel", "region": {"x": 0.45, "y": 0.10, "w": 0.45, "h": 0.65},
     "affects": ["highlight"], "scale": "micro",
     "description": "Every teak rail and post has softly eased edges catching a thin highlight.",
     "evidenceRef": "reference/chair-right.png#rear-post", "confidence": 0.7,
     "mapsTo": {"type": "component.localFeatures", "ref": "lateral-rear-post-left/eased-edges"}},
    {"id": "d08-rail-top-sheen", "kind": "gloss", "region": {"x": 0.62, "y": 0.09, "w": 0.30, "h": 0.05},
     "affects": ["roughness"], "scale": "meso",
     "description": "Satin sheen band on upward-facing teak surfaces (rail tops, armrest tops).",
     "evidenceRef": "reference/chair-right.png#rear-top-rail", "confidence": 0.7,
     "mapsTo": {"type": "material.localOverrides", "ref": "teak-satin/upward-face-sheen"}},
    {"id": "d09-teak-grain", "kind": "linework", "region": {"x": 0.45, "y": 0.10, "w": 0.45, "h": 0.65},
     "affects": ["albedo"], "scale": "micro",
     "description": "Straight longitudinal grain lines along every member, slightly darker than the base honey tone.",
     "evidenceRef": "reference/chair-left.png#rear-post", "confidence": 0.65,
     "mapsTo": {"type": "material.localOverrides", "ref": "teak-satin/longitudinal-grain"}},
    {"id": "d10-fastener-plugs", "kind": "fastener", "region": {"x": 0.55, "y": 0.30, "w": 0.04, "h": 0.03},
     "affects": ["silhouette", "albedo"], "scale": "micro",
     "description": "Small round fastener caps on the lateral rear post: one at the armrest joint and one at the bottom-rail joint (zone r2c1), per side - 4 in total.",
     "evidenceRef": "reference/chair-right.png#armrest-joint", "confidence": 0.7,
     "mapsTo": {"type": "component", "ref": "fastener-cap-left-upper"}},
    {"id": "d11-cushion-slub", "kind": "stain", "region": {"x": 0.47, "y": 0.04, "w": 0.40, "h": 0.25},
     "affects": ["albedo"], "scale": "micro",
     "description": "Sparse darker slub flecks in the light beige cushion weave.",
     "evidenceRef": "reference/chair-right.png#back-cushion", "confidence": 0.6,
     "mapsTo": {"type": "material.localOverrides", "ref": "cushion-fabric/slub-flecks"}},
    {"id": "d12-cushion-boxed-seam", "kind": "seam", "region": {"x": 0.47, "y": 0.04, "w": 0.40, "h": 0.12},
     "affects": ["relief"], "scale": "micro",
     "description": "Boxed cushion edge seam along the back cushion perimeter.",
     "evidenceRef": "reference/chair-left.png#back-cushion", "confidence": 0.55,
     "mapsTo": {"type": "component.localFeatures", "ref": "cushion-back/perimeter-seam"}},
]

doc["qualityContract"]["definitionOfDone"] = [
    "From both rear 3/4 azimuths the render reads as this chair: splayed + reclined teak box on a visible round swivel ring, back cushion rising above the rear rail.",
    "Lateral panels show see-through diamond openings with over/under interlaced rope, not a solid or textured slab.",
    "Rear panel lattice is visibly denser than the lateral lattice.",
    "Teak reads satin honey-brown with longitudinal grain; rope reads matte mid-dark brown; cushions read matte light beige.",
    "Upper assembly swivels about Y and the model separates into base / frame / weave / cushion explode groups.",
]
doc["qualityContract"]["featureGroups"] = [
    {"id": "overall-silhouette", "name": "Splayed, reclined seat box on a swivel ring", "required": True,
     "qualityCriteria": ["Top footprint wider than bottom by the splay; rear panel reclined; back cushion crown above the rear rail by ~0.14 m; ring visible below with a gap under the box."],
     "evidenceRefs": ["reference/chair-right.png", "reference/chair-left.png"],
     "failureModes": ["box reads as an upright cube", "base reads as a solid pedestal instead of an open ring"]},
    {"id": "primary-structure", "name": "Teak frame members", "required": True,
     "qualityCriteria": ["Separate posts, bottom rails, rear top rail with ears and two armrests; joints meet without gaps or floating members."],
     "evidenceRefs": ["reference/chair-right.png#rear-post"],
     "failureModes": ["frame merged into one block", "posts not following splay/recline so panels gap at the corners"]},
    {"id": "attachment-joint-correctness", "name": "Attachment and joint correctness", "required": True,
     "qualityCriteria": ["Every member, weave panel and cushion declares parent socket, local start/end, contact type and gap tolerance; weave strand ends are embedded in the frame."],
     "evidenceRefs": ["reference/chair-right.png"],
     "failureModes": ["weave floats inside the frame", "cushions intersect the frame or hover above the deck"]},
    {"id": "weave-lattice", "name": "Interlaced rope lattice", "required": True,
     "qualityCriteria": ["Diagonal strands at +/-45 deg, perpendicular pitch ~0.056 m lateral / ~0.042 m rear, strand diameter ~0.023 m, alternating over/under offsets at crossings, openings see-through."],
     "evidenceRefs": ["reference/chair-right.png#lateral-panel", "reference/chair-left.png#rear-panel"],
     "failureModes": ["panel rendered as a solid slab or flat alpha card", "strands parallel/unwoven", "pitch so tight the openings vanish"]},
    {"id": "surface-material-response", "name": "Surface material response", "required": True,
     "qualityCriteria": ["Independent albedo/roughness/normal per material; satin sheen on teak upward faces; braid relief on rope; slub flecks on cushions."],
     "evidenceRefs": ["reference/chair-right.png"],
     "failureModes": ["teak reads plastic-glossy", "rope reads as smooth tube", "cushion reads as flat grey"]},
    {"id": "reference-lookdev", "name": "Reference color and lighting response", "required": True,
     "qualityCriteria": ["Studio white-background lighting: soft key from upper front-left, low-contrast fill, soft contact shadow; palette sampled from reference pixels."],
     "evidenceRefs": ["reference/chair-right.png"],
     "failureModes": ["harsh single light with black shadows", "palette averaged into one brown"]},
]
doc["qualityContract"]["visualDeltaChecks"] = [
    "splay/recline silhouette delta from both rear 3/4 azimuths",
    "lattice opening size and pitch delta on the lateral panel",
    "rear vs lateral lattice density ratio",
    "back cushion crown height above the rear rail",
    "teak / rope / cushion albedo and roughness delta",
]

PATH.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
print("assessment filled:", len(psa["detailInventory"]["details"]), "details,", len(psa["unknownsToResolveBeforeImplementation"]), "unknowns")
