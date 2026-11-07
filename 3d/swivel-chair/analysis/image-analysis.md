# Image analysis — Swivel lounge chair (BFC set 3BFC1514)

Source: `frontend/public/Assets/img3js/3BFC1514-1.png` (2390x1792, studio white background, 4-piece set).
Working references (cropped, alpha composited over white):

- `reference/chair-right.png` — right chair of the set. Shows the **rear panel + the chair's LEFT lateral panel**, azimuth ≈ rear-left 3/4, camera slightly above seat height.
- `reference/chair-left.png` — left chair of the set, mirror twin. Shows the **rear panel + the chair's RIGHT lateral panel**, azimuth ≈ rear-right 3/4.

Object frame used below: forward `+Z` = the direction a seated person faces, `+Y` up, chair's own left = `+X`.
Because the chair is bilaterally symmetric, the two crops are two azimuths (≈ ±45° around the rear) of the same object.

## Layer 1 — Identification & classification

- Observation: a single upholstered armchair on a circular floor ring; frame in a mid-value warm brown wood with visible straight grain; open diagonal rope lattice filling the side and back frames; two loose light-beige cushions.
- Work type: **swivel lounge chair** (club-style outdoor armchair). Broad class: furnishing / seating.
- `primaryDomain`: `object`. Confidence 0.93.
- Inference: frame is teak (company material family, honey tone + straight grain), weave is outdoor-grade braided rope — marked as inference, not observed.

## Layer 2 — Overall form & silhouette

- Bounding volume: an **inverted truncated-pyramid box** (top footprint wider than bottom) sitting on a short **circular pedestal ring**, plus a tall back cushion protruding above the rear frame.
- Symmetry: **bilateral** about the X=0 plane. Radial symmetry only in the base ring.
- Shape language: geometric/rectilinear frame with one organic accent — the armrest is a swept curve.
- Proportions (relative to overall height H = floor → top of back cushion, measured on `chair-right.png` along the rear corner post, perspective-corrected by eye — inference ±10%):
  - floor → top of base ring ≈ 0.06 H
  - floor → underside of seat box (swivel gap) ≈ 0.12 H
  - floor → armrest top at rear post ≈ 0.55 H
  - floor → rear frame top rail ≈ 0.80 H
  - back cushion top = 1.00 H
  - overall width ≈ 0.95 H at armrest level, ≈ 0.80 H at the bottom rail (splay)
  - base ring outer diameter ≈ 0.72 H, ring section ≈ 0.045 H
- Real-world scale (inference, typical for this class): H ≈ 0.86 m, W ≈ 0.82 m, D ≈ 0.86 m.

## Layer 3 — Macro → meso → micro

Macro assemblies (independent, each an exploded-view part):

1. `swivel-base` — floor ring + inner cross stretchers + central swivel plate (plate hidden).
2. `seat-box-frame` — the teak frame: 4 corner posts, bottom rails, rear top rail, two armrests.
3. `weave-panels` — rear weave panel, left lateral weave panel, right lateral weave panel.
4. `cushions` — seat cushion, back cushion.

Meso sub-assemblies:

- base: ring (torus-like, rounded-square section), 2 crossed stretchers, swivel plate.
- frame: rear panel frame (top rail with outer "ear" overhang, 2 rear posts, bottom rail); lateral frames ×2 (armrest, front post, rear post shared, bottom rail).
- weave: lattice field per panel; rope perimeter wrap along the inner frame edge.
- cushions: back cushion (rounded top crown, soft bulge), seat cushion (box cushion).

Micro feature groups:

- fastener caps at armrest ↔ rear-post junction (one each side).
- eased/rounded wood edges on every rail (radius ≈ 3–5 mm, inference).
- rope braid twist visible on each strand.
- slub flecks in the cushion fabric.

## Layer 4 — Spatial relationships

- `<seat-box-frame, rests-on, swivel-base>` — contact: socket (swivel plate under the bottom rails; plate occluded).
- `<swivel-base.ring, rests-on, floor>` — butt.
- `<rear-weave-panel, embedded-in, rear-panel-frame>` — embed, recessed ≈ 1 rope diameter behind the outer frame face.
- `<lateral-weave-panel, embedded-in, lateral-frame>` — embed, same recess.
- `<armrest, attached-to, rear-post (top)>` and `<armrest, attached-to, front-post (top)>` — overlap joint; armrest overhangs the lateral panel outward.
- `<rear-top-rail, above, back-cushion-lower-half>`; `<back-cushion, leans-on, rear-weave-panel (inner face)>`.
- `<seat-cushion, rests-on, seat-deck>` — deck hidden; visible through the lateral lattice.
- The rear frame is **reclined** (top tilts toward −Z by ≈ 12–15°, inference) and the lateral frames **splay outward** (top wider by ≈ 6–8°).

## Layer 5 — Materials & surface (PBR)

| Region | Albedo (observed) | Metalness | Roughness | Relief / notes |
|---|---|---|---|---|
| teak frame | warm honey-brown, mid value | 0 | ≈ 0.55 (satin, broad soft highlight on rail tops) | straight longitudinal grain, eased edges |
| rope weave | mid-dark brown with lighter strand highlights | 0 | ≈ 0.85 (matte) | braided/twisted strands, strong self-shadowing between crossings |
| cushion fabric | light warm beige | 0 | ≈ 0.92 (matte) | fine woven texture, sparse darker slub flecks |
| base ring | same teak as frame | 0 | ≈ 0.55 | turned/bent round profile |

Opaque everywhere. The weave is an **open** lattice: background and cushion are visible through the diamond openings on the lateral panels.

## Layer 6 — Color & finish

- Teak: hue ≈ 28–32°, mid value, moderate saturation; finish **satin**; darker hue along end grain and in corner shadows (lighting, not albedo).
- Rope: hue ≈ 25–30°, low-mid value, low-moderate saturation; two-tone per strand (lighter crown, darker flank) — a relief effect, the albedo is one mid-dark brown.
- Cushion: hue ≈ 35–40°, high value, low saturation; finish **matte**.
- Exact stops to be extracted from pixels by `analyze_texture.py` / `extract_pbr_evidence.py`, not guessed.

## Layer 7 — Identity-defining features

1. Open **diamond-lattice rope weave** on both lateral panels (see-through).
2. **Denser scale/chevron weave** on the rear panel (smaller openings than the sides).
3. **Swept, outward-flaring armrest** that overhangs its lateral panel.
4. **Splayed + reclined seat box** (inverted truncated pyramid silhouette).
5. **Circular teak swivel ring base** with a visible gap under the seat box and crossed inner stretchers.
6. Rear top rail **"ear" overhang** past the outer corner posts.
7. **Back cushion rising well above** the rear frame; loose seat cushion.
8. Fastener caps at the armrest ↔ rear-post joint.

## Layer 8 — Uncertainty & single-image limits

- **Hidden:** the entire front face (seat front edge, front posts' inner faces, whether a front apron rail exists below the seat cushion).
- **Hidden:** the swivel mechanism / plate under the seat box and how the stretchers meet it.
- **Occluded:** inner faces of all three weave panels; the seat deck under the cushion.
- **Uncertain:** exact recline and splay angles (single perspective view); exact armrest front termination (only the far armrest end is partly visible).
- **Uncertain:** rear panel weave motif — reads as a denser scale pattern, but the rope count cannot be resolved per strand at this resolution.
- **Needs another view** for a faithful front: a front 3/4 photo of the same model.
- Clutter in the crops (sofa corner, coffee-table edge) is not part of the subject.
