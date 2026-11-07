import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: "reference-fidelity" | "balanced";
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

type SdfVector = readonly [number, number, number];
type SdfTransform = {
  position?: SdfVector;
  translation?: SdfVector;
  rotation?: SdfVector;
  scale?: SdfVector;
};
type SdfPrimitive = {
  readonly id: string;
  readonly type: "sphere" | "capsule" | "box" | "cone" | "ellipsoid";
  readonly center?: SdfVector;
  readonly radius?: number | SdfVector;
  readonly height?: number;
  readonly size?: SdfVector;
  readonly dimensions?: SdfVector;
  readonly radii?: SdfVector;
  readonly transform?: SdfTransform;
};
type SdfOperation = {
  readonly id?: string;
  readonly output?: string;
  readonly type: "smooth-union" | "subtract" | "intersect";
  readonly left: string;
  readonly right: string;
  readonly radius?: number;
};
type SdfDescriptor = {
  readonly primitives: readonly SdfPrimitive[];
  readonly operations?: readonly SdfOperation[];
  readonly resolution: number;
  readonly bounds?: { readonly min: SdfVector; readonly max: SdfVector };
};
type SdfFunction = (point: THREE.Vector3) => number;

function sdfSphere(point: THREE.Vector3, radius: number): number {
  return point.length() - radius;
}

function sdfCapsule(
  point: THREE.Vector3,
  radius: number,
  height: number,
): number {
  const halfHeight = height * 0.5;
  const y = Math.max(-halfHeight, Math.min(halfHeight, point.y));
  return point.distanceTo(new THREE.Vector3(0, y, 0)) - radius;
}

function sdfBox(point: THREE.Vector3, size: SdfVector): number {
  const q = new THREE.Vector3(
    Math.abs(point.x),
    Math.abs(point.y),
    Math.abs(point.z),
  ).sub(new THREE.Vector3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5));
  return (
    q.clone().max(new THREE.Vector3()).length() +
    Math.min(Math.max(q.x, q.y, q.z), 0)
  );
}

function sdfCone(point: THREE.Vector3, radius: number, height: number): number {
  const halfHeight = height * 0.5;
  const taper = radius * (1 - (point.y + halfHeight) / height);
  return Math.max(
    Math.hypot(point.x, point.z) - Math.max(0, taper),
    Math.abs(point.y) - halfHeight,
  );
}

function sdfEllipsoid(point: THREE.Vector3, radii: SdfVector): number {
  const scaled = new THREE.Vector3(
    point.x / radii[0],
    point.y / radii[1],
    point.z / radii[2],
  );
  return (scaled.length() - 1) * Math.min(radii[0], radii[1], radii[2]);
}

function sdfRadii(primitive: SdfPrimitive): SdfVector {
  const radius = primitive.radius;
  if (primitive.radii) return primitive.radii;
  if (typeof radius === "number") return [radius, radius, radius];
  return radius ?? [0.5, 0.5, 0.5];
}

function smin(left: number, right: number, radius: number): number {
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

function sdfLocalPoint(
  point: THREE.Vector3,
  primitive: SdfPrimitive,
): { point: THREE.Vector3; scale: number } {
  const transform = primitive.transform;
  const translation = transform?.position ??
    transform?.translation ??
    primitive.center ?? [0, 0, 0];
  const rotation = transform?.rotation ?? [0, 0, 0];
  const scale = transform?.scale ?? [1, 1, 1];
  const local = point
    .clone()
    .sub(new THREE.Vector3(translation[0], translation[1], translation[2]));
  const inverseRotation = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]))
    .invert();
  local.applyQuaternion(inverseRotation);
  local.set(local.x / scale[0], local.y / scale[1], local.z / scale[2]);
  return { point: local, scale: Math.min(scale[0], scale[1], scale[2]) };
}

function sdfPrimitive(point: THREE.Vector3, primitive: SdfPrimitive): number {
  const local = sdfLocalPoint(point, primitive);
  let distance: number;
  switch (primitive.type) {
    case "sphere":
      distance = sdfSphere(
        local.point,
        typeof primitive.radius === "number" ? primitive.radius : 0.5,
      );
      break;
    case "capsule":
      distance = sdfCapsule(
        local.point,
        typeof primitive.radius === "number" ? primitive.radius : 0.25,
        primitive.height ?? 1,
      );
      break;
    case "box":
      distance = sdfBox(
        local.point,
        primitive.size ?? primitive.dimensions ?? [1, 1, 1],
      );
      break;
    case "cone":
      distance = sdfCone(
        local.point,
        typeof primitive.radius === "number" ? primitive.radius : 0.5,
        primitive.height ?? 1,
      );
      break;
    case "ellipsoid":
      distance = sdfEllipsoid(local.point, sdfRadii(primitive));
      break;
  }
  return distance * local.scale;
}

function sdfSample(descriptor: SdfDescriptor): SdfFunction {
  const nodes = new Map<string, SdfFunction>();
  for (const primitive of descriptor.primitives)
    nodes.set(primitive.id, (point) => sdfPrimitive(point, primitive));
  let result =
    descriptor.primitives.length > 0
      ? nodes.get(descriptor.primitives[0].id)
      : undefined;
  for (
    let index = 0;
    index < (descriptor.operations?.length ?? 0);
    index += 1
  ) {
    const operation = descriptor.operations?.[index];
    if (!operation) continue;
    const left = nodes.get(operation.left);
    const right = nodes.get(operation.right);
    if (!left || !right) continue;
    let combined: SdfFunction;
    switch (operation.type) {
      case "smooth-union":
        combined = (point) =>
          smin(left(point), right(point), operation.radius ?? 0.1);
        break;
      case "subtract":
        combined = (point) => Math.max(left(point), -right(point));
        break;
      case "intersect":
        combined = (point) => Math.max(left(point), right(point));
        break;
    }
    nodes.set(
      operation.id ?? operation.output ?? `operation-${index}`,
      combined,
    );
    result = combined;
  }
  return result ?? (() => Infinity);
}

function polygonizeSdf(descriptor: SdfDescriptor): THREE.BufferGeometry {
  // SURFACE NETS, not a voxel shell.
  //
  // This used to emit one axis-aligned quad per exposed voxel face, which is a Minecraft surface:
  // every face is axis-aligned, every edge is a 90-degree step, and the result is stair-stepped at
  // exactly the scale of the sampling grid. For a subject whose whole identity is smooth blended
  // organic form -- which is the only kind of subject anyone reaches for an implicit surface to
  // build -- that is worse than the assembled primitives it was meant to replace.
  //
  // Naive surface nets places ONE vertex per sign-changing cell, at the average of the linearly
  // interpolated crossings on that cell's edges, and joins the four cells around each crossing
  // edge into a quad. It is compact, manifold, and smooth, and it is a natural fit for a field
  // that can be sampled anywhere rather than only at corners.
  //
  // Normals come from the field GRADIENT, not from face averaging: the gradient is the exact
  // surface normal of the implicit surface, so shading no longer carries the grid's imprint.
  const resolution = Math.max(
    4,
    Math.min(64, Math.floor(descriptor.resolution)),
  );
  const defaultBounds: { readonly min: SdfVector; readonly max: SdfVector } = {
    min: [-2, -2, -2],
    max: [2, 2, 2],
  };
  const bounds = descriptor.bounds ?? defaultBounds;
  const min = new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]);
  const step = new THREE.Vector3(
    (bounds.max[0] - bounds.min[0]) / resolution,
    (bounds.max[1] - bounds.min[1]) / resolution,
    (bounds.max[2] - bounds.min[2]) / resolution,
  );
  const sample = sdfSample(descriptor);
  const scratch = new THREE.Vector3();

  // Corner grid: one more corner than cells on each axis.
  const side = resolution + 1;
  const field = new Float32Array(side * side * side);
  const cornerAt = (x: number, y: number, z: number): number =>
    (z * side + y) * side + x;
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        scratch.set(min.x + x * step.x, min.y + y * step.y, min.z + z * step.z);
        field[cornerAt(x, y, z)] = sample(scratch);
      }
    }
  }

  // The 12 cell edges as corner-offset pairs.
  const CUBE_EDGES: readonly (readonly [
    number,
    number,
    number,
    number,
    number,
    number,
  ])[] = [
    [0, 0, 0, 1, 0, 0],
    [1, 0, 0, 1, 1, 0],
    [0, 1, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1],
    [0, 0, 1, 0, 1, 1],
    [0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 1],
    [1, 1, 0, 1, 1, 1],
    [0, 1, 0, 0, 1, 1],
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const cellVertex = new Int32Array(resolution * resolution * resolution).fill(
    -1,
  );
  const cellAt = (x: number, y: number, z: number): number =>
    (z * resolution + y) * resolution + x;

  // Central-difference gradient, stepped at a fraction of a cell so it follows the field rather
  // than the grid.
  const epsilon = Math.min(step.x, step.y, step.z) * 0.25;
  const gradient = (point: THREE.Vector3): THREE.Vector3 => {
    const gx =
      sample(scratch.set(point.x + epsilon, point.y, point.z)) -
      sample(scratch.set(point.x - epsilon, point.y, point.z));
    const gy =
      sample(scratch.set(point.x, point.y + epsilon, point.z)) -
      sample(scratch.set(point.x, point.y - epsilon, point.z));
    const gz =
      sample(scratch.set(point.x, point.y, point.z + epsilon)) -
      sample(scratch.set(point.x, point.y, point.z - epsilon));
    const normal = new THREE.Vector3(gx, gy, gz);
    // A point where the field is flat has no defined normal; +Y is arbitrary but finite, and
    // leaving a zero vector would poison every lighting calculation downstream.
    return normal.lengthSq() < 1e-20
      ? new THREE.Vector3(0, 1, 0)
      : normal.normalize();
  };

  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        let crossings = 0;
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        for (const [ax, ay, az, bx, by, bz] of CUBE_EDGES) {
          const a = field[cornerAt(x + ax, y + ay, z + az)];
          const b = field[cornerAt(x + bx, y + by, z + bz)];
          if (a <= 0 === b <= 0) continue;
          const t = a / (a - b);
          sumX += ax + (bx - ax) * t;
          sumY += ay + (by - ay) * t;
          sumZ += az + (bz - az) * t;
          crossings += 1;
        }
        if (crossings === 0) continue;
        const px = min.x + (x + sumX / crossings) * step.x;
        const py = min.y + (y + sumY / crossings) * step.y;
        const pz = min.z + (z + sumZ / crossings) * step.z;
        cellVertex[cellAt(x, y, z)] = positions.length / 3;
        positions.push(px, py, pz);
        const normal = gradient(new THREE.Vector3(px, py, pz));
        normals.push(normal.x, normal.y, normal.z);
      }
    }
  }

  // One quad per sign-changing grid edge, joining the four cells that share it.
  //
  // Winding, worked out rather than guessed. For the +x edge from corner (x,y,z), the four cells
  // around it are (x, y-1, z-1), (x, y, z-1), (x, y, z), (x, y-1, z); in the (y,z) plane that
  // traversal is +y, +z, -y, whose cross product is +x. So when the corner is INSIDE and its
  // neighbour is outside, the unflipped order already faces out, and the flip belongs on the
  // opposite case. Getting this backwards is invisible in the normals -- those come from the
  // gradient and stay correct -- and shows only as back-face culling removing the front surface,
  // i.e. the model rendering as a hollow shell with its interior visible.
  const quad = (
    a: number,
    b: number,
    c: number,
    d: number,
    flip: boolean,
  ): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  // Each quad joins the FOUR cells sharing one grid edge, so every one of those cells must exist.
  // Bounding only the edge axis and the lower end of the other two let y/z reach `resolution`, which
  // is a corner index, not a cell index: `cellAt` then strides into an unrelated slot (with
  // resolution 8, `cellAt(3, 8, 1)` is 131 -- the slot for cell (3, 0, 2)) or past the end of the
  // array, where a typed-array read yields `undefined`. `undefined < 0` is false, so the guard in
  // `quad` passed it through to `setIndex`, which coerces it to 0. Measured on a sphere reaching its
  // own bounds at resolution 8: 60 out-of-range reads and 108 aliased reads. A surface that touches
  // the sampling box is therefore left OPEN at that face rather than closed with wrong triangles --
  // pad `bounds` past the surface to get a closed mesh.
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const here = field[cornerAt(x, y, z)] <= 0;
        if (
          x + 1 < side &&
          y > 0 &&
          z > 0 &&
          y < side - 1 &&
          z < side - 1 &&
          here !== field[cornerAt(x + 1, y, z)] <= 0
        ) {
          quad(
            cellVertex[cellAt(x, y - 1, z - 1)],
            cellVertex[cellAt(x, y, z - 1)],
            cellVertex[cellAt(x, y, z)],
            cellVertex[cellAt(x, y - 1, z)],
            !here,
          );
        }
        if (
          y + 1 < side &&
          x > 0 &&
          z > 0 &&
          x < side - 1 &&
          z < side - 1 &&
          here !== field[cornerAt(x, y + 1, z)] <= 0
        ) {
          quad(
            cellVertex[cellAt(x - 1, y, z - 1)],
            cellVertex[cellAt(x - 1, y, z)],
            cellVertex[cellAt(x, y, z)],
            cellVertex[cellAt(x, y, z - 1)],
            !here,
          );
        }
        if (
          z + 1 < side &&
          x > 0 &&
          y > 0 &&
          x < side - 1 &&
          y < side - 1 &&
          here !== field[cornerAt(x, y, z + 1)] <= 0
        ) {
          quad(
            cellVertex[cellAt(x - 1, y - 1, z)],
            cellVertex[cellAt(x, y - 1, z)],
            cellVertex[cellAt(x, y, z)],
            cellVertex[cellAt(x - 1, y, z)],
            !here,
          );
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(
  points: [number, number][],
  holes?: [number, number][][],
): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1)
      path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seg = 24,
): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: {
  points: [number, number][];
  depth: number;
  holes?: [number, number][][];
  ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[];
}): THREE.ExtrudeGeometry {
  const holes = [
    ...(profile.holes ?? []),
    ...(profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)),
  ];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function buildLatheGeometry(profile: {
  points: [number, number][];
  segments?: number;
}): THREE.LatheGeometry {
  const points = profile.points.map(
    ([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y),
  );
  return new THREE.LatheGeometry(points, profile.segments ?? 24);
}

function buildTubeGeometry(path: {
  points: [number, number, number][];
  radius?: number;
  radialSegments?: number;
  closed?: boolean;
}): THREE.TubeGeometry {
  const vectors = path.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(vectors, path.closed ?? false);
  const tubularSegments = Math.max(8, path.points.length * 6);
  return new THREE.TubeGeometry(
    curve,
    tubularSegments,
    path.radius ?? 0.05,
    path.radialSegments ?? 8,
    path.closed ?? false,
  );
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(
  value: unknown,
  keys: string[],
  fallback: number,
): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === "number") return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? "#" +
      hex
        .slice(1)
        .split("")
        .map((part) => part + part)
        .join("")
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized.slice(1), 16)
    : 0x8a7a5f;
  return [
    clampAlbedoChannel((value >> 16) & 255),
    clampAlbedoChannel((value >> 8) & 255),
    clampAlbedoChannel(value & 255),
  ];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0)
    return palette.filter((value) => typeof value === "string");
  const secondary = spec.albedo?.secondary;
  const colors = [
    spec.baseColor ?? spec.color ?? spec.albedo?.dominant,
    ...(Array.isArray(secondary) ? secondary : []),
  ];
  return colors.filter(
    (value): value is string =>
      typeof value === "string" && value.startsWith("#"),
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source =
    typeof spec.baseColor === "string" ? spec.baseColor : "#8A7A5F";
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(
  x: number,
  y: number,
  seed: number,
  periodX: number,
  periodY: number,
): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value =
    Math.imul(wrappedX + seed * 17, 374761393) ^
    Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(
  u: number,
  v: number,
  seed: number,
  periodX: number,
  periodY: number,
): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, tx),
    THREE.MathUtils.lerp(c, d, tx),
    ty,
  );
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands)
    ? spec.surfaceFrequencyBands
    : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === "number" ? band.frequency : 0;
    const amplitude = typeof band.amplitude === "number" ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description =
      `${String(band.pattern ?? "")} ${String(band.role ?? "")}`.toLowerCase();
    return [
      {
        frequency,
        amplitude,
        stretchX:
          typeof stretch[0] === "number" ? Math.max(0.1, stretch[0]) : 1,
        stretchY:
          typeof stretch[1] === "number" ? Math.max(0.1, stretch[1]) : 1,
        ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
      },
    ];
  });
  return parsed.length > 0
    ? parsed
    : [
        {
          frequency: 2,
          amplitude: 0.42,
          stretchX: 1,
          stretchY: 1,
          ridge: false,
        },
        {
          frequency: 12,
          amplitude: 0.22,
          stretchX: 1,
          stretchY: 1,
          ridge: false,
        },
        {
          frequency: 56,
          amplitude: 0.08,
          stretchX: 1,
          stretchY: 1,
          ridge: false,
        },
      ];
}

function sampleSurface(
  u: number,
  v: number,
  bands: SurfaceBand[],
  seed: number,
): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(
      u,
      v,
      seed + index * 1013,
      periodX,
      periodY,
    );
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(
  colors: [number, number, number][],
  value: number,
): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: "linear" | "radial";
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [
    clampAlbedoChannel(Number(match[1])),
    clampAlbedoChannel(Number(match[2])),
    clampAlbedoChannel(Number(match[3])),
  ];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(
  gradient: ColorGradientSpec,
  u: number,
  v: number,
): [number, number, number] {
  const stops =
    gradient.stops.length >= 2
      ? gradient.stops
      : [
          { offset: 0, color: "rgba(138,122,95,1)" },
          { offset: 1, color: "rgba(138,122,95,1)" },
        ];
  let t: number;
  if (gradient.type === "radial") {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(
      0.001,
      Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)),
    );
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(
  data: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection =
    spec.textureProjection && typeof spec.textureProjection === "object"
      ? spec.textureProjection
      : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === "number" ? repeat[0] : 2,
    typeof repeat[1] === "number" ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(
    1,
    Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8),
  );
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: "reference-pixel-extraction" | "procedural";
};

function referenceMapUrl(
  spec: SculptMaterialSpec,
  channel: string,
): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== "object") return null;
  if (reference.usable === false) return null;
  const confidence =
    typeof reference.confidence === "number"
      ? reference.confidence
      : typeof reference.estimatedFidelity === "number"
        ? reference.estimatedFidelity
        : 0;
  const threshold =
    typeof reference.targetThreshold === "number"
      ? reference.targetThreshold
      : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== "object") return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== "object") return null;
  const record = map as Record<string, unknown>;
  const url =
    typeof record.url === "string" && record.url.trim()
      ? record.url
      : record.path;
  return typeof url === "string" && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection =
    spec.textureProjection && typeof spec.textureProjection === "object"
      ? spec.textureProjection
      : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === "number" ? repeat[0] : 1,
    typeof repeat[1] === "number" ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(
    1,
    Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8),
  );
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, "albedo");
  const roughness = referenceMapUrl(spec, "roughness");
  const height = referenceMapUrl(spec, "height");
  const normal = referenceMapUrl(spec, "normal");
  const ao = referenceMapUrl(spec, "ao");
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(
      roughness,
      THREE.NoColorSpace,
      spec,
      options,
    ),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: "reference-pixel-extraction",
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === "undefined") return null;
  const qualityFirst =
    (options.qualityPriority ?? "reference-fidelity") === "reference-fidelity";
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize =
    typeof requested === "number" && Number.isFinite(requested)
      ? requested
      : qualityFirst
        ? 1024
        : 512;
  const size = Math.max(
    256,
    Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))),
  );
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext("2d"),
    roughness: canvases.roughness.getContext("2d"),
    height: canvases.height.getContext("2d"),
    normal: canvases.normal.getContext("2d"),
    ao: canvases.ao.getContext("2d"),
  };
  if (
    !contexts.albedo ||
    !contexts.roughness ||
    !contexts.height ||
    !contexts.normal ||
    !contexts.ao
  )
    return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback =
    typeof spec.baseColor === "string" ? spec.baseColor : "#8A7A5F";
  const colors = (
    palette.length >= 2 ? palette : [fallback, "#6E614B", "#A08F70"]
  ).map(hexToRgb);
  const baseRoughness = clamp01(
    readLayerNumber(spec.roughness, ["base"], 0.76),
  );
  const roughnessVariation = clamp01(
    readLayerNumber(spec.roughness, ["variation"], 0.18),
  );
  const colorAmplitude = clamp01(
    readLayerNumber(spec.colorVariation, ["amplitude", "variation"], 0.18),
  );
  const heightCorrelation = clamp01(
    readLayerNumber(spec.colorVariation, ["heightCorrelation"], 0.3),
  );
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(
        baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2,
      );
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 +
            (colorNoise - 0.5) * colorAmplitude * 2 +
            (height - 0.5) * heightCorrelation,
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(
    0.05,
    readLayerNumber(spec.normal, ["strength", "amplitude"], 0.35),
  );
  const aoStrength = clamp01(
    readLayerNumber(
      spec.ambientOcclusion,
      ["cavityStrength", "strength"],
      0.35,
    ),
  );
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx =
        (heightField[y * size + right] - heightField[y * size + left]) *
        normalStrength *
        6;
      const dy =
        (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage =
        (heightField[y * size + left] +
          heightField[y * size + right] +
          heightField[up + x] +
          heightField[down + x]) *
        0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(
        images.height.data,
        offset,
        heightByte,
        heightByte,
        heightByte,
      );
      writePixel(
        images.roughness.data,
        offset,
        roughnessByte,
        roughnessByte,
        roughnessByte,
      );
      writePixel(
        images.normal.data,
        offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(
      canvases.albedo,
      THREE.SRGBColorSpace,
      spec,
      options,
    ),
    roughness: createMapTexture(
      canvases.roughness,
      THREE.NoColorSpace,
      spec,
      options,
    ),
    height: createMapTexture(
      canvases.height,
      THREE.NoColorSpace,
      spec,
      options,
    ),
    normal: createMapTexture(
      canvases.normal,
      THREE.NoColorSpace,
      spec,
      options,
    ),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: "procedural",
  };
}

function createSculptMaterial(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
  denseComponent = false,
): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless =
    (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : (makeReferenceTextureSet(spec, options) ??
      makeProceduralTextureSet(id, spec, options));
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures
      ? 1
      : clamp01(readLayerNumber(spec.roughness, ["base"], 0.76)),
    metalness: clampPbrMetalness(
      readLayerNumber(spec.metalness, ["base"], 0.0),
    ),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ["base", "amount"], 0)),
    clearcoatRoughness: clamp01(
      readLayerNumber(spec.clearcoatRoughness, ["base"], 0.25),
    ),
    transmission: clamp01(
      readLayerNumber(spec.transmission, ["base", "amount"], 0),
    ),
    ior: clampPbrIor(readLayerNumber(spec.ior, ["base", "value"], 1.5)),
    thickness: Math.max(
      0,
      readLayerNumber(spec.thickness, ["base", "amount"], 0),
    ),
    attenuationDistance: Math.max(
      0.001,
      readLayerNumber(spec.attenuationDistance, ["base", "value"], Infinity),
    ),
    attenuationColor: new THREE.Color(
      typeof spec.attenuationColor === "string"
        ? spec.attenuationColor
        : "#ffffff",
    ),
    sheen: clamp01(readLayerNumber(spec.sheen, ["base", "amount"], 0)),
    sheenColor: new THREE.Color(
      typeof spec.sheenColor === "string" ? spec.sheenColor : "#ffffff",
    ),
    sheenRoughness: clamp01(
      readLayerNumber(spec.sheenRoughness, ["base"], 1.0),
    ),
    iridescence: clamp01(
      readLayerNumber(spec.iridescence, ["base", "amount"], 0),
    ),
    iridescenceIOR: clampPbrIor(
      readLayerNumber(spec.iridescenceIOR, ["base", "value"], 1.3),
    ),
    anisotropy: clamp01(
      readLayerNumber(spec.anisotropy, ["base", "amount"], 0),
    ),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ["rotation"], 0),
    specularIntensity: clampPbrF0(
      readLayerNumber(
        spec.specularF0 ?? spec.f0 ?? spec.specularIntensity,
        ["base", "value"],
        1.0,
      ),
    ),
    specularColor: new THREE.Color(
      typeof spec.specularColor === "string" ? spec.specularColor : "#ffffff",
    ),
    emissive: new THREE.Color(
      typeof spec.emissive === "string" ? spec.emissive : "#000000",
    ),
    emissiveIntensity: Math.max(
      0,
      readLayerNumber(spec.emissiveIntensity, ["base"], 1.0),
    ),
    opacity: clamp01(readLayerNumber(spec.opacity, ["base"], 1)),
    transparent:
      readLayerNumber(spec.transmission, ["base", "amount"], 0) > 0 ||
      readLayerNumber(spec.opacity, ["base"], 1) < 1,
    alphaTest: Math.max(
      0,
      readLayerNumber(spec.alpha, ["cutoff", "alphaTest"], 0),
    ),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(
      Math.max(
        0.05,
        readLayerNumber(spec.normal, ["strength", "amplitude"], 0.35),
      ),
    );
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(
      spec.ambientOcclusion,
      ["cavityStrength", "strength"],
      0.35,
    );
    const denseMesh =
      denseComponent ||
      spec.denseMesh === true ||
      spec.geometryDensity === "dense" ||
      spec.topologyClass === "dense";
    const bumpScale = Math.max(
      0,
      readLayerNumber(spec.bump, ["amplitude", "strength"], 0),
    );
    const effectiveBumpScale = denseMesh
      ? Math.max(0.05, bumpScale)
      : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(
      0,
      readLayerNumber(spec.displacement, ["amplitude", "strength"], 0),
    );
    const effectiveDisplacementScale = denseMesh
      ? Math.max(0.005, displacementScale)
      : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ["envMapIntensity"], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = {
    albedoRange: [30, 240],
    binaryMetalness: true,
    f0Range: [0.02, 1],
    iorRange: [1, 2.5],
  };
  material.userData.pbrTextureSource = textures?.source ?? "flat-fallback";
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId =
    spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews =
    spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(
  value: unknown,
  fallback: [number, number, number],
): THREE.Vector3 {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number")
  ) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(
  attachment: unknown,
): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== "object") return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(
    0.003,
    readNumber(record.endRadius, baseRadius * 0.55),
  );
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Swivel Lounge Chair
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createSwivelLoungeChairModel(
  options: ProceduralModelOptions = {},
): THREE.Group {
  const root = new THREE.Group();
  root.name = "Swivel Lounge Chair";
  root.userData.reconstructionEvidence = {
    itemFamily: null,
    subtype: null,
    componentAdapter: null,
    route: null,
    exactnessTier: null,
    referenceCamera: {
      solved: false,
      fovDegrees: 40.0,
      aspect: 1.0,
      orientation: { yaw: 0.0, pitch: 0.0, roll: 0.0 },
      positionHint: [0.0, 0.0, 3.0],
      note: "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review.",
    },
    approximationNotes: [],
  };
  root.userData.materialPipeline = {
    schemaVersion: 1,
    status: "proceed",
    registry:
      "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json",
    analysisArtifact:
      "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-analysis.json",
    targetThreshold: 0.7,
    unresolvedNotObservedMaterials: [],
    regions: [
      {
        componentId: "rear-top-rail",
        regionId: "teak-lit-face",
        specMaterialId: "teak-satin",
        profileId: "wood.unfinished",
        status: "proceed",
      },
      {
        componentId: "weave-rear",
        regionId: "rope-dense-lattice",
        specMaterialId: "rope-braided",
        profileId: "fabric.woven-matte",
        status: "proceed",
      },
      {
        componentId: "cushion-back",
        regionId: "cushion-slub-weave",
        specMaterialId: "cushion-fabric",
        profileId: "fabric.woven-matte",
        status: "proceed",
      },
    ],
    controlledViewsRequired: [
      "albedo-unlit",
      "grazing",
      "neutral-studio",
      "reference-beauty",
    ],
  };
  root.userData.materialReferenceRegistry =
    "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json";

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["teak-satin"] = createSculptMaterial(
    "teak-satin",
    {
      id: "teak-satin",
      name: "Satin teak",
      type: "physical",
      shaderModel: "MeshPhysicalMaterial",
      materialProfileId: "wood.unfinished",
      baseColor: "#9C6841",
      color: "#9C6841",
      albedo: {
        dominant: "#9C6841",
        secondary: ["#98643F", "#A16C42"],
        samplingNotes:
          "Sampled from reference pixels (1920 px): median / 20th / 80th luma percentile.",
      },
      colorVariation: {
        palette: ["#9C6841", "#98643F", "#A16C42"],
        pattern: "grain",
        amplitude: 0.12,
        heightCorrelation: 0.3,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2.0, 2.0],
        anisotropy: 8,
        texelDensityIntent: "Stable object-scale detail.",
      },
      surfaceFrequencyBands: [
        {
          id: "macro",
          frequency: 2.0,
          amplitude: 0.18,
          role: "board-to-board tone variation",
        },
        {
          id: "meso",
          frequency: 18.0,
          amplitude: 0.12,
          role: "longitudinal grain lines",
        },
        {
          id: "micro",
          frequency: 90.0,
          amplitude: 0.05,
          role: "pore breakup under grazing light",
        },
      ],
      roughness: {
        base: 0.72,
        variation: 0.08,
        map: "independent-procedural-field",
        localResponse: "see localOverrides",
      },
      metalness: { base: 0.0, variation: 0.0 },
      normal: {
        pattern: "derived-from-independent-height-field",
        strength: 0.25,
        scale: 24.0,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0.0, scale: 1.0 },
      displacement: {
        pattern: "none",
        amplitude: 0.0,
        scale: 1.0,
        silhouetteAffects: false,
      },
      ambientOcclusion: {
        cavityStrength: 0.3,
        contactShadowBias: 0.35,
        notes: "Darken joints and lattice crossings.",
      },
      wear: { edgeWear: 0.0, scratches: [], chips: [] },
      dirt: { amount: 0.0, cavityBias: 0.0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "upward-face-sheen",
          kind: "gloss",
          region: "upward-facing faces of rails and armrests",
          roughness: 0.28,
          evidenceRef: "reference/chair-right.png#rear-top-rail",
        },
        {
          id: "longitudinal-grain",
          kind: "linework",
          region: "all teak members, along the member axis",
          albedoShift: -0.08,
          pattern: "straight grain lines",
          evidenceRef: "analysis/detail-inventory/zone-r0c2.png",
        },
      ],
      shaderNotes: [
        "Satin wood: MeshPhysicalMaterial, low clearcoat 0.15, anisotropy along grain.",
      ],
      referenceMaterialId: "wood.unfinished",
      materialFamily: "wood",
      materialSubtype: "generic",
      materialFinish: "unfinished",
      materialReference: {
        registry:
          "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json",
        profileId: "wood.unfinished",
        method: "explicit-material-id",
        confidence: 1.0,
        sourceRefs: [
          "three.mesh-standard",
          "three.texture",
          "adobe.pbr-guide-1",
          "mit.material-recognition",
        ],
        requiredMaps: ["map", "roughnessMap", "normalMap"],
        optionalMaps: ["aoMap", "anisotropyMap"],
        validationViews: ["albedo-unlit", "neutral-studio", "grazing"],
      },
      anisotropy: { base: 0.12, variation: 0.0 },
      referencePbr: {
        version: "1.0",
        sourceImage:
          "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\00-teak-lit-face.png",
        extractor: "stage1_intake/extract_pbr_evidence.py",
        method:
          "single-image pixel evidence with de-lighting estimate; not photogrammetry",
        usable: true,
        verdict: "pass",
        confidence: 0.751,
        estimatedFidelity: 0.751,
        targetThreshold: 0.7,
        hardLimit:
          "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.",
        maps: {
          albedo: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-00-teak-lit-face\\teak-satin_albedo.png",
            url: "/3d/swivel-chair/maps/teak-satin_albedo.png",
            channel: "albedo",
            source: "reference-pixel-extraction",
          },
          roughness: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-00-teak-lit-face\\teak-satin_roughness.png",
            url: "/3d/swivel-chair/maps/teak-satin_roughness.png",
            channel: "roughness",
            source: "reference-pixel-extraction",
          },
          height: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-00-teak-lit-face\\teak-satin_height.png",
            url: "/3d/swivel-chair/maps/teak-satin_height.png",
            channel: "height",
            source: "reference-pixel-extraction",
          },
          normal: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-00-teak-lit-face\\teak-satin_normal.png",
            url: "/3d/swivel-chair/maps/teak-satin_normal.png",
            channel: "normal",
            source: "reference-pixel-extraction",
          },
          ao: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-00-teak-lit-face\\teak-satin_ao.png",
            url: "/3d/swivel-chair/maps/teak-satin_ao.png",
            channel: "ao",
            source: "reference-pixel-extraction",
          },
        },
        diagnostics: {
          sourceWidth: 160,
          sourceHeight: 36,
          mapSize: 512,
          cropBBoxPixels: { x: 0, y: 0, width: 160, height: 36 },
          mask: {
            backgroundColor: "#A16C43",
            backgroundNoise: 7.81,
            transparentPixelFraction: 0.0,
            foregroundCoverage: 1.0,
          },
          mapStats: {
            valueRange: 0.08,
            heightP90Gradient: 0.08247,
            roughnessBase: 0.776,
            roughnessVariation: 0.145,
            normalStrength: 0.253,
            blurRadius: 10,
          },
          palette: ["#9F6941", "#9A653F", "#A16C44", "#A46F46", "#925E3B"],
        },
        warnings: [
          "image is not clearly isolated from background; using most pixels as material evidence",
          "object/background separation is weak",
          "single-image inverse rendering cannot prove true physical PBR; confidence is capped",
          "low value range weakens height/roughness inference",
        ],
      },
      textureAnalysis: {
        finishClass: "painted-metal",
        recipe: {
          metalness: 0.0,
          roughness: 0.5,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          transmission: 0.0,
          ior: 1.5,
          envMapIntensity: 1.0,
          anisotropy: 0.0,
          procedural: "flat-clearcoat",
        },
        palette: ["#A06C42", "#9F6A40", "#9D6840", "#996440", "#9D6842"],
        paletteHueRisk: [],
        gradientAxis: "horizontal",
        stats: {
          meanLum: 116.2,
          meanSaturation: 0.587,
          gradientStrength: 0.041,
          mottle: 0.008,
          streakRatio: 1.42,
          hueSpread: 0.0,
          specularFraction: 0.0,
        },
      },
      materialEvidence: {
        componentId: "rear-top-rail",
        regionId: "teak-lit-face",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\00-teak-lit-face.png",
          bbox: { x: 0, y: 0, width: 160, height: 36 },
          sourceWidth: 160,
          sourceHeight: 36,
          loaderWarnings: [],
          coverage: 1.0,
        },
        observations: [
          "chromatic base-colour response",
          "single-image PBR inference requires controlled render validation",
        ],
        hypothesis: {
          componentId: "rear-top-rail",
          regionId: "teak-lit-face",
          materialId: "wood.unfinished",
          family: "wood",
          subtype: "generic",
          finish: "unfinished",
          aliases: [],
          confidence: 0.751,
          source: "vision",
        },
        alternatives: [],
      },
    },
    options,
  );
  materialMap["rope-braided"] = createSculptMaterial(
    "rope-braided",
    {
      id: "rope-braided",
      name: "Braided outdoor rope",
      type: "physical",
      shaderModel: "MeshPhysicalMaterial",
      materialProfileId: "fabric.woven-matte",
      baseColor: "#593F30",
      color: "#593F30",
      albedo: {
        dominant: "#593F30",
        secondary: ["#442E20", "#6D5346"],
        samplingNotes:
          "Sampled from reference pixels (56854 px): median / 20th / 80th luma percentile.",
      },
      colorVariation: {
        palette: ["#593F30", "#442E20", "#6D5346"],
        pattern: "mottled",
        amplitude: 0.12,
        heightCorrelation: 0.3,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2.0, 2.0],
        anisotropy: 8,
        texelDensityIntent: "Stable object-scale detail.",
      },
      surfaceFrequencyBands: [
        {
          id: "macro",
          frequency: 1.5,
          amplitude: 0.1,
          role: "dye tone variation across runs",
        },
        {
          id: "meso",
          frequency: 40.0,
          amplitude: 0.3,
          role: "braid ply ridges",
        },
        { id: "micro", frequency: 160.0, amplitude: 0.08, role: "fibre fuzz" },
      ],
      roughness: {
        base: 0.85,
        variation: 0.08,
        map: "independent-procedural-field",
        localResponse: "see localOverrides",
      },
      metalness: { base: 0.0, variation: 0.0 },
      normal: {
        pattern: "derived-from-independent-height-field",
        strength: 0.55,
        scale: 24.0,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0.0, scale: 1.0 },
      displacement: {
        pattern: "none",
        amplitude: 0.0,
        scale: 1.0,
        silhouetteAffects: false,
      },
      ambientOcclusion: {
        cavityStrength: 0.3,
        contactShadowBias: 0.35,
        notes: "Darken joints and lattice crossings.",
      },
      wear: { edgeWear: 0.0, scratches: [], chips: [] },
      dirt: { amount: 0.0, cavityBias: 0.0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "braid-twist-relief",
          kind: "ridge",
          region: "every rope strand, helical along the strand",
          normalStrength: 0.6,
          pattern: "helical braid, 3 plies",
          evidenceRef: "analysis/detail-inventory/zone-r1c1.png",
        },
      ],
      shaderNotes: [
        "Matte fibre: no clearcoat, sheen 0.2 for fibre highlight.",
      ],
      referenceMaterialId: "fabric.woven-matte",
      materialFamily: "fabric",
      materialSubtype: "woven",
      materialFinish: "matte",
      materialReference: {
        registry:
          "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json",
        profileId: "fabric.woven-matte",
        method: "explicit-material-id",
        confidence: 1.0,
        sourceRefs: [
          "three.mesh-physical",
          "three.texture",
          "khronos.sheen",
          "mit.material-recognition",
        ],
        requiredMaps: ["map", "roughnessMap", "normalMap"],
        optionalMaps: ["sheenColorMap", "sheenRoughnessMap", "aoMap"],
        validationViews: [
          "albedo-unlit",
          "neutral-studio",
          "grazing",
          "reference-beauty",
        ],
      },
      sheen: { base: 0.65, variation: 0.0 },
      sheenRoughness: { base: 0.75, variation: 0.0 },
      referencePbr: {
        version: "1.0",
        sourceImage:
          "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\01-rope-dense-lattice.png",
        extractor: "stage1_intake/extract_pbr_evidence.py",
        method:
          "single-image pixel evidence with de-lighting estimate; not photogrammetry",
        usable: true,
        verdict: "pass",
        confidence: 0.806,
        estimatedFidelity: 0.806,
        targetThreshold: 0.7,
        hardLimit:
          "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.",
        maps: {
          albedo: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-01-rope-dense-lattice\\rope-braided_albedo.png",
            url: "/3d/swivel-chair/maps/rope-braided_albedo.png",
            channel: "albedo",
            source: "reference-pixel-extraction",
          },
          roughness: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-01-rope-dense-lattice\\rope-braided_roughness.png",
            url: "/3d/swivel-chair/maps/rope-braided_roughness.png",
            channel: "roughness",
            source: "reference-pixel-extraction",
          },
          height: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-01-rope-dense-lattice\\rope-braided_height.png",
            url: "/3d/swivel-chair/maps/rope-braided_height.png",
            channel: "height",
            source: "reference-pixel-extraction",
          },
          normal: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-01-rope-dense-lattice\\rope-braided_normal.png",
            url: "/3d/swivel-chair/maps/rope-braided_normal.png",
            channel: "normal",
            source: "reference-pixel-extraction",
          },
          ao: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-01-rope-dense-lattice\\rope-braided_ao.png",
            url: "/3d/swivel-chair/maps/rope-braided_ao.png",
            channel: "ao",
            source: "reference-pixel-extraction",
          },
        },
        diagnostics: {
          sourceWidth: 140,
          sourceHeight: 180,
          mapSize: 512,
          cropBBoxPixels: { x: 0, y: 0, width: 140, height: 180 },
          mask: {
            backgroundColor: "#764A36",
            backgroundNoise: 46.152,
            transparentPixelFraction: 0.0,
            foregroundCoverage: 1.0,
          },
          mapStats: {
            valueRange: 0.3873,
            heightP90Gradient: 0.22794,
            roughnessBase: 0.888,
            roughnessVariation: 0.098,
            normalStrength: 0.423,
            blurRadius: 10,
          },
          palette: ["#72533E", "#5B3E2C", "#896A55", "#43291A", "#A88973"],
        },
        warnings: [
          "image is not clearly isolated from background; using most pixels as material evidence",
          "object/background separation is weak",
          "single-image inverse rendering cannot prove true physical PBR; confidence is capped",
        ],
      },
      textureAnalysis: {
        finishClass: "painted-metal",
        recipe: {
          metalness: 0.0,
          roughness: 0.5,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          transmission: 0.0,
          ior: 1.5,
          envMapIntensity: 1.0,
          anisotropy: 0.0,
          procedural: "flat-clearcoat",
        },
        palette: ["#715340", "#6E513E", "#6D513E", "#6C4F3C", "#6D4F3B"],
        paletteHueRisk: [],
        gradientAxis: "vertical",
        stats: {
          meanLum: 88.2,
          meanSaturation: 0.466,
          gradientStrength: 0.095,
          mottle: 0.131,
          streakRatio: 1.14,
          hueSpread: 0.001,
          specularFraction: 0.0,
        },
      },
      materialEvidence: {
        componentId: "weave-rear",
        regionId: "rope-dense-lattice",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\01-rope-dense-lattice.png",
          bbox: { x: 0, y: 0, width: 140, height: 180 },
          sourceWidth: 140,
          sourceHeight: 180,
          loaderWarnings: [],
          coverage: 1.0,
        },
        observations: [
          "chromatic base-colour response",
          "visible meso/micro variation",
          "single-image PBR inference requires controlled render validation",
        ],
        hypothesis: {
          componentId: "weave-rear",
          regionId: "rope-dense-lattice",
          materialId: "fabric.woven-matte",
          family: "fabric",
          subtype: "woven",
          finish: "matte",
          aliases: [],
          confidence: 0.8,
          source: "vision",
        },
        alternatives: [],
      },
    },
    options,
  );
  materialMap["cushion-fabric"] = createSculptMaterial(
    "cushion-fabric",
    {
      id: "cushion-fabric",
      name: "Slub outdoor upholstery",
      type: "physical",
      shaderModel: "MeshPhysicalMaterial",
      materialProfileId: "fabric.woven-matte",
      baseColor: "#E7E0DA",
      color: "#E7E0DA",
      albedo: {
        dominant: "#E7E0DA",
        secondary: ["#DECBBA", "#FEFEFE"],
        samplingNotes:
          "Sampled from reference pixels (20000 px): median / 20th / 80th luma percentile.",
      },
      colorVariation: {
        palette: ["#E7E0DA", "#DECBBA", "#FEFEFE"],
        pattern: "mottled",
        amplitude: 0.12,
        heightCorrelation: 0.3,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2.0, 2.0],
        anisotropy: 8,
        texelDensityIntent: "Stable object-scale detail.",
      },
      surfaceFrequencyBands: [
        {
          id: "macro",
          frequency: 1.0,
          amplitude: 0.08,
          role: "soft fold shading",
        },
        {
          id: "meso",
          frequency: 30.0,
          amplitude: 0.15,
          role: "woven slub texture",
        },
        {
          id: "micro",
          frequency: 120.0,
          amplitude: 0.06,
          role: "yarn breakup",
        },
      ],
      roughness: {
        base: 0.85,
        variation: 0.08,
        map: "independent-procedural-field",
        localResponse: "see localOverrides",
      },
      metalness: { base: 0.0, variation: 0.0 },
      normal: {
        pattern: "derived-from-independent-height-field",
        strength: 0.3,
        scale: 24.0,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0.0, scale: 1.0 },
      displacement: {
        pattern: "none",
        amplitude: 0.0,
        scale: 1.0,
        silhouetteAffects: false,
      },
      ambientOcclusion: {
        cavityStrength: 0.3,
        contactShadowBias: 0.35,
        notes: "Darken joints and lattice crossings.",
      },
      wear: { edgeWear: 0.0, scratches: [], chips: [] },
      dirt: { amount: 0.0, cavityBias: 0.0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "slub-flecks",
          kind: "stain",
          region: "cushion faces",
          dirtAmount: 0.12,
          cavityBias: 0.0,
          pattern: "sparse darker slub flecks",
          evidenceRef: "reference/chair-right.png#back-cushion",
        },
      ],
      shaderNotes: [
        "Matte woven fabric: sheen 0.3 with light sheenColor, no clearcoat.",
      ],
      referenceMaterialId: "fabric.woven-matte",
      materialFamily: "fabric",
      materialSubtype: "woven",
      materialFinish: "matte",
      materialReference: {
        registry:
          "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json",
        profileId: "fabric.woven-matte",
        method: "explicit-material-id",
        confidence: 1.0,
        sourceRefs: [
          "three.mesh-physical",
          "three.texture",
          "khronos.sheen",
          "mit.material-recognition",
        ],
        requiredMaps: ["map", "roughnessMap", "normalMap"],
        optionalMaps: ["sheenColorMap", "sheenRoughnessMap", "aoMap"],
        validationViews: [
          "albedo-unlit",
          "neutral-studio",
          "grazing",
          "reference-beauty",
        ],
      },
      sheen: { base: 0.65, variation: 0.0 },
      sheenRoughness: { base: 0.75, variation: 0.0 },
      referencePbr: {
        version: "1.0",
        sourceImage:
          "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
        extractor: "stage1_intake/extract_pbr_evidence.py",
        method:
          "single-image pixel evidence with de-lighting estimate; not photogrammetry",
        usable: true,
        verdict: "pass",
        confidence: 0.721,
        estimatedFidelity: 0.721,
        targetThreshold: 0.7,
        hardLimit:
          "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.",
        maps: {
          albedo: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_albedo.png",
            url: "/3d/swivel-chair/maps/cushion-fabric_albedo.png",
            channel: "albedo",
            source: "reference-pixel-extraction",
          },
          roughness: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_roughness.png",
            url: "/3d/swivel-chair/maps/cushion-fabric_roughness.png",
            channel: "roughness",
            source: "reference-pixel-extraction",
          },
          height: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_height.png",
            url: "/3d/swivel-chair/maps/cushion-fabric_height.png",
            channel: "height",
            source: "reference-pixel-extraction",
          },
          normal: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_normal.png",
            url: "/3d/swivel-chair/maps/cushion-fabric_normal.png",
            channel: "normal",
            source: "reference-pixel-extraction",
          },
          ao: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_ao.png",
            url: "/3d/swivel-chair/maps/cushion-fabric_ao.png",
            channel: "ao",
            source: "reference-pixel-extraction",
          },
        },
        diagnostics: {
          sourceWidth: 140,
          sourceHeight: 45,
          mapSize: 512,
          cropBBoxPixels: { x: 0, y: 0, width: 140, height: 45 },
          mask: {
            backgroundColor: "#ECE3DC",
            backgroundNoise: 45.574,
            transparentPixelFraction: 0.0,
            foregroundCoverage: 1.0,
          },
          mapStats: {
            valueRange: 0.1872,
            heightP90Gradient: 0.1159,
            roughnessBase: 0.776,
            roughnessVariation: 0.202,
            normalStrength: 0.292,
            blurRadius: 10,
          },
          palette: ["#FEFEFE", "#E8E3DD", "#E0D9D2", "#F0EAE5", "#CDC4BD"],
        },
        warnings: [
          "foreground mask is tiny; material extraction is likely unreliable",
          "image is not clearly isolated from background; using most pixels as material evidence",
          "object/background separation is weak",
          "single-image inverse rendering cannot prove true physical PBR; confidence is capped",
          "low value range weakens height/roughness inference",
        ],
      },
      textureAnalysis: {
        finishClass: "brushed-steel",
        recipe: {
          metalness: 1.0,
          roughness: 0.35,
          clearcoat: 0.0,
          clearcoatRoughness: 0.0,
          transmission: 0.0,
          ior: 1.5,
          envMapIntensity: 1.0,
          anisotropy: 1.0,
          procedural: "brushed",
        },
        palette: ["#FAFAF9", "#F5F3F1", "#ECE8E3", "#E2DCD5", "#E3DCD5"],
        paletteHueRisk: [],
        gradientAxis: "vertical",
        stats: {
          meanLum: 233.3,
          meanSaturation: 0.038,
          gradientStrength: 0.113,
          mottle: 0.024,
          streakRatio: 1.6,
          hueSpread: 0.0,
          specularFraction: 0.376,
        },
      },
      materialEvidence: {
        componentId: "cushion-back",
        regionId: "cushion-slub-weave",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
          bbox: { x: 0, y: 0, width: 140, height: 45 },
          sourceWidth: 140,
          sourceHeight: 45,
          loaderWarnings: [],
          coverage: 1.0,
        },
        observations: [
          "near-neutral colour response",
          "single-image PBR inference requires controlled render validation",
        ],
        hypothesis: {
          componentId: "cushion-back",
          regionId: "cushion-slub-weave",
          materialId: "fabric.woven-matte",
          family: "fabric",
          subtype: "woven",
          finish: "matte",
          aliases: [],
          confidence: 0.721,
          source: "vision",
        },
        alternatives: [],
      },
    },
    options,
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_base_ring_0 = makeAttachmentEndpoint(null);
  const node_base_ring_0 = new THREE.Group();
  node_base_ring_0.name = "Swivel base ring__pivot";
  node_base_ring_0.scale.set(1, 1, 1);
  if (endpoint_base_ring_0) {
    node_base_ring_0.position.copy(endpoint_base_ring_0.start);
    node_base_ring_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_base_ring_0.position.set(0.0, 0.0, 0.0);
    node_base_ring_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_base_ring_0.userData.sculptComponent = {
    id: "base-ring",
    name: "Swivel base ring",
    level: "macro",
    role: "swivel-base",
    importance: 1.0,
    confidence: 0.8,
    primitive: "lathe",
    topologyClass: "continuous-sculpt",
    topologyRationale:
      "Bent-laminated teak ring with a round section; a revolved circular profile, not a torus primitive, so it lies flat without a rotated pivot.",
    geometryDescriptor: {
      topologyIntent:
        "Bent-laminated teak ring with a round section; a revolved circular profile, not a torus primitive, so it lies flat without a rotated pivot.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      latheProfile: {
        points: [
          [0.245, 0.02],
          [0.24348, 0.02765],
          [0.23914, 0.03414],
          [0.23265, 0.03848],
          [0.225, 0.04],
          [0.21735, 0.03848],
          [0.21086, 0.03414],
          [0.20652, 0.02765],
          [0.205, 0.02],
          [0.20652, 0.01235],
          [0.21086, 0.00586],
          [0.21735, 0.00152],
          [0.225, 0.0],
          [0.23265, 0.00152],
          [0.23914, 0.00586],
          [0.24348, 0.01235],
          [0.245, 0.02],
        ],
        segments: 64,
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.8,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [
        {
          id: "swivel-plate-mount",
          localPosition: [0, 0.045, 0],
          localRotation: [0, 0, 0],
        },
      ],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.28, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "ring-rounded-section",
        kind: "contour",
        description: "Round ring section ~0.048 m, grain following the ring.",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r2c1.png"],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "base-ring",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_base_ring_0.userData.actionProfile = {
    animationRole: "swivel-base",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [
      {
        id: "swivel-plate-mount",
        localPosition: [0, 0.045, 0],
        localRotation: [0, 0, 0],
      },
    ],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "base",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, -0.28, 0],
    },
  };
  (nodes["root"] ?? root).add(node_base_ring_0);
  nodes["base-ring"] = node_base_ring_0;
  const mesh_base_ring_0Geometry = endpoint_base_ring_0
    ? new THREE.CylinderGeometry(
        endpoint_base_ring_0.endRadius,
        endpoint_base_ring_0.baseRadius,
        endpoint_base_ring_0.length,
        16,
        6,
      )
    : buildLatheGeometry({
        points: [
          [0.245, 0.02],
          [0.24348, 0.02765],
          [0.23914, 0.03414],
          [0.23265, 0.03848],
          [0.225, 0.04],
          [0.21735, 0.03848],
          [0.21086, 0.03414],
          [0.20652, 0.02765],
          [0.205, 0.02],
          [0.20652, 0.01235],
          [0.21086, 0.00586],
          [0.21735, 0.00152],
          [0.225, 0.0],
          [0.23265, 0.00152],
          [0.23914, 0.00586],
          [0.24348, 0.01235],
          [0.245, 0.02],
        ],
        segments: 64,
      });
  if (!endpoint_base_ring_0) {
    mesh_base_ring_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_base_ring_0 = new THREE.Mesh(
    mesh_base_ring_0Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_base_ring_0.name = "Swivel base ring";
  if (endpoint_base_ring_0) {
    mesh_base_ring_0.position.copy(endpoint_base_ring_0.midpoint);
    mesh_base_ring_0.quaternion.copy(endpoint_base_ring_0.quaternion);
  }
  mesh_base_ring_0.castShadow = options.castShadow ?? true;
  mesh_base_ring_0.receiveShadow = options.receiveShadow ?? true;
  mesh_base_ring_0.userData.sculptComponent = {
    id: "base-ring",
    name: "Swivel base ring",
    level: "macro",
    role: "swivel-base",
    importance: 1.0,
    confidence: 0.8,
    primitive: "lathe",
    topologyClass: "continuous-sculpt",
    topologyRationale:
      "Bent-laminated teak ring with a round section; a revolved circular profile, not a torus primitive, so it lies flat without a rotated pivot.",
    geometryDescriptor: {
      topologyIntent:
        "Bent-laminated teak ring with a round section; a revolved circular profile, not a torus primitive, so it lies flat without a rotated pivot.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      latheProfile: {
        points: [
          [0.245, 0.02],
          [0.24348, 0.02765],
          [0.23914, 0.03414],
          [0.23265, 0.03848],
          [0.225, 0.04],
          [0.21735, 0.03848],
          [0.21086, 0.03414],
          [0.20652, 0.02765],
          [0.205, 0.02],
          [0.20652, 0.01235],
          [0.21086, 0.00586],
          [0.21735, 0.00152],
          [0.225, 0.0],
          [0.23265, 0.00152],
          [0.23914, 0.00586],
          [0.24348, 0.01235],
          [0.245, 0.02],
        ],
        segments: 64,
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.8,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [
        {
          id: "swivel-plate-mount",
          localPosition: [0, 0.045, 0],
          localRotation: [0, 0, 0],
        },
      ],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.28, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "ring-rounded-section",
        kind: "contour",
        description: "Round ring section ~0.048 m, grain following the ring.",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r2c1.png"],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "base-ring",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_base_ring_0.add(mesh_base_ring_0);
  meshes["base-ring"] = mesh_base_ring_0;
  colliders["base-ring"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["base"] ??= [];
  destructionGroups["base"].push(node_base_ring_0);
  const socket_base_ring_swivel_plate_mount_0 = new THREE.Object3D();
  socket_base_ring_swivel_plate_mount_0.name = "swivel-plate-mount";
  socket_base_ring_swivel_plate_mount_0.position.set(0.0, 0.045, 0.0);
  socket_base_ring_swivel_plate_mount_0.rotation.set(0.0, 0.0, 0.0);
  socket_base_ring_swivel_plate_mount_0.userData.socket = {
    id: "swivel-plate-mount",
    localPosition: [0, 0.045, 0],
    localRotation: [0, 0, 0],
  };
  node_base_ring_0.add(socket_base_ring_swivel_plate_mount_0);
  sockets["base-ring:swivel-plate-mount"] =
    socket_base_ring_swivel_plate_mount_0;

  const endpoint_base_stretcher_a_1 = makeAttachmentEndpoint(null);
  const node_base_stretcher_a_1 = new THREE.Group();
  node_base_stretcher_a_1.name = "Base cross stretcher (+45 deg)__pivot";
  node_base_stretcher_a_1.scale.set(1, 1, 1);
  if (endpoint_base_stretcher_a_1) {
    node_base_stretcher_a_1.position.copy(endpoint_base_stretcher_a_1.start);
    node_base_stretcher_a_1.rotation.set(0.0, 0.7854, 0.0);
  } else {
    node_base_stretcher_a_1.position.set(0.0, 0.028, 0.0);
    node_base_stretcher_a_1.rotation.set(0.0, 0.7854, 0.0);
  }
  node_base_stretcher_a_1.userData.sculptComponent = {
    id: "base-stretcher-a",
    name: "Base cross stretcher (+45 deg)",
    level: "meso",
    role: "swivel-base",
    importance: 0.75,
    confidence: 0.45,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Straight teak stretcher spanning the ring interior; flat rectangular section.",
    geometryDescriptor: {
      topologyIntent:
        "Straight teak stretcher spanning the ring interior; flat rectangular section.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "base-ring",
    attachment: {
      parentSocket: "swivel-plate-mount",
      localStart: [-0.1527, 0.028, -0.1527],
      localEnd: [0.1527, 0.028, 0.1527],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.045,
      height: 0.03,
      depth: 0.432,
      units: "meters",
      confidence: 0.45,
    },
    transform: {
      position: [0, 0.028, 0],
      rotation: [0, 0.7854, 0],
      scale: [0.045, 0.03, 0.432],
    },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.28, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r2c1.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "base-stretcher-a",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_base_stretcher_a_1.userData.actionProfile = {
    animationRole: "swivel-base",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "base",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, -0.28, 0],
    },
  };
  (nodes["base-ring"] ?? root).add(node_base_stretcher_a_1);
  nodes["base-stretcher-a"] = node_base_stretcher_a_1;
  const mesh_base_stretcher_a_1Geometry = endpoint_base_stretcher_a_1
    ? new THREE.CylinderGeometry(
        endpoint_base_stretcher_a_1.endRadius,
        endpoint_base_stretcher_a_1.baseRadius,
        endpoint_base_stretcher_a_1.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_base_stretcher_a_1) {
    mesh_base_stretcher_a_1Geometry.scale(0.045, 0.03, 0.432);
  }
  const mesh_base_stretcher_a_1 = new THREE.Mesh(
    mesh_base_stretcher_a_1Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_base_stretcher_a_1.name = "Base cross stretcher (+45 deg)";
  if (endpoint_base_stretcher_a_1) {
    mesh_base_stretcher_a_1.position.copy(endpoint_base_stretcher_a_1.midpoint);
    mesh_base_stretcher_a_1.quaternion.copy(
      endpoint_base_stretcher_a_1.quaternion,
    );
  }
  mesh_base_stretcher_a_1.castShadow = options.castShadow ?? true;
  mesh_base_stretcher_a_1.receiveShadow = options.receiveShadow ?? true;
  mesh_base_stretcher_a_1.userData.sculptComponent = {
    id: "base-stretcher-a",
    name: "Base cross stretcher (+45 deg)",
    level: "meso",
    role: "swivel-base",
    importance: 0.75,
    confidence: 0.45,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Straight teak stretcher spanning the ring interior; flat rectangular section.",
    geometryDescriptor: {
      topologyIntent:
        "Straight teak stretcher spanning the ring interior; flat rectangular section.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "base-ring",
    attachment: {
      parentSocket: "swivel-plate-mount",
      localStart: [-0.1527, 0.028, -0.1527],
      localEnd: [0.1527, 0.028, 0.1527],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.045,
      height: 0.03,
      depth: 0.432,
      units: "meters",
      confidence: 0.45,
    },
    transform: {
      position: [0, 0.028, 0],
      rotation: [0, 0.7854, 0],
      scale: [0.045, 0.03, 0.432],
    },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.28, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r2c1.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "base-stretcher-a",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_base_stretcher_a_1.add(mesh_base_stretcher_a_1);
  meshes["base-stretcher-a"] = mesh_base_stretcher_a_1;
  colliders["base-stretcher-a"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["base"] ??= [];
  destructionGroups["base"].push(node_base_stretcher_a_1);

  const endpoint_base_stretcher_b_2 = makeAttachmentEndpoint(null);
  const node_base_stretcher_b_2 = new THREE.Group();
  node_base_stretcher_b_2.name = "Base cross stretcher (-45 deg)__pivot";
  node_base_stretcher_b_2.scale.set(1, 1, 1);
  if (endpoint_base_stretcher_b_2) {
    node_base_stretcher_b_2.position.copy(endpoint_base_stretcher_b_2.start);
    node_base_stretcher_b_2.rotation.set(0.0, -0.7854, 0.0);
  } else {
    node_base_stretcher_b_2.position.set(0.0, 0.028, 0.0);
    node_base_stretcher_b_2.rotation.set(0.0, -0.7854, 0.0);
  }
  node_base_stretcher_b_2.userData.sculptComponent = {
    id: "base-stretcher-b",
    name: "Base cross stretcher (-45 deg)",
    level: "meso",
    role: "swivel-base",
    importance: 0.75,
    confidence: 0.45,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Straight teak stretcher spanning the ring interior; flat rectangular section.",
    geometryDescriptor: {
      topologyIntent:
        "Straight teak stretcher spanning the ring interior; flat rectangular section.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "base-ring",
    attachment: {
      parentSocket: "swivel-plate-mount",
      localStart: [0.1527, 0.028, -0.1527],
      localEnd: [-0.1527, 0.028, 0.1527],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.045,
      height: 0.03,
      depth: 0.432,
      units: "meters",
      confidence: 0.45,
    },
    transform: {
      position: [0, 0.028, 0],
      rotation: [0, -0.7854, 0],
      scale: [0.045, 0.03, 0.432],
    },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.28, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r2c1.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "base-stretcher-b",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_base_stretcher_b_2.userData.actionProfile = {
    animationRole: "swivel-base",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "base",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, -0.28, 0],
    },
  };
  (nodes["base-ring"] ?? root).add(node_base_stretcher_b_2);
  nodes["base-stretcher-b"] = node_base_stretcher_b_2;
  const mesh_base_stretcher_b_2Geometry = endpoint_base_stretcher_b_2
    ? new THREE.CylinderGeometry(
        endpoint_base_stretcher_b_2.endRadius,
        endpoint_base_stretcher_b_2.baseRadius,
        endpoint_base_stretcher_b_2.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_base_stretcher_b_2) {
    mesh_base_stretcher_b_2Geometry.scale(0.045, 0.03, 0.432);
  }
  const mesh_base_stretcher_b_2 = new THREE.Mesh(
    mesh_base_stretcher_b_2Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_base_stretcher_b_2.name = "Base cross stretcher (-45 deg)";
  if (endpoint_base_stretcher_b_2) {
    mesh_base_stretcher_b_2.position.copy(endpoint_base_stretcher_b_2.midpoint);
    mesh_base_stretcher_b_2.quaternion.copy(
      endpoint_base_stretcher_b_2.quaternion,
    );
  }
  mesh_base_stretcher_b_2.castShadow = options.castShadow ?? true;
  mesh_base_stretcher_b_2.receiveShadow = options.receiveShadow ?? true;
  mesh_base_stretcher_b_2.userData.sculptComponent = {
    id: "base-stretcher-b",
    name: "Base cross stretcher (-45 deg)",
    level: "meso",
    role: "swivel-base",
    importance: 0.75,
    confidence: 0.45,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Straight teak stretcher spanning the ring interior; flat rectangular section.",
    geometryDescriptor: {
      topologyIntent:
        "Straight teak stretcher spanning the ring interior; flat rectangular section.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "base-ring",
    attachment: {
      parentSocket: "swivel-plate-mount",
      localStart: [0.1527, 0.028, -0.1527],
      localEnd: [-0.1527, 0.028, 0.1527],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.045,
      height: 0.03,
      depth: 0.432,
      units: "meters",
      confidence: 0.45,
    },
    transform: {
      position: [0, 0.028, 0],
      rotation: [0, -0.7854, 0],
      scale: [0.045, 0.03, 0.432],
    },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.28, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r2c1.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "base-stretcher-b",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_base_stretcher_b_2.add(mesh_base_stretcher_b_2);
  meshes["base-stretcher-b"] = mesh_base_stretcher_b_2;
  colliders["base-stretcher-b"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["base"] ??= [];
  destructionGroups["base"].push(node_base_stretcher_b_2);

  const endpoint_swivel_plate_3 = makeAttachmentEndpoint(null);
  const node_swivel_plate_3 = new THREE.Group();
  node_swivel_plate_3.name = "Swivel bearing plate__pivot";
  node_swivel_plate_3.scale.set(1, 1, 1);
  if (endpoint_swivel_plate_3) {
    node_swivel_plate_3.position.copy(endpoint_swivel_plate_3.start);
    node_swivel_plate_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_swivel_plate_3.position.set(0.0, 0.0, 0.0);
    node_swivel_plate_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_swivel_plate_3.userData.sculptComponent = {
    id: "swivel-plate",
    name: "Swivel bearing plate",
    level: "meso",
    role: "swivel-base",
    importance: 0.75,
    confidence: 0.35,
    primitive: "lathe",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Hidden disc bearing between stretchers and seat box, inferred (see unknowns: swivel-mechanism).",
    geometryDescriptor: {
      topologyIntent:
        "Hidden disc bearing between stretchers and seat box, inferred (see unknowns: swivel-mechanism).",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      latheProfile: {
        points: [
          [0.0001, 0.035],
          [0.09, 0.035],
          [0.09, 0.14],
          [0.0001, 0.14],
        ],
        segments: 40,
      },
    },
    parent: "base-ring",
    attachment: {
      parentSocket: "swivel-plate-mount",
      localStart: [0, 0.043, 0],
      localEnd: [0, 0.14, 0],
      contactType: "socket",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.35,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.14, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "swivel-plate",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751. Component is hidden; recipe taken from the visible surface of the same material.",
    },
  };
  node_swivel_plate_3.userData.actionProfile = {
    animationRole: "swivel-base",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "base",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, -0.14, 0],
    },
  };
  (nodes["base-ring"] ?? root).add(node_swivel_plate_3);
  nodes["swivel-plate"] = node_swivel_plate_3;
  const mesh_swivel_plate_3Geometry = endpoint_swivel_plate_3
    ? new THREE.CylinderGeometry(
        endpoint_swivel_plate_3.endRadius,
        endpoint_swivel_plate_3.baseRadius,
        endpoint_swivel_plate_3.length,
        16,
        6,
      )
    : buildLatheGeometry({
        points: [
          [0.0001, 0.035],
          [0.09, 0.035],
          [0.09, 0.14],
          [0.0001, 0.14],
        ],
        segments: 40,
      });
  if (!endpoint_swivel_plate_3) {
    mesh_swivel_plate_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_swivel_plate_3 = new THREE.Mesh(
    mesh_swivel_plate_3Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_swivel_plate_3.name = "Swivel bearing plate";
  if (endpoint_swivel_plate_3) {
    mesh_swivel_plate_3.position.copy(endpoint_swivel_plate_3.midpoint);
    mesh_swivel_plate_3.quaternion.copy(endpoint_swivel_plate_3.quaternion);
  }
  mesh_swivel_plate_3.castShadow = options.castShadow ?? true;
  mesh_swivel_plate_3.receiveShadow = options.receiveShadow ?? true;
  mesh_swivel_plate_3.userData.sculptComponent = {
    id: "swivel-plate",
    name: "Swivel bearing plate",
    level: "meso",
    role: "swivel-base",
    importance: 0.75,
    confidence: 0.35,
    primitive: "lathe",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Hidden disc bearing between stretchers and seat box, inferred (see unknowns: swivel-mechanism).",
    geometryDescriptor: {
      topologyIntent:
        "Hidden disc bearing between stretchers and seat box, inferred (see unknowns: swivel-mechanism).",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      latheProfile: {
        points: [
          [0.0001, 0.035],
          [0.09, 0.035],
          [0.09, 0.14],
          [0.0001, 0.14],
        ],
        segments: 40,
      },
    },
    parent: "base-ring",
    attachment: {
      parentSocket: "swivel-plate-mount",
      localStart: [0, 0.043, 0],
      localEnd: [0, 0.14, 0],
      contactType: "socket",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.35,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "swivel-base",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "base",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, -0.14, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "swivel-plate",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751. Component is hidden; recipe taken from the visible surface of the same material.",
    },
  };
  node_swivel_plate_3.add(mesh_swivel_plate_3);
  meshes["swivel-plate"] = mesh_swivel_plate_3;
  colliders["swivel-plate"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["base"] ??= [];
  destructionGroups["base"].push(node_swivel_plate_3);

  const endpoint_seat_deck_4 = makeAttachmentEndpoint(null);
  const node_seat_deck_4 = new THREE.Group();
  node_seat_deck_4.name = "Seat deck (swivel root)__pivot";
  node_seat_deck_4.scale.set(1, 1, 1);
  if (endpoint_seat_deck_4) {
    node_seat_deck_4.position.copy(endpoint_seat_deck_4.start);
    node_seat_deck_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_seat_deck_4.position.set(0.0, 0.285, 0.0);
    node_seat_deck_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_seat_deck_4.userData.sculptComponent = {
    id: "seat-deck",
    name: "Seat deck (swivel root)",
    level: "macro",
    role: "swivel-root",
    importance: 1.0,
    confidence: 0.4,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Flat structural deck under the seat cushion; hidden, carries the frame and pivots about Y on the swivel plate.",
    geometryDescriptor: {
      topologyIntent:
        "Flat structural deck under the seat cushion; hidden, carries the frame and pivots about Y on the swivel plate.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 0.5536,
      height: 0.03,
      depth: 0.5424,
      units: "meters",
      confidence: 0.4,
    },
    transform: {
      position: [0.0, 0.285, 0.0],
      rotation: [0, 0, 0],
      scale: [0.5536, 0.03, 0.5424],
    },
    actionProfile: {
      animationRole: "swivel-root",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [
        {
          id: "lateral-frame-left-mount",
          localPosition: [0.3, -0.145, 0],
          localRotation: [0, 0, 0],
        },
        {
          id: "lateral-frame-right-mount",
          localPosition: [-0.3, -0.145, 0],
          localRotation: [0, 0, 0],
        },
        {
          id: "rear-frame-mount",
          localPosition: [0, -0.145, -0.28],
          localRotation: [0, 0, 0],
        },
        {
          id: "weave-mount",
          localPosition: [0, 0, 0],
          localRotation: [0, 0, 0],
        },
        {
          id: "cushion-mount",
          localPosition: [0, 0.015, -0.0028119025909584816],
          localRotation: [0, 0, 0],
        },
      ],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/image-analysis.md#layer-8"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "seat-deck",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751. Component is hidden; recipe taken from the visible surface of the same material.",
    },
  };
  node_seat_deck_4.userData.actionProfile = {
    animationRole: "swivel-root",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [
      {
        id: "lateral-frame-left-mount",
        localPosition: [0.3, -0.145, 0],
        localRotation: [0, 0, 0],
      },
      {
        id: "lateral-frame-right-mount",
        localPosition: [-0.3, -0.145, 0],
        localRotation: [0, 0, 0],
      },
      {
        id: "rear-frame-mount",
        localPosition: [0, -0.145, -0.28],
        localRotation: [0, 0, 0],
      },
      { id: "weave-mount", localPosition: [0, 0, 0], localRotation: [0, 0, 0] },
      {
        id: "cushion-mount",
        localPosition: [0, 0.015, -0.0028119025909584816],
        localRotation: [0, 0, 0],
      },
    ],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, 0],
    },
  };
  (nodes["root"] ?? root).add(node_seat_deck_4);
  nodes["seat-deck"] = node_seat_deck_4;
  const mesh_seat_deck_4Geometry = endpoint_seat_deck_4
    ? new THREE.CylinderGeometry(
        endpoint_seat_deck_4.endRadius,
        endpoint_seat_deck_4.baseRadius,
        endpoint_seat_deck_4.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_seat_deck_4) {
    mesh_seat_deck_4Geometry.scale(0.5536, 0.03, 0.5424);
  }
  const mesh_seat_deck_4 = new THREE.Mesh(
    mesh_seat_deck_4Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_seat_deck_4.name = "Seat deck (swivel root)";
  if (endpoint_seat_deck_4) {
    mesh_seat_deck_4.position.copy(endpoint_seat_deck_4.midpoint);
    mesh_seat_deck_4.quaternion.copy(endpoint_seat_deck_4.quaternion);
  }
  mesh_seat_deck_4.castShadow = options.castShadow ?? true;
  mesh_seat_deck_4.receiveShadow = options.receiveShadow ?? true;
  mesh_seat_deck_4.userData.sculptComponent = {
    id: "seat-deck",
    name: "Seat deck (swivel root)",
    level: "macro",
    role: "swivel-root",
    importance: 1.0,
    confidence: 0.4,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Flat structural deck under the seat cushion; hidden, carries the frame and pivots about Y on the swivel plate.",
    geometryDescriptor: {
      topologyIntent:
        "Flat structural deck under the seat cushion; hidden, carries the frame and pivots about Y on the swivel plate.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 0.5536,
      height: 0.03,
      depth: 0.5424,
      units: "meters",
      confidence: 0.4,
    },
    transform: {
      position: [0.0, 0.285, 0.0],
      rotation: [0, 0, 0],
      scale: [0.5536, 0.03, 0.5424],
    },
    actionProfile: {
      animationRole: "swivel-root",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [
        {
          id: "lateral-frame-left-mount",
          localPosition: [0.3, -0.145, 0],
          localRotation: [0, 0, 0],
        },
        {
          id: "lateral-frame-right-mount",
          localPosition: [-0.3, -0.145, 0],
          localRotation: [0, 0, 0],
        },
        {
          id: "rear-frame-mount",
          localPosition: [0, -0.145, -0.28],
          localRotation: [0, 0, 0],
        },
        {
          id: "weave-mount",
          localPosition: [0, 0, 0],
          localRotation: [0, 0, 0],
        },
        {
          id: "cushion-mount",
          localPosition: [0, 0.015, -0.0028119025909584816],
          localRotation: [0, 0, 0],
        },
      ],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/image-analysis.md#layer-8"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "seat-deck",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751. Component is hidden; recipe taken from the visible surface of the same material.",
    },
  };
  node_seat_deck_4.add(mesh_seat_deck_4);
  meshes["seat-deck"] = mesh_seat_deck_4;
  colliders["seat-deck"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_seat_deck_4);
  const socket_seat_deck_lateral_frame_left_mount_0 = new THREE.Object3D();
  socket_seat_deck_lateral_frame_left_mount_0.name = "lateral-frame-left-mount";
  socket_seat_deck_lateral_frame_left_mount_0.position.set(0.3, -0.145, 0.0);
  socket_seat_deck_lateral_frame_left_mount_0.rotation.set(0.0, 0.0, 0.0);
  socket_seat_deck_lateral_frame_left_mount_0.userData.socket = {
    id: "lateral-frame-left-mount",
    localPosition: [0.3, -0.145, 0],
    localRotation: [0, 0, 0],
  };
  node_seat_deck_4.add(socket_seat_deck_lateral_frame_left_mount_0);
  sockets["seat-deck:lateral-frame-left-mount"] =
    socket_seat_deck_lateral_frame_left_mount_0;
  const socket_seat_deck_lateral_frame_right_mount_1 = new THREE.Object3D();
  socket_seat_deck_lateral_frame_right_mount_1.name =
    "lateral-frame-right-mount";
  socket_seat_deck_lateral_frame_right_mount_1.position.set(-0.3, -0.145, 0.0);
  socket_seat_deck_lateral_frame_right_mount_1.rotation.set(0.0, 0.0, 0.0);
  socket_seat_deck_lateral_frame_right_mount_1.userData.socket = {
    id: "lateral-frame-right-mount",
    localPosition: [-0.3, -0.145, 0],
    localRotation: [0, 0, 0],
  };
  node_seat_deck_4.add(socket_seat_deck_lateral_frame_right_mount_1);
  sockets["seat-deck:lateral-frame-right-mount"] =
    socket_seat_deck_lateral_frame_right_mount_1;
  const socket_seat_deck_rear_frame_mount_2 = new THREE.Object3D();
  socket_seat_deck_rear_frame_mount_2.name = "rear-frame-mount";
  socket_seat_deck_rear_frame_mount_2.position.set(0.0, -0.145, -0.28);
  socket_seat_deck_rear_frame_mount_2.rotation.set(0.0, 0.0, 0.0);
  socket_seat_deck_rear_frame_mount_2.userData.socket = {
    id: "rear-frame-mount",
    localPosition: [0, -0.145, -0.28],
    localRotation: [0, 0, 0],
  };
  node_seat_deck_4.add(socket_seat_deck_rear_frame_mount_2);
  sockets["seat-deck:rear-frame-mount"] = socket_seat_deck_rear_frame_mount_2;
  const socket_seat_deck_weave_mount_3 = new THREE.Object3D();
  socket_seat_deck_weave_mount_3.name = "weave-mount";
  socket_seat_deck_weave_mount_3.position.set(0.0, 0.0, 0.0);
  socket_seat_deck_weave_mount_3.rotation.set(0.0, 0.0, 0.0);
  socket_seat_deck_weave_mount_3.userData.socket = {
    id: "weave-mount",
    localPosition: [0, 0, 0],
    localRotation: [0, 0, 0],
  };
  node_seat_deck_4.add(socket_seat_deck_weave_mount_3);
  sockets["seat-deck:weave-mount"] = socket_seat_deck_weave_mount_3;
  const socket_seat_deck_cushion_mount_4 = new THREE.Object3D();
  socket_seat_deck_cushion_mount_4.name = "cushion-mount";
  socket_seat_deck_cushion_mount_4.position.set(
    0.0,
    0.015,
    -0.0028119025909584816,
  );
  socket_seat_deck_cushion_mount_4.rotation.set(0.0, 0.0, 0.0);
  socket_seat_deck_cushion_mount_4.userData.socket = {
    id: "cushion-mount",
    localPosition: [0, 0.015, -0.0028119025909584816],
    localRotation: [0, 0, 0],
  };
  node_seat_deck_4.add(socket_seat_deck_cushion_mount_4);
  sockets["seat-deck:cushion-mount"] = socket_seat_deck_cushion_mount_4;

  const endpoint_lateral_rear_post_left_5 = makeAttachmentEndpoint(null);
  const node_lateral_rear_post_left_5 = new THREE.Group();
  node_lateral_rear_post_left_5.name = "Lateral rear post (left)__pivot";
  node_lateral_rear_post_left_5.scale.set(1, 1, 1);
  if (endpoint_lateral_rear_post_left_5) {
    node_lateral_rear_post_left_5.position.copy(
      endpoint_lateral_rear_post_left_5.start,
    );
    node_lateral_rear_post_left_5.rotation.set(1.36136, 1.46835, -1.5708);
  } else {
    node_lateral_rear_post_left_5.position.set(0.3035, 0.079, -0.3326);
    node_lateral_rear_post_left_5.rotation.set(1.36136, 1.46835, -1.5708);
  }
  node_lateral_rear_post_left_5.userData.sculptComponent = {
    id: "lateral-rear-post-left",
    name: "Lateral rear post (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.28, -0.145, -0.285],
      localEnd: [0.3271, 0.303, -0.3802],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.4604,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.3035, 0.079, -0.3326],
      rotation: [1.36136, 1.46835, -1.5708],
      scale: [0.05, 0.4604, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased long edges catching a thin highlight line.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-rear-post-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_rear_post_left_5.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_lateral_rear_post_left_5);
  nodes["lateral-rear-post-left"] = node_lateral_rear_post_left_5;
  const mesh_lateral_rear_post_left_5Geometry =
    endpoint_lateral_rear_post_left_5
      ? new THREE.CylinderGeometry(
          endpoint_lateral_rear_post_left_5.endRadius,
          endpoint_lateral_rear_post_left_5.baseRadius,
          endpoint_lateral_rear_post_left_5.length,
          16,
          6,
        )
      : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_lateral_rear_post_left_5) {
    mesh_lateral_rear_post_left_5Geometry.scale(0.05, 0.4604, 0.04);
  }
  const mesh_lateral_rear_post_left_5 = new THREE.Mesh(
    mesh_lateral_rear_post_left_5Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_lateral_rear_post_left_5.name = "Lateral rear post (left)";
  if (endpoint_lateral_rear_post_left_5) {
    mesh_lateral_rear_post_left_5.position.copy(
      endpoint_lateral_rear_post_left_5.midpoint,
    );
    mesh_lateral_rear_post_left_5.quaternion.copy(
      endpoint_lateral_rear_post_left_5.quaternion,
    );
  }
  mesh_lateral_rear_post_left_5.castShadow = options.castShadow ?? true;
  mesh_lateral_rear_post_left_5.receiveShadow = options.receiveShadow ?? true;
  mesh_lateral_rear_post_left_5.userData.sculptComponent = {
    id: "lateral-rear-post-left",
    name: "Lateral rear post (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.28, -0.145, -0.285],
      localEnd: [0.3271, 0.303, -0.3802],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.4604,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.3035, 0.079, -0.3326],
      rotation: [1.36136, 1.46835, -1.5708],
      scale: [0.05, 0.4604, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased long edges catching a thin highlight line.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-rear-post-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_rear_post_left_5.add(mesh_lateral_rear_post_left_5);
  meshes["lateral-rear-post-left"] = mesh_lateral_rear_post_left_5;
  colliders["lateral-rear-post-left"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_lateral_rear_post_left_5);

  const endpoint_front_post_left_6 = makeAttachmentEndpoint(null);
  const node_front_post_left_6 = new THREE.Group();
  node_front_post_left_6.name = "Front post (left)__pivot";
  node_front_post_left_6.scale.set(1, 1, 1);
  if (endpoint_front_post_left_6) {
    node_front_post_left_6.position.copy(endpoint_front_post_left_6.start);
    node_front_post_left_6.rotation.set(1.62316, 1.46622, -1.5708);
  } else {
    node_front_post_left_6.position.set(0.3028, 0.0715, 0.2963);
    node_front_post_left_6.rotation.set(1.62316, 1.46622, -1.5708);
  }
  node_front_post_left_6.userData.sculptComponent = {
    id: "front-post-left",
    name: "Front post (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.5,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.28, -0.145, 0.285],
      localEnd: [0.3255, 0.288, 0.3077],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.436,
      depth: 0.04,
      units: "meters",
      confidence: 0.5,
    },
    transform: {
      position: [0.3028, 0.0715, 0.2963],
      rotation: [1.62316, 1.46622, -1.5708],
      scale: [0.05, 0.436, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "front-post-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_front_post_left_6.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_front_post_left_6);
  nodes["front-post-left"] = node_front_post_left_6;
  const mesh_front_post_left_6Geometry = endpoint_front_post_left_6
    ? new THREE.CylinderGeometry(
        endpoint_front_post_left_6.endRadius,
        endpoint_front_post_left_6.baseRadius,
        endpoint_front_post_left_6.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_front_post_left_6) {
    mesh_front_post_left_6Geometry.scale(0.05, 0.436, 0.04);
  }
  const mesh_front_post_left_6 = new THREE.Mesh(
    mesh_front_post_left_6Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_front_post_left_6.name = "Front post (left)";
  if (endpoint_front_post_left_6) {
    mesh_front_post_left_6.position.copy(endpoint_front_post_left_6.midpoint);
    mesh_front_post_left_6.quaternion.copy(
      endpoint_front_post_left_6.quaternion,
    );
  }
  mesh_front_post_left_6.castShadow = options.castShadow ?? true;
  mesh_front_post_left_6.receiveShadow = options.receiveShadow ?? true;
  mesh_front_post_left_6.userData.sculptComponent = {
    id: "front-post-left",
    name: "Front post (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.5,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.28, -0.145, 0.285],
      localEnd: [0.3255, 0.288, 0.3077],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.436,
      depth: 0.04,
      units: "meters",
      confidence: 0.5,
    },
    transform: {
      position: [0.3028, 0.0715, 0.2963],
      rotation: [1.62316, 1.46622, -1.5708],
      scale: [0.05, 0.436, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "front-post-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_front_post_left_6.add(mesh_front_post_left_6);
  meshes["front-post-left"] = mesh_front_post_left_6;
  colliders["front-post-left"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_front_post_left_6);

  const endpoint_lateral_bottom_rail_left_7 = makeAttachmentEndpoint(null);
  const node_lateral_bottom_rail_left_7 = new THREE.Group();
  node_lateral_bottom_rail_left_7.name = "Lateral bottom rail (left)__pivot";
  node_lateral_bottom_rail_left_7.scale.set(1, 1, 1);
  if (endpoint_lateral_bottom_rail_left_7) {
    node_lateral_bottom_rail_left_7.position.copy(
      endpoint_lateral_bottom_rail_left_7.start,
    );
    node_lateral_bottom_rail_left_7.rotation.set(1.5708, 1.5708, 0.0);
  } else {
    node_lateral_bottom_rail_left_7.position.set(0.2826, -0.12, -0.002);
    node_lateral_bottom_rail_left_7.rotation.set(1.5708, 1.5708, 0.0);
  }
  node_lateral_bottom_rail_left_7.userData.sculptComponent = {
    id: "lateral-bottom-rail-left",
    name: "Lateral bottom rail (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.2826, -0.12, -0.3153],
      localEnd: [0.2826, -0.12, 0.3113],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.6266,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.2826, -0.12, -0.002],
      rotation: [1.5708, 1.5708, 0.0],
      scale: [0.05, 0.6266, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-bottom-rail-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_bottom_rail_left_7.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_lateral_bottom_rail_left_7);
  nodes["lateral-bottom-rail-left"] = node_lateral_bottom_rail_left_7;
  const mesh_lateral_bottom_rail_left_7Geometry =
    endpoint_lateral_bottom_rail_left_7
      ? new THREE.CylinderGeometry(
          endpoint_lateral_bottom_rail_left_7.endRadius,
          endpoint_lateral_bottom_rail_left_7.baseRadius,
          endpoint_lateral_bottom_rail_left_7.length,
          16,
          6,
        )
      : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_lateral_bottom_rail_left_7) {
    mesh_lateral_bottom_rail_left_7Geometry.scale(0.05, 0.6266, 0.04);
  }
  const mesh_lateral_bottom_rail_left_7 = new THREE.Mesh(
    mesh_lateral_bottom_rail_left_7Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_lateral_bottom_rail_left_7.name = "Lateral bottom rail (left)";
  if (endpoint_lateral_bottom_rail_left_7) {
    mesh_lateral_bottom_rail_left_7.position.copy(
      endpoint_lateral_bottom_rail_left_7.midpoint,
    );
    mesh_lateral_bottom_rail_left_7.quaternion.copy(
      endpoint_lateral_bottom_rail_left_7.quaternion,
    );
  }
  mesh_lateral_bottom_rail_left_7.castShadow = options.castShadow ?? true;
  mesh_lateral_bottom_rail_left_7.receiveShadow = options.receiveShadow ?? true;
  mesh_lateral_bottom_rail_left_7.userData.sculptComponent = {
    id: "lateral-bottom-rail-left",
    name: "Lateral bottom rail (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.2826, -0.12, -0.3153],
      localEnd: [0.2826, -0.12, 0.3113],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.6266,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.2826, -0.12, -0.002],
      rotation: [1.5708, 1.5708, 0.0],
      scale: [0.05, 0.6266, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-bottom-rail-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_bottom_rail_left_7.add(mesh_lateral_bottom_rail_left_7);
  meshes["lateral-bottom-rail-left"] = mesh_lateral_bottom_rail_left_7;
  colliders["lateral-bottom-rail-left"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_lateral_bottom_rail_left_7);

  const endpoint_armrest_left_8 = makeAttachmentEndpoint(null);
  const node_armrest_left_8 = new THREE.Group();
  node_armrest_left_8.name = "Armrest (left)__pivot";
  node_armrest_left_8.scale.set(1, 1, 1);
  if (endpoint_armrest_left_8) {
    node_armrest_left_8.position.copy(endpoint_armrest_left_8.start);
    node_armrest_left_8.rotation.set(0.0, -1.5708, 0.0);
  } else {
    node_armrest_left_8.position.set(0.3755, 0.303, -0.447);
    node_armrest_left_8.rotation.set(0.0, -1.5708, 0.0);
  }
  node_armrest_left_8.userData.sculptComponent = {
    id: "armrest-left",
    name: "Armrest (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.65,
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
    geometryDescriptor: {
      topologyIntent:
        "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      profile2D: {
        points: [
          [0.0, 0.0],
          [0.8113967669682247, -0.015],
          [0.8114, 0.017],
          [0.71, 0.0143],
          [0.6085, 0.0123],
          [0.5071, 0.0115],
          [0.4057, 0.0125],
          [0.3043, 0.0153],
          [0.2028, 0.0198],
          [0.1014, 0.0255],
          [0.0, 0.032],
          [-0.008, 0.0299],
          [-0.0139, 0.024],
          [-0.016, 0.016],
          [-0.0139, 0.008],
          [-0.008, 0.0021],
        ],
        depth: 0.075,
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.3755, 0.303, -0.447],
      localEnd: [0.3755, 0.288, 0.3644],
      contactType: "overlap",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.65,
    },
    transform: {
      position: [0.3755, 0.303, -0.447],
      rotation: [0.0, -1.5708, 0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0.05, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "concave-sweep",
        kind: "contour",
        description: "Top edge dips ~12 mm mid-length (d05).",
        realizedInPass: "form-refinement",
      },
      {
        id: "rear-end-protrusion",
        kind: "contour",
        description:
          "Round-ended rear stub protrudes ~35 mm behind the rear frame (d06).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#armrest",
      "analysis/detail-inventory/zone-r0c2.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "armrest-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_armrest_left_8.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.22, 0.05, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_armrest_left_8);
  nodes["armrest-left"] = node_armrest_left_8;
  const mesh_armrest_left_8Geometry = endpoint_armrest_left_8
    ? new THREE.CylinderGeometry(
        endpoint_armrest_left_8.endRadius,
        endpoint_armrest_left_8.baseRadius,
        endpoint_armrest_left_8.length,
        16,
        6,
      )
    : buildExtrudeGeometry({
        points: [
          [0.0, 0.0],
          [0.8113967669682247, -0.015],
          [0.8114, 0.017],
          [0.71, 0.0143],
          [0.6085, 0.0123],
          [0.5071, 0.0115],
          [0.4057, 0.0125],
          [0.3043, 0.0153],
          [0.2028, 0.0198],
          [0.1014, 0.0255],
          [0.0, 0.032],
          [-0.008, 0.0299],
          [-0.0139, 0.024],
          [-0.016, 0.016],
          [-0.0139, 0.008],
          [-0.008, 0.0021],
        ],
        depth: 0.075,
      });
  if (!endpoint_armrest_left_8) {
    mesh_armrest_left_8Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_armrest_left_8 = new THREE.Mesh(
    mesh_armrest_left_8Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_armrest_left_8.name = "Armrest (left)";
  if (endpoint_armrest_left_8) {
    mesh_armrest_left_8.position.copy(endpoint_armrest_left_8.midpoint);
    mesh_armrest_left_8.quaternion.copy(endpoint_armrest_left_8.quaternion);
  }
  mesh_armrest_left_8.castShadow = options.castShadow ?? true;
  mesh_armrest_left_8.receiveShadow = options.receiveShadow ?? true;
  mesh_armrest_left_8.userData.sculptComponent = {
    id: "armrest-left",
    name: "Armrest (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.65,
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
    geometryDescriptor: {
      topologyIntent:
        "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      profile2D: {
        points: [
          [0.0, 0.0],
          [0.8113967669682247, -0.015],
          [0.8114, 0.017],
          [0.71, 0.0143],
          [0.6085, 0.0123],
          [0.5071, 0.0115],
          [0.4057, 0.0125],
          [0.3043, 0.0153],
          [0.2028, 0.0198],
          [0.1014, 0.0255],
          [0.0, 0.032],
          [-0.008, 0.0299],
          [-0.0139, 0.024],
          [-0.016, 0.016],
          [-0.0139, 0.008],
          [-0.008, 0.0021],
        ],
        depth: 0.075,
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.3755, 0.303, -0.447],
      localEnd: [0.3755, 0.288, 0.3644],
      contactType: "overlap",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.65,
    },
    transform: {
      position: [0.3755, 0.303, -0.447],
      rotation: [0.0, -1.5708, 0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0.05, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "concave-sweep",
        kind: "contour",
        description: "Top edge dips ~12 mm mid-length (d05).",
        realizedInPass: "form-refinement",
      },
      {
        id: "rear-end-protrusion",
        kind: "contour",
        description:
          "Round-ended rear stub protrudes ~35 mm behind the rear frame (d06).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#armrest",
      "analysis/detail-inventory/zone-r0c2.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "armrest-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_armrest_left_8.add(mesh_armrest_left_8);
  meshes["armrest-left"] = mesh_armrest_left_8;
  colliders["armrest-left"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_armrest_left_8);

  const endpoint_fastener_cap_left_upper_9 = makeAttachmentEndpoint(null);
  const node_fastener_cap_left_upper_9 = new THREE.Group();
  node_fastener_cap_left_upper_9.name = "Fastener cap (left, upper)__pivot";
  node_fastener_cap_left_upper_9.scale.set(1, 1, 1);
  if (endpoint_fastener_cap_left_upper_9) {
    node_fastener_cap_left_upper_9.position.copy(
      endpoint_fastener_cap_left_upper_9.start,
    );
    node_fastener_cap_left_upper_9.rotation.set(0.0, 1.5708, 0.0);
  } else {
    node_fastener_cap_left_upper_9.position.set(0.3461, 0.275, -0.3743);
    node_fastener_cap_left_upper_9.rotation.set(0.0, 1.5708, 0.0);
  }
  node_fastener_cap_left_upper_9.userData.sculptComponent = {
    id: "fastener-cap-left-upper",
    name: "Fastener cap (left, upper)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.3461, 0.275, -0.3743],
      localEnd: [0.3501, 0.275, -0.3743],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [0.3461, 0.275, -0.3743],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-left-upper",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_left_upper_9.userData.actionProfile = {
    animationRole: "fastener",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_fastener_cap_left_upper_9);
  nodes["fastener-cap-left-upper"] = node_fastener_cap_left_upper_9;
  const mesh_fastener_cap_left_upper_9Geometry =
    endpoint_fastener_cap_left_upper_9
      ? new THREE.CylinderGeometry(
          endpoint_fastener_cap_left_upper_9.endRadius,
          endpoint_fastener_cap_left_upper_9.baseRadius,
          endpoint_fastener_cap_left_upper_9.length,
          16,
          6,
        )
      : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_fastener_cap_left_upper_9) {
    mesh_fastener_cap_left_upper_9Geometry.scale(0.016, 0.016, 0.006);
  }
  const mesh_fastener_cap_left_upper_9 = new THREE.Mesh(
    mesh_fastener_cap_left_upper_9Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_fastener_cap_left_upper_9.name = "Fastener cap (left, upper)";
  if (endpoint_fastener_cap_left_upper_9) {
    mesh_fastener_cap_left_upper_9.position.copy(
      endpoint_fastener_cap_left_upper_9.midpoint,
    );
    mesh_fastener_cap_left_upper_9.quaternion.copy(
      endpoint_fastener_cap_left_upper_9.quaternion,
    );
  }
  mesh_fastener_cap_left_upper_9.castShadow = options.castShadow ?? true;
  mesh_fastener_cap_left_upper_9.receiveShadow = options.receiveShadow ?? true;
  mesh_fastener_cap_left_upper_9.userData.sculptComponent = {
    id: "fastener-cap-left-upper",
    name: "Fastener cap (left, upper)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.3461, 0.275, -0.3743],
      localEnd: [0.3501, 0.275, -0.3743],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [0.3461, 0.275, -0.3743],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-left-upper",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_left_upper_9.add(mesh_fastener_cap_left_upper_9);
  meshes["fastener-cap-left-upper"] = mesh_fastener_cap_left_upper_9;
  colliders["fastener-cap-left-upper"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_fastener_cap_left_upper_9);

  const endpoint_fastener_cap_left_lower_10 = makeAttachmentEndpoint(null);
  const node_fastener_cap_left_lower_10 = new THREE.Group();
  node_fastener_cap_left_lower_10.name = "Fastener cap (left, lower)__pivot";
  node_fastener_cap_left_lower_10.scale.set(1, 1, 1);
  if (endpoint_fastener_cap_left_lower_10) {
    node_fastener_cap_left_lower_10.position.copy(
      endpoint_fastener_cap_left_lower_10.start,
    );
    node_fastener_cap_left_lower_10.rotation.set(0.0, 1.5708, 0.0);
  } else {
    node_fastener_cap_left_lower_10.position.set(0.3052, -0.115, -0.2914);
    node_fastener_cap_left_lower_10.rotation.set(0.0, 1.5708, 0.0);
  }
  node_fastener_cap_left_lower_10.userData.sculptComponent = {
    id: "fastener-cap-left-lower",
    name: "Fastener cap (left, lower)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.3052, -0.115, -0.2914],
      localEnd: [0.3092, -0.115, -0.2914],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [0.3052, -0.115, -0.2914],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-left-lower",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_left_lower_10.userData.actionProfile = {
    animationRole: "fastener",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_fastener_cap_left_lower_10);
  nodes["fastener-cap-left-lower"] = node_fastener_cap_left_lower_10;
  const mesh_fastener_cap_left_lower_10Geometry =
    endpoint_fastener_cap_left_lower_10
      ? new THREE.CylinderGeometry(
          endpoint_fastener_cap_left_lower_10.endRadius,
          endpoint_fastener_cap_left_lower_10.baseRadius,
          endpoint_fastener_cap_left_lower_10.length,
          16,
          6,
        )
      : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_fastener_cap_left_lower_10) {
    mesh_fastener_cap_left_lower_10Geometry.scale(0.016, 0.016, 0.006);
  }
  const mesh_fastener_cap_left_lower_10 = new THREE.Mesh(
    mesh_fastener_cap_left_lower_10Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_fastener_cap_left_lower_10.name = "Fastener cap (left, lower)";
  if (endpoint_fastener_cap_left_lower_10) {
    mesh_fastener_cap_left_lower_10.position.copy(
      endpoint_fastener_cap_left_lower_10.midpoint,
    );
    mesh_fastener_cap_left_lower_10.quaternion.copy(
      endpoint_fastener_cap_left_lower_10.quaternion,
    );
  }
  mesh_fastener_cap_left_lower_10.castShadow = options.castShadow ?? true;
  mesh_fastener_cap_left_lower_10.receiveShadow = options.receiveShadow ?? true;
  mesh_fastener_cap_left_lower_10.userData.sculptComponent = {
    id: "fastener-cap-left-lower",
    name: "Fastener cap (left, lower)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-left-mount",
      localStart: [0.3052, -0.115, -0.2914],
      localEnd: [0.3092, -0.115, -0.2914],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [0.3052, -0.115, -0.2914],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-left-lower",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_left_lower_10.add(mesh_fastener_cap_left_lower_10);
  meshes["fastener-cap-left-lower"] = mesh_fastener_cap_left_lower_10;
  colliders["fastener-cap-left-lower"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_fastener_cap_left_lower_10);

  const attachment_weave_lateral_left_11 = null;
  const endpoint_weave_lateral_left_11 = makeAttachmentEndpoint(
    attachment_weave_lateral_left_11,
  );
  const node_weave_lateral_left_11 = new THREE.Group();
  node_weave_lateral_left_11.name =
    "Lateral rope lattice (left, +45 deg run)__pivot";
  node_weave_lateral_left_11.scale.set(1, 1, 1);
  if (endpoint_weave_lateral_left_11) {
    node_weave_lateral_left_11.position.copy(
      endpoint_weave_lateral_left_11.start,
    );
    node_weave_lateral_left_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_weave_lateral_left_11.position.set(0.0, 0.0, 0.0);
    node_weave_lateral_left_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_weave_lateral_left_11.userData.sculptComponent = {
    id: "weave-lateral-left",
    name: "Lateral rope lattice (left, +45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.3245, 0.5638, -0.3522],
          [0.3308, 0.5663, -0.3494],
          [0.3273, 0.59, -0.3288],
          [0.3279, 0.5959, -0.3151],
          [0.3279, 0.5959, -0.2953],
          [0.3273, 0.59, -0.2794],
          [0.3308, 0.5663, -0.3006],
          [0.3166, 0.5453, -0.3205],
          [0.3262, 0.5218, -0.34],
          [0.3199, 0.5193, -0.3427],
          [0.3185, 0.506, -0.3462],
          [0.3166, 0.4882, -0.3424],
          [0.3152, 0.4748, -0.3332],
          [0.3215, 0.4773, -0.3306],
          [0.3119, 0.5008, -0.3115],
          [0.3262, 0.5218, -0.292],
          [0.3166, 0.5453, -0.2721],
          [0.3308, 0.5663, -0.2517],
          [0.3273, 0.59, -0.23],
          [0.3279, 0.5959, -0.2161],
          [0.3279, 0.5959, -0.1963],
          [0.3273, 0.59, -0.1807],
          [0.3308, 0.5663, -0.2028],
          [0.3166, 0.5453, -0.2236],
          [0.3262, 0.5218, -0.244],
          [0.3119, 0.5008, -0.264],
          [0.3215, 0.4773, -0.2835],
          [0.3072, 0.4564, -0.3026],
          [0.3168, 0.4329, -0.3212],
          [0.3105, 0.4303, -0.3238],
          [0.3091, 0.417, -0.327],
          [0.3072, 0.3992, -0.3231],
          [0.3058, 0.3859, -0.3143],
          [0.3121, 0.3884, -0.3117],
          [0.3025, 0.4119, -0.2936],
          [0.3168, 0.4329, -0.275],
          [0.3072, 0.4564, -0.2559],
          [0.3215, 0.4773, -0.2364],
          [0.3119, 0.5008, -0.2165],
          [0.3262, 0.5218, -0.1961],
          [0.3166, 0.5453, -0.1752],
          [0.3308, 0.5663, -0.1539],
          [0.3273, 0.59, -0.1313],
          [0.3279, 0.5959, -0.1172],
          [0.3279, 0.5959, -0.0974],
          [0.3273, 0.59, -0.0819],
          [0.3308, 0.5663, -0.105],
          [0.3166, 0.5453, -0.1267],
          [0.3262, 0.5218, -0.1481],
          [0.3119, 0.5008, -0.1689],
          [0.3215, 0.4773, -0.1894],
          [0.3072, 0.4564, -0.2093],
          [0.3168, 0.4329, -0.2288],
          [0.3025, 0.4119, -0.2479],
          [0.3121, 0.3884, -0.2665],
          [0.2979, 0.3674, -0.2846],
          [0.3075, 0.3439, -0.3023],
          [0.3012, 0.3414, -0.3048],
          [0.2998, 0.328, -0.3077],
          [0.2979, 0.3102, -0.3039],
          [0.2965, 0.2969, -0.2953],
          [0.3028, 0.2994, -0.2929],
          [0.2932, 0.3229, -0.2756],
          [0.3075, 0.3439, -0.2579],
          [0.2979, 0.3674, -0.2398],
          [0.3121, 0.3884, -0.2212],
          [0.3025, 0.4119, -0.2022],
          [0.3168, 0.4329, -0.1827],
          [0.3072, 0.4564, -0.1627],
          [0.3215, 0.4773, -0.1423],
          [0.3119, 0.5008, -0.1214],
          [0.3262, 0.5218, -0.1001],
          [0.3166, 0.5453, -0.0783],
          [0.3308, 0.5663, -0.0561],
          [0.3273, 0.59, -0.0326],
          [0.3279, 0.5959, -0.0182],
          [0.3279, 0.5959, 0.0016],
          [0.3273, 0.59, 0.0168],
          [0.3308, 0.5663, -0.0072],
          [0.3166, 0.5453, -0.0299],
          [0.3262, 0.5218, -0.0521],
          [0.3119, 0.5008, -0.0739],
          [0.3215, 0.4773, -0.0952],
          [0.3072, 0.4564, -0.1161],
          [0.3168, 0.4329, -0.1365],
          [0.3025, 0.4119, -0.1565],
          [0.3121, 0.3884, -0.176],
          [0.2979, 0.3674, -0.195],
          [0.3075, 0.3439, -0.2136],
          [0.2932, 0.3229, -0.2317],
          [0.3028, 0.2994, -0.2494],
          [0.2885, 0.2784, -0.2667],
          [0.2981, 0.2549, -0.2834],
          [0.2918, 0.2524, -0.2858],
          [0.2904, 0.239, -0.2885],
          [0.2885, 0.2213, -0.2847],
          [0.2871, 0.2079, -0.2763],
          [0.2934, 0.2104, -0.274],
          [0.2838, 0.2339, -0.2577],
          [0.2981, 0.2549, -0.2409],
          [0.2885, 0.2784, -0.2237],
          [0.3028, 0.2994, -0.206],
          [0.2932, 0.3229, -0.1879],
          [0.3075, 0.3439, -0.1693],
          [0.2979, 0.3674, -0.1502],
          [0.3121, 0.3884, -0.1307],
          [0.3025, 0.4119, -0.1107],
          [0.3168, 0.4329, -0.0903],
          [0.3072, 0.4564, -0.0695],
          [0.3215, 0.4773, -0.0481],
          [0.3119, 0.5008, -0.0264],
          [0.3262, 0.5218, -0.0041],
          [0.3166, 0.5453, 0.0186],
          [0.3308, 0.5663, 0.0417],
          [0.3273, 0.59, 0.0662],
          [0.3279, 0.5959, 0.0808],
          [0.3279, 0.5959, 0.1006],
          [0.3273, 0.59, 0.1155],
          [0.3308, 0.5663, 0.0906],
          [0.3166, 0.5453, 0.067],
          [0.3262, 0.5218, 0.0439],
          [0.3119, 0.5008, 0.0212],
          [0.3215, 0.4773, -0.0011],
          [0.3072, 0.4564, -0.0228],
          [0.3168, 0.4329, -0.0442],
          [0.3025, 0.4119, -0.065],
          [0.3121, 0.3884, -0.0854],
          [0.2979, 0.3674, -0.1054],
          [0.3075, 0.3439, -0.1249],
          [0.2932, 0.3229, -0.144],
          [0.3028, 0.2994, -0.1626],
          [0.2885, 0.2784, -0.1807],
          [0.2981, 0.2549, -0.1984],
          [0.2838, 0.2339, -0.2156],
          [0.2934, 0.2104, -0.2324],
          [0.285, 0.188, -0.2493],
          [0.2844, 0.1821, -0.2358],
          [0.2844, 0.1821, -0.2194],
          [0.285, 0.188, -0.2081],
          [0.2934, 0.2104, -0.1908],
          [0.2838, 0.2339, -0.1735],
          [0.2981, 0.2549, -0.1559],
          [0.2885, 0.2784, -0.1377],
          [0.3028, 0.2994, -0.1191],
          [0.2932, 0.3229, -0.1001],
          [0.3075, 0.3439, -0.0806],
          [0.2979, 0.3674, -0.0606],
          [0.3121, 0.3884, -0.0402],
          [0.3025, 0.4119, -0.0193],
          [0.3168, 0.4329, 0.002],
          [0.3072, 0.4564, 0.0238],
          [0.3215, 0.4773, 0.046],
          [0.3119, 0.5008, 0.0687],
          [0.3262, 0.5218, 0.0919],
          [0.3166, 0.5453, 0.1155],
          [0.3308, 0.5663, 0.1395],
          [0.3273, 0.59, 0.1649],
          [0.3279, 0.5959, 0.1798],
          [0.3279, 0.5959, 0.1996],
          [0.3273, 0.59, 0.2143],
          [0.3308, 0.5663, 0.1884],
          [0.3166, 0.5453, 0.1639],
          [0.3262, 0.5218, 0.1398],
          [0.3119, 0.5008, 0.1162],
          [0.3215, 0.4773, 0.0931],
          [0.3072, 0.4564, 0.0704],
          [0.3168, 0.4329, 0.0482],
          [0.3025, 0.4119, 0.0264],
          [0.3121, 0.3884, 0.0051],
          [0.2979, 0.3674, -0.0158],
          [0.3075, 0.3439, -0.0362],
          [0.2932, 0.3229, -0.0562],
          [0.3028, 0.2994, -0.0757],
          [0.2885, 0.2784, -0.0947],
          [0.2981, 0.2549, -0.1133],
          [0.2838, 0.2339, -0.1315],
          [0.2934, 0.2104, -0.1492],
          [0.285, 0.188, -0.167],
          [0.2844, 0.1821, -0.1537],
          [0.2844, 0.1821, -0.1373],
          [0.285, 0.188, -0.1258],
          [0.2934, 0.2104, -0.1075],
          [0.2838, 0.2339, -0.0894],
          [0.2981, 0.2549, -0.0708],
          [0.2885, 0.2784, -0.0518],
          [0.3028, 0.2994, -0.0323],
          [0.2932, 0.3229, -0.0123],
          [0.3075, 0.3439, 0.0081],
          [0.2979, 0.3674, 0.029],
          [0.3121, 0.3884, 0.0503],
          [0.3025, 0.4119, 0.0721],
          [0.3168, 0.4329, 0.0943],
          [0.3072, 0.4564, 0.117],
          [0.3215, 0.4773, 0.1402],
          [0.3119, 0.5008, 0.1638],
          [0.3262, 0.5218, 0.1878],
          [0.3166, 0.5453, 0.2123],
          [0.3308, 0.5663, 0.2373],
          [0.3273, 0.59, 0.2636],
          [0.3265, 0.5826, 0.2699],
          [0.3255, 0.5728, 0.2783],
          [0.3247, 0.5654, 0.2845],
          [0.3166, 0.5453, 0.2608],
          [0.3262, 0.5218, 0.2358],
          [0.3119, 0.5008, 0.2113],
          [0.3215, 0.4773, 0.1872],
          [0.3072, 0.4564, 0.1636],
          [0.3168, 0.4329, 0.1405],
          [0.3025, 0.4119, 0.1178],
          [0.3121, 0.3884, 0.0956],
          [0.2979, 0.3674, 0.0738],
          [0.3075, 0.3439, 0.0525],
          [0.2932, 0.3229, 0.0316],
          [0.3028, 0.2994, 0.0112],
          [0.2885, 0.2784, -0.0088],
          [0.2981, 0.2549, -0.0283],
          [0.2838, 0.2339, -0.0473],
          [0.2934, 0.2104, -0.0659],
          [0.285, 0.188, -0.0847],
          [0.2844, 0.1821, -0.0717],
          [0.2844, 0.1821, -0.0553],
          [0.285, 0.188, -0.0436],
          [0.2934, 0.2104, -0.0243],
          [0.2838, 0.2339, -0.0053],
          [0.2981, 0.2549, 0.0142],
          [0.2885, 0.2784, 0.0342],
          [0.3028, 0.2994, 0.0546],
          [0.2932, 0.3229, 0.0755],
          [0.3075, 0.3439, 0.0968],
          [0.2979, 0.3674, 0.1186],
          [0.3121, 0.3884, 0.1408],
          [0.3025, 0.4119, 0.1635],
          [0.3168, 0.4329, 0.1867],
          [0.3072, 0.4564, 0.2103],
          [0.3215, 0.4773, 0.2343],
          [0.3119, 0.5008, 0.2588],
          [0.32, 0.5209, 0.2821],
          [0.3186, 0.5076, 0.2877],
          [0.3168, 0.4898, 0.2867],
          [0.3154, 0.4765, 0.2797],
          [0.3072, 0.4564, 0.2569],
          [0.3168, 0.4329, 0.2328],
          [0.3025, 0.4119, 0.2092],
          [0.3121, 0.3884, 0.1861],
          [0.2979, 0.3674, 0.1634],
          [0.3075, 0.3439, 0.1412],
          [0.2932, 0.3229, 0.1194],
          [0.3028, 0.2994, 0.098],
          [0.2885, 0.2784, 0.0772],
          [0.2981, 0.2549, 0.0568],
          [0.2838, 0.2339, 0.0368],
          [0.2934, 0.2104, 0.0173],
          [0.285, 0.188, -0.0024],
          [0.2844, 0.1821, 0.0104],
          [0.2844, 0.1821, 0.0268],
          [0.285, 0.188, 0.0387],
          [0.2934, 0.2104, 0.0589],
          [0.2838, 0.2339, 0.0789],
          [0.2981, 0.2549, 0.0993],
          [0.2885, 0.2784, 0.1202],
          [0.3028, 0.2994, 0.1415],
          [0.2932, 0.3229, 0.1633],
          [0.3075, 0.3439, 0.1855],
          [0.2979, 0.3674, 0.2082],
          [0.3121, 0.3884, 0.2313],
          [0.3025, 0.4119, 0.2549],
          [0.3107, 0.432, 0.2773],
          [0.3093, 0.4186, 0.2827],
          [0.3074, 0.4008, 0.2817],
          [0.306, 0.3875, 0.275],
          [0.2979, 0.3674, 0.253],
          [0.3075, 0.3439, 0.2298],
          [0.2932, 0.3229, 0.2072],
          [0.3028, 0.2994, 0.1849],
          [0.2885, 0.2784, 0.1631],
          [0.2981, 0.2549, 0.1418],
          [0.2838, 0.2339, 0.1209],
          [0.2934, 0.2104, 0.1005],
          [0.285, 0.188, 0.0799],
          [0.2844, 0.1821, 0.0924],
          [0.2844, 0.1821, 0.1088],
          [0.285, 0.188, 0.121],
          [0.2934, 0.2104, 0.1421],
          [0.2838, 0.2339, 0.163],
          [0.2981, 0.2549, 0.1843],
          [0.2885, 0.2784, 0.2061],
          [0.3028, 0.2994, 0.2284],
          [0.2932, 0.3229, 0.251],
          [0.3013, 0.343, 0.2726],
          [0.2999, 0.3297, 0.2777],
          [0.2981, 0.3119, 0.2767],
          [0.2967, 0.2985, 0.2702],
          [0.2885, 0.2784, 0.2491],
          [0.2981, 0.2549, 0.2269],
          [0.2838, 0.2339, 0.2051],
          [0.2934, 0.2104, 0.1838],
          [0.285, 0.188, 0.1622],
          [0.2844, 0.1821, 0.1744],
          [0.2844, 0.1821, 0.1909],
          [0.285, 0.188, 0.2033],
          [0.2934, 0.2104, 0.2254],
          [0.2838, 0.2339, 0.2471],
          [0.292, 0.254, 0.2679],
          [0.2906, 0.2407, 0.2727],
          [0.2887, 0.2229, 0.2717],
          [0.2873, 0.2095, 0.2655],
          [0.285, 0.188, 0.2444],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2853, -0.095, -0.2706],
        localEnd: [0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: 45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "lattice-openings",
        kind: "hole",
        description: "See-through diamond openings between strands (d01).",
        realizedInPass: "structural-pass",
      },
      {
        id: "over-under-interlace",
        kind: "ridge",
        description:
          "Strands alternate +/-7.5 mm about the panel plane at every crossing (d02).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-left",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_left_11.userData.actionProfile = {
    animationRole: "weave-panel",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "weave",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.12, 0, 0],
    },
  };
  (nodes["root"] ?? root).add(node_weave_lateral_left_11);
  nodes["weave-lateral-left"] = node_weave_lateral_left_11;
  const mesh_weave_lateral_left_11Geometry = endpoint_weave_lateral_left_11
    ? new THREE.CylinderGeometry(
        endpoint_weave_lateral_left_11.endRadius,
        endpoint_weave_lateral_left_11.baseRadius,
        endpoint_weave_lateral_left_11.length,
        16,
        6,
      )
    : buildTubeGeometry({
        points: [
          [0.3245, 0.5638, -0.3522],
          [0.3308, 0.5663, -0.3494],
          [0.3273, 0.59, -0.3288],
          [0.3279, 0.5959, -0.3151],
          [0.3279, 0.5959, -0.2953],
          [0.3273, 0.59, -0.2794],
          [0.3308, 0.5663, -0.3006],
          [0.3166, 0.5453, -0.3205],
          [0.3262, 0.5218, -0.34],
          [0.3199, 0.5193, -0.3427],
          [0.3185, 0.506, -0.3462],
          [0.3166, 0.4882, -0.3424],
          [0.3152, 0.4748, -0.3332],
          [0.3215, 0.4773, -0.3306],
          [0.3119, 0.5008, -0.3115],
          [0.3262, 0.5218, -0.292],
          [0.3166, 0.5453, -0.2721],
          [0.3308, 0.5663, -0.2517],
          [0.3273, 0.59, -0.23],
          [0.3279, 0.5959, -0.2161],
          [0.3279, 0.5959, -0.1963],
          [0.3273, 0.59, -0.1807],
          [0.3308, 0.5663, -0.2028],
          [0.3166, 0.5453, -0.2236],
          [0.3262, 0.5218, -0.244],
          [0.3119, 0.5008, -0.264],
          [0.3215, 0.4773, -0.2835],
          [0.3072, 0.4564, -0.3026],
          [0.3168, 0.4329, -0.3212],
          [0.3105, 0.4303, -0.3238],
          [0.3091, 0.417, -0.327],
          [0.3072, 0.3992, -0.3231],
          [0.3058, 0.3859, -0.3143],
          [0.3121, 0.3884, -0.3117],
          [0.3025, 0.4119, -0.2936],
          [0.3168, 0.4329, -0.275],
          [0.3072, 0.4564, -0.2559],
          [0.3215, 0.4773, -0.2364],
          [0.3119, 0.5008, -0.2165],
          [0.3262, 0.5218, -0.1961],
          [0.3166, 0.5453, -0.1752],
          [0.3308, 0.5663, -0.1539],
          [0.3273, 0.59, -0.1313],
          [0.3279, 0.5959, -0.1172],
          [0.3279, 0.5959, -0.0974],
          [0.3273, 0.59, -0.0819],
          [0.3308, 0.5663, -0.105],
          [0.3166, 0.5453, -0.1267],
          [0.3262, 0.5218, -0.1481],
          [0.3119, 0.5008, -0.1689],
          [0.3215, 0.4773, -0.1894],
          [0.3072, 0.4564, -0.2093],
          [0.3168, 0.4329, -0.2288],
          [0.3025, 0.4119, -0.2479],
          [0.3121, 0.3884, -0.2665],
          [0.2979, 0.3674, -0.2846],
          [0.3075, 0.3439, -0.3023],
          [0.3012, 0.3414, -0.3048],
          [0.2998, 0.328, -0.3077],
          [0.2979, 0.3102, -0.3039],
          [0.2965, 0.2969, -0.2953],
          [0.3028, 0.2994, -0.2929],
          [0.2932, 0.3229, -0.2756],
          [0.3075, 0.3439, -0.2579],
          [0.2979, 0.3674, -0.2398],
          [0.3121, 0.3884, -0.2212],
          [0.3025, 0.4119, -0.2022],
          [0.3168, 0.4329, -0.1827],
          [0.3072, 0.4564, -0.1627],
          [0.3215, 0.4773, -0.1423],
          [0.3119, 0.5008, -0.1214],
          [0.3262, 0.5218, -0.1001],
          [0.3166, 0.5453, -0.0783],
          [0.3308, 0.5663, -0.0561],
          [0.3273, 0.59, -0.0326],
          [0.3279, 0.5959, -0.0182],
          [0.3279, 0.5959, 0.0016],
          [0.3273, 0.59, 0.0168],
          [0.3308, 0.5663, -0.0072],
          [0.3166, 0.5453, -0.0299],
          [0.3262, 0.5218, -0.0521],
          [0.3119, 0.5008, -0.0739],
          [0.3215, 0.4773, -0.0952],
          [0.3072, 0.4564, -0.1161],
          [0.3168, 0.4329, -0.1365],
          [0.3025, 0.4119, -0.1565],
          [0.3121, 0.3884, -0.176],
          [0.2979, 0.3674, -0.195],
          [0.3075, 0.3439, -0.2136],
          [0.2932, 0.3229, -0.2317],
          [0.3028, 0.2994, -0.2494],
          [0.2885, 0.2784, -0.2667],
          [0.2981, 0.2549, -0.2834],
          [0.2918, 0.2524, -0.2858],
          [0.2904, 0.239, -0.2885],
          [0.2885, 0.2213, -0.2847],
          [0.2871, 0.2079, -0.2763],
          [0.2934, 0.2104, -0.274],
          [0.2838, 0.2339, -0.2577],
          [0.2981, 0.2549, -0.2409],
          [0.2885, 0.2784, -0.2237],
          [0.3028, 0.2994, -0.206],
          [0.2932, 0.3229, -0.1879],
          [0.3075, 0.3439, -0.1693],
          [0.2979, 0.3674, -0.1502],
          [0.3121, 0.3884, -0.1307],
          [0.3025, 0.4119, -0.1107],
          [0.3168, 0.4329, -0.0903],
          [0.3072, 0.4564, -0.0695],
          [0.3215, 0.4773, -0.0481],
          [0.3119, 0.5008, -0.0264],
          [0.3262, 0.5218, -0.0041],
          [0.3166, 0.5453, 0.0186],
          [0.3308, 0.5663, 0.0417],
          [0.3273, 0.59, 0.0662],
          [0.3279, 0.5959, 0.0808],
          [0.3279, 0.5959, 0.1006],
          [0.3273, 0.59, 0.1155],
          [0.3308, 0.5663, 0.0906],
          [0.3166, 0.5453, 0.067],
          [0.3262, 0.5218, 0.0439],
          [0.3119, 0.5008, 0.0212],
          [0.3215, 0.4773, -0.0011],
          [0.3072, 0.4564, -0.0228],
          [0.3168, 0.4329, -0.0442],
          [0.3025, 0.4119, -0.065],
          [0.3121, 0.3884, -0.0854],
          [0.2979, 0.3674, -0.1054],
          [0.3075, 0.3439, -0.1249],
          [0.2932, 0.3229, -0.144],
          [0.3028, 0.2994, -0.1626],
          [0.2885, 0.2784, -0.1807],
          [0.2981, 0.2549, -0.1984],
          [0.2838, 0.2339, -0.2156],
          [0.2934, 0.2104, -0.2324],
          [0.285, 0.188, -0.2493],
          [0.2844, 0.1821, -0.2358],
          [0.2844, 0.1821, -0.2194],
          [0.285, 0.188, -0.2081],
          [0.2934, 0.2104, -0.1908],
          [0.2838, 0.2339, -0.1735],
          [0.2981, 0.2549, -0.1559],
          [0.2885, 0.2784, -0.1377],
          [0.3028, 0.2994, -0.1191],
          [0.2932, 0.3229, -0.1001],
          [0.3075, 0.3439, -0.0806],
          [0.2979, 0.3674, -0.0606],
          [0.3121, 0.3884, -0.0402],
          [0.3025, 0.4119, -0.0193],
          [0.3168, 0.4329, 0.002],
          [0.3072, 0.4564, 0.0238],
          [0.3215, 0.4773, 0.046],
          [0.3119, 0.5008, 0.0687],
          [0.3262, 0.5218, 0.0919],
          [0.3166, 0.5453, 0.1155],
          [0.3308, 0.5663, 0.1395],
          [0.3273, 0.59, 0.1649],
          [0.3279, 0.5959, 0.1798],
          [0.3279, 0.5959, 0.1996],
          [0.3273, 0.59, 0.2143],
          [0.3308, 0.5663, 0.1884],
          [0.3166, 0.5453, 0.1639],
          [0.3262, 0.5218, 0.1398],
          [0.3119, 0.5008, 0.1162],
          [0.3215, 0.4773, 0.0931],
          [0.3072, 0.4564, 0.0704],
          [0.3168, 0.4329, 0.0482],
          [0.3025, 0.4119, 0.0264],
          [0.3121, 0.3884, 0.0051],
          [0.2979, 0.3674, -0.0158],
          [0.3075, 0.3439, -0.0362],
          [0.2932, 0.3229, -0.0562],
          [0.3028, 0.2994, -0.0757],
          [0.2885, 0.2784, -0.0947],
          [0.2981, 0.2549, -0.1133],
          [0.2838, 0.2339, -0.1315],
          [0.2934, 0.2104, -0.1492],
          [0.285, 0.188, -0.167],
          [0.2844, 0.1821, -0.1537],
          [0.2844, 0.1821, -0.1373],
          [0.285, 0.188, -0.1258],
          [0.2934, 0.2104, -0.1075],
          [0.2838, 0.2339, -0.0894],
          [0.2981, 0.2549, -0.0708],
          [0.2885, 0.2784, -0.0518],
          [0.3028, 0.2994, -0.0323],
          [0.2932, 0.3229, -0.0123],
          [0.3075, 0.3439, 0.0081],
          [0.2979, 0.3674, 0.029],
          [0.3121, 0.3884, 0.0503],
          [0.3025, 0.4119, 0.0721],
          [0.3168, 0.4329, 0.0943],
          [0.3072, 0.4564, 0.117],
          [0.3215, 0.4773, 0.1402],
          [0.3119, 0.5008, 0.1638],
          [0.3262, 0.5218, 0.1878],
          [0.3166, 0.5453, 0.2123],
          [0.3308, 0.5663, 0.2373],
          [0.3273, 0.59, 0.2636],
          [0.3265, 0.5826, 0.2699],
          [0.3255, 0.5728, 0.2783],
          [0.3247, 0.5654, 0.2845],
          [0.3166, 0.5453, 0.2608],
          [0.3262, 0.5218, 0.2358],
          [0.3119, 0.5008, 0.2113],
          [0.3215, 0.4773, 0.1872],
          [0.3072, 0.4564, 0.1636],
          [0.3168, 0.4329, 0.1405],
          [0.3025, 0.4119, 0.1178],
          [0.3121, 0.3884, 0.0956],
          [0.2979, 0.3674, 0.0738],
          [0.3075, 0.3439, 0.0525],
          [0.2932, 0.3229, 0.0316],
          [0.3028, 0.2994, 0.0112],
          [0.2885, 0.2784, -0.0088],
          [0.2981, 0.2549, -0.0283],
          [0.2838, 0.2339, -0.0473],
          [0.2934, 0.2104, -0.0659],
          [0.285, 0.188, -0.0847],
          [0.2844, 0.1821, -0.0717],
          [0.2844, 0.1821, -0.0553],
          [0.285, 0.188, -0.0436],
          [0.2934, 0.2104, -0.0243],
          [0.2838, 0.2339, -0.0053],
          [0.2981, 0.2549, 0.0142],
          [0.2885, 0.2784, 0.0342],
          [0.3028, 0.2994, 0.0546],
          [0.2932, 0.3229, 0.0755],
          [0.3075, 0.3439, 0.0968],
          [0.2979, 0.3674, 0.1186],
          [0.3121, 0.3884, 0.1408],
          [0.3025, 0.4119, 0.1635],
          [0.3168, 0.4329, 0.1867],
          [0.3072, 0.4564, 0.2103],
          [0.3215, 0.4773, 0.2343],
          [0.3119, 0.5008, 0.2588],
          [0.32, 0.5209, 0.2821],
          [0.3186, 0.5076, 0.2877],
          [0.3168, 0.4898, 0.2867],
          [0.3154, 0.4765, 0.2797],
          [0.3072, 0.4564, 0.2569],
          [0.3168, 0.4329, 0.2328],
          [0.3025, 0.4119, 0.2092],
          [0.3121, 0.3884, 0.1861],
          [0.2979, 0.3674, 0.1634],
          [0.3075, 0.3439, 0.1412],
          [0.2932, 0.3229, 0.1194],
          [0.3028, 0.2994, 0.098],
          [0.2885, 0.2784, 0.0772],
          [0.2981, 0.2549, 0.0568],
          [0.2838, 0.2339, 0.0368],
          [0.2934, 0.2104, 0.0173],
          [0.285, 0.188, -0.0024],
          [0.2844, 0.1821, 0.0104],
          [0.2844, 0.1821, 0.0268],
          [0.285, 0.188, 0.0387],
          [0.2934, 0.2104, 0.0589],
          [0.2838, 0.2339, 0.0789],
          [0.2981, 0.2549, 0.0993],
          [0.2885, 0.2784, 0.1202],
          [0.3028, 0.2994, 0.1415],
          [0.2932, 0.3229, 0.1633],
          [0.3075, 0.3439, 0.1855],
          [0.2979, 0.3674, 0.2082],
          [0.3121, 0.3884, 0.2313],
          [0.3025, 0.4119, 0.2549],
          [0.3107, 0.432, 0.2773],
          [0.3093, 0.4186, 0.2827],
          [0.3074, 0.4008, 0.2817],
          [0.306, 0.3875, 0.275],
          [0.2979, 0.3674, 0.253],
          [0.3075, 0.3439, 0.2298],
          [0.2932, 0.3229, 0.2072],
          [0.3028, 0.2994, 0.1849],
          [0.2885, 0.2784, 0.1631],
          [0.2981, 0.2549, 0.1418],
          [0.2838, 0.2339, 0.1209],
          [0.2934, 0.2104, 0.1005],
          [0.285, 0.188, 0.0799],
          [0.2844, 0.1821, 0.0924],
          [0.2844, 0.1821, 0.1088],
          [0.285, 0.188, 0.121],
          [0.2934, 0.2104, 0.1421],
          [0.2838, 0.2339, 0.163],
          [0.2981, 0.2549, 0.1843],
          [0.2885, 0.2784, 0.2061],
          [0.3028, 0.2994, 0.2284],
          [0.2932, 0.3229, 0.251],
          [0.3013, 0.343, 0.2726],
          [0.2999, 0.3297, 0.2777],
          [0.2981, 0.3119, 0.2767],
          [0.2967, 0.2985, 0.2702],
          [0.2885, 0.2784, 0.2491],
          [0.2981, 0.2549, 0.2269],
          [0.2838, 0.2339, 0.2051],
          [0.2934, 0.2104, 0.1838],
          [0.285, 0.188, 0.1622],
          [0.2844, 0.1821, 0.1744],
          [0.2844, 0.1821, 0.1909],
          [0.285, 0.188, 0.2033],
          [0.2934, 0.2104, 0.2254],
          [0.2838, 0.2339, 0.2471],
          [0.292, 0.254, 0.2679],
          [0.2906, 0.2407, 0.2727],
          [0.2887, 0.2229, 0.2717],
          [0.2873, 0.2095, 0.2655],
          [0.285, 0.188, 0.2444],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      });
  if (!endpoint_weave_lateral_left_11) {
    mesh_weave_lateral_left_11Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_weave_lateral_left_11 = new THREE.Mesh(
    mesh_weave_lateral_left_11Geometry,
    materialMap["rope-braided"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_weave_lateral_left_11.name = "Lateral rope lattice (left, +45 deg run)";
  if (endpoint_weave_lateral_left_11) {
    mesh_weave_lateral_left_11.position.copy(
      endpoint_weave_lateral_left_11.midpoint,
    );
    mesh_weave_lateral_left_11.quaternion.copy(
      endpoint_weave_lateral_left_11.quaternion,
    );
  }
  mesh_weave_lateral_left_11.castShadow = options.castShadow ?? true;
  mesh_weave_lateral_left_11.receiveShadow = options.receiveShadow ?? true;
  mesh_weave_lateral_left_11.userData.sculptComponent = {
    id: "weave-lateral-left",
    name: "Lateral rope lattice (left, +45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.3245, 0.5638, -0.3522],
          [0.3308, 0.5663, -0.3494],
          [0.3273, 0.59, -0.3288],
          [0.3279, 0.5959, -0.3151],
          [0.3279, 0.5959, -0.2953],
          [0.3273, 0.59, -0.2794],
          [0.3308, 0.5663, -0.3006],
          [0.3166, 0.5453, -0.3205],
          [0.3262, 0.5218, -0.34],
          [0.3199, 0.5193, -0.3427],
          [0.3185, 0.506, -0.3462],
          [0.3166, 0.4882, -0.3424],
          [0.3152, 0.4748, -0.3332],
          [0.3215, 0.4773, -0.3306],
          [0.3119, 0.5008, -0.3115],
          [0.3262, 0.5218, -0.292],
          [0.3166, 0.5453, -0.2721],
          [0.3308, 0.5663, -0.2517],
          [0.3273, 0.59, -0.23],
          [0.3279, 0.5959, -0.2161],
          [0.3279, 0.5959, -0.1963],
          [0.3273, 0.59, -0.1807],
          [0.3308, 0.5663, -0.2028],
          [0.3166, 0.5453, -0.2236],
          [0.3262, 0.5218, -0.244],
          [0.3119, 0.5008, -0.264],
          [0.3215, 0.4773, -0.2835],
          [0.3072, 0.4564, -0.3026],
          [0.3168, 0.4329, -0.3212],
          [0.3105, 0.4303, -0.3238],
          [0.3091, 0.417, -0.327],
          [0.3072, 0.3992, -0.3231],
          [0.3058, 0.3859, -0.3143],
          [0.3121, 0.3884, -0.3117],
          [0.3025, 0.4119, -0.2936],
          [0.3168, 0.4329, -0.275],
          [0.3072, 0.4564, -0.2559],
          [0.3215, 0.4773, -0.2364],
          [0.3119, 0.5008, -0.2165],
          [0.3262, 0.5218, -0.1961],
          [0.3166, 0.5453, -0.1752],
          [0.3308, 0.5663, -0.1539],
          [0.3273, 0.59, -0.1313],
          [0.3279, 0.5959, -0.1172],
          [0.3279, 0.5959, -0.0974],
          [0.3273, 0.59, -0.0819],
          [0.3308, 0.5663, -0.105],
          [0.3166, 0.5453, -0.1267],
          [0.3262, 0.5218, -0.1481],
          [0.3119, 0.5008, -0.1689],
          [0.3215, 0.4773, -0.1894],
          [0.3072, 0.4564, -0.2093],
          [0.3168, 0.4329, -0.2288],
          [0.3025, 0.4119, -0.2479],
          [0.3121, 0.3884, -0.2665],
          [0.2979, 0.3674, -0.2846],
          [0.3075, 0.3439, -0.3023],
          [0.3012, 0.3414, -0.3048],
          [0.2998, 0.328, -0.3077],
          [0.2979, 0.3102, -0.3039],
          [0.2965, 0.2969, -0.2953],
          [0.3028, 0.2994, -0.2929],
          [0.2932, 0.3229, -0.2756],
          [0.3075, 0.3439, -0.2579],
          [0.2979, 0.3674, -0.2398],
          [0.3121, 0.3884, -0.2212],
          [0.3025, 0.4119, -0.2022],
          [0.3168, 0.4329, -0.1827],
          [0.3072, 0.4564, -0.1627],
          [0.3215, 0.4773, -0.1423],
          [0.3119, 0.5008, -0.1214],
          [0.3262, 0.5218, -0.1001],
          [0.3166, 0.5453, -0.0783],
          [0.3308, 0.5663, -0.0561],
          [0.3273, 0.59, -0.0326],
          [0.3279, 0.5959, -0.0182],
          [0.3279, 0.5959, 0.0016],
          [0.3273, 0.59, 0.0168],
          [0.3308, 0.5663, -0.0072],
          [0.3166, 0.5453, -0.0299],
          [0.3262, 0.5218, -0.0521],
          [0.3119, 0.5008, -0.0739],
          [0.3215, 0.4773, -0.0952],
          [0.3072, 0.4564, -0.1161],
          [0.3168, 0.4329, -0.1365],
          [0.3025, 0.4119, -0.1565],
          [0.3121, 0.3884, -0.176],
          [0.2979, 0.3674, -0.195],
          [0.3075, 0.3439, -0.2136],
          [0.2932, 0.3229, -0.2317],
          [0.3028, 0.2994, -0.2494],
          [0.2885, 0.2784, -0.2667],
          [0.2981, 0.2549, -0.2834],
          [0.2918, 0.2524, -0.2858],
          [0.2904, 0.239, -0.2885],
          [0.2885, 0.2213, -0.2847],
          [0.2871, 0.2079, -0.2763],
          [0.2934, 0.2104, -0.274],
          [0.2838, 0.2339, -0.2577],
          [0.2981, 0.2549, -0.2409],
          [0.2885, 0.2784, -0.2237],
          [0.3028, 0.2994, -0.206],
          [0.2932, 0.3229, -0.1879],
          [0.3075, 0.3439, -0.1693],
          [0.2979, 0.3674, -0.1502],
          [0.3121, 0.3884, -0.1307],
          [0.3025, 0.4119, -0.1107],
          [0.3168, 0.4329, -0.0903],
          [0.3072, 0.4564, -0.0695],
          [0.3215, 0.4773, -0.0481],
          [0.3119, 0.5008, -0.0264],
          [0.3262, 0.5218, -0.0041],
          [0.3166, 0.5453, 0.0186],
          [0.3308, 0.5663, 0.0417],
          [0.3273, 0.59, 0.0662],
          [0.3279, 0.5959, 0.0808],
          [0.3279, 0.5959, 0.1006],
          [0.3273, 0.59, 0.1155],
          [0.3308, 0.5663, 0.0906],
          [0.3166, 0.5453, 0.067],
          [0.3262, 0.5218, 0.0439],
          [0.3119, 0.5008, 0.0212],
          [0.3215, 0.4773, -0.0011],
          [0.3072, 0.4564, -0.0228],
          [0.3168, 0.4329, -0.0442],
          [0.3025, 0.4119, -0.065],
          [0.3121, 0.3884, -0.0854],
          [0.2979, 0.3674, -0.1054],
          [0.3075, 0.3439, -0.1249],
          [0.2932, 0.3229, -0.144],
          [0.3028, 0.2994, -0.1626],
          [0.2885, 0.2784, -0.1807],
          [0.2981, 0.2549, -0.1984],
          [0.2838, 0.2339, -0.2156],
          [0.2934, 0.2104, -0.2324],
          [0.285, 0.188, -0.2493],
          [0.2844, 0.1821, -0.2358],
          [0.2844, 0.1821, -0.2194],
          [0.285, 0.188, -0.2081],
          [0.2934, 0.2104, -0.1908],
          [0.2838, 0.2339, -0.1735],
          [0.2981, 0.2549, -0.1559],
          [0.2885, 0.2784, -0.1377],
          [0.3028, 0.2994, -0.1191],
          [0.2932, 0.3229, -0.1001],
          [0.3075, 0.3439, -0.0806],
          [0.2979, 0.3674, -0.0606],
          [0.3121, 0.3884, -0.0402],
          [0.3025, 0.4119, -0.0193],
          [0.3168, 0.4329, 0.002],
          [0.3072, 0.4564, 0.0238],
          [0.3215, 0.4773, 0.046],
          [0.3119, 0.5008, 0.0687],
          [0.3262, 0.5218, 0.0919],
          [0.3166, 0.5453, 0.1155],
          [0.3308, 0.5663, 0.1395],
          [0.3273, 0.59, 0.1649],
          [0.3279, 0.5959, 0.1798],
          [0.3279, 0.5959, 0.1996],
          [0.3273, 0.59, 0.2143],
          [0.3308, 0.5663, 0.1884],
          [0.3166, 0.5453, 0.1639],
          [0.3262, 0.5218, 0.1398],
          [0.3119, 0.5008, 0.1162],
          [0.3215, 0.4773, 0.0931],
          [0.3072, 0.4564, 0.0704],
          [0.3168, 0.4329, 0.0482],
          [0.3025, 0.4119, 0.0264],
          [0.3121, 0.3884, 0.0051],
          [0.2979, 0.3674, -0.0158],
          [0.3075, 0.3439, -0.0362],
          [0.2932, 0.3229, -0.0562],
          [0.3028, 0.2994, -0.0757],
          [0.2885, 0.2784, -0.0947],
          [0.2981, 0.2549, -0.1133],
          [0.2838, 0.2339, -0.1315],
          [0.2934, 0.2104, -0.1492],
          [0.285, 0.188, -0.167],
          [0.2844, 0.1821, -0.1537],
          [0.2844, 0.1821, -0.1373],
          [0.285, 0.188, -0.1258],
          [0.2934, 0.2104, -0.1075],
          [0.2838, 0.2339, -0.0894],
          [0.2981, 0.2549, -0.0708],
          [0.2885, 0.2784, -0.0518],
          [0.3028, 0.2994, -0.0323],
          [0.2932, 0.3229, -0.0123],
          [0.3075, 0.3439, 0.0081],
          [0.2979, 0.3674, 0.029],
          [0.3121, 0.3884, 0.0503],
          [0.3025, 0.4119, 0.0721],
          [0.3168, 0.4329, 0.0943],
          [0.3072, 0.4564, 0.117],
          [0.3215, 0.4773, 0.1402],
          [0.3119, 0.5008, 0.1638],
          [0.3262, 0.5218, 0.1878],
          [0.3166, 0.5453, 0.2123],
          [0.3308, 0.5663, 0.2373],
          [0.3273, 0.59, 0.2636],
          [0.3265, 0.5826, 0.2699],
          [0.3255, 0.5728, 0.2783],
          [0.3247, 0.5654, 0.2845],
          [0.3166, 0.5453, 0.2608],
          [0.3262, 0.5218, 0.2358],
          [0.3119, 0.5008, 0.2113],
          [0.3215, 0.4773, 0.1872],
          [0.3072, 0.4564, 0.1636],
          [0.3168, 0.4329, 0.1405],
          [0.3025, 0.4119, 0.1178],
          [0.3121, 0.3884, 0.0956],
          [0.2979, 0.3674, 0.0738],
          [0.3075, 0.3439, 0.0525],
          [0.2932, 0.3229, 0.0316],
          [0.3028, 0.2994, 0.0112],
          [0.2885, 0.2784, -0.0088],
          [0.2981, 0.2549, -0.0283],
          [0.2838, 0.2339, -0.0473],
          [0.2934, 0.2104, -0.0659],
          [0.285, 0.188, -0.0847],
          [0.2844, 0.1821, -0.0717],
          [0.2844, 0.1821, -0.0553],
          [0.285, 0.188, -0.0436],
          [0.2934, 0.2104, -0.0243],
          [0.2838, 0.2339, -0.0053],
          [0.2981, 0.2549, 0.0142],
          [0.2885, 0.2784, 0.0342],
          [0.3028, 0.2994, 0.0546],
          [0.2932, 0.3229, 0.0755],
          [0.3075, 0.3439, 0.0968],
          [0.2979, 0.3674, 0.1186],
          [0.3121, 0.3884, 0.1408],
          [0.3025, 0.4119, 0.1635],
          [0.3168, 0.4329, 0.1867],
          [0.3072, 0.4564, 0.2103],
          [0.3215, 0.4773, 0.2343],
          [0.3119, 0.5008, 0.2588],
          [0.32, 0.5209, 0.2821],
          [0.3186, 0.5076, 0.2877],
          [0.3168, 0.4898, 0.2867],
          [0.3154, 0.4765, 0.2797],
          [0.3072, 0.4564, 0.2569],
          [0.3168, 0.4329, 0.2328],
          [0.3025, 0.4119, 0.2092],
          [0.3121, 0.3884, 0.1861],
          [0.2979, 0.3674, 0.1634],
          [0.3075, 0.3439, 0.1412],
          [0.2932, 0.3229, 0.1194],
          [0.3028, 0.2994, 0.098],
          [0.2885, 0.2784, 0.0772],
          [0.2981, 0.2549, 0.0568],
          [0.2838, 0.2339, 0.0368],
          [0.2934, 0.2104, 0.0173],
          [0.285, 0.188, -0.0024],
          [0.2844, 0.1821, 0.0104],
          [0.2844, 0.1821, 0.0268],
          [0.285, 0.188, 0.0387],
          [0.2934, 0.2104, 0.0589],
          [0.2838, 0.2339, 0.0789],
          [0.2981, 0.2549, 0.0993],
          [0.2885, 0.2784, 0.1202],
          [0.3028, 0.2994, 0.1415],
          [0.2932, 0.3229, 0.1633],
          [0.3075, 0.3439, 0.1855],
          [0.2979, 0.3674, 0.2082],
          [0.3121, 0.3884, 0.2313],
          [0.3025, 0.4119, 0.2549],
          [0.3107, 0.432, 0.2773],
          [0.3093, 0.4186, 0.2827],
          [0.3074, 0.4008, 0.2817],
          [0.306, 0.3875, 0.275],
          [0.2979, 0.3674, 0.253],
          [0.3075, 0.3439, 0.2298],
          [0.2932, 0.3229, 0.2072],
          [0.3028, 0.2994, 0.1849],
          [0.2885, 0.2784, 0.1631],
          [0.2981, 0.2549, 0.1418],
          [0.2838, 0.2339, 0.1209],
          [0.2934, 0.2104, 0.1005],
          [0.285, 0.188, 0.0799],
          [0.2844, 0.1821, 0.0924],
          [0.2844, 0.1821, 0.1088],
          [0.285, 0.188, 0.121],
          [0.2934, 0.2104, 0.1421],
          [0.2838, 0.2339, 0.163],
          [0.2981, 0.2549, 0.1843],
          [0.2885, 0.2784, 0.2061],
          [0.3028, 0.2994, 0.2284],
          [0.2932, 0.3229, 0.251],
          [0.3013, 0.343, 0.2726],
          [0.2999, 0.3297, 0.2777],
          [0.2981, 0.3119, 0.2767],
          [0.2967, 0.2985, 0.2702],
          [0.2885, 0.2784, 0.2491],
          [0.2981, 0.2549, 0.2269],
          [0.2838, 0.2339, 0.2051],
          [0.2934, 0.2104, 0.1838],
          [0.285, 0.188, 0.1622],
          [0.2844, 0.1821, 0.1744],
          [0.2844, 0.1821, 0.1909],
          [0.285, 0.188, 0.2033],
          [0.2934, 0.2104, 0.2254],
          [0.2838, 0.2339, 0.2471],
          [0.292, 0.254, 0.2679],
          [0.2906, 0.2407, 0.2727],
          [0.2887, 0.2229, 0.2717],
          [0.2873, 0.2095, 0.2655],
          [0.285, 0.188, 0.2444],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2853, -0.095, -0.2706],
        localEnd: [0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: 45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "lattice-openings",
        kind: "hole",
        description: "See-through diamond openings between strands (d01).",
        realizedInPass: "structural-pass",
      },
      {
        id: "over-under-interlace",
        kind: "ridge",
        description:
          "Strands alternate +/-7.5 mm about the panel plane at every crossing (d02).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-left",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_left_11.add(mesh_weave_lateral_left_11);
  meshes["weave-lateral-left"] = mesh_weave_lateral_left_11;
  colliders["weave-lateral-left"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["weave"] ??= [];
  destructionGroups["weave"].push(node_weave_lateral_left_11);

  const attachment_weave_lateral_left_b_12 = null;
  const endpoint_weave_lateral_left_b_12 = makeAttachmentEndpoint(
    attachment_weave_lateral_left_b_12,
  );
  const node_weave_lateral_left_b_12 = new THREE.Group();
  node_weave_lateral_left_b_12.name =
    "Lateral rope lattice (left, -45 deg run)__pivot";
  node_weave_lateral_left_b_12.scale.set(1, 1, 1);
  if (endpoint_weave_lateral_left_b_12) {
    node_weave_lateral_left_b_12.position.copy(
      endpoint_weave_lateral_left_b_12.start,
    );
    node_weave_lateral_left_b_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_weave_lateral_left_b_12.position.set(0.0, 0.0, 0.0);
    node_weave_lateral_left_b_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_weave_lateral_left_b_12.userData.sculptComponent = {
    id: "weave-lateral-left-b",
    name: "Lateral rope lattice (left, -45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.2878, 0.2142, -0.2776],
          [0.2815, 0.2117, -0.274],
          [0.285, 0.188, -0.2478],
          [0.2844, 0.1821, -0.2343],
          [0.2844, 0.1821, -0.2179],
          [0.285, 0.188, -0.2067],
          [0.2815, 0.2117, -0.2324],
          [0.2958, 0.2327, -0.2577],
          [0.2862, 0.2562, -0.2834],
          [0.2925, 0.2587, -0.2871],
          [0.2939, 0.272, -0.2956],
          [0.2957, 0.2898, -0.2995],
          [0.2972, 0.3032, -0.2966],
          [0.2909, 0.3007, -0.2929],
          [0.3004, 0.2772, -0.2667],
          [0.2862, 0.2562, -0.2409],
          [0.2958, 0.2327, -0.2156],
          [0.2815, 0.2117, -0.1908],
          [0.285, 0.188, -0.1655],
          [0.2844, 0.1821, -0.1523],
          [0.2844, 0.1821, -0.1359],
          [0.285, 0.188, -0.1244],
          [0.2815, 0.2117, -0.1492],
          [0.2958, 0.2327, -0.1735],
          [0.2862, 0.2562, -0.1984],
          [0.3004, 0.2772, -0.2237],
          [0.2909, 0.3007, -0.2494],
          [0.3051, 0.3216, -0.2756],
          [0.2955, 0.3451, -0.3023],
          [0.3018, 0.3477, -0.3061],
          [0.3032, 0.361, -0.3149],
          [0.3051, 0.3788, -0.3187],
          [0.3065, 0.3921, -0.3156],
          [0.3002, 0.3896, -0.3117],
          [0.3098, 0.3661, -0.2846],
          [0.2955, 0.3451, -0.2579],
          [0.3051, 0.3216, -0.2317],
          [0.2909, 0.3007, -0.206],
          [0.3004, 0.2772, -0.1807],
          [0.2862, 0.2562, -0.1559],
          [0.2958, 0.2327, -0.1315],
          [0.2815, 0.2117, -0.1075],
          [0.285, 0.188, -0.0833],
          [0.2844, 0.1821, -0.0702],
          [0.2844, 0.1821, -0.0538],
          [0.285, 0.188, -0.0421],
          [0.2815, 0.2117, -0.0659],
          [0.2958, 0.2327, -0.0894],
          [0.2862, 0.2562, -0.1133],
          [0.3004, 0.2772, -0.1377],
          [0.2909, 0.3007, -0.1626],
          [0.3051, 0.3216, -0.1879],
          [0.2955, 0.3451, -0.2136],
          [0.3098, 0.3661, -0.2398],
          [0.3002, 0.3896, -0.2665],
          [0.3145, 0.4106, -0.2936],
          [0.3049, 0.4341, -0.3212],
          [0.3112, 0.4366, -0.3251],
          [0.3126, 0.45, -0.3341],
          [0.3145, 0.4678, -0.338],
          [0.3159, 0.4811, -0.3346],
          [0.3096, 0.4786, -0.3306],
          [0.3192, 0.4551, -0.3026],
          [0.3049, 0.4341, -0.275],
          [0.3145, 0.4106, -0.2479],
          [0.3002, 0.3896, -0.2212],
          [0.3098, 0.3661, -0.195],
          [0.2955, 0.3451, -0.1693],
          [0.3051, 0.3216, -0.144],
          [0.2909, 0.3007, -0.1191],
          [0.3004, 0.2772, -0.0947],
          [0.2862, 0.2562, -0.0708],
          [0.2958, 0.2327, -0.0473],
          [0.2815, 0.2117, -0.0243],
          [0.285, 0.188, -0.001],
          [0.2844, 0.1821, 0.0118],
          [0.2844, 0.1821, 0.0282],
          [0.285, 0.188, 0.0402],
          [0.2815, 0.2117, 0.0173],
          [0.2958, 0.2327, -0.0053],
          [0.2862, 0.2562, -0.0283],
          [0.3004, 0.2772, -0.0518],
          [0.2909, 0.3007, -0.0757],
          [0.3051, 0.3216, -0.1001],
          [0.2955, 0.3451, -0.1249],
          [0.3098, 0.3661, -0.1502],
          [0.3002, 0.3896, -0.176],
          [0.3145, 0.4106, -0.2022],
          [0.3049, 0.4341, -0.2288],
          [0.3192, 0.4551, -0.2559],
          [0.3096, 0.4786, -0.2835],
          [0.3238, 0.4996, -0.3115],
          [0.3142, 0.5231, -0.34],
          [0.3205, 0.5256, -0.3441],
          [0.3219, 0.539, -0.3533],
          [0.3238, 0.5567, -0.3572],
          [0.3252, 0.5701, -0.3536],
          [0.3189, 0.5676, -0.3494],
          [0.3285, 0.5441, -0.3205],
          [0.3142, 0.5231, -0.292],
          [0.3238, 0.4996, -0.264],
          [0.3096, 0.4786, -0.2364],
          [0.3192, 0.4551, -0.2093],
          [0.3049, 0.4341, -0.1827],
          [0.3145, 0.4106, -0.1565],
          [0.3002, 0.3896, -0.1307],
          [0.3098, 0.3661, -0.1054],
          [0.2955, 0.3451, -0.0806],
          [0.3051, 0.3216, -0.0562],
          [0.2909, 0.3007, -0.0323],
          [0.3004, 0.2772, -0.0088],
          [0.2862, 0.2562, 0.0142],
          [0.2958, 0.2327, 0.0368],
          [0.2815, 0.2117, 0.0589],
          [0.285, 0.188, 0.0813],
          [0.2844, 0.1821, 0.0938],
          [0.2844, 0.1821, 0.1103],
          [0.285, 0.188, 0.1225],
          [0.2815, 0.2117, 0.1005],
          [0.2958, 0.2327, 0.0789],
          [0.2862, 0.2562, 0.0568],
          [0.3004, 0.2772, 0.0342],
          [0.2909, 0.3007, 0.0112],
          [0.3051, 0.3216, -0.0123],
          [0.2955, 0.3451, -0.0362],
          [0.3098, 0.3661, -0.0606],
          [0.3002, 0.3896, -0.0854],
          [0.3145, 0.4106, -0.1107],
          [0.3049, 0.4341, -0.1365],
          [0.3192, 0.4551, -0.1627],
          [0.3096, 0.4786, -0.1894],
          [0.3238, 0.4996, -0.2165],
          [0.3142, 0.5231, -0.244],
          [0.3285, 0.5441, -0.2721],
          [0.3189, 0.5676, -0.3006],
          [0.3273, 0.59, -0.3305],
          [0.3279, 0.5959, -0.3169],
          [0.3279, 0.5959, -0.2971],
          [0.3273, 0.59, -0.2811],
          [0.3189, 0.5676, -0.2517],
          [0.3285, 0.5441, -0.2236],
          [0.3142, 0.5231, -0.1961],
          [0.3238, 0.4996, -0.1689],
          [0.3096, 0.4786, -0.1423],
          [0.3192, 0.4551, -0.1161],
          [0.3049, 0.4341, -0.0903],
          [0.3145, 0.4106, -0.065],
          [0.3002, 0.3896, -0.0402],
          [0.3098, 0.3661, -0.0158],
          [0.2955, 0.3451, 0.0081],
          [0.3051, 0.3216, 0.0316],
          [0.2909, 0.3007, 0.0546],
          [0.3004, 0.2772, 0.0772],
          [0.2862, 0.2562, 0.0993],
          [0.2958, 0.2327, 0.1209],
          [0.2815, 0.2117, 0.1421],
          [0.285, 0.188, 0.1636],
          [0.2844, 0.1821, 0.1759],
          [0.2844, 0.1821, 0.1923],
          [0.285, 0.188, 0.2047],
          [0.2815, 0.2117, 0.1838],
          [0.2958, 0.2327, 0.163],
          [0.2862, 0.2562, 0.1418],
          [0.3004, 0.2772, 0.1202],
          [0.2909, 0.3007, 0.098],
          [0.3051, 0.3216, 0.0755],
          [0.2955, 0.3451, 0.0525],
          [0.3098, 0.3661, 0.029],
          [0.3002, 0.3896, 0.0051],
          [0.3145, 0.4106, -0.0193],
          [0.3049, 0.4341, -0.0442],
          [0.3192, 0.4551, -0.0695],
          [0.3096, 0.4786, -0.0952],
          [0.3238, 0.4996, -0.1214],
          [0.3142, 0.5231, -0.1481],
          [0.3285, 0.5441, -0.1752],
          [0.3189, 0.5676, -0.2028],
          [0.3273, 0.59, -0.2318],
          [0.3279, 0.5959, -0.2179],
          [0.3279, 0.5959, -0.1981],
          [0.3273, 0.59, -0.1824],
          [0.3189, 0.5676, -0.1539],
          [0.3285, 0.5441, -0.1267],
          [0.3142, 0.5231, -0.1001],
          [0.3238, 0.4996, -0.0739],
          [0.3096, 0.4786, -0.0481],
          [0.3192, 0.4551, -0.0228],
          [0.3049, 0.4341, 0.002],
          [0.3145, 0.4106, 0.0264],
          [0.3002, 0.3896, 0.0503],
          [0.3098, 0.3661, 0.0738],
          [0.2955, 0.3451, 0.0968],
          [0.3051, 0.3216, 0.1194],
          [0.2909, 0.3007, 0.1415],
          [0.3004, 0.2772, 0.1631],
          [0.2862, 0.2562, 0.1843],
          [0.2958, 0.2327, 0.2051],
          [0.2815, 0.2117, 0.2254],
          [0.285, 0.188, 0.2459],
          [0.2858, 0.1954, 0.2518],
          [0.2869, 0.2052, 0.2597],
          [0.2876, 0.2126, 0.2656],
          [0.2958, 0.2327, 0.2471],
          [0.2862, 0.2562, 0.2269],
          [0.3004, 0.2772, 0.2061],
          [0.2909, 0.3007, 0.1849],
          [0.3051, 0.3216, 0.1633],
          [0.2955, 0.3451, 0.1412],
          [0.3098, 0.3661, 0.1186],
          [0.3002, 0.3896, 0.0956],
          [0.3145, 0.4106, 0.0721],
          [0.3049, 0.4341, 0.0482],
          [0.3192, 0.4551, 0.0238],
          [0.3096, 0.4786, -0.0011],
          [0.3238, 0.4996, -0.0264],
          [0.3142, 0.5231, -0.0521],
          [0.3285, 0.5441, -0.0783],
          [0.3189, 0.5676, -0.105],
          [0.3273, 0.59, -0.133],
          [0.3279, 0.5959, -0.1189],
          [0.3279, 0.5959, -0.0991],
          [0.3273, 0.59, -0.0837],
          [0.3189, 0.5676, -0.0561],
          [0.3285, 0.5441, -0.0299],
          [0.3142, 0.5231, -0.0041],
          [0.3238, 0.4996, 0.0212],
          [0.3096, 0.4786, 0.046],
          [0.3192, 0.4551, 0.0704],
          [0.3049, 0.4341, 0.0943],
          [0.3145, 0.4106, 0.1178],
          [0.3002, 0.3896, 0.1408],
          [0.3098, 0.3661, 0.1634],
          [0.2955, 0.3451, 0.1855],
          [0.3051, 0.3216, 0.2072],
          [0.2909, 0.3007, 0.2284],
          [0.3004, 0.2772, 0.2491],
          [0.2923, 0.2571, 0.268],
          [0.2937, 0.2704, 0.2744],
          [0.2956, 0.2882, 0.2754],
          [0.297, 0.3015, 0.2704],
          [0.3051, 0.3216, 0.251],
          [0.2955, 0.3451, 0.2298],
          [0.3098, 0.3661, 0.2082],
          [0.3002, 0.3896, 0.1861],
          [0.3145, 0.4106, 0.1635],
          [0.3049, 0.4341, 0.1405],
          [0.3192, 0.4551, 0.117],
          [0.3096, 0.4786, 0.0931],
          [0.3238, 0.4996, 0.0687],
          [0.3142, 0.5231, 0.0439],
          [0.3285, 0.5441, 0.0186],
          [0.3189, 0.5676, -0.0072],
          [0.3273, 0.59, -0.0343],
          [0.3279, 0.5959, -0.0199],
          [0.3279, 0.5959, -0.0001],
          [0.3273, 0.59, 0.0151],
          [0.3189, 0.5676, 0.0417],
          [0.3285, 0.5441, 0.067],
          [0.3142, 0.5231, 0.0919],
          [0.3238, 0.4996, 0.1162],
          [0.3096, 0.4786, 0.1402],
          [0.3192, 0.4551, 0.1636],
          [0.3049, 0.4341, 0.1867],
          [0.3145, 0.4106, 0.2092],
          [0.3002, 0.3896, 0.2313],
          [0.3098, 0.3661, 0.253],
          [0.3017, 0.346, 0.2728],
          [0.3031, 0.3594, 0.2794],
          [0.3049, 0.3772, 0.2804],
          [0.3063, 0.3905, 0.2751],
          [0.3145, 0.4106, 0.2549],
          [0.3049, 0.4341, 0.2328],
          [0.3192, 0.4551, 0.2103],
          [0.3096, 0.4786, 0.1872],
          [0.3238, 0.4996, 0.1638],
          [0.3142, 0.5231, 0.1398],
          [0.3285, 0.5441, 0.1155],
          [0.3189, 0.5676, 0.0906],
          [0.3273, 0.59, 0.0644],
          [0.3279, 0.5959, 0.079],
          [0.3279, 0.5959, 0.0988],
          [0.3273, 0.59, 0.1138],
          [0.3189, 0.5676, 0.1395],
          [0.3285, 0.5441, 0.1639],
          [0.3142, 0.5231, 0.1878],
          [0.3238, 0.4996, 0.2113],
          [0.3096, 0.4786, 0.2343],
          [0.3192, 0.4551, 0.2569],
          [0.311, 0.435, 0.2775],
          [0.3124, 0.4483, 0.2844],
          [0.3143, 0.4661, 0.2854],
          [0.3157, 0.4795, 0.2799],
          [0.3238, 0.4996, 0.2588],
          [0.3142, 0.5231, 0.2358],
          [0.3285, 0.5441, 0.2123],
          [0.3189, 0.5676, 0.1884],
          [0.3273, 0.59, 0.1632],
          [0.3279, 0.5959, 0.178],
          [0.3279, 0.5959, 0.1978],
          [0.3273, 0.59, 0.2125],
          [0.3189, 0.5676, 0.2373],
          [0.3285, 0.5441, 0.2608],
          [0.3204, 0.524, 0.2822],
          [0.3218, 0.5373, 0.2894],
          [0.3236, 0.5551, 0.2904],
          [0.325, 0.5685, 0.2846],
          [0.3273, 0.59, 0.2619],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2853, -0.095, -0.2706],
        localEnd: [0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: -45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-left-b",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_left_b_12.userData.actionProfile = {
    animationRole: "weave-panel",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "weave",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0.12, 0, 0],
    },
  };
  (nodes["root"] ?? root).add(node_weave_lateral_left_b_12);
  nodes["weave-lateral-left-b"] = node_weave_lateral_left_b_12;
  const mesh_weave_lateral_left_b_12Geometry = endpoint_weave_lateral_left_b_12
    ? new THREE.CylinderGeometry(
        endpoint_weave_lateral_left_b_12.endRadius,
        endpoint_weave_lateral_left_b_12.baseRadius,
        endpoint_weave_lateral_left_b_12.length,
        16,
        6,
      )
    : buildTubeGeometry({
        points: [
          [0.2878, 0.2142, -0.2776],
          [0.2815, 0.2117, -0.274],
          [0.285, 0.188, -0.2478],
          [0.2844, 0.1821, -0.2343],
          [0.2844, 0.1821, -0.2179],
          [0.285, 0.188, -0.2067],
          [0.2815, 0.2117, -0.2324],
          [0.2958, 0.2327, -0.2577],
          [0.2862, 0.2562, -0.2834],
          [0.2925, 0.2587, -0.2871],
          [0.2939, 0.272, -0.2956],
          [0.2957, 0.2898, -0.2995],
          [0.2972, 0.3032, -0.2966],
          [0.2909, 0.3007, -0.2929],
          [0.3004, 0.2772, -0.2667],
          [0.2862, 0.2562, -0.2409],
          [0.2958, 0.2327, -0.2156],
          [0.2815, 0.2117, -0.1908],
          [0.285, 0.188, -0.1655],
          [0.2844, 0.1821, -0.1523],
          [0.2844, 0.1821, -0.1359],
          [0.285, 0.188, -0.1244],
          [0.2815, 0.2117, -0.1492],
          [0.2958, 0.2327, -0.1735],
          [0.2862, 0.2562, -0.1984],
          [0.3004, 0.2772, -0.2237],
          [0.2909, 0.3007, -0.2494],
          [0.3051, 0.3216, -0.2756],
          [0.2955, 0.3451, -0.3023],
          [0.3018, 0.3477, -0.3061],
          [0.3032, 0.361, -0.3149],
          [0.3051, 0.3788, -0.3187],
          [0.3065, 0.3921, -0.3156],
          [0.3002, 0.3896, -0.3117],
          [0.3098, 0.3661, -0.2846],
          [0.2955, 0.3451, -0.2579],
          [0.3051, 0.3216, -0.2317],
          [0.2909, 0.3007, -0.206],
          [0.3004, 0.2772, -0.1807],
          [0.2862, 0.2562, -0.1559],
          [0.2958, 0.2327, -0.1315],
          [0.2815, 0.2117, -0.1075],
          [0.285, 0.188, -0.0833],
          [0.2844, 0.1821, -0.0702],
          [0.2844, 0.1821, -0.0538],
          [0.285, 0.188, -0.0421],
          [0.2815, 0.2117, -0.0659],
          [0.2958, 0.2327, -0.0894],
          [0.2862, 0.2562, -0.1133],
          [0.3004, 0.2772, -0.1377],
          [0.2909, 0.3007, -0.1626],
          [0.3051, 0.3216, -0.1879],
          [0.2955, 0.3451, -0.2136],
          [0.3098, 0.3661, -0.2398],
          [0.3002, 0.3896, -0.2665],
          [0.3145, 0.4106, -0.2936],
          [0.3049, 0.4341, -0.3212],
          [0.3112, 0.4366, -0.3251],
          [0.3126, 0.45, -0.3341],
          [0.3145, 0.4678, -0.338],
          [0.3159, 0.4811, -0.3346],
          [0.3096, 0.4786, -0.3306],
          [0.3192, 0.4551, -0.3026],
          [0.3049, 0.4341, -0.275],
          [0.3145, 0.4106, -0.2479],
          [0.3002, 0.3896, -0.2212],
          [0.3098, 0.3661, -0.195],
          [0.2955, 0.3451, -0.1693],
          [0.3051, 0.3216, -0.144],
          [0.2909, 0.3007, -0.1191],
          [0.3004, 0.2772, -0.0947],
          [0.2862, 0.2562, -0.0708],
          [0.2958, 0.2327, -0.0473],
          [0.2815, 0.2117, -0.0243],
          [0.285, 0.188, -0.001],
          [0.2844, 0.1821, 0.0118],
          [0.2844, 0.1821, 0.0282],
          [0.285, 0.188, 0.0402],
          [0.2815, 0.2117, 0.0173],
          [0.2958, 0.2327, -0.0053],
          [0.2862, 0.2562, -0.0283],
          [0.3004, 0.2772, -0.0518],
          [0.2909, 0.3007, -0.0757],
          [0.3051, 0.3216, -0.1001],
          [0.2955, 0.3451, -0.1249],
          [0.3098, 0.3661, -0.1502],
          [0.3002, 0.3896, -0.176],
          [0.3145, 0.4106, -0.2022],
          [0.3049, 0.4341, -0.2288],
          [0.3192, 0.4551, -0.2559],
          [0.3096, 0.4786, -0.2835],
          [0.3238, 0.4996, -0.3115],
          [0.3142, 0.5231, -0.34],
          [0.3205, 0.5256, -0.3441],
          [0.3219, 0.539, -0.3533],
          [0.3238, 0.5567, -0.3572],
          [0.3252, 0.5701, -0.3536],
          [0.3189, 0.5676, -0.3494],
          [0.3285, 0.5441, -0.3205],
          [0.3142, 0.5231, -0.292],
          [0.3238, 0.4996, -0.264],
          [0.3096, 0.4786, -0.2364],
          [0.3192, 0.4551, -0.2093],
          [0.3049, 0.4341, -0.1827],
          [0.3145, 0.4106, -0.1565],
          [0.3002, 0.3896, -0.1307],
          [0.3098, 0.3661, -0.1054],
          [0.2955, 0.3451, -0.0806],
          [0.3051, 0.3216, -0.0562],
          [0.2909, 0.3007, -0.0323],
          [0.3004, 0.2772, -0.0088],
          [0.2862, 0.2562, 0.0142],
          [0.2958, 0.2327, 0.0368],
          [0.2815, 0.2117, 0.0589],
          [0.285, 0.188, 0.0813],
          [0.2844, 0.1821, 0.0938],
          [0.2844, 0.1821, 0.1103],
          [0.285, 0.188, 0.1225],
          [0.2815, 0.2117, 0.1005],
          [0.2958, 0.2327, 0.0789],
          [0.2862, 0.2562, 0.0568],
          [0.3004, 0.2772, 0.0342],
          [0.2909, 0.3007, 0.0112],
          [0.3051, 0.3216, -0.0123],
          [0.2955, 0.3451, -0.0362],
          [0.3098, 0.3661, -0.0606],
          [0.3002, 0.3896, -0.0854],
          [0.3145, 0.4106, -0.1107],
          [0.3049, 0.4341, -0.1365],
          [0.3192, 0.4551, -0.1627],
          [0.3096, 0.4786, -0.1894],
          [0.3238, 0.4996, -0.2165],
          [0.3142, 0.5231, -0.244],
          [0.3285, 0.5441, -0.2721],
          [0.3189, 0.5676, -0.3006],
          [0.3273, 0.59, -0.3305],
          [0.3279, 0.5959, -0.3169],
          [0.3279, 0.5959, -0.2971],
          [0.3273, 0.59, -0.2811],
          [0.3189, 0.5676, -0.2517],
          [0.3285, 0.5441, -0.2236],
          [0.3142, 0.5231, -0.1961],
          [0.3238, 0.4996, -0.1689],
          [0.3096, 0.4786, -0.1423],
          [0.3192, 0.4551, -0.1161],
          [0.3049, 0.4341, -0.0903],
          [0.3145, 0.4106, -0.065],
          [0.3002, 0.3896, -0.0402],
          [0.3098, 0.3661, -0.0158],
          [0.2955, 0.3451, 0.0081],
          [0.3051, 0.3216, 0.0316],
          [0.2909, 0.3007, 0.0546],
          [0.3004, 0.2772, 0.0772],
          [0.2862, 0.2562, 0.0993],
          [0.2958, 0.2327, 0.1209],
          [0.2815, 0.2117, 0.1421],
          [0.285, 0.188, 0.1636],
          [0.2844, 0.1821, 0.1759],
          [0.2844, 0.1821, 0.1923],
          [0.285, 0.188, 0.2047],
          [0.2815, 0.2117, 0.1838],
          [0.2958, 0.2327, 0.163],
          [0.2862, 0.2562, 0.1418],
          [0.3004, 0.2772, 0.1202],
          [0.2909, 0.3007, 0.098],
          [0.3051, 0.3216, 0.0755],
          [0.2955, 0.3451, 0.0525],
          [0.3098, 0.3661, 0.029],
          [0.3002, 0.3896, 0.0051],
          [0.3145, 0.4106, -0.0193],
          [0.3049, 0.4341, -0.0442],
          [0.3192, 0.4551, -0.0695],
          [0.3096, 0.4786, -0.0952],
          [0.3238, 0.4996, -0.1214],
          [0.3142, 0.5231, -0.1481],
          [0.3285, 0.5441, -0.1752],
          [0.3189, 0.5676, -0.2028],
          [0.3273, 0.59, -0.2318],
          [0.3279, 0.5959, -0.2179],
          [0.3279, 0.5959, -0.1981],
          [0.3273, 0.59, -0.1824],
          [0.3189, 0.5676, -0.1539],
          [0.3285, 0.5441, -0.1267],
          [0.3142, 0.5231, -0.1001],
          [0.3238, 0.4996, -0.0739],
          [0.3096, 0.4786, -0.0481],
          [0.3192, 0.4551, -0.0228],
          [0.3049, 0.4341, 0.002],
          [0.3145, 0.4106, 0.0264],
          [0.3002, 0.3896, 0.0503],
          [0.3098, 0.3661, 0.0738],
          [0.2955, 0.3451, 0.0968],
          [0.3051, 0.3216, 0.1194],
          [0.2909, 0.3007, 0.1415],
          [0.3004, 0.2772, 0.1631],
          [0.2862, 0.2562, 0.1843],
          [0.2958, 0.2327, 0.2051],
          [0.2815, 0.2117, 0.2254],
          [0.285, 0.188, 0.2459],
          [0.2858, 0.1954, 0.2518],
          [0.2869, 0.2052, 0.2597],
          [0.2876, 0.2126, 0.2656],
          [0.2958, 0.2327, 0.2471],
          [0.2862, 0.2562, 0.2269],
          [0.3004, 0.2772, 0.2061],
          [0.2909, 0.3007, 0.1849],
          [0.3051, 0.3216, 0.1633],
          [0.2955, 0.3451, 0.1412],
          [0.3098, 0.3661, 0.1186],
          [0.3002, 0.3896, 0.0956],
          [0.3145, 0.4106, 0.0721],
          [0.3049, 0.4341, 0.0482],
          [0.3192, 0.4551, 0.0238],
          [0.3096, 0.4786, -0.0011],
          [0.3238, 0.4996, -0.0264],
          [0.3142, 0.5231, -0.0521],
          [0.3285, 0.5441, -0.0783],
          [0.3189, 0.5676, -0.105],
          [0.3273, 0.59, -0.133],
          [0.3279, 0.5959, -0.1189],
          [0.3279, 0.5959, -0.0991],
          [0.3273, 0.59, -0.0837],
          [0.3189, 0.5676, -0.0561],
          [0.3285, 0.5441, -0.0299],
          [0.3142, 0.5231, -0.0041],
          [0.3238, 0.4996, 0.0212],
          [0.3096, 0.4786, 0.046],
          [0.3192, 0.4551, 0.0704],
          [0.3049, 0.4341, 0.0943],
          [0.3145, 0.4106, 0.1178],
          [0.3002, 0.3896, 0.1408],
          [0.3098, 0.3661, 0.1634],
          [0.2955, 0.3451, 0.1855],
          [0.3051, 0.3216, 0.2072],
          [0.2909, 0.3007, 0.2284],
          [0.3004, 0.2772, 0.2491],
          [0.2923, 0.2571, 0.268],
          [0.2937, 0.2704, 0.2744],
          [0.2956, 0.2882, 0.2754],
          [0.297, 0.3015, 0.2704],
          [0.3051, 0.3216, 0.251],
          [0.2955, 0.3451, 0.2298],
          [0.3098, 0.3661, 0.2082],
          [0.3002, 0.3896, 0.1861],
          [0.3145, 0.4106, 0.1635],
          [0.3049, 0.4341, 0.1405],
          [0.3192, 0.4551, 0.117],
          [0.3096, 0.4786, 0.0931],
          [0.3238, 0.4996, 0.0687],
          [0.3142, 0.5231, 0.0439],
          [0.3285, 0.5441, 0.0186],
          [0.3189, 0.5676, -0.0072],
          [0.3273, 0.59, -0.0343],
          [0.3279, 0.5959, -0.0199],
          [0.3279, 0.5959, -0.0001],
          [0.3273, 0.59, 0.0151],
          [0.3189, 0.5676, 0.0417],
          [0.3285, 0.5441, 0.067],
          [0.3142, 0.5231, 0.0919],
          [0.3238, 0.4996, 0.1162],
          [0.3096, 0.4786, 0.1402],
          [0.3192, 0.4551, 0.1636],
          [0.3049, 0.4341, 0.1867],
          [0.3145, 0.4106, 0.2092],
          [0.3002, 0.3896, 0.2313],
          [0.3098, 0.3661, 0.253],
          [0.3017, 0.346, 0.2728],
          [0.3031, 0.3594, 0.2794],
          [0.3049, 0.3772, 0.2804],
          [0.3063, 0.3905, 0.2751],
          [0.3145, 0.4106, 0.2549],
          [0.3049, 0.4341, 0.2328],
          [0.3192, 0.4551, 0.2103],
          [0.3096, 0.4786, 0.1872],
          [0.3238, 0.4996, 0.1638],
          [0.3142, 0.5231, 0.1398],
          [0.3285, 0.5441, 0.1155],
          [0.3189, 0.5676, 0.0906],
          [0.3273, 0.59, 0.0644],
          [0.3279, 0.5959, 0.079],
          [0.3279, 0.5959, 0.0988],
          [0.3273, 0.59, 0.1138],
          [0.3189, 0.5676, 0.1395],
          [0.3285, 0.5441, 0.1639],
          [0.3142, 0.5231, 0.1878],
          [0.3238, 0.4996, 0.2113],
          [0.3096, 0.4786, 0.2343],
          [0.3192, 0.4551, 0.2569],
          [0.311, 0.435, 0.2775],
          [0.3124, 0.4483, 0.2844],
          [0.3143, 0.4661, 0.2854],
          [0.3157, 0.4795, 0.2799],
          [0.3238, 0.4996, 0.2588],
          [0.3142, 0.5231, 0.2358],
          [0.3285, 0.5441, 0.2123],
          [0.3189, 0.5676, 0.1884],
          [0.3273, 0.59, 0.1632],
          [0.3279, 0.5959, 0.178],
          [0.3279, 0.5959, 0.1978],
          [0.3273, 0.59, 0.2125],
          [0.3189, 0.5676, 0.2373],
          [0.3285, 0.5441, 0.2608],
          [0.3204, 0.524, 0.2822],
          [0.3218, 0.5373, 0.2894],
          [0.3236, 0.5551, 0.2904],
          [0.325, 0.5685, 0.2846],
          [0.3273, 0.59, 0.2619],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      });
  if (!endpoint_weave_lateral_left_b_12) {
    mesh_weave_lateral_left_b_12Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_weave_lateral_left_b_12 = new THREE.Mesh(
    mesh_weave_lateral_left_b_12Geometry,
    materialMap["rope-braided"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_weave_lateral_left_b_12.name =
    "Lateral rope lattice (left, -45 deg run)";
  if (endpoint_weave_lateral_left_b_12) {
    mesh_weave_lateral_left_b_12.position.copy(
      endpoint_weave_lateral_left_b_12.midpoint,
    );
    mesh_weave_lateral_left_b_12.quaternion.copy(
      endpoint_weave_lateral_left_b_12.quaternion,
    );
  }
  mesh_weave_lateral_left_b_12.castShadow = options.castShadow ?? true;
  mesh_weave_lateral_left_b_12.receiveShadow = options.receiveShadow ?? true;
  mesh_weave_lateral_left_b_12.userData.sculptComponent = {
    id: "weave-lateral-left-b",
    name: "Lateral rope lattice (left, -45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.2878, 0.2142, -0.2776],
          [0.2815, 0.2117, -0.274],
          [0.285, 0.188, -0.2478],
          [0.2844, 0.1821, -0.2343],
          [0.2844, 0.1821, -0.2179],
          [0.285, 0.188, -0.2067],
          [0.2815, 0.2117, -0.2324],
          [0.2958, 0.2327, -0.2577],
          [0.2862, 0.2562, -0.2834],
          [0.2925, 0.2587, -0.2871],
          [0.2939, 0.272, -0.2956],
          [0.2957, 0.2898, -0.2995],
          [0.2972, 0.3032, -0.2966],
          [0.2909, 0.3007, -0.2929],
          [0.3004, 0.2772, -0.2667],
          [0.2862, 0.2562, -0.2409],
          [0.2958, 0.2327, -0.2156],
          [0.2815, 0.2117, -0.1908],
          [0.285, 0.188, -0.1655],
          [0.2844, 0.1821, -0.1523],
          [0.2844, 0.1821, -0.1359],
          [0.285, 0.188, -0.1244],
          [0.2815, 0.2117, -0.1492],
          [0.2958, 0.2327, -0.1735],
          [0.2862, 0.2562, -0.1984],
          [0.3004, 0.2772, -0.2237],
          [0.2909, 0.3007, -0.2494],
          [0.3051, 0.3216, -0.2756],
          [0.2955, 0.3451, -0.3023],
          [0.3018, 0.3477, -0.3061],
          [0.3032, 0.361, -0.3149],
          [0.3051, 0.3788, -0.3187],
          [0.3065, 0.3921, -0.3156],
          [0.3002, 0.3896, -0.3117],
          [0.3098, 0.3661, -0.2846],
          [0.2955, 0.3451, -0.2579],
          [0.3051, 0.3216, -0.2317],
          [0.2909, 0.3007, -0.206],
          [0.3004, 0.2772, -0.1807],
          [0.2862, 0.2562, -0.1559],
          [0.2958, 0.2327, -0.1315],
          [0.2815, 0.2117, -0.1075],
          [0.285, 0.188, -0.0833],
          [0.2844, 0.1821, -0.0702],
          [0.2844, 0.1821, -0.0538],
          [0.285, 0.188, -0.0421],
          [0.2815, 0.2117, -0.0659],
          [0.2958, 0.2327, -0.0894],
          [0.2862, 0.2562, -0.1133],
          [0.3004, 0.2772, -0.1377],
          [0.2909, 0.3007, -0.1626],
          [0.3051, 0.3216, -0.1879],
          [0.2955, 0.3451, -0.2136],
          [0.3098, 0.3661, -0.2398],
          [0.3002, 0.3896, -0.2665],
          [0.3145, 0.4106, -0.2936],
          [0.3049, 0.4341, -0.3212],
          [0.3112, 0.4366, -0.3251],
          [0.3126, 0.45, -0.3341],
          [0.3145, 0.4678, -0.338],
          [0.3159, 0.4811, -0.3346],
          [0.3096, 0.4786, -0.3306],
          [0.3192, 0.4551, -0.3026],
          [0.3049, 0.4341, -0.275],
          [0.3145, 0.4106, -0.2479],
          [0.3002, 0.3896, -0.2212],
          [0.3098, 0.3661, -0.195],
          [0.2955, 0.3451, -0.1693],
          [0.3051, 0.3216, -0.144],
          [0.2909, 0.3007, -0.1191],
          [0.3004, 0.2772, -0.0947],
          [0.2862, 0.2562, -0.0708],
          [0.2958, 0.2327, -0.0473],
          [0.2815, 0.2117, -0.0243],
          [0.285, 0.188, -0.001],
          [0.2844, 0.1821, 0.0118],
          [0.2844, 0.1821, 0.0282],
          [0.285, 0.188, 0.0402],
          [0.2815, 0.2117, 0.0173],
          [0.2958, 0.2327, -0.0053],
          [0.2862, 0.2562, -0.0283],
          [0.3004, 0.2772, -0.0518],
          [0.2909, 0.3007, -0.0757],
          [0.3051, 0.3216, -0.1001],
          [0.2955, 0.3451, -0.1249],
          [0.3098, 0.3661, -0.1502],
          [0.3002, 0.3896, -0.176],
          [0.3145, 0.4106, -0.2022],
          [0.3049, 0.4341, -0.2288],
          [0.3192, 0.4551, -0.2559],
          [0.3096, 0.4786, -0.2835],
          [0.3238, 0.4996, -0.3115],
          [0.3142, 0.5231, -0.34],
          [0.3205, 0.5256, -0.3441],
          [0.3219, 0.539, -0.3533],
          [0.3238, 0.5567, -0.3572],
          [0.3252, 0.5701, -0.3536],
          [0.3189, 0.5676, -0.3494],
          [0.3285, 0.5441, -0.3205],
          [0.3142, 0.5231, -0.292],
          [0.3238, 0.4996, -0.264],
          [0.3096, 0.4786, -0.2364],
          [0.3192, 0.4551, -0.2093],
          [0.3049, 0.4341, -0.1827],
          [0.3145, 0.4106, -0.1565],
          [0.3002, 0.3896, -0.1307],
          [0.3098, 0.3661, -0.1054],
          [0.2955, 0.3451, -0.0806],
          [0.3051, 0.3216, -0.0562],
          [0.2909, 0.3007, -0.0323],
          [0.3004, 0.2772, -0.0088],
          [0.2862, 0.2562, 0.0142],
          [0.2958, 0.2327, 0.0368],
          [0.2815, 0.2117, 0.0589],
          [0.285, 0.188, 0.0813],
          [0.2844, 0.1821, 0.0938],
          [0.2844, 0.1821, 0.1103],
          [0.285, 0.188, 0.1225],
          [0.2815, 0.2117, 0.1005],
          [0.2958, 0.2327, 0.0789],
          [0.2862, 0.2562, 0.0568],
          [0.3004, 0.2772, 0.0342],
          [0.2909, 0.3007, 0.0112],
          [0.3051, 0.3216, -0.0123],
          [0.2955, 0.3451, -0.0362],
          [0.3098, 0.3661, -0.0606],
          [0.3002, 0.3896, -0.0854],
          [0.3145, 0.4106, -0.1107],
          [0.3049, 0.4341, -0.1365],
          [0.3192, 0.4551, -0.1627],
          [0.3096, 0.4786, -0.1894],
          [0.3238, 0.4996, -0.2165],
          [0.3142, 0.5231, -0.244],
          [0.3285, 0.5441, -0.2721],
          [0.3189, 0.5676, -0.3006],
          [0.3273, 0.59, -0.3305],
          [0.3279, 0.5959, -0.3169],
          [0.3279, 0.5959, -0.2971],
          [0.3273, 0.59, -0.2811],
          [0.3189, 0.5676, -0.2517],
          [0.3285, 0.5441, -0.2236],
          [0.3142, 0.5231, -0.1961],
          [0.3238, 0.4996, -0.1689],
          [0.3096, 0.4786, -0.1423],
          [0.3192, 0.4551, -0.1161],
          [0.3049, 0.4341, -0.0903],
          [0.3145, 0.4106, -0.065],
          [0.3002, 0.3896, -0.0402],
          [0.3098, 0.3661, -0.0158],
          [0.2955, 0.3451, 0.0081],
          [0.3051, 0.3216, 0.0316],
          [0.2909, 0.3007, 0.0546],
          [0.3004, 0.2772, 0.0772],
          [0.2862, 0.2562, 0.0993],
          [0.2958, 0.2327, 0.1209],
          [0.2815, 0.2117, 0.1421],
          [0.285, 0.188, 0.1636],
          [0.2844, 0.1821, 0.1759],
          [0.2844, 0.1821, 0.1923],
          [0.285, 0.188, 0.2047],
          [0.2815, 0.2117, 0.1838],
          [0.2958, 0.2327, 0.163],
          [0.2862, 0.2562, 0.1418],
          [0.3004, 0.2772, 0.1202],
          [0.2909, 0.3007, 0.098],
          [0.3051, 0.3216, 0.0755],
          [0.2955, 0.3451, 0.0525],
          [0.3098, 0.3661, 0.029],
          [0.3002, 0.3896, 0.0051],
          [0.3145, 0.4106, -0.0193],
          [0.3049, 0.4341, -0.0442],
          [0.3192, 0.4551, -0.0695],
          [0.3096, 0.4786, -0.0952],
          [0.3238, 0.4996, -0.1214],
          [0.3142, 0.5231, -0.1481],
          [0.3285, 0.5441, -0.1752],
          [0.3189, 0.5676, -0.2028],
          [0.3273, 0.59, -0.2318],
          [0.3279, 0.5959, -0.2179],
          [0.3279, 0.5959, -0.1981],
          [0.3273, 0.59, -0.1824],
          [0.3189, 0.5676, -0.1539],
          [0.3285, 0.5441, -0.1267],
          [0.3142, 0.5231, -0.1001],
          [0.3238, 0.4996, -0.0739],
          [0.3096, 0.4786, -0.0481],
          [0.3192, 0.4551, -0.0228],
          [0.3049, 0.4341, 0.002],
          [0.3145, 0.4106, 0.0264],
          [0.3002, 0.3896, 0.0503],
          [0.3098, 0.3661, 0.0738],
          [0.2955, 0.3451, 0.0968],
          [0.3051, 0.3216, 0.1194],
          [0.2909, 0.3007, 0.1415],
          [0.3004, 0.2772, 0.1631],
          [0.2862, 0.2562, 0.1843],
          [0.2958, 0.2327, 0.2051],
          [0.2815, 0.2117, 0.2254],
          [0.285, 0.188, 0.2459],
          [0.2858, 0.1954, 0.2518],
          [0.2869, 0.2052, 0.2597],
          [0.2876, 0.2126, 0.2656],
          [0.2958, 0.2327, 0.2471],
          [0.2862, 0.2562, 0.2269],
          [0.3004, 0.2772, 0.2061],
          [0.2909, 0.3007, 0.1849],
          [0.3051, 0.3216, 0.1633],
          [0.2955, 0.3451, 0.1412],
          [0.3098, 0.3661, 0.1186],
          [0.3002, 0.3896, 0.0956],
          [0.3145, 0.4106, 0.0721],
          [0.3049, 0.4341, 0.0482],
          [0.3192, 0.4551, 0.0238],
          [0.3096, 0.4786, -0.0011],
          [0.3238, 0.4996, -0.0264],
          [0.3142, 0.5231, -0.0521],
          [0.3285, 0.5441, -0.0783],
          [0.3189, 0.5676, -0.105],
          [0.3273, 0.59, -0.133],
          [0.3279, 0.5959, -0.1189],
          [0.3279, 0.5959, -0.0991],
          [0.3273, 0.59, -0.0837],
          [0.3189, 0.5676, -0.0561],
          [0.3285, 0.5441, -0.0299],
          [0.3142, 0.5231, -0.0041],
          [0.3238, 0.4996, 0.0212],
          [0.3096, 0.4786, 0.046],
          [0.3192, 0.4551, 0.0704],
          [0.3049, 0.4341, 0.0943],
          [0.3145, 0.4106, 0.1178],
          [0.3002, 0.3896, 0.1408],
          [0.3098, 0.3661, 0.1634],
          [0.2955, 0.3451, 0.1855],
          [0.3051, 0.3216, 0.2072],
          [0.2909, 0.3007, 0.2284],
          [0.3004, 0.2772, 0.2491],
          [0.2923, 0.2571, 0.268],
          [0.2937, 0.2704, 0.2744],
          [0.2956, 0.2882, 0.2754],
          [0.297, 0.3015, 0.2704],
          [0.3051, 0.3216, 0.251],
          [0.2955, 0.3451, 0.2298],
          [0.3098, 0.3661, 0.2082],
          [0.3002, 0.3896, 0.1861],
          [0.3145, 0.4106, 0.1635],
          [0.3049, 0.4341, 0.1405],
          [0.3192, 0.4551, 0.117],
          [0.3096, 0.4786, 0.0931],
          [0.3238, 0.4996, 0.0687],
          [0.3142, 0.5231, 0.0439],
          [0.3285, 0.5441, 0.0186],
          [0.3189, 0.5676, -0.0072],
          [0.3273, 0.59, -0.0343],
          [0.3279, 0.5959, -0.0199],
          [0.3279, 0.5959, -0.0001],
          [0.3273, 0.59, 0.0151],
          [0.3189, 0.5676, 0.0417],
          [0.3285, 0.5441, 0.067],
          [0.3142, 0.5231, 0.0919],
          [0.3238, 0.4996, 0.1162],
          [0.3096, 0.4786, 0.1402],
          [0.3192, 0.4551, 0.1636],
          [0.3049, 0.4341, 0.1867],
          [0.3145, 0.4106, 0.2092],
          [0.3002, 0.3896, 0.2313],
          [0.3098, 0.3661, 0.253],
          [0.3017, 0.346, 0.2728],
          [0.3031, 0.3594, 0.2794],
          [0.3049, 0.3772, 0.2804],
          [0.3063, 0.3905, 0.2751],
          [0.3145, 0.4106, 0.2549],
          [0.3049, 0.4341, 0.2328],
          [0.3192, 0.4551, 0.2103],
          [0.3096, 0.4786, 0.1872],
          [0.3238, 0.4996, 0.1638],
          [0.3142, 0.5231, 0.1398],
          [0.3285, 0.5441, 0.1155],
          [0.3189, 0.5676, 0.0906],
          [0.3273, 0.59, 0.0644],
          [0.3279, 0.5959, 0.079],
          [0.3279, 0.5959, 0.0988],
          [0.3273, 0.59, 0.1138],
          [0.3189, 0.5676, 0.1395],
          [0.3285, 0.5441, 0.1639],
          [0.3142, 0.5231, 0.1878],
          [0.3238, 0.4996, 0.2113],
          [0.3096, 0.4786, 0.2343],
          [0.3192, 0.4551, 0.2569],
          [0.311, 0.435, 0.2775],
          [0.3124, 0.4483, 0.2844],
          [0.3143, 0.4661, 0.2854],
          [0.3157, 0.4795, 0.2799],
          [0.3238, 0.4996, 0.2588],
          [0.3142, 0.5231, 0.2358],
          [0.3285, 0.5441, 0.2123],
          [0.3189, 0.5676, 0.1884],
          [0.3273, 0.59, 0.1632],
          [0.3279, 0.5959, 0.178],
          [0.3279, 0.5959, 0.1978],
          [0.3273, 0.59, 0.2125],
          [0.3189, 0.5676, 0.2373],
          [0.3285, 0.5441, 0.2608],
          [0.3204, 0.524, 0.2822],
          [0.3218, 0.5373, 0.2894],
          [0.3236, 0.5551, 0.2904],
          [0.325, 0.5685, 0.2846],
          [0.3273, 0.59, 0.2619],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2853, -0.095, -0.2706],
        localEnd: [0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: -45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-left-b",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_left_b_12.add(mesh_weave_lateral_left_b_12);
  meshes["weave-lateral-left-b"] = mesh_weave_lateral_left_b_12;
  colliders["weave-lateral-left-b"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["weave"] ??= [];
  destructionGroups["weave"].push(node_weave_lateral_left_b_12);

  const endpoint_lateral_rear_post_right_13 = makeAttachmentEndpoint(null);
  const node_lateral_rear_post_right_13 = new THREE.Group();
  node_lateral_rear_post_right_13.name = "Lateral rear post (right)__pivot";
  node_lateral_rear_post_right_13.scale.set(1, 1, 1);
  if (endpoint_lateral_rear_post_right_13) {
    node_lateral_rear_post_right_13.position.copy(
      endpoint_lateral_rear_post_right_13.start,
    );
    node_lateral_rear_post_right_13.rotation.set(1.36136, -1.46835, 1.5708);
  } else {
    node_lateral_rear_post_right_13.position.set(-0.3035, 0.079, -0.3326);
    node_lateral_rear_post_right_13.rotation.set(1.36136, -1.46835, 1.5708);
  }
  node_lateral_rear_post_right_13.userData.sculptComponent = {
    id: "lateral-rear-post-right",
    name: "Lateral rear post (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.28, -0.145, -0.285],
      localEnd: [-0.3271, 0.303, -0.3802],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.4604,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [-0.3035, 0.079, -0.3326],
      rotation: [1.36136, -1.46835, 1.5708],
      scale: [0.05, 0.4604, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased long edges catching a thin highlight line.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-rear-post-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_rear_post_right_13.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_lateral_rear_post_right_13);
  nodes["lateral-rear-post-right"] = node_lateral_rear_post_right_13;
  const mesh_lateral_rear_post_right_13Geometry =
    endpoint_lateral_rear_post_right_13
      ? new THREE.CylinderGeometry(
          endpoint_lateral_rear_post_right_13.endRadius,
          endpoint_lateral_rear_post_right_13.baseRadius,
          endpoint_lateral_rear_post_right_13.length,
          16,
          6,
        )
      : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_lateral_rear_post_right_13) {
    mesh_lateral_rear_post_right_13Geometry.scale(0.05, 0.4604, 0.04);
  }
  const mesh_lateral_rear_post_right_13 = new THREE.Mesh(
    mesh_lateral_rear_post_right_13Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_lateral_rear_post_right_13.name = "Lateral rear post (right)";
  if (endpoint_lateral_rear_post_right_13) {
    mesh_lateral_rear_post_right_13.position.copy(
      endpoint_lateral_rear_post_right_13.midpoint,
    );
    mesh_lateral_rear_post_right_13.quaternion.copy(
      endpoint_lateral_rear_post_right_13.quaternion,
    );
  }
  mesh_lateral_rear_post_right_13.castShadow = options.castShadow ?? true;
  mesh_lateral_rear_post_right_13.receiveShadow = options.receiveShadow ?? true;
  mesh_lateral_rear_post_right_13.userData.sculptComponent = {
    id: "lateral-rear-post-right",
    name: "Lateral rear post (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.28, -0.145, -0.285],
      localEnd: [-0.3271, 0.303, -0.3802],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.4604,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [-0.3035, 0.079, -0.3326],
      rotation: [1.36136, -1.46835, 1.5708],
      scale: [0.05, 0.4604, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased long edges catching a thin highlight line.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-rear-post-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_rear_post_right_13.add(mesh_lateral_rear_post_right_13);
  meshes["lateral-rear-post-right"] = mesh_lateral_rear_post_right_13;
  colliders["lateral-rear-post-right"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_lateral_rear_post_right_13);

  const endpoint_front_post_right_14 = makeAttachmentEndpoint(null);
  const node_front_post_right_14 = new THREE.Group();
  node_front_post_right_14.name = "Front post (right)__pivot";
  node_front_post_right_14.scale.set(1, 1, 1);
  if (endpoint_front_post_right_14) {
    node_front_post_right_14.position.copy(endpoint_front_post_right_14.start);
    node_front_post_right_14.rotation.set(1.62316, -1.46622, 1.5708);
  } else {
    node_front_post_right_14.position.set(-0.3028, 0.0715, 0.2963);
    node_front_post_right_14.rotation.set(1.62316, -1.46622, 1.5708);
  }
  node_front_post_right_14.userData.sculptComponent = {
    id: "front-post-right",
    name: "Front post (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.5,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.28, -0.145, 0.285],
      localEnd: [-0.3255, 0.288, 0.3077],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.436,
      depth: 0.04,
      units: "meters",
      confidence: 0.5,
    },
    transform: {
      position: [-0.3028, 0.0715, 0.2963],
      rotation: [1.62316, -1.46622, 1.5708],
      scale: [0.05, 0.436, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "front-post-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_front_post_right_14.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_front_post_right_14);
  nodes["front-post-right"] = node_front_post_right_14;
  const mesh_front_post_right_14Geometry = endpoint_front_post_right_14
    ? new THREE.CylinderGeometry(
        endpoint_front_post_right_14.endRadius,
        endpoint_front_post_right_14.baseRadius,
        endpoint_front_post_right_14.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_front_post_right_14) {
    mesh_front_post_right_14Geometry.scale(0.05, 0.436, 0.04);
  }
  const mesh_front_post_right_14 = new THREE.Mesh(
    mesh_front_post_right_14Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_front_post_right_14.name = "Front post (right)";
  if (endpoint_front_post_right_14) {
    mesh_front_post_right_14.position.copy(
      endpoint_front_post_right_14.midpoint,
    );
    mesh_front_post_right_14.quaternion.copy(
      endpoint_front_post_right_14.quaternion,
    );
  }
  mesh_front_post_right_14.castShadow = options.castShadow ?? true;
  mesh_front_post_right_14.receiveShadow = options.receiveShadow ?? true;
  mesh_front_post_right_14.userData.sculptComponent = {
    id: "front-post-right",
    name: "Front post (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.5,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.28, -0.145, 0.285],
      localEnd: [-0.3255, 0.288, 0.3077],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.436,
      depth: 0.04,
      units: "meters",
      confidence: 0.5,
    },
    transform: {
      position: [-0.3028, 0.0715, 0.2963],
      rotation: [1.62316, -1.46622, 1.5708],
      scale: [0.05, 0.436, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "front-post-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_front_post_right_14.add(mesh_front_post_right_14);
  meshes["front-post-right"] = mesh_front_post_right_14;
  colliders["front-post-right"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_front_post_right_14);

  const endpoint_lateral_bottom_rail_right_15 = makeAttachmentEndpoint(null);
  const node_lateral_bottom_rail_right_15 = new THREE.Group();
  node_lateral_bottom_rail_right_15.name = "Lateral bottom rail (right)__pivot";
  node_lateral_bottom_rail_right_15.scale.set(1, 1, 1);
  if (endpoint_lateral_bottom_rail_right_15) {
    node_lateral_bottom_rail_right_15.position.copy(
      endpoint_lateral_bottom_rail_right_15.start,
    );
    node_lateral_bottom_rail_right_15.rotation.set(1.5708, -1.5708, 0.0);
  } else {
    node_lateral_bottom_rail_right_15.position.set(-0.2826, -0.12, -0.002);
    node_lateral_bottom_rail_right_15.rotation.set(1.5708, -1.5708, 0.0);
  }
  node_lateral_bottom_rail_right_15.userData.sculptComponent = {
    id: "lateral-bottom-rail-right",
    name: "Lateral bottom rail (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.2826, -0.12, -0.3153],
      localEnd: [-0.2826, -0.12, 0.3113],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.6266,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [-0.2826, -0.12, -0.002],
      rotation: [1.5708, -1.5708, 0.0],
      scale: [0.05, 0.6266, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-bottom-rail-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_bottom_rail_right_15.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_lateral_bottom_rail_right_15);
  nodes["lateral-bottom-rail-right"] = node_lateral_bottom_rail_right_15;
  const mesh_lateral_bottom_rail_right_15Geometry =
    endpoint_lateral_bottom_rail_right_15
      ? new THREE.CylinderGeometry(
          endpoint_lateral_bottom_rail_right_15.endRadius,
          endpoint_lateral_bottom_rail_right_15.baseRadius,
          endpoint_lateral_bottom_rail_right_15.length,
          16,
          6,
        )
      : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_lateral_bottom_rail_right_15) {
    mesh_lateral_bottom_rail_right_15Geometry.scale(0.05, 0.6266, 0.04);
  }
  const mesh_lateral_bottom_rail_right_15 = new THREE.Mesh(
    mesh_lateral_bottom_rail_right_15Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_lateral_bottom_rail_right_15.name = "Lateral bottom rail (right)";
  if (endpoint_lateral_bottom_rail_right_15) {
    mesh_lateral_bottom_rail_right_15.position.copy(
      endpoint_lateral_bottom_rail_right_15.midpoint,
    );
    mesh_lateral_bottom_rail_right_15.quaternion.copy(
      endpoint_lateral_bottom_rail_right_15.quaternion,
    );
  }
  mesh_lateral_bottom_rail_right_15.castShadow = options.castShadow ?? true;
  mesh_lateral_bottom_rail_right_15.receiveShadow =
    options.receiveShadow ?? true;
  mesh_lateral_bottom_rail_right_15.userData.sculptComponent = {
    id: "lateral-bottom-rail-right",
    name: "Lateral bottom rail (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.2826, -0.12, -0.3153],
      localEnd: [-0.2826, -0.12, 0.3113],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.6266,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [-0.2826, -0.12, -0.002],
      rotation: [1.5708, -1.5708, 0.0],
      scale: [0.05, 0.6266, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "lateral-bottom-rail-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_lateral_bottom_rail_right_15.add(mesh_lateral_bottom_rail_right_15);
  meshes["lateral-bottom-rail-right"] = mesh_lateral_bottom_rail_right_15;
  colliders["lateral-bottom-rail-right"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_lateral_bottom_rail_right_15);

  const endpoint_armrest_right_16 = makeAttachmentEndpoint(null);
  const node_armrest_right_16 = new THREE.Group();
  node_armrest_right_16.name = "Armrest (right)__pivot";
  node_armrest_right_16.scale.set(1, 1, 1);
  if (endpoint_armrest_right_16) {
    node_armrest_right_16.position.copy(endpoint_armrest_right_16.start);
    node_armrest_right_16.rotation.set(0.0, -1.5708, 0.0);
  } else {
    node_armrest_right_16.position.set(-0.3005, 0.303, -0.447);
    node_armrest_right_16.rotation.set(0.0, -1.5708, 0.0);
  }
  node_armrest_right_16.userData.sculptComponent = {
    id: "armrest-right",
    name: "Armrest (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.65,
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
    geometryDescriptor: {
      topologyIntent:
        "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      profile2D: {
        points: [
          [0.0, 0.0],
          [0.8113967669682247, -0.015],
          [0.8114, 0.017],
          [0.71, 0.0143],
          [0.6085, 0.0123],
          [0.5071, 0.0115],
          [0.4057, 0.0125],
          [0.3043, 0.0153],
          [0.2028, 0.0198],
          [0.1014, 0.0255],
          [0.0, 0.032],
          [-0.008, 0.0299],
          [-0.0139, 0.024],
          [-0.016, 0.016],
          [-0.0139, 0.008],
          [-0.008, 0.0021],
        ],
        depth: 0.075,
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.3005, 0.303, -0.447],
      localEnd: [-0.3005, 0.288, 0.3644],
      contactType: "overlap",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.65,
    },
    transform: {
      position: [-0.3005, 0.303, -0.447],
      rotation: [0.0, -1.5708, 0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0.05, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "concave-sweep",
        kind: "contour",
        description: "Top edge dips ~12 mm mid-length (d05).",
        realizedInPass: "form-refinement",
      },
      {
        id: "rear-end-protrusion",
        kind: "contour",
        description:
          "Round-ended rear stub protrudes ~35 mm behind the rear frame (d06).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#armrest",
      "analysis/detail-inventory/zone-r0c2.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "armrest-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_armrest_right_16.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.22, 0.05, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_armrest_right_16);
  nodes["armrest-right"] = node_armrest_right_16;
  const mesh_armrest_right_16Geometry = endpoint_armrest_right_16
    ? new THREE.CylinderGeometry(
        endpoint_armrest_right_16.endRadius,
        endpoint_armrest_right_16.baseRadius,
        endpoint_armrest_right_16.length,
        16,
        6,
      )
    : buildExtrudeGeometry({
        points: [
          [0.0, 0.0],
          [0.8113967669682247, -0.015],
          [0.8114, 0.017],
          [0.71, 0.0143],
          [0.6085, 0.0123],
          [0.5071, 0.0115],
          [0.4057, 0.0125],
          [0.3043, 0.0153],
          [0.2028, 0.0198],
          [0.1014, 0.0255],
          [0.0, 0.032],
          [-0.008, 0.0299],
          [-0.0139, 0.024],
          [-0.016, 0.016],
          [-0.0139, 0.008],
          [-0.008, 0.0021],
        ],
        depth: 0.075,
      });
  if (!endpoint_armrest_right_16) {
    mesh_armrest_right_16Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_armrest_right_16 = new THREE.Mesh(
    mesh_armrest_right_16Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_armrest_right_16.name = "Armrest (right)";
  if (endpoint_armrest_right_16) {
    mesh_armrest_right_16.position.copy(endpoint_armrest_right_16.midpoint);
    mesh_armrest_right_16.quaternion.copy(endpoint_armrest_right_16.quaternion);
  }
  mesh_armrest_right_16.castShadow = options.castShadow ?? true;
  mesh_armrest_right_16.receiveShadow = options.receiveShadow ?? true;
  mesh_armrest_right_16.userData.sculptComponent = {
    id: "armrest-right",
    name: "Armrest (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.65,
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
    geometryDescriptor: {
      topologyIntent:
        "Planed teak plank with flat top/side faces, a gently dipped top edge and a round-ended rear stub; its side profile is extruded across its 75 mm width. Rigid flat-faced part, so assembled-solid rather than continuous-sculpt.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      profile2D: {
        points: [
          [0.0, 0.0],
          [0.8113967669682247, -0.015],
          [0.8114, 0.017],
          [0.71, 0.0143],
          [0.6085, 0.0123],
          [0.5071, 0.0115],
          [0.4057, 0.0125],
          [0.3043, 0.0153],
          [0.2028, 0.0198],
          [0.1014, 0.0255],
          [0.0, 0.032],
          [-0.008, 0.0299],
          [-0.0139, 0.024],
          [-0.016, 0.016],
          [-0.0139, 0.008],
          [-0.008, 0.0021],
        ],
        depth: 0.075,
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.3005, 0.303, -0.447],
      localEnd: [-0.3005, 0.288, 0.3644],
      contactType: "overlap",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.65,
    },
    transform: {
      position: [-0.3005, 0.303, -0.447],
      rotation: [0.0, -1.5708, 0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0.05, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "concave-sweep",
        kind: "contour",
        description: "Top edge dips ~12 mm mid-length (d05).",
        realizedInPass: "form-refinement",
      },
      {
        id: "rear-end-protrusion",
        kind: "contour",
        description:
          "Round-ended rear stub protrudes ~35 mm behind the rear frame (d06).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#armrest",
      "analysis/detail-inventory/zone-r0c2.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "armrest-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_armrest_right_16.add(mesh_armrest_right_16);
  meshes["armrest-right"] = mesh_armrest_right_16;
  colliders["armrest-right"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_armrest_right_16);

  const endpoint_fastener_cap_right_upper_17 = makeAttachmentEndpoint(null);
  const node_fastener_cap_right_upper_17 = new THREE.Group();
  node_fastener_cap_right_upper_17.name = "Fastener cap (right, upper)__pivot";
  node_fastener_cap_right_upper_17.scale.set(1, 1, 1);
  if (endpoint_fastener_cap_right_upper_17) {
    node_fastener_cap_right_upper_17.position.copy(
      endpoint_fastener_cap_right_upper_17.start,
    );
    node_fastener_cap_right_upper_17.rotation.set(0.0, 1.5708, 0.0);
  } else {
    node_fastener_cap_right_upper_17.position.set(-0.3461, 0.275, -0.3743);
    node_fastener_cap_right_upper_17.rotation.set(0.0, 1.5708, 0.0);
  }
  node_fastener_cap_right_upper_17.userData.sculptComponent = {
    id: "fastener-cap-right-upper",
    name: "Fastener cap (right, upper)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.3461, 0.275, -0.3743],
      localEnd: [-0.3501, 0.275, -0.3743],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [-0.3461, 0.275, -0.3743],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-right-upper",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_right_upper_17.userData.actionProfile = {
    animationRole: "fastener",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_fastener_cap_right_upper_17);
  nodes["fastener-cap-right-upper"] = node_fastener_cap_right_upper_17;
  const mesh_fastener_cap_right_upper_17Geometry =
    endpoint_fastener_cap_right_upper_17
      ? new THREE.CylinderGeometry(
          endpoint_fastener_cap_right_upper_17.endRadius,
          endpoint_fastener_cap_right_upper_17.baseRadius,
          endpoint_fastener_cap_right_upper_17.length,
          16,
          6,
        )
      : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_fastener_cap_right_upper_17) {
    mesh_fastener_cap_right_upper_17Geometry.scale(0.016, 0.016, 0.006);
  }
  const mesh_fastener_cap_right_upper_17 = new THREE.Mesh(
    mesh_fastener_cap_right_upper_17Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_fastener_cap_right_upper_17.name = "Fastener cap (right, upper)";
  if (endpoint_fastener_cap_right_upper_17) {
    mesh_fastener_cap_right_upper_17.position.copy(
      endpoint_fastener_cap_right_upper_17.midpoint,
    );
    mesh_fastener_cap_right_upper_17.quaternion.copy(
      endpoint_fastener_cap_right_upper_17.quaternion,
    );
  }
  mesh_fastener_cap_right_upper_17.castShadow = options.castShadow ?? true;
  mesh_fastener_cap_right_upper_17.receiveShadow =
    options.receiveShadow ?? true;
  mesh_fastener_cap_right_upper_17.userData.sculptComponent = {
    id: "fastener-cap-right-upper",
    name: "Fastener cap (right, upper)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.3461, 0.275, -0.3743],
      localEnd: [-0.3501, 0.275, -0.3743],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [-0.3461, 0.275, -0.3743],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-right-upper",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_right_upper_17.add(mesh_fastener_cap_right_upper_17);
  meshes["fastener-cap-right-upper"] = mesh_fastener_cap_right_upper_17;
  colliders["fastener-cap-right-upper"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_fastener_cap_right_upper_17);

  const endpoint_fastener_cap_right_lower_18 = makeAttachmentEndpoint(null);
  const node_fastener_cap_right_lower_18 = new THREE.Group();
  node_fastener_cap_right_lower_18.name = "Fastener cap (right, lower)__pivot";
  node_fastener_cap_right_lower_18.scale.set(1, 1, 1);
  if (endpoint_fastener_cap_right_lower_18) {
    node_fastener_cap_right_lower_18.position.copy(
      endpoint_fastener_cap_right_lower_18.start,
    );
    node_fastener_cap_right_lower_18.rotation.set(0.0, 1.5708, 0.0);
  } else {
    node_fastener_cap_right_lower_18.position.set(-0.3052, -0.115, -0.2914);
    node_fastener_cap_right_lower_18.rotation.set(0.0, 1.5708, 0.0);
  }
  node_fastener_cap_right_lower_18.userData.sculptComponent = {
    id: "fastener-cap-right-lower",
    name: "Fastener cap (right, lower)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.3052, -0.115, -0.2914],
      localEnd: [-0.3092, -0.115, -0.2914],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [-0.3052, -0.115, -0.2914],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-right-lower",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_right_lower_18.userData.actionProfile = {
    animationRole: "fastener",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.22, 0, 0],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_fastener_cap_right_lower_18);
  nodes["fastener-cap-right-lower"] = node_fastener_cap_right_lower_18;
  const mesh_fastener_cap_right_lower_18Geometry =
    endpoint_fastener_cap_right_lower_18
      ? new THREE.CylinderGeometry(
          endpoint_fastener_cap_right_lower_18.endRadius,
          endpoint_fastener_cap_right_lower_18.baseRadius,
          endpoint_fastener_cap_right_lower_18.length,
          16,
          6,
        )
      : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_fastener_cap_right_lower_18) {
    mesh_fastener_cap_right_lower_18Geometry.scale(0.016, 0.016, 0.006);
  }
  const mesh_fastener_cap_right_lower_18 = new THREE.Mesh(
    mesh_fastener_cap_right_lower_18Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_fastener_cap_right_lower_18.name = "Fastener cap (right, lower)";
  if (endpoint_fastener_cap_right_lower_18) {
    mesh_fastener_cap_right_lower_18.position.copy(
      endpoint_fastener_cap_right_lower_18.midpoint,
    );
    mesh_fastener_cap_right_lower_18.quaternion.copy(
      endpoint_fastener_cap_right_lower_18.quaternion,
    );
  }
  mesh_fastener_cap_right_lower_18.castShadow = options.castShadow ?? true;
  mesh_fastener_cap_right_lower_18.receiveShadow =
    options.receiveShadow ?? true;
  mesh_fastener_cap_right_lower_18.userData.sculptComponent = {
    id: "fastener-cap-right-lower",
    name: "Fastener cap (right, lower)",
    level: "micro",
    role: "fastener",
    importance: 0.4,
    confidence: 0.6,
    primitive: "sphere",
    topologyClass: "assembled-solid",
    topologyRationale: "Low domed fastener cap proud of the post face.",
    geometryDescriptor: {
      topologyIntent: "Low domed fastener cap proud of the post face.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "lateral-frame-right-mount",
      localStart: [-0.3052, -0.115, -0.2914],
      localEnd: [-0.3092, -0.115, -0.2914],
      contactType: "embed",
      embedDepth: 0.002,
      overlap: 0.002,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.016,
      height: 0.016,
      depth: 0.006,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [-0.3052, -0.115, -0.2914],
      rotation: [0, 1.5708, 0],
      scale: [0.016, 0.016, 0.006],
    },
    actionProfile: {
      animationRole: "fastener",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.22, 0, 0],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "analysis/detail-inventory/zone-r2c1.png",
      "reference/chair-right.png#armrest-joint",
    ],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "fastener-cap-right-lower",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_fastener_cap_right_lower_18.add(mesh_fastener_cap_right_lower_18);
  meshes["fastener-cap-right-lower"] = mesh_fastener_cap_right_lower_18;
  colliders["fastener-cap-right-lower"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_fastener_cap_right_lower_18);

  const attachment_weave_lateral_right_19 = null;
  const endpoint_weave_lateral_right_19 = makeAttachmentEndpoint(
    attachment_weave_lateral_right_19,
  );
  const node_weave_lateral_right_19 = new THREE.Group();
  node_weave_lateral_right_19.name =
    "Lateral rope lattice (right, +45 deg run)__pivot";
  node_weave_lateral_right_19.scale.set(1, 1, 1);
  if (endpoint_weave_lateral_right_19) {
    node_weave_lateral_right_19.position.copy(
      endpoint_weave_lateral_right_19.start,
    );
    node_weave_lateral_right_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_weave_lateral_right_19.position.set(0.0, 0.0, 0.0);
    node_weave_lateral_right_19.rotation.set(0.0, 0.0, 0.0);
  }
  node_weave_lateral_right_19.userData.sculptComponent = {
    id: "weave-lateral-right",
    name: "Lateral rope lattice (right, +45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [-0.3245, 0.5638, -0.3522],
          [-0.3308, 0.5663, -0.3494],
          [-0.3273, 0.59, -0.3288],
          [-0.3279, 0.5959, -0.3151],
          [-0.3279, 0.5959, -0.2953],
          [-0.3273, 0.59, -0.2794],
          [-0.3308, 0.5663, -0.3006],
          [-0.3166, 0.5453, -0.3205],
          [-0.3262, 0.5218, -0.34],
          [-0.3199, 0.5193, -0.3427],
          [-0.3185, 0.506, -0.3462],
          [-0.3166, 0.4882, -0.3424],
          [-0.3152, 0.4748, -0.3332],
          [-0.3215, 0.4773, -0.3306],
          [-0.3119, 0.5008, -0.3115],
          [-0.3262, 0.5218, -0.292],
          [-0.3166, 0.5453, -0.2721],
          [-0.3308, 0.5663, -0.2517],
          [-0.3273, 0.59, -0.23],
          [-0.3279, 0.5959, -0.2161],
          [-0.3279, 0.5959, -0.1963],
          [-0.3273, 0.59, -0.1807],
          [-0.3308, 0.5663, -0.2028],
          [-0.3166, 0.5453, -0.2236],
          [-0.3262, 0.5218, -0.244],
          [-0.3119, 0.5008, -0.264],
          [-0.3215, 0.4773, -0.2835],
          [-0.3072, 0.4564, -0.3026],
          [-0.3168, 0.4329, -0.3212],
          [-0.3105, 0.4303, -0.3238],
          [-0.3091, 0.417, -0.327],
          [-0.3072, 0.3992, -0.3231],
          [-0.3058, 0.3859, -0.3143],
          [-0.3121, 0.3884, -0.3117],
          [-0.3025, 0.4119, -0.2936],
          [-0.3168, 0.4329, -0.275],
          [-0.3072, 0.4564, -0.2559],
          [-0.3215, 0.4773, -0.2364],
          [-0.3119, 0.5008, -0.2165],
          [-0.3262, 0.5218, -0.1961],
          [-0.3166, 0.5453, -0.1752],
          [-0.3308, 0.5663, -0.1539],
          [-0.3273, 0.59, -0.1313],
          [-0.3279, 0.5959, -0.1172],
          [-0.3279, 0.5959, -0.0974],
          [-0.3273, 0.59, -0.0819],
          [-0.3308, 0.5663, -0.105],
          [-0.3166, 0.5453, -0.1267],
          [-0.3262, 0.5218, -0.1481],
          [-0.3119, 0.5008, -0.1689],
          [-0.3215, 0.4773, -0.1894],
          [-0.3072, 0.4564, -0.2093],
          [-0.3168, 0.4329, -0.2288],
          [-0.3025, 0.4119, -0.2479],
          [-0.3121, 0.3884, -0.2665],
          [-0.2979, 0.3674, -0.2846],
          [-0.3075, 0.3439, -0.3023],
          [-0.3012, 0.3414, -0.3048],
          [-0.2998, 0.328, -0.3077],
          [-0.2979, 0.3102, -0.3039],
          [-0.2965, 0.2969, -0.2953],
          [-0.3028, 0.2994, -0.2929],
          [-0.2932, 0.3229, -0.2756],
          [-0.3075, 0.3439, -0.2579],
          [-0.2979, 0.3674, -0.2398],
          [-0.3121, 0.3884, -0.2212],
          [-0.3025, 0.4119, -0.2022],
          [-0.3168, 0.4329, -0.1827],
          [-0.3072, 0.4564, -0.1627],
          [-0.3215, 0.4773, -0.1423],
          [-0.3119, 0.5008, -0.1214],
          [-0.3262, 0.5218, -0.1001],
          [-0.3166, 0.5453, -0.0783],
          [-0.3308, 0.5663, -0.0561],
          [-0.3273, 0.59, -0.0326],
          [-0.3279, 0.5959, -0.0182],
          [-0.3279, 0.5959, 0.0016],
          [-0.3273, 0.59, 0.0168],
          [-0.3308, 0.5663, -0.0072],
          [-0.3166, 0.5453, -0.0299],
          [-0.3262, 0.5218, -0.0521],
          [-0.3119, 0.5008, -0.0739],
          [-0.3215, 0.4773, -0.0952],
          [-0.3072, 0.4564, -0.1161],
          [-0.3168, 0.4329, -0.1365],
          [-0.3025, 0.4119, -0.1565],
          [-0.3121, 0.3884, -0.176],
          [-0.2979, 0.3674, -0.195],
          [-0.3075, 0.3439, -0.2136],
          [-0.2932, 0.3229, -0.2317],
          [-0.3028, 0.2994, -0.2494],
          [-0.2885, 0.2784, -0.2667],
          [-0.2981, 0.2549, -0.2834],
          [-0.2918, 0.2524, -0.2858],
          [-0.2904, 0.239, -0.2885],
          [-0.2885, 0.2213, -0.2847],
          [-0.2871, 0.2079, -0.2763],
          [-0.2934, 0.2104, -0.274],
          [-0.2838, 0.2339, -0.2577],
          [-0.2981, 0.2549, -0.2409],
          [-0.2885, 0.2784, -0.2237],
          [-0.3028, 0.2994, -0.206],
          [-0.2932, 0.3229, -0.1879],
          [-0.3075, 0.3439, -0.1693],
          [-0.2979, 0.3674, -0.1502],
          [-0.3121, 0.3884, -0.1307],
          [-0.3025, 0.4119, -0.1107],
          [-0.3168, 0.4329, -0.0903],
          [-0.3072, 0.4564, -0.0695],
          [-0.3215, 0.4773, -0.0481],
          [-0.3119, 0.5008, -0.0264],
          [-0.3262, 0.5218, -0.0041],
          [-0.3166, 0.5453, 0.0186],
          [-0.3308, 0.5663, 0.0417],
          [-0.3273, 0.59, 0.0662],
          [-0.3279, 0.5959, 0.0808],
          [-0.3279, 0.5959, 0.1006],
          [-0.3273, 0.59, 0.1155],
          [-0.3308, 0.5663, 0.0906],
          [-0.3166, 0.5453, 0.067],
          [-0.3262, 0.5218, 0.0439],
          [-0.3119, 0.5008, 0.0212],
          [-0.3215, 0.4773, -0.0011],
          [-0.3072, 0.4564, -0.0228],
          [-0.3168, 0.4329, -0.0442],
          [-0.3025, 0.4119, -0.065],
          [-0.3121, 0.3884, -0.0854],
          [-0.2979, 0.3674, -0.1054],
          [-0.3075, 0.3439, -0.1249],
          [-0.2932, 0.3229, -0.144],
          [-0.3028, 0.2994, -0.1626],
          [-0.2885, 0.2784, -0.1807],
          [-0.2981, 0.2549, -0.1984],
          [-0.2838, 0.2339, -0.2156],
          [-0.2934, 0.2104, -0.2324],
          [-0.285, 0.188, -0.2493],
          [-0.2844, 0.1821, -0.2358],
          [-0.2844, 0.1821, -0.2194],
          [-0.285, 0.188, -0.2081],
          [-0.2934, 0.2104, -0.1908],
          [-0.2838, 0.2339, -0.1735],
          [-0.2981, 0.2549, -0.1559],
          [-0.2885, 0.2784, -0.1377],
          [-0.3028, 0.2994, -0.1191],
          [-0.2932, 0.3229, -0.1001],
          [-0.3075, 0.3439, -0.0806],
          [-0.2979, 0.3674, -0.0606],
          [-0.3121, 0.3884, -0.0402],
          [-0.3025, 0.4119, -0.0193],
          [-0.3168, 0.4329, 0.002],
          [-0.3072, 0.4564, 0.0238],
          [-0.3215, 0.4773, 0.046],
          [-0.3119, 0.5008, 0.0687],
          [-0.3262, 0.5218, 0.0919],
          [-0.3166, 0.5453, 0.1155],
          [-0.3308, 0.5663, 0.1395],
          [-0.3273, 0.59, 0.1649],
          [-0.3279, 0.5959, 0.1798],
          [-0.3279, 0.5959, 0.1996],
          [-0.3273, 0.59, 0.2143],
          [-0.3308, 0.5663, 0.1884],
          [-0.3166, 0.5453, 0.1639],
          [-0.3262, 0.5218, 0.1398],
          [-0.3119, 0.5008, 0.1162],
          [-0.3215, 0.4773, 0.0931],
          [-0.3072, 0.4564, 0.0704],
          [-0.3168, 0.4329, 0.0482],
          [-0.3025, 0.4119, 0.0264],
          [-0.3121, 0.3884, 0.0051],
          [-0.2979, 0.3674, -0.0158],
          [-0.3075, 0.3439, -0.0362],
          [-0.2932, 0.3229, -0.0562],
          [-0.3028, 0.2994, -0.0757],
          [-0.2885, 0.2784, -0.0947],
          [-0.2981, 0.2549, -0.1133],
          [-0.2838, 0.2339, -0.1315],
          [-0.2934, 0.2104, -0.1492],
          [-0.285, 0.188, -0.167],
          [-0.2844, 0.1821, -0.1537],
          [-0.2844, 0.1821, -0.1373],
          [-0.285, 0.188, -0.1258],
          [-0.2934, 0.2104, -0.1075],
          [-0.2838, 0.2339, -0.0894],
          [-0.2981, 0.2549, -0.0708],
          [-0.2885, 0.2784, -0.0518],
          [-0.3028, 0.2994, -0.0323],
          [-0.2932, 0.3229, -0.0123],
          [-0.3075, 0.3439, 0.0081],
          [-0.2979, 0.3674, 0.029],
          [-0.3121, 0.3884, 0.0503],
          [-0.3025, 0.4119, 0.0721],
          [-0.3168, 0.4329, 0.0943],
          [-0.3072, 0.4564, 0.117],
          [-0.3215, 0.4773, 0.1402],
          [-0.3119, 0.5008, 0.1638],
          [-0.3262, 0.5218, 0.1878],
          [-0.3166, 0.5453, 0.2123],
          [-0.3308, 0.5663, 0.2373],
          [-0.3273, 0.59, 0.2636],
          [-0.3265, 0.5826, 0.2699],
          [-0.3255, 0.5728, 0.2783],
          [-0.3247, 0.5654, 0.2845],
          [-0.3166, 0.5453, 0.2608],
          [-0.3262, 0.5218, 0.2358],
          [-0.3119, 0.5008, 0.2113],
          [-0.3215, 0.4773, 0.1872],
          [-0.3072, 0.4564, 0.1636],
          [-0.3168, 0.4329, 0.1405],
          [-0.3025, 0.4119, 0.1178],
          [-0.3121, 0.3884, 0.0956],
          [-0.2979, 0.3674, 0.0738],
          [-0.3075, 0.3439, 0.0525],
          [-0.2932, 0.3229, 0.0316],
          [-0.3028, 0.2994, 0.0112],
          [-0.2885, 0.2784, -0.0088],
          [-0.2981, 0.2549, -0.0283],
          [-0.2838, 0.2339, -0.0473],
          [-0.2934, 0.2104, -0.0659],
          [-0.285, 0.188, -0.0847],
          [-0.2844, 0.1821, -0.0717],
          [-0.2844, 0.1821, -0.0553],
          [-0.285, 0.188, -0.0436],
          [-0.2934, 0.2104, -0.0243],
          [-0.2838, 0.2339, -0.0053],
          [-0.2981, 0.2549, 0.0142],
          [-0.2885, 0.2784, 0.0342],
          [-0.3028, 0.2994, 0.0546],
          [-0.2932, 0.3229, 0.0755],
          [-0.3075, 0.3439, 0.0968],
          [-0.2979, 0.3674, 0.1186],
          [-0.3121, 0.3884, 0.1408],
          [-0.3025, 0.4119, 0.1635],
          [-0.3168, 0.4329, 0.1867],
          [-0.3072, 0.4564, 0.2103],
          [-0.3215, 0.4773, 0.2343],
          [-0.3119, 0.5008, 0.2588],
          [-0.32, 0.5209, 0.2821],
          [-0.3186, 0.5076, 0.2877],
          [-0.3168, 0.4898, 0.2867],
          [-0.3154, 0.4765, 0.2797],
          [-0.3072, 0.4564, 0.2569],
          [-0.3168, 0.4329, 0.2328],
          [-0.3025, 0.4119, 0.2092],
          [-0.3121, 0.3884, 0.1861],
          [-0.2979, 0.3674, 0.1634],
          [-0.3075, 0.3439, 0.1412],
          [-0.2932, 0.3229, 0.1194],
          [-0.3028, 0.2994, 0.098],
          [-0.2885, 0.2784, 0.0772],
          [-0.2981, 0.2549, 0.0568],
          [-0.2838, 0.2339, 0.0368],
          [-0.2934, 0.2104, 0.0173],
          [-0.285, 0.188, -0.0024],
          [-0.2844, 0.1821, 0.0104],
          [-0.2844, 0.1821, 0.0268],
          [-0.285, 0.188, 0.0387],
          [-0.2934, 0.2104, 0.0589],
          [-0.2838, 0.2339, 0.0789],
          [-0.2981, 0.2549, 0.0993],
          [-0.2885, 0.2784, 0.1202],
          [-0.3028, 0.2994, 0.1415],
          [-0.2932, 0.3229, 0.1633],
          [-0.3075, 0.3439, 0.1855],
          [-0.2979, 0.3674, 0.2082],
          [-0.3121, 0.3884, 0.2313],
          [-0.3025, 0.4119, 0.2549],
          [-0.3107, 0.432, 0.2773],
          [-0.3093, 0.4186, 0.2827],
          [-0.3074, 0.4008, 0.2817],
          [-0.306, 0.3875, 0.275],
          [-0.2979, 0.3674, 0.253],
          [-0.3075, 0.3439, 0.2298],
          [-0.2932, 0.3229, 0.2072],
          [-0.3028, 0.2994, 0.1849],
          [-0.2885, 0.2784, 0.1631],
          [-0.2981, 0.2549, 0.1418],
          [-0.2838, 0.2339, 0.1209],
          [-0.2934, 0.2104, 0.1005],
          [-0.285, 0.188, 0.0799],
          [-0.2844, 0.1821, 0.0924],
          [-0.2844, 0.1821, 0.1088],
          [-0.285, 0.188, 0.121],
          [-0.2934, 0.2104, 0.1421],
          [-0.2838, 0.2339, 0.163],
          [-0.2981, 0.2549, 0.1843],
          [-0.2885, 0.2784, 0.2061],
          [-0.3028, 0.2994, 0.2284],
          [-0.2932, 0.3229, 0.251],
          [-0.3013, 0.343, 0.2726],
          [-0.2999, 0.3297, 0.2777],
          [-0.2981, 0.3119, 0.2767],
          [-0.2967, 0.2985, 0.2702],
          [-0.2885, 0.2784, 0.2491],
          [-0.2981, 0.2549, 0.2269],
          [-0.2838, 0.2339, 0.2051],
          [-0.2934, 0.2104, 0.1838],
          [-0.285, 0.188, 0.1622],
          [-0.2844, 0.1821, 0.1744],
          [-0.2844, 0.1821, 0.1909],
          [-0.285, 0.188, 0.2033],
          [-0.2934, 0.2104, 0.2254],
          [-0.2838, 0.2339, 0.2471],
          [-0.292, 0.254, 0.2679],
          [-0.2906, 0.2407, 0.2727],
          [-0.2887, 0.2229, 0.2717],
          [-0.2873, 0.2095, 0.2655],
          [-0.285, 0.188, 0.2444],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [-0.2853, -0.095, -0.2706],
        localEnd: [-0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: 45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "lattice-openings",
        kind: "hole",
        description: "See-through diamond openings between strands (d01).",
        realizedInPass: "structural-pass",
      },
      {
        id: "over-under-interlace",
        kind: "ridge",
        description:
          "Strands alternate +/-7.5 mm about the panel plane at every crossing (d02).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-right",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_right_19.userData.actionProfile = {
    animationRole: "weave-panel",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "weave",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.12, 0, 0],
    },
  };
  (nodes["root"] ?? root).add(node_weave_lateral_right_19);
  nodes["weave-lateral-right"] = node_weave_lateral_right_19;
  const mesh_weave_lateral_right_19Geometry = endpoint_weave_lateral_right_19
    ? new THREE.CylinderGeometry(
        endpoint_weave_lateral_right_19.endRadius,
        endpoint_weave_lateral_right_19.baseRadius,
        endpoint_weave_lateral_right_19.length,
        16,
        6,
      )
    : buildTubeGeometry({
        points: [
          [-0.3245, 0.5638, -0.3522],
          [-0.3308, 0.5663, -0.3494],
          [-0.3273, 0.59, -0.3288],
          [-0.3279, 0.5959, -0.3151],
          [-0.3279, 0.5959, -0.2953],
          [-0.3273, 0.59, -0.2794],
          [-0.3308, 0.5663, -0.3006],
          [-0.3166, 0.5453, -0.3205],
          [-0.3262, 0.5218, -0.34],
          [-0.3199, 0.5193, -0.3427],
          [-0.3185, 0.506, -0.3462],
          [-0.3166, 0.4882, -0.3424],
          [-0.3152, 0.4748, -0.3332],
          [-0.3215, 0.4773, -0.3306],
          [-0.3119, 0.5008, -0.3115],
          [-0.3262, 0.5218, -0.292],
          [-0.3166, 0.5453, -0.2721],
          [-0.3308, 0.5663, -0.2517],
          [-0.3273, 0.59, -0.23],
          [-0.3279, 0.5959, -0.2161],
          [-0.3279, 0.5959, -0.1963],
          [-0.3273, 0.59, -0.1807],
          [-0.3308, 0.5663, -0.2028],
          [-0.3166, 0.5453, -0.2236],
          [-0.3262, 0.5218, -0.244],
          [-0.3119, 0.5008, -0.264],
          [-0.3215, 0.4773, -0.2835],
          [-0.3072, 0.4564, -0.3026],
          [-0.3168, 0.4329, -0.3212],
          [-0.3105, 0.4303, -0.3238],
          [-0.3091, 0.417, -0.327],
          [-0.3072, 0.3992, -0.3231],
          [-0.3058, 0.3859, -0.3143],
          [-0.3121, 0.3884, -0.3117],
          [-0.3025, 0.4119, -0.2936],
          [-0.3168, 0.4329, -0.275],
          [-0.3072, 0.4564, -0.2559],
          [-0.3215, 0.4773, -0.2364],
          [-0.3119, 0.5008, -0.2165],
          [-0.3262, 0.5218, -0.1961],
          [-0.3166, 0.5453, -0.1752],
          [-0.3308, 0.5663, -0.1539],
          [-0.3273, 0.59, -0.1313],
          [-0.3279, 0.5959, -0.1172],
          [-0.3279, 0.5959, -0.0974],
          [-0.3273, 0.59, -0.0819],
          [-0.3308, 0.5663, -0.105],
          [-0.3166, 0.5453, -0.1267],
          [-0.3262, 0.5218, -0.1481],
          [-0.3119, 0.5008, -0.1689],
          [-0.3215, 0.4773, -0.1894],
          [-0.3072, 0.4564, -0.2093],
          [-0.3168, 0.4329, -0.2288],
          [-0.3025, 0.4119, -0.2479],
          [-0.3121, 0.3884, -0.2665],
          [-0.2979, 0.3674, -0.2846],
          [-0.3075, 0.3439, -0.3023],
          [-0.3012, 0.3414, -0.3048],
          [-0.2998, 0.328, -0.3077],
          [-0.2979, 0.3102, -0.3039],
          [-0.2965, 0.2969, -0.2953],
          [-0.3028, 0.2994, -0.2929],
          [-0.2932, 0.3229, -0.2756],
          [-0.3075, 0.3439, -0.2579],
          [-0.2979, 0.3674, -0.2398],
          [-0.3121, 0.3884, -0.2212],
          [-0.3025, 0.4119, -0.2022],
          [-0.3168, 0.4329, -0.1827],
          [-0.3072, 0.4564, -0.1627],
          [-0.3215, 0.4773, -0.1423],
          [-0.3119, 0.5008, -0.1214],
          [-0.3262, 0.5218, -0.1001],
          [-0.3166, 0.5453, -0.0783],
          [-0.3308, 0.5663, -0.0561],
          [-0.3273, 0.59, -0.0326],
          [-0.3279, 0.5959, -0.0182],
          [-0.3279, 0.5959, 0.0016],
          [-0.3273, 0.59, 0.0168],
          [-0.3308, 0.5663, -0.0072],
          [-0.3166, 0.5453, -0.0299],
          [-0.3262, 0.5218, -0.0521],
          [-0.3119, 0.5008, -0.0739],
          [-0.3215, 0.4773, -0.0952],
          [-0.3072, 0.4564, -0.1161],
          [-0.3168, 0.4329, -0.1365],
          [-0.3025, 0.4119, -0.1565],
          [-0.3121, 0.3884, -0.176],
          [-0.2979, 0.3674, -0.195],
          [-0.3075, 0.3439, -0.2136],
          [-0.2932, 0.3229, -0.2317],
          [-0.3028, 0.2994, -0.2494],
          [-0.2885, 0.2784, -0.2667],
          [-0.2981, 0.2549, -0.2834],
          [-0.2918, 0.2524, -0.2858],
          [-0.2904, 0.239, -0.2885],
          [-0.2885, 0.2213, -0.2847],
          [-0.2871, 0.2079, -0.2763],
          [-0.2934, 0.2104, -0.274],
          [-0.2838, 0.2339, -0.2577],
          [-0.2981, 0.2549, -0.2409],
          [-0.2885, 0.2784, -0.2237],
          [-0.3028, 0.2994, -0.206],
          [-0.2932, 0.3229, -0.1879],
          [-0.3075, 0.3439, -0.1693],
          [-0.2979, 0.3674, -0.1502],
          [-0.3121, 0.3884, -0.1307],
          [-0.3025, 0.4119, -0.1107],
          [-0.3168, 0.4329, -0.0903],
          [-0.3072, 0.4564, -0.0695],
          [-0.3215, 0.4773, -0.0481],
          [-0.3119, 0.5008, -0.0264],
          [-0.3262, 0.5218, -0.0041],
          [-0.3166, 0.5453, 0.0186],
          [-0.3308, 0.5663, 0.0417],
          [-0.3273, 0.59, 0.0662],
          [-0.3279, 0.5959, 0.0808],
          [-0.3279, 0.5959, 0.1006],
          [-0.3273, 0.59, 0.1155],
          [-0.3308, 0.5663, 0.0906],
          [-0.3166, 0.5453, 0.067],
          [-0.3262, 0.5218, 0.0439],
          [-0.3119, 0.5008, 0.0212],
          [-0.3215, 0.4773, -0.0011],
          [-0.3072, 0.4564, -0.0228],
          [-0.3168, 0.4329, -0.0442],
          [-0.3025, 0.4119, -0.065],
          [-0.3121, 0.3884, -0.0854],
          [-0.2979, 0.3674, -0.1054],
          [-0.3075, 0.3439, -0.1249],
          [-0.2932, 0.3229, -0.144],
          [-0.3028, 0.2994, -0.1626],
          [-0.2885, 0.2784, -0.1807],
          [-0.2981, 0.2549, -0.1984],
          [-0.2838, 0.2339, -0.2156],
          [-0.2934, 0.2104, -0.2324],
          [-0.285, 0.188, -0.2493],
          [-0.2844, 0.1821, -0.2358],
          [-0.2844, 0.1821, -0.2194],
          [-0.285, 0.188, -0.2081],
          [-0.2934, 0.2104, -0.1908],
          [-0.2838, 0.2339, -0.1735],
          [-0.2981, 0.2549, -0.1559],
          [-0.2885, 0.2784, -0.1377],
          [-0.3028, 0.2994, -0.1191],
          [-0.2932, 0.3229, -0.1001],
          [-0.3075, 0.3439, -0.0806],
          [-0.2979, 0.3674, -0.0606],
          [-0.3121, 0.3884, -0.0402],
          [-0.3025, 0.4119, -0.0193],
          [-0.3168, 0.4329, 0.002],
          [-0.3072, 0.4564, 0.0238],
          [-0.3215, 0.4773, 0.046],
          [-0.3119, 0.5008, 0.0687],
          [-0.3262, 0.5218, 0.0919],
          [-0.3166, 0.5453, 0.1155],
          [-0.3308, 0.5663, 0.1395],
          [-0.3273, 0.59, 0.1649],
          [-0.3279, 0.5959, 0.1798],
          [-0.3279, 0.5959, 0.1996],
          [-0.3273, 0.59, 0.2143],
          [-0.3308, 0.5663, 0.1884],
          [-0.3166, 0.5453, 0.1639],
          [-0.3262, 0.5218, 0.1398],
          [-0.3119, 0.5008, 0.1162],
          [-0.3215, 0.4773, 0.0931],
          [-0.3072, 0.4564, 0.0704],
          [-0.3168, 0.4329, 0.0482],
          [-0.3025, 0.4119, 0.0264],
          [-0.3121, 0.3884, 0.0051],
          [-0.2979, 0.3674, -0.0158],
          [-0.3075, 0.3439, -0.0362],
          [-0.2932, 0.3229, -0.0562],
          [-0.3028, 0.2994, -0.0757],
          [-0.2885, 0.2784, -0.0947],
          [-0.2981, 0.2549, -0.1133],
          [-0.2838, 0.2339, -0.1315],
          [-0.2934, 0.2104, -0.1492],
          [-0.285, 0.188, -0.167],
          [-0.2844, 0.1821, -0.1537],
          [-0.2844, 0.1821, -0.1373],
          [-0.285, 0.188, -0.1258],
          [-0.2934, 0.2104, -0.1075],
          [-0.2838, 0.2339, -0.0894],
          [-0.2981, 0.2549, -0.0708],
          [-0.2885, 0.2784, -0.0518],
          [-0.3028, 0.2994, -0.0323],
          [-0.2932, 0.3229, -0.0123],
          [-0.3075, 0.3439, 0.0081],
          [-0.2979, 0.3674, 0.029],
          [-0.3121, 0.3884, 0.0503],
          [-0.3025, 0.4119, 0.0721],
          [-0.3168, 0.4329, 0.0943],
          [-0.3072, 0.4564, 0.117],
          [-0.3215, 0.4773, 0.1402],
          [-0.3119, 0.5008, 0.1638],
          [-0.3262, 0.5218, 0.1878],
          [-0.3166, 0.5453, 0.2123],
          [-0.3308, 0.5663, 0.2373],
          [-0.3273, 0.59, 0.2636],
          [-0.3265, 0.5826, 0.2699],
          [-0.3255, 0.5728, 0.2783],
          [-0.3247, 0.5654, 0.2845],
          [-0.3166, 0.5453, 0.2608],
          [-0.3262, 0.5218, 0.2358],
          [-0.3119, 0.5008, 0.2113],
          [-0.3215, 0.4773, 0.1872],
          [-0.3072, 0.4564, 0.1636],
          [-0.3168, 0.4329, 0.1405],
          [-0.3025, 0.4119, 0.1178],
          [-0.3121, 0.3884, 0.0956],
          [-0.2979, 0.3674, 0.0738],
          [-0.3075, 0.3439, 0.0525],
          [-0.2932, 0.3229, 0.0316],
          [-0.3028, 0.2994, 0.0112],
          [-0.2885, 0.2784, -0.0088],
          [-0.2981, 0.2549, -0.0283],
          [-0.2838, 0.2339, -0.0473],
          [-0.2934, 0.2104, -0.0659],
          [-0.285, 0.188, -0.0847],
          [-0.2844, 0.1821, -0.0717],
          [-0.2844, 0.1821, -0.0553],
          [-0.285, 0.188, -0.0436],
          [-0.2934, 0.2104, -0.0243],
          [-0.2838, 0.2339, -0.0053],
          [-0.2981, 0.2549, 0.0142],
          [-0.2885, 0.2784, 0.0342],
          [-0.3028, 0.2994, 0.0546],
          [-0.2932, 0.3229, 0.0755],
          [-0.3075, 0.3439, 0.0968],
          [-0.2979, 0.3674, 0.1186],
          [-0.3121, 0.3884, 0.1408],
          [-0.3025, 0.4119, 0.1635],
          [-0.3168, 0.4329, 0.1867],
          [-0.3072, 0.4564, 0.2103],
          [-0.3215, 0.4773, 0.2343],
          [-0.3119, 0.5008, 0.2588],
          [-0.32, 0.5209, 0.2821],
          [-0.3186, 0.5076, 0.2877],
          [-0.3168, 0.4898, 0.2867],
          [-0.3154, 0.4765, 0.2797],
          [-0.3072, 0.4564, 0.2569],
          [-0.3168, 0.4329, 0.2328],
          [-0.3025, 0.4119, 0.2092],
          [-0.3121, 0.3884, 0.1861],
          [-0.2979, 0.3674, 0.1634],
          [-0.3075, 0.3439, 0.1412],
          [-0.2932, 0.3229, 0.1194],
          [-0.3028, 0.2994, 0.098],
          [-0.2885, 0.2784, 0.0772],
          [-0.2981, 0.2549, 0.0568],
          [-0.2838, 0.2339, 0.0368],
          [-0.2934, 0.2104, 0.0173],
          [-0.285, 0.188, -0.0024],
          [-0.2844, 0.1821, 0.0104],
          [-0.2844, 0.1821, 0.0268],
          [-0.285, 0.188, 0.0387],
          [-0.2934, 0.2104, 0.0589],
          [-0.2838, 0.2339, 0.0789],
          [-0.2981, 0.2549, 0.0993],
          [-0.2885, 0.2784, 0.1202],
          [-0.3028, 0.2994, 0.1415],
          [-0.2932, 0.3229, 0.1633],
          [-0.3075, 0.3439, 0.1855],
          [-0.2979, 0.3674, 0.2082],
          [-0.3121, 0.3884, 0.2313],
          [-0.3025, 0.4119, 0.2549],
          [-0.3107, 0.432, 0.2773],
          [-0.3093, 0.4186, 0.2827],
          [-0.3074, 0.4008, 0.2817],
          [-0.306, 0.3875, 0.275],
          [-0.2979, 0.3674, 0.253],
          [-0.3075, 0.3439, 0.2298],
          [-0.2932, 0.3229, 0.2072],
          [-0.3028, 0.2994, 0.1849],
          [-0.2885, 0.2784, 0.1631],
          [-0.2981, 0.2549, 0.1418],
          [-0.2838, 0.2339, 0.1209],
          [-0.2934, 0.2104, 0.1005],
          [-0.285, 0.188, 0.0799],
          [-0.2844, 0.1821, 0.0924],
          [-0.2844, 0.1821, 0.1088],
          [-0.285, 0.188, 0.121],
          [-0.2934, 0.2104, 0.1421],
          [-0.2838, 0.2339, 0.163],
          [-0.2981, 0.2549, 0.1843],
          [-0.2885, 0.2784, 0.2061],
          [-0.3028, 0.2994, 0.2284],
          [-0.2932, 0.3229, 0.251],
          [-0.3013, 0.343, 0.2726],
          [-0.2999, 0.3297, 0.2777],
          [-0.2981, 0.3119, 0.2767],
          [-0.2967, 0.2985, 0.2702],
          [-0.2885, 0.2784, 0.2491],
          [-0.2981, 0.2549, 0.2269],
          [-0.2838, 0.2339, 0.2051],
          [-0.2934, 0.2104, 0.1838],
          [-0.285, 0.188, 0.1622],
          [-0.2844, 0.1821, 0.1744],
          [-0.2844, 0.1821, 0.1909],
          [-0.285, 0.188, 0.2033],
          [-0.2934, 0.2104, 0.2254],
          [-0.2838, 0.2339, 0.2471],
          [-0.292, 0.254, 0.2679],
          [-0.2906, 0.2407, 0.2727],
          [-0.2887, 0.2229, 0.2717],
          [-0.2873, 0.2095, 0.2655],
          [-0.285, 0.188, 0.2444],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      });
  if (!endpoint_weave_lateral_right_19) {
    mesh_weave_lateral_right_19Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_weave_lateral_right_19 = new THREE.Mesh(
    mesh_weave_lateral_right_19Geometry,
    materialMap["rope-braided"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_weave_lateral_right_19.name =
    "Lateral rope lattice (right, +45 deg run)";
  if (endpoint_weave_lateral_right_19) {
    mesh_weave_lateral_right_19.position.copy(
      endpoint_weave_lateral_right_19.midpoint,
    );
    mesh_weave_lateral_right_19.quaternion.copy(
      endpoint_weave_lateral_right_19.quaternion,
    );
  }
  mesh_weave_lateral_right_19.castShadow = options.castShadow ?? true;
  mesh_weave_lateral_right_19.receiveShadow = options.receiveShadow ?? true;
  mesh_weave_lateral_right_19.userData.sculptComponent = {
    id: "weave-lateral-right",
    name: "Lateral rope lattice (right, +45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [-0.3245, 0.5638, -0.3522],
          [-0.3308, 0.5663, -0.3494],
          [-0.3273, 0.59, -0.3288],
          [-0.3279, 0.5959, -0.3151],
          [-0.3279, 0.5959, -0.2953],
          [-0.3273, 0.59, -0.2794],
          [-0.3308, 0.5663, -0.3006],
          [-0.3166, 0.5453, -0.3205],
          [-0.3262, 0.5218, -0.34],
          [-0.3199, 0.5193, -0.3427],
          [-0.3185, 0.506, -0.3462],
          [-0.3166, 0.4882, -0.3424],
          [-0.3152, 0.4748, -0.3332],
          [-0.3215, 0.4773, -0.3306],
          [-0.3119, 0.5008, -0.3115],
          [-0.3262, 0.5218, -0.292],
          [-0.3166, 0.5453, -0.2721],
          [-0.3308, 0.5663, -0.2517],
          [-0.3273, 0.59, -0.23],
          [-0.3279, 0.5959, -0.2161],
          [-0.3279, 0.5959, -0.1963],
          [-0.3273, 0.59, -0.1807],
          [-0.3308, 0.5663, -0.2028],
          [-0.3166, 0.5453, -0.2236],
          [-0.3262, 0.5218, -0.244],
          [-0.3119, 0.5008, -0.264],
          [-0.3215, 0.4773, -0.2835],
          [-0.3072, 0.4564, -0.3026],
          [-0.3168, 0.4329, -0.3212],
          [-0.3105, 0.4303, -0.3238],
          [-0.3091, 0.417, -0.327],
          [-0.3072, 0.3992, -0.3231],
          [-0.3058, 0.3859, -0.3143],
          [-0.3121, 0.3884, -0.3117],
          [-0.3025, 0.4119, -0.2936],
          [-0.3168, 0.4329, -0.275],
          [-0.3072, 0.4564, -0.2559],
          [-0.3215, 0.4773, -0.2364],
          [-0.3119, 0.5008, -0.2165],
          [-0.3262, 0.5218, -0.1961],
          [-0.3166, 0.5453, -0.1752],
          [-0.3308, 0.5663, -0.1539],
          [-0.3273, 0.59, -0.1313],
          [-0.3279, 0.5959, -0.1172],
          [-0.3279, 0.5959, -0.0974],
          [-0.3273, 0.59, -0.0819],
          [-0.3308, 0.5663, -0.105],
          [-0.3166, 0.5453, -0.1267],
          [-0.3262, 0.5218, -0.1481],
          [-0.3119, 0.5008, -0.1689],
          [-0.3215, 0.4773, -0.1894],
          [-0.3072, 0.4564, -0.2093],
          [-0.3168, 0.4329, -0.2288],
          [-0.3025, 0.4119, -0.2479],
          [-0.3121, 0.3884, -0.2665],
          [-0.2979, 0.3674, -0.2846],
          [-0.3075, 0.3439, -0.3023],
          [-0.3012, 0.3414, -0.3048],
          [-0.2998, 0.328, -0.3077],
          [-0.2979, 0.3102, -0.3039],
          [-0.2965, 0.2969, -0.2953],
          [-0.3028, 0.2994, -0.2929],
          [-0.2932, 0.3229, -0.2756],
          [-0.3075, 0.3439, -0.2579],
          [-0.2979, 0.3674, -0.2398],
          [-0.3121, 0.3884, -0.2212],
          [-0.3025, 0.4119, -0.2022],
          [-0.3168, 0.4329, -0.1827],
          [-0.3072, 0.4564, -0.1627],
          [-0.3215, 0.4773, -0.1423],
          [-0.3119, 0.5008, -0.1214],
          [-0.3262, 0.5218, -0.1001],
          [-0.3166, 0.5453, -0.0783],
          [-0.3308, 0.5663, -0.0561],
          [-0.3273, 0.59, -0.0326],
          [-0.3279, 0.5959, -0.0182],
          [-0.3279, 0.5959, 0.0016],
          [-0.3273, 0.59, 0.0168],
          [-0.3308, 0.5663, -0.0072],
          [-0.3166, 0.5453, -0.0299],
          [-0.3262, 0.5218, -0.0521],
          [-0.3119, 0.5008, -0.0739],
          [-0.3215, 0.4773, -0.0952],
          [-0.3072, 0.4564, -0.1161],
          [-0.3168, 0.4329, -0.1365],
          [-0.3025, 0.4119, -0.1565],
          [-0.3121, 0.3884, -0.176],
          [-0.2979, 0.3674, -0.195],
          [-0.3075, 0.3439, -0.2136],
          [-0.2932, 0.3229, -0.2317],
          [-0.3028, 0.2994, -0.2494],
          [-0.2885, 0.2784, -0.2667],
          [-0.2981, 0.2549, -0.2834],
          [-0.2918, 0.2524, -0.2858],
          [-0.2904, 0.239, -0.2885],
          [-0.2885, 0.2213, -0.2847],
          [-0.2871, 0.2079, -0.2763],
          [-0.2934, 0.2104, -0.274],
          [-0.2838, 0.2339, -0.2577],
          [-0.2981, 0.2549, -0.2409],
          [-0.2885, 0.2784, -0.2237],
          [-0.3028, 0.2994, -0.206],
          [-0.2932, 0.3229, -0.1879],
          [-0.3075, 0.3439, -0.1693],
          [-0.2979, 0.3674, -0.1502],
          [-0.3121, 0.3884, -0.1307],
          [-0.3025, 0.4119, -0.1107],
          [-0.3168, 0.4329, -0.0903],
          [-0.3072, 0.4564, -0.0695],
          [-0.3215, 0.4773, -0.0481],
          [-0.3119, 0.5008, -0.0264],
          [-0.3262, 0.5218, -0.0041],
          [-0.3166, 0.5453, 0.0186],
          [-0.3308, 0.5663, 0.0417],
          [-0.3273, 0.59, 0.0662],
          [-0.3279, 0.5959, 0.0808],
          [-0.3279, 0.5959, 0.1006],
          [-0.3273, 0.59, 0.1155],
          [-0.3308, 0.5663, 0.0906],
          [-0.3166, 0.5453, 0.067],
          [-0.3262, 0.5218, 0.0439],
          [-0.3119, 0.5008, 0.0212],
          [-0.3215, 0.4773, -0.0011],
          [-0.3072, 0.4564, -0.0228],
          [-0.3168, 0.4329, -0.0442],
          [-0.3025, 0.4119, -0.065],
          [-0.3121, 0.3884, -0.0854],
          [-0.2979, 0.3674, -0.1054],
          [-0.3075, 0.3439, -0.1249],
          [-0.2932, 0.3229, -0.144],
          [-0.3028, 0.2994, -0.1626],
          [-0.2885, 0.2784, -0.1807],
          [-0.2981, 0.2549, -0.1984],
          [-0.2838, 0.2339, -0.2156],
          [-0.2934, 0.2104, -0.2324],
          [-0.285, 0.188, -0.2493],
          [-0.2844, 0.1821, -0.2358],
          [-0.2844, 0.1821, -0.2194],
          [-0.285, 0.188, -0.2081],
          [-0.2934, 0.2104, -0.1908],
          [-0.2838, 0.2339, -0.1735],
          [-0.2981, 0.2549, -0.1559],
          [-0.2885, 0.2784, -0.1377],
          [-0.3028, 0.2994, -0.1191],
          [-0.2932, 0.3229, -0.1001],
          [-0.3075, 0.3439, -0.0806],
          [-0.2979, 0.3674, -0.0606],
          [-0.3121, 0.3884, -0.0402],
          [-0.3025, 0.4119, -0.0193],
          [-0.3168, 0.4329, 0.002],
          [-0.3072, 0.4564, 0.0238],
          [-0.3215, 0.4773, 0.046],
          [-0.3119, 0.5008, 0.0687],
          [-0.3262, 0.5218, 0.0919],
          [-0.3166, 0.5453, 0.1155],
          [-0.3308, 0.5663, 0.1395],
          [-0.3273, 0.59, 0.1649],
          [-0.3279, 0.5959, 0.1798],
          [-0.3279, 0.5959, 0.1996],
          [-0.3273, 0.59, 0.2143],
          [-0.3308, 0.5663, 0.1884],
          [-0.3166, 0.5453, 0.1639],
          [-0.3262, 0.5218, 0.1398],
          [-0.3119, 0.5008, 0.1162],
          [-0.3215, 0.4773, 0.0931],
          [-0.3072, 0.4564, 0.0704],
          [-0.3168, 0.4329, 0.0482],
          [-0.3025, 0.4119, 0.0264],
          [-0.3121, 0.3884, 0.0051],
          [-0.2979, 0.3674, -0.0158],
          [-0.3075, 0.3439, -0.0362],
          [-0.2932, 0.3229, -0.0562],
          [-0.3028, 0.2994, -0.0757],
          [-0.2885, 0.2784, -0.0947],
          [-0.2981, 0.2549, -0.1133],
          [-0.2838, 0.2339, -0.1315],
          [-0.2934, 0.2104, -0.1492],
          [-0.285, 0.188, -0.167],
          [-0.2844, 0.1821, -0.1537],
          [-0.2844, 0.1821, -0.1373],
          [-0.285, 0.188, -0.1258],
          [-0.2934, 0.2104, -0.1075],
          [-0.2838, 0.2339, -0.0894],
          [-0.2981, 0.2549, -0.0708],
          [-0.2885, 0.2784, -0.0518],
          [-0.3028, 0.2994, -0.0323],
          [-0.2932, 0.3229, -0.0123],
          [-0.3075, 0.3439, 0.0081],
          [-0.2979, 0.3674, 0.029],
          [-0.3121, 0.3884, 0.0503],
          [-0.3025, 0.4119, 0.0721],
          [-0.3168, 0.4329, 0.0943],
          [-0.3072, 0.4564, 0.117],
          [-0.3215, 0.4773, 0.1402],
          [-0.3119, 0.5008, 0.1638],
          [-0.3262, 0.5218, 0.1878],
          [-0.3166, 0.5453, 0.2123],
          [-0.3308, 0.5663, 0.2373],
          [-0.3273, 0.59, 0.2636],
          [-0.3265, 0.5826, 0.2699],
          [-0.3255, 0.5728, 0.2783],
          [-0.3247, 0.5654, 0.2845],
          [-0.3166, 0.5453, 0.2608],
          [-0.3262, 0.5218, 0.2358],
          [-0.3119, 0.5008, 0.2113],
          [-0.3215, 0.4773, 0.1872],
          [-0.3072, 0.4564, 0.1636],
          [-0.3168, 0.4329, 0.1405],
          [-0.3025, 0.4119, 0.1178],
          [-0.3121, 0.3884, 0.0956],
          [-0.2979, 0.3674, 0.0738],
          [-0.3075, 0.3439, 0.0525],
          [-0.2932, 0.3229, 0.0316],
          [-0.3028, 0.2994, 0.0112],
          [-0.2885, 0.2784, -0.0088],
          [-0.2981, 0.2549, -0.0283],
          [-0.2838, 0.2339, -0.0473],
          [-0.2934, 0.2104, -0.0659],
          [-0.285, 0.188, -0.0847],
          [-0.2844, 0.1821, -0.0717],
          [-0.2844, 0.1821, -0.0553],
          [-0.285, 0.188, -0.0436],
          [-0.2934, 0.2104, -0.0243],
          [-0.2838, 0.2339, -0.0053],
          [-0.2981, 0.2549, 0.0142],
          [-0.2885, 0.2784, 0.0342],
          [-0.3028, 0.2994, 0.0546],
          [-0.2932, 0.3229, 0.0755],
          [-0.3075, 0.3439, 0.0968],
          [-0.2979, 0.3674, 0.1186],
          [-0.3121, 0.3884, 0.1408],
          [-0.3025, 0.4119, 0.1635],
          [-0.3168, 0.4329, 0.1867],
          [-0.3072, 0.4564, 0.2103],
          [-0.3215, 0.4773, 0.2343],
          [-0.3119, 0.5008, 0.2588],
          [-0.32, 0.5209, 0.2821],
          [-0.3186, 0.5076, 0.2877],
          [-0.3168, 0.4898, 0.2867],
          [-0.3154, 0.4765, 0.2797],
          [-0.3072, 0.4564, 0.2569],
          [-0.3168, 0.4329, 0.2328],
          [-0.3025, 0.4119, 0.2092],
          [-0.3121, 0.3884, 0.1861],
          [-0.2979, 0.3674, 0.1634],
          [-0.3075, 0.3439, 0.1412],
          [-0.2932, 0.3229, 0.1194],
          [-0.3028, 0.2994, 0.098],
          [-0.2885, 0.2784, 0.0772],
          [-0.2981, 0.2549, 0.0568],
          [-0.2838, 0.2339, 0.0368],
          [-0.2934, 0.2104, 0.0173],
          [-0.285, 0.188, -0.0024],
          [-0.2844, 0.1821, 0.0104],
          [-0.2844, 0.1821, 0.0268],
          [-0.285, 0.188, 0.0387],
          [-0.2934, 0.2104, 0.0589],
          [-0.2838, 0.2339, 0.0789],
          [-0.2981, 0.2549, 0.0993],
          [-0.2885, 0.2784, 0.1202],
          [-0.3028, 0.2994, 0.1415],
          [-0.2932, 0.3229, 0.1633],
          [-0.3075, 0.3439, 0.1855],
          [-0.2979, 0.3674, 0.2082],
          [-0.3121, 0.3884, 0.2313],
          [-0.3025, 0.4119, 0.2549],
          [-0.3107, 0.432, 0.2773],
          [-0.3093, 0.4186, 0.2827],
          [-0.3074, 0.4008, 0.2817],
          [-0.306, 0.3875, 0.275],
          [-0.2979, 0.3674, 0.253],
          [-0.3075, 0.3439, 0.2298],
          [-0.2932, 0.3229, 0.2072],
          [-0.3028, 0.2994, 0.1849],
          [-0.2885, 0.2784, 0.1631],
          [-0.2981, 0.2549, 0.1418],
          [-0.2838, 0.2339, 0.1209],
          [-0.2934, 0.2104, 0.1005],
          [-0.285, 0.188, 0.0799],
          [-0.2844, 0.1821, 0.0924],
          [-0.2844, 0.1821, 0.1088],
          [-0.285, 0.188, 0.121],
          [-0.2934, 0.2104, 0.1421],
          [-0.2838, 0.2339, 0.163],
          [-0.2981, 0.2549, 0.1843],
          [-0.2885, 0.2784, 0.2061],
          [-0.3028, 0.2994, 0.2284],
          [-0.2932, 0.3229, 0.251],
          [-0.3013, 0.343, 0.2726],
          [-0.2999, 0.3297, 0.2777],
          [-0.2981, 0.3119, 0.2767],
          [-0.2967, 0.2985, 0.2702],
          [-0.2885, 0.2784, 0.2491],
          [-0.2981, 0.2549, 0.2269],
          [-0.2838, 0.2339, 0.2051],
          [-0.2934, 0.2104, 0.1838],
          [-0.285, 0.188, 0.1622],
          [-0.2844, 0.1821, 0.1744],
          [-0.2844, 0.1821, 0.1909],
          [-0.285, 0.188, 0.2033],
          [-0.2934, 0.2104, 0.2254],
          [-0.2838, 0.2339, 0.2471],
          [-0.292, 0.254, 0.2679],
          [-0.2906, 0.2407, 0.2727],
          [-0.2887, 0.2229, 0.2717],
          [-0.2873, 0.2095, 0.2655],
          [-0.285, 0.188, 0.2444],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [-0.2853, -0.095, -0.2706],
        localEnd: [-0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: 45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "lattice-openings",
        kind: "hole",
        description: "See-through diamond openings between strands (d01).",
        realizedInPass: "structural-pass",
      },
      {
        id: "over-under-interlace",
        kind: "ridge",
        description:
          "Strands alternate +/-7.5 mm about the panel plane at every crossing (d02).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-right",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_right_19.add(mesh_weave_lateral_right_19);
  meshes["weave-lateral-right"] = mesh_weave_lateral_right_19;
  colliders["weave-lateral-right"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["weave"] ??= [];
  destructionGroups["weave"].push(node_weave_lateral_right_19);

  const attachment_weave_lateral_right_b_20 = null;
  const endpoint_weave_lateral_right_b_20 = makeAttachmentEndpoint(
    attachment_weave_lateral_right_b_20,
  );
  const node_weave_lateral_right_b_20 = new THREE.Group();
  node_weave_lateral_right_b_20.name =
    "Lateral rope lattice (right, -45 deg run)__pivot";
  node_weave_lateral_right_b_20.scale.set(1, 1, 1);
  if (endpoint_weave_lateral_right_b_20) {
    node_weave_lateral_right_b_20.position.copy(
      endpoint_weave_lateral_right_b_20.start,
    );
    node_weave_lateral_right_b_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_weave_lateral_right_b_20.position.set(0.0, 0.0, 0.0);
    node_weave_lateral_right_b_20.rotation.set(0.0, 0.0, 0.0);
  }
  node_weave_lateral_right_b_20.userData.sculptComponent = {
    id: "weave-lateral-right-b",
    name: "Lateral rope lattice (right, -45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [-0.2878, 0.2142, -0.2776],
          [-0.2815, 0.2117, -0.274],
          [-0.285, 0.188, -0.2478],
          [-0.2844, 0.1821, -0.2343],
          [-0.2844, 0.1821, -0.2179],
          [-0.285, 0.188, -0.2067],
          [-0.2815, 0.2117, -0.2324],
          [-0.2958, 0.2327, -0.2577],
          [-0.2862, 0.2562, -0.2834],
          [-0.2925, 0.2587, -0.2871],
          [-0.2939, 0.272, -0.2956],
          [-0.2957, 0.2898, -0.2995],
          [-0.2972, 0.3032, -0.2966],
          [-0.2909, 0.3007, -0.2929],
          [-0.3004, 0.2772, -0.2667],
          [-0.2862, 0.2562, -0.2409],
          [-0.2958, 0.2327, -0.2156],
          [-0.2815, 0.2117, -0.1908],
          [-0.285, 0.188, -0.1655],
          [-0.2844, 0.1821, -0.1523],
          [-0.2844, 0.1821, -0.1359],
          [-0.285, 0.188, -0.1244],
          [-0.2815, 0.2117, -0.1492],
          [-0.2958, 0.2327, -0.1735],
          [-0.2862, 0.2562, -0.1984],
          [-0.3004, 0.2772, -0.2237],
          [-0.2909, 0.3007, -0.2494],
          [-0.3051, 0.3216, -0.2756],
          [-0.2955, 0.3451, -0.3023],
          [-0.3018, 0.3477, -0.3061],
          [-0.3032, 0.361, -0.3149],
          [-0.3051, 0.3788, -0.3187],
          [-0.3065, 0.3921, -0.3156],
          [-0.3002, 0.3896, -0.3117],
          [-0.3098, 0.3661, -0.2846],
          [-0.2955, 0.3451, -0.2579],
          [-0.3051, 0.3216, -0.2317],
          [-0.2909, 0.3007, -0.206],
          [-0.3004, 0.2772, -0.1807],
          [-0.2862, 0.2562, -0.1559],
          [-0.2958, 0.2327, -0.1315],
          [-0.2815, 0.2117, -0.1075],
          [-0.285, 0.188, -0.0833],
          [-0.2844, 0.1821, -0.0702],
          [-0.2844, 0.1821, -0.0538],
          [-0.285, 0.188, -0.0421],
          [-0.2815, 0.2117, -0.0659],
          [-0.2958, 0.2327, -0.0894],
          [-0.2862, 0.2562, -0.1133],
          [-0.3004, 0.2772, -0.1377],
          [-0.2909, 0.3007, -0.1626],
          [-0.3051, 0.3216, -0.1879],
          [-0.2955, 0.3451, -0.2136],
          [-0.3098, 0.3661, -0.2398],
          [-0.3002, 0.3896, -0.2665],
          [-0.3145, 0.4106, -0.2936],
          [-0.3049, 0.4341, -0.3212],
          [-0.3112, 0.4366, -0.3251],
          [-0.3126, 0.45, -0.3341],
          [-0.3145, 0.4678, -0.338],
          [-0.3159, 0.4811, -0.3346],
          [-0.3096, 0.4786, -0.3306],
          [-0.3192, 0.4551, -0.3026],
          [-0.3049, 0.4341, -0.275],
          [-0.3145, 0.4106, -0.2479],
          [-0.3002, 0.3896, -0.2212],
          [-0.3098, 0.3661, -0.195],
          [-0.2955, 0.3451, -0.1693],
          [-0.3051, 0.3216, -0.144],
          [-0.2909, 0.3007, -0.1191],
          [-0.3004, 0.2772, -0.0947],
          [-0.2862, 0.2562, -0.0708],
          [-0.2958, 0.2327, -0.0473],
          [-0.2815, 0.2117, -0.0243],
          [-0.285, 0.188, -0.001],
          [-0.2844, 0.1821, 0.0118],
          [-0.2844, 0.1821, 0.0282],
          [-0.285, 0.188, 0.0402],
          [-0.2815, 0.2117, 0.0173],
          [-0.2958, 0.2327, -0.0053],
          [-0.2862, 0.2562, -0.0283],
          [-0.3004, 0.2772, -0.0518],
          [-0.2909, 0.3007, -0.0757],
          [-0.3051, 0.3216, -0.1001],
          [-0.2955, 0.3451, -0.1249],
          [-0.3098, 0.3661, -0.1502],
          [-0.3002, 0.3896, -0.176],
          [-0.3145, 0.4106, -0.2022],
          [-0.3049, 0.4341, -0.2288],
          [-0.3192, 0.4551, -0.2559],
          [-0.3096, 0.4786, -0.2835],
          [-0.3238, 0.4996, -0.3115],
          [-0.3142, 0.5231, -0.34],
          [-0.3205, 0.5256, -0.3441],
          [-0.3219, 0.539, -0.3533],
          [-0.3238, 0.5567, -0.3572],
          [-0.3252, 0.5701, -0.3536],
          [-0.3189, 0.5676, -0.3494],
          [-0.3285, 0.5441, -0.3205],
          [-0.3142, 0.5231, -0.292],
          [-0.3238, 0.4996, -0.264],
          [-0.3096, 0.4786, -0.2364],
          [-0.3192, 0.4551, -0.2093],
          [-0.3049, 0.4341, -0.1827],
          [-0.3145, 0.4106, -0.1565],
          [-0.3002, 0.3896, -0.1307],
          [-0.3098, 0.3661, -0.1054],
          [-0.2955, 0.3451, -0.0806],
          [-0.3051, 0.3216, -0.0562],
          [-0.2909, 0.3007, -0.0323],
          [-0.3004, 0.2772, -0.0088],
          [-0.2862, 0.2562, 0.0142],
          [-0.2958, 0.2327, 0.0368],
          [-0.2815, 0.2117, 0.0589],
          [-0.285, 0.188, 0.0813],
          [-0.2844, 0.1821, 0.0938],
          [-0.2844, 0.1821, 0.1103],
          [-0.285, 0.188, 0.1225],
          [-0.2815, 0.2117, 0.1005],
          [-0.2958, 0.2327, 0.0789],
          [-0.2862, 0.2562, 0.0568],
          [-0.3004, 0.2772, 0.0342],
          [-0.2909, 0.3007, 0.0112],
          [-0.3051, 0.3216, -0.0123],
          [-0.2955, 0.3451, -0.0362],
          [-0.3098, 0.3661, -0.0606],
          [-0.3002, 0.3896, -0.0854],
          [-0.3145, 0.4106, -0.1107],
          [-0.3049, 0.4341, -0.1365],
          [-0.3192, 0.4551, -0.1627],
          [-0.3096, 0.4786, -0.1894],
          [-0.3238, 0.4996, -0.2165],
          [-0.3142, 0.5231, -0.244],
          [-0.3285, 0.5441, -0.2721],
          [-0.3189, 0.5676, -0.3006],
          [-0.3273, 0.59, -0.3305],
          [-0.3279, 0.5959, -0.3169],
          [-0.3279, 0.5959, -0.2971],
          [-0.3273, 0.59, -0.2811],
          [-0.3189, 0.5676, -0.2517],
          [-0.3285, 0.5441, -0.2236],
          [-0.3142, 0.5231, -0.1961],
          [-0.3238, 0.4996, -0.1689],
          [-0.3096, 0.4786, -0.1423],
          [-0.3192, 0.4551, -0.1161],
          [-0.3049, 0.4341, -0.0903],
          [-0.3145, 0.4106, -0.065],
          [-0.3002, 0.3896, -0.0402],
          [-0.3098, 0.3661, -0.0158],
          [-0.2955, 0.3451, 0.0081],
          [-0.3051, 0.3216, 0.0316],
          [-0.2909, 0.3007, 0.0546],
          [-0.3004, 0.2772, 0.0772],
          [-0.2862, 0.2562, 0.0993],
          [-0.2958, 0.2327, 0.1209],
          [-0.2815, 0.2117, 0.1421],
          [-0.285, 0.188, 0.1636],
          [-0.2844, 0.1821, 0.1759],
          [-0.2844, 0.1821, 0.1923],
          [-0.285, 0.188, 0.2047],
          [-0.2815, 0.2117, 0.1838],
          [-0.2958, 0.2327, 0.163],
          [-0.2862, 0.2562, 0.1418],
          [-0.3004, 0.2772, 0.1202],
          [-0.2909, 0.3007, 0.098],
          [-0.3051, 0.3216, 0.0755],
          [-0.2955, 0.3451, 0.0525],
          [-0.3098, 0.3661, 0.029],
          [-0.3002, 0.3896, 0.0051],
          [-0.3145, 0.4106, -0.0193],
          [-0.3049, 0.4341, -0.0442],
          [-0.3192, 0.4551, -0.0695],
          [-0.3096, 0.4786, -0.0952],
          [-0.3238, 0.4996, -0.1214],
          [-0.3142, 0.5231, -0.1481],
          [-0.3285, 0.5441, -0.1752],
          [-0.3189, 0.5676, -0.2028],
          [-0.3273, 0.59, -0.2318],
          [-0.3279, 0.5959, -0.2179],
          [-0.3279, 0.5959, -0.1981],
          [-0.3273, 0.59, -0.1824],
          [-0.3189, 0.5676, -0.1539],
          [-0.3285, 0.5441, -0.1267],
          [-0.3142, 0.5231, -0.1001],
          [-0.3238, 0.4996, -0.0739],
          [-0.3096, 0.4786, -0.0481],
          [-0.3192, 0.4551, -0.0228],
          [-0.3049, 0.4341, 0.002],
          [-0.3145, 0.4106, 0.0264],
          [-0.3002, 0.3896, 0.0503],
          [-0.3098, 0.3661, 0.0738],
          [-0.2955, 0.3451, 0.0968],
          [-0.3051, 0.3216, 0.1194],
          [-0.2909, 0.3007, 0.1415],
          [-0.3004, 0.2772, 0.1631],
          [-0.2862, 0.2562, 0.1843],
          [-0.2958, 0.2327, 0.2051],
          [-0.2815, 0.2117, 0.2254],
          [-0.285, 0.188, 0.2459],
          [-0.2858, 0.1954, 0.2518],
          [-0.2869, 0.2052, 0.2597],
          [-0.2876, 0.2126, 0.2656],
          [-0.2958, 0.2327, 0.2471],
          [-0.2862, 0.2562, 0.2269],
          [-0.3004, 0.2772, 0.2061],
          [-0.2909, 0.3007, 0.1849],
          [-0.3051, 0.3216, 0.1633],
          [-0.2955, 0.3451, 0.1412],
          [-0.3098, 0.3661, 0.1186],
          [-0.3002, 0.3896, 0.0956],
          [-0.3145, 0.4106, 0.0721],
          [-0.3049, 0.4341, 0.0482],
          [-0.3192, 0.4551, 0.0238],
          [-0.3096, 0.4786, -0.0011],
          [-0.3238, 0.4996, -0.0264],
          [-0.3142, 0.5231, -0.0521],
          [-0.3285, 0.5441, -0.0783],
          [-0.3189, 0.5676, -0.105],
          [-0.3273, 0.59, -0.133],
          [-0.3279, 0.5959, -0.1189],
          [-0.3279, 0.5959, -0.0991],
          [-0.3273, 0.59, -0.0837],
          [-0.3189, 0.5676, -0.0561],
          [-0.3285, 0.5441, -0.0299],
          [-0.3142, 0.5231, -0.0041],
          [-0.3238, 0.4996, 0.0212],
          [-0.3096, 0.4786, 0.046],
          [-0.3192, 0.4551, 0.0704],
          [-0.3049, 0.4341, 0.0943],
          [-0.3145, 0.4106, 0.1178],
          [-0.3002, 0.3896, 0.1408],
          [-0.3098, 0.3661, 0.1634],
          [-0.2955, 0.3451, 0.1855],
          [-0.3051, 0.3216, 0.2072],
          [-0.2909, 0.3007, 0.2284],
          [-0.3004, 0.2772, 0.2491],
          [-0.2923, 0.2571, 0.268],
          [-0.2937, 0.2704, 0.2744],
          [-0.2956, 0.2882, 0.2754],
          [-0.297, 0.3015, 0.2704],
          [-0.3051, 0.3216, 0.251],
          [-0.2955, 0.3451, 0.2298],
          [-0.3098, 0.3661, 0.2082],
          [-0.3002, 0.3896, 0.1861],
          [-0.3145, 0.4106, 0.1635],
          [-0.3049, 0.4341, 0.1405],
          [-0.3192, 0.4551, 0.117],
          [-0.3096, 0.4786, 0.0931],
          [-0.3238, 0.4996, 0.0687],
          [-0.3142, 0.5231, 0.0439],
          [-0.3285, 0.5441, 0.0186],
          [-0.3189, 0.5676, -0.0072],
          [-0.3273, 0.59, -0.0343],
          [-0.3279, 0.5959, -0.0199],
          [-0.3279, 0.5959, -0.0001],
          [-0.3273, 0.59, 0.0151],
          [-0.3189, 0.5676, 0.0417],
          [-0.3285, 0.5441, 0.067],
          [-0.3142, 0.5231, 0.0919],
          [-0.3238, 0.4996, 0.1162],
          [-0.3096, 0.4786, 0.1402],
          [-0.3192, 0.4551, 0.1636],
          [-0.3049, 0.4341, 0.1867],
          [-0.3145, 0.4106, 0.2092],
          [-0.3002, 0.3896, 0.2313],
          [-0.3098, 0.3661, 0.253],
          [-0.3017, 0.346, 0.2728],
          [-0.3031, 0.3594, 0.2794],
          [-0.3049, 0.3772, 0.2804],
          [-0.3063, 0.3905, 0.2751],
          [-0.3145, 0.4106, 0.2549],
          [-0.3049, 0.4341, 0.2328],
          [-0.3192, 0.4551, 0.2103],
          [-0.3096, 0.4786, 0.1872],
          [-0.3238, 0.4996, 0.1638],
          [-0.3142, 0.5231, 0.1398],
          [-0.3285, 0.5441, 0.1155],
          [-0.3189, 0.5676, 0.0906],
          [-0.3273, 0.59, 0.0644],
          [-0.3279, 0.5959, 0.079],
          [-0.3279, 0.5959, 0.0988],
          [-0.3273, 0.59, 0.1138],
          [-0.3189, 0.5676, 0.1395],
          [-0.3285, 0.5441, 0.1639],
          [-0.3142, 0.5231, 0.1878],
          [-0.3238, 0.4996, 0.2113],
          [-0.3096, 0.4786, 0.2343],
          [-0.3192, 0.4551, 0.2569],
          [-0.311, 0.435, 0.2775],
          [-0.3124, 0.4483, 0.2844],
          [-0.3143, 0.4661, 0.2854],
          [-0.3157, 0.4795, 0.2799],
          [-0.3238, 0.4996, 0.2588],
          [-0.3142, 0.5231, 0.2358],
          [-0.3285, 0.5441, 0.2123],
          [-0.3189, 0.5676, 0.1884],
          [-0.3273, 0.59, 0.1632],
          [-0.3279, 0.5959, 0.178],
          [-0.3279, 0.5959, 0.1978],
          [-0.3273, 0.59, 0.2125],
          [-0.3189, 0.5676, 0.2373],
          [-0.3285, 0.5441, 0.2608],
          [-0.3204, 0.524, 0.2822],
          [-0.3218, 0.5373, 0.2894],
          [-0.3236, 0.5551, 0.2904],
          [-0.325, 0.5685, 0.2846],
          [-0.3273, 0.59, 0.2619],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [-0.2853, -0.095, -0.2706],
        localEnd: [-0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: -45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-right-b",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_right_b_20.userData.actionProfile = {
    animationRole: "weave-panel",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "weave",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [-0.12, 0, 0],
    },
  };
  (nodes["root"] ?? root).add(node_weave_lateral_right_b_20);
  nodes["weave-lateral-right-b"] = node_weave_lateral_right_b_20;
  const mesh_weave_lateral_right_b_20Geometry =
    endpoint_weave_lateral_right_b_20
      ? new THREE.CylinderGeometry(
          endpoint_weave_lateral_right_b_20.endRadius,
          endpoint_weave_lateral_right_b_20.baseRadius,
          endpoint_weave_lateral_right_b_20.length,
          16,
          6,
        )
      : buildTubeGeometry({
          points: [
            [-0.2878, 0.2142, -0.2776],
            [-0.2815, 0.2117, -0.274],
            [-0.285, 0.188, -0.2478],
            [-0.2844, 0.1821, -0.2343],
            [-0.2844, 0.1821, -0.2179],
            [-0.285, 0.188, -0.2067],
            [-0.2815, 0.2117, -0.2324],
            [-0.2958, 0.2327, -0.2577],
            [-0.2862, 0.2562, -0.2834],
            [-0.2925, 0.2587, -0.2871],
            [-0.2939, 0.272, -0.2956],
            [-0.2957, 0.2898, -0.2995],
            [-0.2972, 0.3032, -0.2966],
            [-0.2909, 0.3007, -0.2929],
            [-0.3004, 0.2772, -0.2667],
            [-0.2862, 0.2562, -0.2409],
            [-0.2958, 0.2327, -0.2156],
            [-0.2815, 0.2117, -0.1908],
            [-0.285, 0.188, -0.1655],
            [-0.2844, 0.1821, -0.1523],
            [-0.2844, 0.1821, -0.1359],
            [-0.285, 0.188, -0.1244],
            [-0.2815, 0.2117, -0.1492],
            [-0.2958, 0.2327, -0.1735],
            [-0.2862, 0.2562, -0.1984],
            [-0.3004, 0.2772, -0.2237],
            [-0.2909, 0.3007, -0.2494],
            [-0.3051, 0.3216, -0.2756],
            [-0.2955, 0.3451, -0.3023],
            [-0.3018, 0.3477, -0.3061],
            [-0.3032, 0.361, -0.3149],
            [-0.3051, 0.3788, -0.3187],
            [-0.3065, 0.3921, -0.3156],
            [-0.3002, 0.3896, -0.3117],
            [-0.3098, 0.3661, -0.2846],
            [-0.2955, 0.3451, -0.2579],
            [-0.3051, 0.3216, -0.2317],
            [-0.2909, 0.3007, -0.206],
            [-0.3004, 0.2772, -0.1807],
            [-0.2862, 0.2562, -0.1559],
            [-0.2958, 0.2327, -0.1315],
            [-0.2815, 0.2117, -0.1075],
            [-0.285, 0.188, -0.0833],
            [-0.2844, 0.1821, -0.0702],
            [-0.2844, 0.1821, -0.0538],
            [-0.285, 0.188, -0.0421],
            [-0.2815, 0.2117, -0.0659],
            [-0.2958, 0.2327, -0.0894],
            [-0.2862, 0.2562, -0.1133],
            [-0.3004, 0.2772, -0.1377],
            [-0.2909, 0.3007, -0.1626],
            [-0.3051, 0.3216, -0.1879],
            [-0.2955, 0.3451, -0.2136],
            [-0.3098, 0.3661, -0.2398],
            [-0.3002, 0.3896, -0.2665],
            [-0.3145, 0.4106, -0.2936],
            [-0.3049, 0.4341, -0.3212],
            [-0.3112, 0.4366, -0.3251],
            [-0.3126, 0.45, -0.3341],
            [-0.3145, 0.4678, -0.338],
            [-0.3159, 0.4811, -0.3346],
            [-0.3096, 0.4786, -0.3306],
            [-0.3192, 0.4551, -0.3026],
            [-0.3049, 0.4341, -0.275],
            [-0.3145, 0.4106, -0.2479],
            [-0.3002, 0.3896, -0.2212],
            [-0.3098, 0.3661, -0.195],
            [-0.2955, 0.3451, -0.1693],
            [-0.3051, 0.3216, -0.144],
            [-0.2909, 0.3007, -0.1191],
            [-0.3004, 0.2772, -0.0947],
            [-0.2862, 0.2562, -0.0708],
            [-0.2958, 0.2327, -0.0473],
            [-0.2815, 0.2117, -0.0243],
            [-0.285, 0.188, -0.001],
            [-0.2844, 0.1821, 0.0118],
            [-0.2844, 0.1821, 0.0282],
            [-0.285, 0.188, 0.0402],
            [-0.2815, 0.2117, 0.0173],
            [-0.2958, 0.2327, -0.0053],
            [-0.2862, 0.2562, -0.0283],
            [-0.3004, 0.2772, -0.0518],
            [-0.2909, 0.3007, -0.0757],
            [-0.3051, 0.3216, -0.1001],
            [-0.2955, 0.3451, -0.1249],
            [-0.3098, 0.3661, -0.1502],
            [-0.3002, 0.3896, -0.176],
            [-0.3145, 0.4106, -0.2022],
            [-0.3049, 0.4341, -0.2288],
            [-0.3192, 0.4551, -0.2559],
            [-0.3096, 0.4786, -0.2835],
            [-0.3238, 0.4996, -0.3115],
            [-0.3142, 0.5231, -0.34],
            [-0.3205, 0.5256, -0.3441],
            [-0.3219, 0.539, -0.3533],
            [-0.3238, 0.5567, -0.3572],
            [-0.3252, 0.5701, -0.3536],
            [-0.3189, 0.5676, -0.3494],
            [-0.3285, 0.5441, -0.3205],
            [-0.3142, 0.5231, -0.292],
            [-0.3238, 0.4996, -0.264],
            [-0.3096, 0.4786, -0.2364],
            [-0.3192, 0.4551, -0.2093],
            [-0.3049, 0.4341, -0.1827],
            [-0.3145, 0.4106, -0.1565],
            [-0.3002, 0.3896, -0.1307],
            [-0.3098, 0.3661, -0.1054],
            [-0.2955, 0.3451, -0.0806],
            [-0.3051, 0.3216, -0.0562],
            [-0.2909, 0.3007, -0.0323],
            [-0.3004, 0.2772, -0.0088],
            [-0.2862, 0.2562, 0.0142],
            [-0.2958, 0.2327, 0.0368],
            [-0.2815, 0.2117, 0.0589],
            [-0.285, 0.188, 0.0813],
            [-0.2844, 0.1821, 0.0938],
            [-0.2844, 0.1821, 0.1103],
            [-0.285, 0.188, 0.1225],
            [-0.2815, 0.2117, 0.1005],
            [-0.2958, 0.2327, 0.0789],
            [-0.2862, 0.2562, 0.0568],
            [-0.3004, 0.2772, 0.0342],
            [-0.2909, 0.3007, 0.0112],
            [-0.3051, 0.3216, -0.0123],
            [-0.2955, 0.3451, -0.0362],
            [-0.3098, 0.3661, -0.0606],
            [-0.3002, 0.3896, -0.0854],
            [-0.3145, 0.4106, -0.1107],
            [-0.3049, 0.4341, -0.1365],
            [-0.3192, 0.4551, -0.1627],
            [-0.3096, 0.4786, -0.1894],
            [-0.3238, 0.4996, -0.2165],
            [-0.3142, 0.5231, -0.244],
            [-0.3285, 0.5441, -0.2721],
            [-0.3189, 0.5676, -0.3006],
            [-0.3273, 0.59, -0.3305],
            [-0.3279, 0.5959, -0.3169],
            [-0.3279, 0.5959, -0.2971],
            [-0.3273, 0.59, -0.2811],
            [-0.3189, 0.5676, -0.2517],
            [-0.3285, 0.5441, -0.2236],
            [-0.3142, 0.5231, -0.1961],
            [-0.3238, 0.4996, -0.1689],
            [-0.3096, 0.4786, -0.1423],
            [-0.3192, 0.4551, -0.1161],
            [-0.3049, 0.4341, -0.0903],
            [-0.3145, 0.4106, -0.065],
            [-0.3002, 0.3896, -0.0402],
            [-0.3098, 0.3661, -0.0158],
            [-0.2955, 0.3451, 0.0081],
            [-0.3051, 0.3216, 0.0316],
            [-0.2909, 0.3007, 0.0546],
            [-0.3004, 0.2772, 0.0772],
            [-0.2862, 0.2562, 0.0993],
            [-0.2958, 0.2327, 0.1209],
            [-0.2815, 0.2117, 0.1421],
            [-0.285, 0.188, 0.1636],
            [-0.2844, 0.1821, 0.1759],
            [-0.2844, 0.1821, 0.1923],
            [-0.285, 0.188, 0.2047],
            [-0.2815, 0.2117, 0.1838],
            [-0.2958, 0.2327, 0.163],
            [-0.2862, 0.2562, 0.1418],
            [-0.3004, 0.2772, 0.1202],
            [-0.2909, 0.3007, 0.098],
            [-0.3051, 0.3216, 0.0755],
            [-0.2955, 0.3451, 0.0525],
            [-0.3098, 0.3661, 0.029],
            [-0.3002, 0.3896, 0.0051],
            [-0.3145, 0.4106, -0.0193],
            [-0.3049, 0.4341, -0.0442],
            [-0.3192, 0.4551, -0.0695],
            [-0.3096, 0.4786, -0.0952],
            [-0.3238, 0.4996, -0.1214],
            [-0.3142, 0.5231, -0.1481],
            [-0.3285, 0.5441, -0.1752],
            [-0.3189, 0.5676, -0.2028],
            [-0.3273, 0.59, -0.2318],
            [-0.3279, 0.5959, -0.2179],
            [-0.3279, 0.5959, -0.1981],
            [-0.3273, 0.59, -0.1824],
            [-0.3189, 0.5676, -0.1539],
            [-0.3285, 0.5441, -0.1267],
            [-0.3142, 0.5231, -0.1001],
            [-0.3238, 0.4996, -0.0739],
            [-0.3096, 0.4786, -0.0481],
            [-0.3192, 0.4551, -0.0228],
            [-0.3049, 0.4341, 0.002],
            [-0.3145, 0.4106, 0.0264],
            [-0.3002, 0.3896, 0.0503],
            [-0.3098, 0.3661, 0.0738],
            [-0.2955, 0.3451, 0.0968],
            [-0.3051, 0.3216, 0.1194],
            [-0.2909, 0.3007, 0.1415],
            [-0.3004, 0.2772, 0.1631],
            [-0.2862, 0.2562, 0.1843],
            [-0.2958, 0.2327, 0.2051],
            [-0.2815, 0.2117, 0.2254],
            [-0.285, 0.188, 0.2459],
            [-0.2858, 0.1954, 0.2518],
            [-0.2869, 0.2052, 0.2597],
            [-0.2876, 0.2126, 0.2656],
            [-0.2958, 0.2327, 0.2471],
            [-0.2862, 0.2562, 0.2269],
            [-0.3004, 0.2772, 0.2061],
            [-0.2909, 0.3007, 0.1849],
            [-0.3051, 0.3216, 0.1633],
            [-0.2955, 0.3451, 0.1412],
            [-0.3098, 0.3661, 0.1186],
            [-0.3002, 0.3896, 0.0956],
            [-0.3145, 0.4106, 0.0721],
            [-0.3049, 0.4341, 0.0482],
            [-0.3192, 0.4551, 0.0238],
            [-0.3096, 0.4786, -0.0011],
            [-0.3238, 0.4996, -0.0264],
            [-0.3142, 0.5231, -0.0521],
            [-0.3285, 0.5441, -0.0783],
            [-0.3189, 0.5676, -0.105],
            [-0.3273, 0.59, -0.133],
            [-0.3279, 0.5959, -0.1189],
            [-0.3279, 0.5959, -0.0991],
            [-0.3273, 0.59, -0.0837],
            [-0.3189, 0.5676, -0.0561],
            [-0.3285, 0.5441, -0.0299],
            [-0.3142, 0.5231, -0.0041],
            [-0.3238, 0.4996, 0.0212],
            [-0.3096, 0.4786, 0.046],
            [-0.3192, 0.4551, 0.0704],
            [-0.3049, 0.4341, 0.0943],
            [-0.3145, 0.4106, 0.1178],
            [-0.3002, 0.3896, 0.1408],
            [-0.3098, 0.3661, 0.1634],
            [-0.2955, 0.3451, 0.1855],
            [-0.3051, 0.3216, 0.2072],
            [-0.2909, 0.3007, 0.2284],
            [-0.3004, 0.2772, 0.2491],
            [-0.2923, 0.2571, 0.268],
            [-0.2937, 0.2704, 0.2744],
            [-0.2956, 0.2882, 0.2754],
            [-0.297, 0.3015, 0.2704],
            [-0.3051, 0.3216, 0.251],
            [-0.2955, 0.3451, 0.2298],
            [-0.3098, 0.3661, 0.2082],
            [-0.3002, 0.3896, 0.1861],
            [-0.3145, 0.4106, 0.1635],
            [-0.3049, 0.4341, 0.1405],
            [-0.3192, 0.4551, 0.117],
            [-0.3096, 0.4786, 0.0931],
            [-0.3238, 0.4996, 0.0687],
            [-0.3142, 0.5231, 0.0439],
            [-0.3285, 0.5441, 0.0186],
            [-0.3189, 0.5676, -0.0072],
            [-0.3273, 0.59, -0.0343],
            [-0.3279, 0.5959, -0.0199],
            [-0.3279, 0.5959, -0.0001],
            [-0.3273, 0.59, 0.0151],
            [-0.3189, 0.5676, 0.0417],
            [-0.3285, 0.5441, 0.067],
            [-0.3142, 0.5231, 0.0919],
            [-0.3238, 0.4996, 0.1162],
            [-0.3096, 0.4786, 0.1402],
            [-0.3192, 0.4551, 0.1636],
            [-0.3049, 0.4341, 0.1867],
            [-0.3145, 0.4106, 0.2092],
            [-0.3002, 0.3896, 0.2313],
            [-0.3098, 0.3661, 0.253],
            [-0.3017, 0.346, 0.2728],
            [-0.3031, 0.3594, 0.2794],
            [-0.3049, 0.3772, 0.2804],
            [-0.3063, 0.3905, 0.2751],
            [-0.3145, 0.4106, 0.2549],
            [-0.3049, 0.4341, 0.2328],
            [-0.3192, 0.4551, 0.2103],
            [-0.3096, 0.4786, 0.1872],
            [-0.3238, 0.4996, 0.1638],
            [-0.3142, 0.5231, 0.1398],
            [-0.3285, 0.5441, 0.1155],
            [-0.3189, 0.5676, 0.0906],
            [-0.3273, 0.59, 0.0644],
            [-0.3279, 0.5959, 0.079],
            [-0.3279, 0.5959, 0.0988],
            [-0.3273, 0.59, 0.1138],
            [-0.3189, 0.5676, 0.1395],
            [-0.3285, 0.5441, 0.1639],
            [-0.3142, 0.5231, 0.1878],
            [-0.3238, 0.4996, 0.2113],
            [-0.3096, 0.4786, 0.2343],
            [-0.3192, 0.4551, 0.2569],
            [-0.311, 0.435, 0.2775],
            [-0.3124, 0.4483, 0.2844],
            [-0.3143, 0.4661, 0.2854],
            [-0.3157, 0.4795, 0.2799],
            [-0.3238, 0.4996, 0.2588],
            [-0.3142, 0.5231, 0.2358],
            [-0.3285, 0.5441, 0.2123],
            [-0.3189, 0.5676, 0.1884],
            [-0.3273, 0.59, 0.1632],
            [-0.3279, 0.5959, 0.178],
            [-0.3279, 0.5959, 0.1978],
            [-0.3273, 0.59, 0.2125],
            [-0.3189, 0.5676, 0.2373],
            [-0.3285, 0.5441, 0.2608],
            [-0.3204, 0.524, 0.2822],
            [-0.3218, 0.5373, 0.2894],
            [-0.3236, 0.5551, 0.2904],
            [-0.325, 0.5685, 0.2846],
            [-0.3273, 0.59, 0.2619],
          ],
          radius: 0.009,
          radialSegments: 7,
          closed: false,
        });
  if (!endpoint_weave_lateral_right_b_20) {
    mesh_weave_lateral_right_b_20Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_weave_lateral_right_b_20 = new THREE.Mesh(
    mesh_weave_lateral_right_b_20Geometry,
    materialMap["rope-braided"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_weave_lateral_right_b_20.name =
    "Lateral rope lattice (right, -45 deg run)";
  if (endpoint_weave_lateral_right_b_20) {
    mesh_weave_lateral_right_b_20.position.copy(
      endpoint_weave_lateral_right_b_20.midpoint,
    );
    mesh_weave_lateral_right_b_20.quaternion.copy(
      endpoint_weave_lateral_right_b_20.quaternion,
    );
  }
  mesh_weave_lateral_right_b_20.castShadow = options.castShadow ?? true;
  mesh_weave_lateral_right_b_20.receiveShadow = options.receiveShadow ?? true;
  mesh_weave_lateral_right_b_20.userData.sculptComponent = {
    id: "weave-lateral-right-b",
    name: "Lateral rope lattice (right, -45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.75,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
    geometryDescriptor: {
      topologyIntent:
        "One continuous constant-radius braided rope run zig-zagging across the panel and wrapping the frame at each turn; interlaced with its crossing run. Rope does not taper, so tube rather than tapered-sweep.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [-0.2878, 0.2142, -0.2776],
          [-0.2815, 0.2117, -0.274],
          [-0.285, 0.188, -0.2478],
          [-0.2844, 0.1821, -0.2343],
          [-0.2844, 0.1821, -0.2179],
          [-0.285, 0.188, -0.2067],
          [-0.2815, 0.2117, -0.2324],
          [-0.2958, 0.2327, -0.2577],
          [-0.2862, 0.2562, -0.2834],
          [-0.2925, 0.2587, -0.2871],
          [-0.2939, 0.272, -0.2956],
          [-0.2957, 0.2898, -0.2995],
          [-0.2972, 0.3032, -0.2966],
          [-0.2909, 0.3007, -0.2929],
          [-0.3004, 0.2772, -0.2667],
          [-0.2862, 0.2562, -0.2409],
          [-0.2958, 0.2327, -0.2156],
          [-0.2815, 0.2117, -0.1908],
          [-0.285, 0.188, -0.1655],
          [-0.2844, 0.1821, -0.1523],
          [-0.2844, 0.1821, -0.1359],
          [-0.285, 0.188, -0.1244],
          [-0.2815, 0.2117, -0.1492],
          [-0.2958, 0.2327, -0.1735],
          [-0.2862, 0.2562, -0.1984],
          [-0.3004, 0.2772, -0.2237],
          [-0.2909, 0.3007, -0.2494],
          [-0.3051, 0.3216, -0.2756],
          [-0.2955, 0.3451, -0.3023],
          [-0.3018, 0.3477, -0.3061],
          [-0.3032, 0.361, -0.3149],
          [-0.3051, 0.3788, -0.3187],
          [-0.3065, 0.3921, -0.3156],
          [-0.3002, 0.3896, -0.3117],
          [-0.3098, 0.3661, -0.2846],
          [-0.2955, 0.3451, -0.2579],
          [-0.3051, 0.3216, -0.2317],
          [-0.2909, 0.3007, -0.206],
          [-0.3004, 0.2772, -0.1807],
          [-0.2862, 0.2562, -0.1559],
          [-0.2958, 0.2327, -0.1315],
          [-0.2815, 0.2117, -0.1075],
          [-0.285, 0.188, -0.0833],
          [-0.2844, 0.1821, -0.0702],
          [-0.2844, 0.1821, -0.0538],
          [-0.285, 0.188, -0.0421],
          [-0.2815, 0.2117, -0.0659],
          [-0.2958, 0.2327, -0.0894],
          [-0.2862, 0.2562, -0.1133],
          [-0.3004, 0.2772, -0.1377],
          [-0.2909, 0.3007, -0.1626],
          [-0.3051, 0.3216, -0.1879],
          [-0.2955, 0.3451, -0.2136],
          [-0.3098, 0.3661, -0.2398],
          [-0.3002, 0.3896, -0.2665],
          [-0.3145, 0.4106, -0.2936],
          [-0.3049, 0.4341, -0.3212],
          [-0.3112, 0.4366, -0.3251],
          [-0.3126, 0.45, -0.3341],
          [-0.3145, 0.4678, -0.338],
          [-0.3159, 0.4811, -0.3346],
          [-0.3096, 0.4786, -0.3306],
          [-0.3192, 0.4551, -0.3026],
          [-0.3049, 0.4341, -0.275],
          [-0.3145, 0.4106, -0.2479],
          [-0.3002, 0.3896, -0.2212],
          [-0.3098, 0.3661, -0.195],
          [-0.2955, 0.3451, -0.1693],
          [-0.3051, 0.3216, -0.144],
          [-0.2909, 0.3007, -0.1191],
          [-0.3004, 0.2772, -0.0947],
          [-0.2862, 0.2562, -0.0708],
          [-0.2958, 0.2327, -0.0473],
          [-0.2815, 0.2117, -0.0243],
          [-0.285, 0.188, -0.001],
          [-0.2844, 0.1821, 0.0118],
          [-0.2844, 0.1821, 0.0282],
          [-0.285, 0.188, 0.0402],
          [-0.2815, 0.2117, 0.0173],
          [-0.2958, 0.2327, -0.0053],
          [-0.2862, 0.2562, -0.0283],
          [-0.3004, 0.2772, -0.0518],
          [-0.2909, 0.3007, -0.0757],
          [-0.3051, 0.3216, -0.1001],
          [-0.2955, 0.3451, -0.1249],
          [-0.3098, 0.3661, -0.1502],
          [-0.3002, 0.3896, -0.176],
          [-0.3145, 0.4106, -0.2022],
          [-0.3049, 0.4341, -0.2288],
          [-0.3192, 0.4551, -0.2559],
          [-0.3096, 0.4786, -0.2835],
          [-0.3238, 0.4996, -0.3115],
          [-0.3142, 0.5231, -0.34],
          [-0.3205, 0.5256, -0.3441],
          [-0.3219, 0.539, -0.3533],
          [-0.3238, 0.5567, -0.3572],
          [-0.3252, 0.5701, -0.3536],
          [-0.3189, 0.5676, -0.3494],
          [-0.3285, 0.5441, -0.3205],
          [-0.3142, 0.5231, -0.292],
          [-0.3238, 0.4996, -0.264],
          [-0.3096, 0.4786, -0.2364],
          [-0.3192, 0.4551, -0.2093],
          [-0.3049, 0.4341, -0.1827],
          [-0.3145, 0.4106, -0.1565],
          [-0.3002, 0.3896, -0.1307],
          [-0.3098, 0.3661, -0.1054],
          [-0.2955, 0.3451, -0.0806],
          [-0.3051, 0.3216, -0.0562],
          [-0.2909, 0.3007, -0.0323],
          [-0.3004, 0.2772, -0.0088],
          [-0.2862, 0.2562, 0.0142],
          [-0.2958, 0.2327, 0.0368],
          [-0.2815, 0.2117, 0.0589],
          [-0.285, 0.188, 0.0813],
          [-0.2844, 0.1821, 0.0938],
          [-0.2844, 0.1821, 0.1103],
          [-0.285, 0.188, 0.1225],
          [-0.2815, 0.2117, 0.1005],
          [-0.2958, 0.2327, 0.0789],
          [-0.2862, 0.2562, 0.0568],
          [-0.3004, 0.2772, 0.0342],
          [-0.2909, 0.3007, 0.0112],
          [-0.3051, 0.3216, -0.0123],
          [-0.2955, 0.3451, -0.0362],
          [-0.3098, 0.3661, -0.0606],
          [-0.3002, 0.3896, -0.0854],
          [-0.3145, 0.4106, -0.1107],
          [-0.3049, 0.4341, -0.1365],
          [-0.3192, 0.4551, -0.1627],
          [-0.3096, 0.4786, -0.1894],
          [-0.3238, 0.4996, -0.2165],
          [-0.3142, 0.5231, -0.244],
          [-0.3285, 0.5441, -0.2721],
          [-0.3189, 0.5676, -0.3006],
          [-0.3273, 0.59, -0.3305],
          [-0.3279, 0.5959, -0.3169],
          [-0.3279, 0.5959, -0.2971],
          [-0.3273, 0.59, -0.2811],
          [-0.3189, 0.5676, -0.2517],
          [-0.3285, 0.5441, -0.2236],
          [-0.3142, 0.5231, -0.1961],
          [-0.3238, 0.4996, -0.1689],
          [-0.3096, 0.4786, -0.1423],
          [-0.3192, 0.4551, -0.1161],
          [-0.3049, 0.4341, -0.0903],
          [-0.3145, 0.4106, -0.065],
          [-0.3002, 0.3896, -0.0402],
          [-0.3098, 0.3661, -0.0158],
          [-0.2955, 0.3451, 0.0081],
          [-0.3051, 0.3216, 0.0316],
          [-0.2909, 0.3007, 0.0546],
          [-0.3004, 0.2772, 0.0772],
          [-0.2862, 0.2562, 0.0993],
          [-0.2958, 0.2327, 0.1209],
          [-0.2815, 0.2117, 0.1421],
          [-0.285, 0.188, 0.1636],
          [-0.2844, 0.1821, 0.1759],
          [-0.2844, 0.1821, 0.1923],
          [-0.285, 0.188, 0.2047],
          [-0.2815, 0.2117, 0.1838],
          [-0.2958, 0.2327, 0.163],
          [-0.2862, 0.2562, 0.1418],
          [-0.3004, 0.2772, 0.1202],
          [-0.2909, 0.3007, 0.098],
          [-0.3051, 0.3216, 0.0755],
          [-0.2955, 0.3451, 0.0525],
          [-0.3098, 0.3661, 0.029],
          [-0.3002, 0.3896, 0.0051],
          [-0.3145, 0.4106, -0.0193],
          [-0.3049, 0.4341, -0.0442],
          [-0.3192, 0.4551, -0.0695],
          [-0.3096, 0.4786, -0.0952],
          [-0.3238, 0.4996, -0.1214],
          [-0.3142, 0.5231, -0.1481],
          [-0.3285, 0.5441, -0.1752],
          [-0.3189, 0.5676, -0.2028],
          [-0.3273, 0.59, -0.2318],
          [-0.3279, 0.5959, -0.2179],
          [-0.3279, 0.5959, -0.1981],
          [-0.3273, 0.59, -0.1824],
          [-0.3189, 0.5676, -0.1539],
          [-0.3285, 0.5441, -0.1267],
          [-0.3142, 0.5231, -0.1001],
          [-0.3238, 0.4996, -0.0739],
          [-0.3096, 0.4786, -0.0481],
          [-0.3192, 0.4551, -0.0228],
          [-0.3049, 0.4341, 0.002],
          [-0.3145, 0.4106, 0.0264],
          [-0.3002, 0.3896, 0.0503],
          [-0.3098, 0.3661, 0.0738],
          [-0.2955, 0.3451, 0.0968],
          [-0.3051, 0.3216, 0.1194],
          [-0.2909, 0.3007, 0.1415],
          [-0.3004, 0.2772, 0.1631],
          [-0.2862, 0.2562, 0.1843],
          [-0.2958, 0.2327, 0.2051],
          [-0.2815, 0.2117, 0.2254],
          [-0.285, 0.188, 0.2459],
          [-0.2858, 0.1954, 0.2518],
          [-0.2869, 0.2052, 0.2597],
          [-0.2876, 0.2126, 0.2656],
          [-0.2958, 0.2327, 0.2471],
          [-0.2862, 0.2562, 0.2269],
          [-0.3004, 0.2772, 0.2061],
          [-0.2909, 0.3007, 0.1849],
          [-0.3051, 0.3216, 0.1633],
          [-0.2955, 0.3451, 0.1412],
          [-0.3098, 0.3661, 0.1186],
          [-0.3002, 0.3896, 0.0956],
          [-0.3145, 0.4106, 0.0721],
          [-0.3049, 0.4341, 0.0482],
          [-0.3192, 0.4551, 0.0238],
          [-0.3096, 0.4786, -0.0011],
          [-0.3238, 0.4996, -0.0264],
          [-0.3142, 0.5231, -0.0521],
          [-0.3285, 0.5441, -0.0783],
          [-0.3189, 0.5676, -0.105],
          [-0.3273, 0.59, -0.133],
          [-0.3279, 0.5959, -0.1189],
          [-0.3279, 0.5959, -0.0991],
          [-0.3273, 0.59, -0.0837],
          [-0.3189, 0.5676, -0.0561],
          [-0.3285, 0.5441, -0.0299],
          [-0.3142, 0.5231, -0.0041],
          [-0.3238, 0.4996, 0.0212],
          [-0.3096, 0.4786, 0.046],
          [-0.3192, 0.4551, 0.0704],
          [-0.3049, 0.4341, 0.0943],
          [-0.3145, 0.4106, 0.1178],
          [-0.3002, 0.3896, 0.1408],
          [-0.3098, 0.3661, 0.1634],
          [-0.2955, 0.3451, 0.1855],
          [-0.3051, 0.3216, 0.2072],
          [-0.2909, 0.3007, 0.2284],
          [-0.3004, 0.2772, 0.2491],
          [-0.2923, 0.2571, 0.268],
          [-0.2937, 0.2704, 0.2744],
          [-0.2956, 0.2882, 0.2754],
          [-0.297, 0.3015, 0.2704],
          [-0.3051, 0.3216, 0.251],
          [-0.2955, 0.3451, 0.2298],
          [-0.3098, 0.3661, 0.2082],
          [-0.3002, 0.3896, 0.1861],
          [-0.3145, 0.4106, 0.1635],
          [-0.3049, 0.4341, 0.1405],
          [-0.3192, 0.4551, 0.117],
          [-0.3096, 0.4786, 0.0931],
          [-0.3238, 0.4996, 0.0687],
          [-0.3142, 0.5231, 0.0439],
          [-0.3285, 0.5441, 0.0186],
          [-0.3189, 0.5676, -0.0072],
          [-0.3273, 0.59, -0.0343],
          [-0.3279, 0.5959, -0.0199],
          [-0.3279, 0.5959, -0.0001],
          [-0.3273, 0.59, 0.0151],
          [-0.3189, 0.5676, 0.0417],
          [-0.3285, 0.5441, 0.067],
          [-0.3142, 0.5231, 0.0919],
          [-0.3238, 0.4996, 0.1162],
          [-0.3096, 0.4786, 0.1402],
          [-0.3192, 0.4551, 0.1636],
          [-0.3049, 0.4341, 0.1867],
          [-0.3145, 0.4106, 0.2092],
          [-0.3002, 0.3896, 0.2313],
          [-0.3098, 0.3661, 0.253],
          [-0.3017, 0.346, 0.2728],
          [-0.3031, 0.3594, 0.2794],
          [-0.3049, 0.3772, 0.2804],
          [-0.3063, 0.3905, 0.2751],
          [-0.3145, 0.4106, 0.2549],
          [-0.3049, 0.4341, 0.2328],
          [-0.3192, 0.4551, 0.2103],
          [-0.3096, 0.4786, 0.1872],
          [-0.3238, 0.4996, 0.1638],
          [-0.3142, 0.5231, 0.1398],
          [-0.3285, 0.5441, 0.1155],
          [-0.3189, 0.5676, 0.0906],
          [-0.3273, 0.59, 0.0644],
          [-0.3279, 0.5959, 0.079],
          [-0.3279, 0.5959, 0.0988],
          [-0.3273, 0.59, 0.1138],
          [-0.3189, 0.5676, 0.1395],
          [-0.3285, 0.5441, 0.1639],
          [-0.3142, 0.5231, 0.1878],
          [-0.3238, 0.4996, 0.2113],
          [-0.3096, 0.4786, 0.2343],
          [-0.3192, 0.4551, 0.2569],
          [-0.311, 0.435, 0.2775],
          [-0.3124, 0.4483, 0.2844],
          [-0.3143, 0.4661, 0.2854],
          [-0.3157, 0.4795, 0.2799],
          [-0.3238, 0.4996, 0.2588],
          [-0.3142, 0.5231, 0.2358],
          [-0.3285, 0.5441, 0.2123],
          [-0.3189, 0.5676, 0.1884],
          [-0.3273, 0.59, 0.1632],
          [-0.3279, 0.5959, 0.178],
          [-0.3279, 0.5959, 0.1978],
          [-0.3273, 0.59, 0.2125],
          [-0.3189, 0.5676, 0.2373],
          [-0.3285, 0.5441, 0.2608],
          [-0.3204, 0.524, 0.2822],
          [-0.3218, 0.5373, 0.2894],
          [-0.3236, 0.5551, 0.2904],
          [-0.325, 0.5685, 0.2846],
          [-0.3273, 0.59, 0.2619],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [-0.2853, -0.095, -0.2706],
        localEnd: [-0.3271, 0.303, 0.2835],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.032,
        angleDeg: -45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.006,
        panelSize: { width: 0.586, height: 0.4049 },
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [-0.12, 0, 0],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#lateral-panel",
      "analysis/detail-inventory/zone-r1c1.png",
    ],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-lateral-right-b",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_lateral_right_b_20.add(mesh_weave_lateral_right_b_20);
  meshes["weave-lateral-right-b"] = mesh_weave_lateral_right_b_20;
  colliders["weave-lateral-right-b"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["weave"] ??= [];
  destructionGroups["weave"].push(node_weave_lateral_right_b_20);

  const endpoint_rear_stile_left_21 = makeAttachmentEndpoint(null);
  const node_rear_stile_left_21 = new THREE.Group();
  node_rear_stile_left_21.name = "Rear frame stile (left)__pivot";
  node_rear_stile_left_21.scale.set(1, 1, 1);
  if (endpoint_rear_stile_left_21) {
    node_rear_stile_left_21.position.copy(endpoint_rear_stile_left_21.start);
    node_rear_stile_left_21.rotation.set(2.93438, -0.02162, -3.03912);
  } else {
    node_rear_stile_left_21.position.set(0.2642, 0.1325, -0.319);
    node_rear_stile_left_21.rotation.set(2.93438, -0.02162, -3.03912);
  }
  node_rear_stile_left_21.userData.sculptComponent = {
    id: "rear-stile-left",
    name: "Rear frame stile (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [0.235, -0.145, -0.26],
      localEnd: [0.2933, 0.41, -0.378],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.5704,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.2642, 0.1325, -0.319],
      rotation: [2.93438, -0.02162, -3.03912],
      scale: [0.05, 0.5704, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased edges.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "rear-stile-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_stile_left_21.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, -0.2],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_rear_stile_left_21);
  nodes["rear-stile-left"] = node_rear_stile_left_21;
  const mesh_rear_stile_left_21Geometry = endpoint_rear_stile_left_21
    ? new THREE.CylinderGeometry(
        endpoint_rear_stile_left_21.endRadius,
        endpoint_rear_stile_left_21.baseRadius,
        endpoint_rear_stile_left_21.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_rear_stile_left_21) {
    mesh_rear_stile_left_21Geometry.scale(0.05, 0.5704, 0.04);
  }
  const mesh_rear_stile_left_21 = new THREE.Mesh(
    mesh_rear_stile_left_21Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_rear_stile_left_21.name = "Rear frame stile (left)";
  if (endpoint_rear_stile_left_21) {
    mesh_rear_stile_left_21.position.copy(endpoint_rear_stile_left_21.midpoint);
    mesh_rear_stile_left_21.quaternion.copy(
      endpoint_rear_stile_left_21.quaternion,
    );
  }
  mesh_rear_stile_left_21.castShadow = options.castShadow ?? true;
  mesh_rear_stile_left_21.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_stile_left_21.userData.sculptComponent = {
    id: "rear-stile-left",
    name: "Rear frame stile (left)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [0.235, -0.145, -0.26],
      localEnd: [0.2933, 0.41, -0.378],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.5704,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.2642, 0.1325, -0.319],
      rotation: [2.93438, -0.02162, -3.03912],
      scale: [0.05, 0.5704, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased edges.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "rear-stile-left",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_stile_left_21.add(mesh_rear_stile_left_21);
  meshes["rear-stile-left"] = mesh_rear_stile_left_21;
  colliders["rear-stile-left"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_rear_stile_left_21);

  const endpoint_rear_stile_right_22 = makeAttachmentEndpoint(null);
  const node_rear_stile_right_22 = new THREE.Group();
  node_rear_stile_right_22.name = "Rear frame stile (right)__pivot";
  node_rear_stile_right_22.scale.set(1, 1, 1);
  if (endpoint_rear_stile_right_22) {
    node_rear_stile_right_22.position.copy(endpoint_rear_stile_right_22.start);
    node_rear_stile_right_22.rotation.set(2.93438, 0.02162, 3.03912);
  } else {
    node_rear_stile_right_22.position.set(-0.2642, 0.1325, -0.319);
    node_rear_stile_right_22.rotation.set(2.93438, 0.02162, 3.03912);
  }
  node_rear_stile_right_22.userData.sculptComponent = {
    id: "rear-stile-right",
    name: "Rear frame stile (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.235, -0.145, -0.26],
      localEnd: [-0.2933, 0.41, -0.378],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.5704,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [-0.2642, 0.1325, -0.319],
      rotation: [2.93438, 0.02162, 3.03912],
      scale: [0.05, 0.5704, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased edges.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "rear-stile-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_stile_right_22.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, -0.2],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_rear_stile_right_22);
  nodes["rear-stile-right"] = node_rear_stile_right_22;
  const mesh_rear_stile_right_22Geometry = endpoint_rear_stile_right_22
    ? new THREE.CylinderGeometry(
        endpoint_rear_stile_right_22.endRadius,
        endpoint_rear_stile_right_22.baseRadius,
        endpoint_rear_stile_right_22.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_rear_stile_right_22) {
    mesh_rear_stile_right_22Geometry.scale(0.05, 0.5704, 0.04);
  }
  const mesh_rear_stile_right_22 = new THREE.Mesh(
    mesh_rear_stile_right_22Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_rear_stile_right_22.name = "Rear frame stile (right)";
  if (endpoint_rear_stile_right_22) {
    mesh_rear_stile_right_22.position.copy(
      endpoint_rear_stile_right_22.midpoint,
    );
    mesh_rear_stile_right_22.quaternion.copy(
      endpoint_rear_stile_right_22.quaternion,
    );
  }
  mesh_rear_stile_right_22.castShadow = options.castShadow ?? true;
  mesh_rear_stile_right_22.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_stile_right_22.userData.sculptComponent = {
    id: "rear-stile-right",
    name: "Rear frame stile (right)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.235, -0.145, -0.26],
      localEnd: [-0.2933, 0.41, -0.378],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.5704,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [-0.2642, 0.1325, -0.319],
      rotation: [2.93438, 0.02162, 3.03912],
      scale: [0.05, 0.5704, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "eased-edges",
        kind: "bevel",
        description: "Eased edges.",
        realizedInPass: "form-refinement",
        effect: {
          edgeTreatment: { type: "chamfer", bevelRadius: 0.004, segments: 2 },
        },
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "rear-stile-right",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_stile_right_22.add(mesh_rear_stile_right_22);
  meshes["rear-stile-right"] = mesh_rear_stile_right_22;
  colliders["rear-stile-right"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_rear_stile_right_22);

  const endpoint_rear_bottom_rail_23 = makeAttachmentEndpoint(null);
  const node_rear_bottom_rail_23 = new THREE.Group();
  node_rear_bottom_rail_23.name = "Rear frame bottom rail__pivot";
  node_rear_bottom_rail_23.scale.set(1, 1, 1);
  if (endpoint_rear_bottom_rail_23) {
    node_rear_bottom_rail_23.position.copy(endpoint_rear_bottom_rail_23.start);
    node_rear_bottom_rail_23.rotation.set(-3.14159, 0.0, -1.5708);
  } else {
    node_rear_bottom_rail_23.position.set(0.0, -0.12, -0.2653);
    node_rear_bottom_rail_23.rotation.set(-3.14159, 0.0, -1.5708);
  }
  node_rear_bottom_rail_23.userData.sculptComponent = {
    id: "rear-bottom-rail",
    name: "Rear frame bottom rail",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.2626, -0.12, -0.2653],
      localEnd: [0.2626, -0.12, -0.2653],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.5253,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.0, -0.12, -0.2653],
      rotation: [-3.14159, 0.0, -1.5708],
      scale: [0.05, 0.5253, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "rear-bottom-rail",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_bottom_rail_23.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, -0.2],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_rear_bottom_rail_23);
  nodes["rear-bottom-rail"] = node_rear_bottom_rail_23;
  const mesh_rear_bottom_rail_23Geometry = endpoint_rear_bottom_rail_23
    ? new THREE.CylinderGeometry(
        endpoint_rear_bottom_rail_23.endRadius,
        endpoint_rear_bottom_rail_23.baseRadius,
        endpoint_rear_bottom_rail_23.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_rear_bottom_rail_23) {
    mesh_rear_bottom_rail_23Geometry.scale(0.05, 0.5253, 0.04);
  }
  const mesh_rear_bottom_rail_23 = new THREE.Mesh(
    mesh_rear_bottom_rail_23Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_rear_bottom_rail_23.name = "Rear frame bottom rail";
  if (endpoint_rear_bottom_rail_23) {
    mesh_rear_bottom_rail_23.position.copy(
      endpoint_rear_bottom_rail_23.midpoint,
    );
    mesh_rear_bottom_rail_23.quaternion.copy(
      endpoint_rear_bottom_rail_23.quaternion,
    );
  }
  mesh_rear_bottom_rail_23.castShadow = options.castShadow ?? true;
  mesh_rear_bottom_rail_23.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_bottom_rail_23.userData.sculptComponent = {
    id: "rear-bottom-rail",
    name: "Rear frame bottom rail",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.7,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.2626, -0.12, -0.2653],
      localEnd: [0.2626, -0.12, -0.2653],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.05,
      height: 0.5253,
      depth: 0.04,
      units: "meters",
      confidence: 0.7,
    },
    transform: {
      position: [0.0, -0.12, -0.2653],
      rotation: [-3.14159, 0.0, -1.5708],
      scale: [0.05, 0.5253, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "rear-bottom-rail",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_bottom_rail_23.add(mesh_rear_bottom_rail_23);
  meshes["rear-bottom-rail"] = mesh_rear_bottom_rail_23;
  colliders["rear-bottom-rail"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_rear_bottom_rail_23);

  const endpoint_rear_top_rail_24 = makeAttachmentEndpoint(null);
  const node_rear_top_rail_24 = new THREE.Group();
  node_rear_top_rail_24.name = "Rear frame top rail__pivot";
  node_rear_top_rail_24.scale.set(1, 1, 1);
  if (endpoint_rear_top_rail_24) {
    node_rear_top_rail_24.position.copy(endpoint_rear_top_rail_24.start);
    node_rear_top_rail_24.rotation.set(-0.20944, 0.0, -0.0);
  } else {
    node_rear_top_rail_24.position.set(0.0, 0.4383, -0.4044);
    node_rear_top_rail_24.rotation.set(-0.20944, 0.0, -0.0);
  }
  node_rear_top_rail_24.userData.sculptComponent = {
    id: "rear-top-rail",
    name: "Rear frame top rail",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.75,
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Wide planed teak rail with large outer top corner radii; profile extruded through the frame thickness.",
    geometryDescriptor: {
      topologyIntent:
        "Wide planed teak rail with large outer top corner radii; profile extruded through the frame thickness.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      profile2D: {
        points: [
          [-0.3217, -0.0325],
          [0.3217, -0.0325],
          [0.3217, -0.0125],
          [0.3202, -0.0009],
          [0.3157, 0.01],
          [0.3086, 0.0193],
          [0.2992, 0.0265],
          [0.2884, 0.031],
          [0.2767, 0.0325],
          [-0.2767, 0.0325],
          [-0.2884, 0.031],
          [-0.2992, 0.0265],
          [-0.3086, 0.0193],
          [-0.3157, 0.01],
          [-0.3202, -0.0009],
          [-0.3217, -0.0125],
        ],
        depth: 0.04,
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.3217, 0.4425, -0.3849],
      localEnd: [0.3217, 0.4425, -0.3849],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: {
      position: [0.0, 0.4383, -0.4044],
      rotation: [-0.20944, 0.0, -0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0.12, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "rounded-outer-corners",
        kind: "contour",
        description: "Outer top corners radiused ~45 mm (d13).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r0c2.png"],
    details: [],
    fidelityTier: "form",
    uvContract: {
      status: "unwrapped",
      strategy: "generated procedural coordinates",
      materialId: "teak-satin",
    },
    materialRegions: [
      {
        regionId: "teak-lit-face",
        materialId: "teak-satin",
        profileId: "wood.unfinished",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\00-teak-lit-face.png",
          bbox: { x: 0, y: 0, width: 160, height: 36 },
          sourceWidth: 160,
          sourceHeight: 36,
          loaderWarnings: [],
          coverage: 1.0,
        },
      },
    ],
    colorMaterialRecipe: {
      componentId: "rear-top-rail",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_top_rail_24.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0.12, -0.2],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_rear_top_rail_24);
  nodes["rear-top-rail"] = node_rear_top_rail_24;
  const mesh_rear_top_rail_24Geometry = endpoint_rear_top_rail_24
    ? new THREE.CylinderGeometry(
        endpoint_rear_top_rail_24.endRadius,
        endpoint_rear_top_rail_24.baseRadius,
        endpoint_rear_top_rail_24.length,
        16,
        6,
      )
    : buildExtrudeGeometry({
        points: [
          [-0.3217, -0.0325],
          [0.3217, -0.0325],
          [0.3217, -0.0125],
          [0.3202, -0.0009],
          [0.3157, 0.01],
          [0.3086, 0.0193],
          [0.2992, 0.0265],
          [0.2884, 0.031],
          [0.2767, 0.0325],
          [-0.2767, 0.0325],
          [-0.2884, 0.031],
          [-0.2992, 0.0265],
          [-0.3086, 0.0193],
          [-0.3157, 0.01],
          [-0.3202, -0.0009],
          [-0.3217, -0.0125],
        ],
        depth: 0.04,
      });
  if (!endpoint_rear_top_rail_24) {
    mesh_rear_top_rail_24Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rear_top_rail_24 = new THREE.Mesh(
    mesh_rear_top_rail_24Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_rear_top_rail_24.name = "Rear frame top rail";
  if (endpoint_rear_top_rail_24) {
    mesh_rear_top_rail_24.position.copy(endpoint_rear_top_rail_24.midpoint);
    mesh_rear_top_rail_24.quaternion.copy(endpoint_rear_top_rail_24.quaternion);
  }
  mesh_rear_top_rail_24.castShadow = options.castShadow ?? true;
  mesh_rear_top_rail_24.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_top_rail_24.userData.sculptComponent = {
    id: "rear-top-rail",
    name: "Rear frame top rail",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.75,
    primitive: "extrude",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Wide planed teak rail with large outer top corner radii; profile extruded through the frame thickness.",
    geometryDescriptor: {
      topologyIntent:
        "Wide planed teak rail with large outer top corner radii; profile extruded through the frame thickness.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      profile2D: {
        points: [
          [-0.3217, -0.0325],
          [0.3217, -0.0325],
          [0.3217, -0.0125],
          [0.3202, -0.0009],
          [0.3157, 0.01],
          [0.3086, 0.0193],
          [0.2992, 0.0265],
          [0.2884, 0.031],
          [0.2767, 0.0325],
          [-0.2767, 0.0325],
          [-0.2884, 0.031],
          [-0.2992, 0.0265],
          [-0.3086, 0.0193],
          [-0.3157, 0.01],
          [-0.3202, -0.0009],
          [-0.3217, -0.0125],
        ],
        depth: 0.04,
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.3217, 0.4425, -0.3849],
      localEnd: [0.3217, 0.4425, -0.3849],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.75,
    },
    transform: {
      position: [0.0, 0.4383, -0.4044],
      rotation: [-0.20944, 0.0, -0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0.12, -0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "rounded-outer-corners",
        kind: "contour",
        description: "Outer top corners radiused ~45 mm (d13).",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r0c2.png"],
    details: [],
    fidelityTier: "form",
    uvContract: {
      status: "unwrapped",
      strategy: "generated procedural coordinates",
      materialId: "teak-satin",
    },
    materialRegions: [
      {
        regionId: "teak-lit-face",
        materialId: "teak-satin",
        profileId: "wood.unfinished",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\00-teak-lit-face.png",
          bbox: { x: 0, y: 0, width: 160, height: 36 },
          sourceWidth: 160,
          sourceHeight: 36,
          loaderWarnings: [],
          coverage: 1.0,
        },
      },
    ],
    colorMaterialRecipe: {
      componentId: "rear-top-rail",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751.",
    },
  };
  node_rear_top_rail_24.add(mesh_rear_top_rail_24);
  meshes["rear-top-rail"] = mesh_rear_top_rail_24;
  colliders["rear-top-rail"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_rear_top_rail_24);

  const endpoint_front_apron_rail_25 = makeAttachmentEndpoint(null);
  const node_front_apron_rail_25 = new THREE.Group();
  node_front_apron_rail_25.name = "Front apron rail (inferred)__pivot";
  node_front_apron_rail_25.scale.set(1, 1, 1);
  if (endpoint_front_apron_rail_25) {
    node_front_apron_rail_25.position.copy(endpoint_front_apron_rail_25.start);
    node_front_apron_rail_25.rotation.set(-0.0, -0.0, -1.5708);
  } else {
    node_front_apron_rail_25.position.set(0.0, -0.115, 0.29);
    node_front_apron_rail_25.rotation.set(-0.0, -0.0, -1.5708);
  }
  node_front_apron_rail_25.userData.sculptComponent = {
    id: "front-apron-rail",
    name: "Front apron rail (inferred)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.35,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.2632, -0.115, 0.29],
      localEnd: [0.2632, -0.115, 0.29],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.06,
      height: 0.5263,
      depth: 0.04,
      units: "meters",
      confidence: 0.35,
    },
    transform: {
      position: [0.0, -0.115, 0.29],
      rotation: [-0.0, -0.0, -1.5708],
      scale: [0.06, 0.5263, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, 0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "front-apron-rail",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751. Component is hidden; recipe taken from the visible surface of the same material.",
    },
  };
  node_front_apron_rail_25.userData.actionProfile = {
    animationRole: "frame-member",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "frame",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, 0.2],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_front_apron_rail_25);
  nodes["front-apron-rail"] = node_front_apron_rail_25;
  const mesh_front_apron_rail_25Geometry = endpoint_front_apron_rail_25
    ? new THREE.CylinderGeometry(
        endpoint_front_apron_rail_25.endRadius,
        endpoint_front_apron_rail_25.baseRadius,
        endpoint_front_apron_rail_25.length,
        16,
        6,
      )
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_front_apron_rail_25) {
    mesh_front_apron_rail_25Geometry.scale(0.06, 0.5263, 0.04);
  }
  const mesh_front_apron_rail_25 = new THREE.Mesh(
    mesh_front_apron_rail_25Geometry,
    materialMap["teak-satin"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_front_apron_rail_25.name = "Front apron rail (inferred)";
  if (endpoint_front_apron_rail_25) {
    mesh_front_apron_rail_25.position.copy(
      endpoint_front_apron_rail_25.midpoint,
    );
    mesh_front_apron_rail_25.quaternion.copy(
      endpoint_front_apron_rail_25.quaternion,
    );
  }
  mesh_front_apron_rail_25.castShadow = options.castShadow ?? true;
  mesh_front_apron_rail_25.receiveShadow = options.receiveShadow ?? true;
  mesh_front_apron_rail_25.userData.sculptComponent = {
    id: "front-apron-rail",
    name: "Front apron rail (inferred)",
    level: "meso",
    role: "frame-member",
    importance: 0.75,
    confidence: 0.35,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid planed teak member with flat faces and eased edges.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid planed teak member with flat faces and eased edges.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "rear-frame-mount",
      localStart: [-0.2632, -0.115, 0.29],
      localEnd: [0.2632, -0.115, 0.29],
      contactType: "embed",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 0.06,
      height: 0.5263,
      depth: 0.04,
      units: "meters",
      confidence: 0.35,
    },
    transform: {
      position: [0.0, -0.115, 0.29],
      rotation: [-0.0, -0.0, -1.5708],
      scale: [0.06, 0.5263, 0.04],
    },
    actionProfile: {
      animationRole: "frame-member",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "frame",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, 0.2],
      },
    },
    material: "teak-satin",
    materialLayers: ["teak-satin"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png", "reference/chair-left.png"],
    details: [],
    fidelityTier: "structural",
    colorMaterialRecipe: {
      componentId: "front-apron-rail",
      dominantAlbedo: "rgba(157, 103, 64, 1.0)",
      secondaryAlbedo: "rgba(162, 109, 68, 1.0)",
      materialClass: "wood",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\teak-rear-top-rail.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.457 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.751. Component is hidden; recipe taken from the visible surface of the same material.",
    },
  };
  node_front_apron_rail_25.add(mesh_front_apron_rail_25);
  meshes["front-apron-rail"] = mesh_front_apron_rail_25;
  colliders["front-apron-rail"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["frame"] ??= [];
  destructionGroups["frame"].push(node_front_apron_rail_25);

  const attachment_weave_rear_26 = null;
  const endpoint_weave_rear_26 = makeAttachmentEndpoint(
    attachment_weave_rear_26,
  );
  const node_weave_rear_26 = new THREE.Group();
  node_weave_rear_26.name = "Rear rope lattice (+45 deg run)__pivot";
  node_weave_rear_26.scale.set(1, 1, 1);
  if (endpoint_weave_rear_26) {
    node_weave_rear_26.position.copy(endpoint_weave_rear_26.start);
    node_weave_rear_26.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_weave_rear_26.position.set(0.0, 0.0, 0.0);
    node_weave_rear_26.rotation.set(0.0, 0.0, 0.0);
  }
  node_weave_rear_26.userData.sculptComponent = {
    id: "weave-rear",
    name: "Rear rope lattice (+45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.5,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
    geometryDescriptor: {
      topologyIntent:
        "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.2686, 0.6765, -0.374],
          [0.2545, 0.6912, -0.3721],
          [0.2475, 0.6969, -0.3784],
          [0.2367, 0.7028, -0.3796],
          [0.2216, 0.7028, -0.3796],
          [0.2098, 0.6969, -0.3784],
          [0.2169, 0.6912, -0.3721],
          [0.2342, 0.6726, -0.3783],
          [0.2512, 0.6582, -0.365],
          [0.2651, 0.6435, -0.367],
          [0.2705, 0.6336, -0.3649],
          [0.2691, 0.6204, -0.3621],
          [0.2616, 0.6105, -0.36],
          [0.2479, 0.6252, -0.358],
          [0.2311, 0.6396, -0.3713],
          [0.2141, 0.6582, -0.365],
          [0.1968, 0.6726, -0.3783],
          [0.1793, 0.6912, -0.3721],
          [0.1721, 0.6969, -0.3784],
          [0.1611, 0.7028, -0.3796],
          [0.146, 0.7028, -0.3796],
          [0.1344, 0.6969, -0.3784],
          [0.1417, 0.6912, -0.3721],
          [0.1595, 0.6726, -0.3783],
          [0.177, 0.6582, -0.365],
          [0.1943, 0.6396, -0.3713],
          [0.2113, 0.6252, -0.358],
          [0.2281, 0.6066, -0.3643],
          [0.2446, 0.5922, -0.351],
          [0.2581, 0.5775, -0.353],
          [0.2634, 0.5676, -0.3509],
          [0.2619, 0.5543, -0.3481],
          [0.2546, 0.5444, -0.346],
          [0.2413, 0.5591, -0.344],
          [0.225, 0.5736, -0.3573],
          [0.2085, 0.5922, -0.351],
          [0.1917, 0.6066, -0.3643],
          [0.1747, 0.6252, -0.358],
          [0.1574, 0.6396, -0.3713],
          [0.1399, 0.6582, -0.365],
          [0.1221, 0.6726, -0.3783],
          [0.1041, 0.6912, -0.3721],
          [0.0967, 0.6969, -0.3784],
          [0.0856, 0.7028, -0.3796],
          [0.0705, 0.7028, -0.3796],
          [0.059, 0.6969, -0.3784],
          [0.0665, 0.6912, -0.3721],
          [0.0848, 0.6726, -0.3783],
          [0.1028, 0.6582, -0.365],
          [0.1205, 0.6396, -0.3713],
          [0.138, 0.6252, -0.358],
          [0.1553, 0.6066, -0.3643],
          [0.1723, 0.5922, -0.351],
          [0.1891, 0.5736, -0.3573],
          [0.2057, 0.5591, -0.344],
          [0.222, 0.5405, -0.3502],
          [0.238, 0.5261, -0.337],
          [0.2511, 0.5114, -0.3389],
          [0.2562, 0.5015, -0.3368],
          [0.2548, 0.4883, -0.334],
          [0.2476, 0.4784, -0.3319],
          [0.2347, 0.4931, -0.3299],
          [0.2189, 0.5075, -0.3432],
          [0.2029, 0.5261, -0.337],
          [0.1866, 0.5405, -0.3502],
          [0.17, 0.5591, -0.344],
          [0.1532, 0.5736, -0.3573],
          [0.1362, 0.5922, -0.351],
          [0.1189, 0.6066, -0.3643],
          [0.1014, 0.6252, -0.358],
          [0.0837, 0.6396, -0.3713],
          [0.0657, 0.6582, -0.365],
          [0.0474, 0.6726, -0.3783],
          [0.0289, 0.6912, -0.3721],
          [0.0213, 0.6969, -0.3784],
          [0.01, 0.7028, -0.3796],
          [-0.0051, 0.7028, -0.3796],
          [-0.0164, 0.6969, -0.3784],
          [-0.0087, 0.6912, -0.3721],
          [0.0101, 0.6726, -0.3783],
          [0.0286, 0.6582, -0.365],
          [0.0468, 0.6396, -0.3713],
          [0.0648, 0.6252, -0.358],
          [0.0826, 0.6066, -0.3643],
          [0.1001, 0.5922, -0.351],
          [0.1173, 0.5736, -0.3573],
          [0.1344, 0.5591, -0.344],
          [0.1512, 0.5405, -0.3502],
          [0.1677, 0.5261, -0.337],
          [0.184, 0.5075, -0.3432],
          [0.2, 0.4931, -0.3299],
          [0.2159, 0.4745, -0.3362],
          [0.2314, 0.4601, -0.3229],
          [0.2441, 0.4454, -0.3249],
          [0.249, 0.4355, -0.3228],
          [0.2476, 0.4222, -0.32],
          [0.2406, 0.4123, -0.3179],
          [0.2281, 0.427, -0.3159],
          [0.2128, 0.4415, -0.3292],
          [0.1972, 0.4601, -0.3229],
          [0.1814, 0.4745, -0.3362],
          [0.1654, 0.4931, -0.3299],
          [0.1491, 0.5075, -0.3432],
          [0.1325, 0.5261, -0.337],
          [0.1158, 0.5405, -0.3502],
          [0.0987, 0.5591, -0.344],
          [0.0815, 0.5736, -0.3573],
          [0.0639, 0.5922, -0.351],
          [0.0462, 0.6066, -0.3643],
          [0.0282, 0.6252, -0.358],
          [0.0099, 0.6396, -0.3713],
          [-0.0086, 0.6582, -0.365],
          [-0.0273, 0.6726, -0.3783],
          [-0.0463, 0.6912, -0.3721],
          [-0.0541, 0.6969, -0.3784],
          [-0.0656, 0.7028, -0.3796],
          [-0.0807, 0.7028, -0.3796],
          [-0.0918, 0.6969, -0.3784],
          [-0.0839, 0.6912, -0.3721],
          [-0.0646, 0.6726, -0.3783],
          [-0.0457, 0.6582, -0.365],
          [-0.0269, 0.6396, -0.3713],
          [-0.0084, 0.6252, -0.358],
          [0.0098, 0.6066, -0.3643],
          [0.0278, 0.5922, -0.351],
          [0.0456, 0.5736, -0.3573],
          [0.0631, 0.5591, -0.344],
          [0.0803, 0.5405, -0.3502],
          [0.0974, 0.5261, -0.337],
          [0.1142, 0.5075, -0.3432],
          [0.1307, 0.4931, -0.3299],
          [0.147, 0.4745, -0.3362],
          [0.163, 0.4601, -0.3229],
          [0.1789, 0.4415, -0.3292],
          [0.1944, 0.427, -0.3159],
          [0.2097, 0.4084, -0.3222],
          [0.2248, 0.394, -0.3089],
          [0.2371, 0.3793, -0.3109],
          [0.2419, 0.3694, -0.3088],
          [0.2404, 0.3562, -0.306],
          [0.2336, 0.3463, -0.3038],
          [0.2215, 0.361, -0.3019],
          [0.2067, 0.3754, -0.3151],
          [0.1916, 0.394, -0.3089],
          [0.1763, 0.4084, -0.3222],
          [0.1607, 0.427, -0.3159],
          [0.1449, 0.4415, -0.3292],
          [0.1289, 0.4601, -0.3229],
          [0.1126, 0.4745, -0.3362],
          [0.096, 0.4931, -0.3299],
          [0.0792, 0.5075, -0.3432],
          [0.0622, 0.5261, -0.337],
          [0.0449, 0.5405, -0.3502],
          [0.0274, 0.5591, -0.344],
          [0.0097, 0.5736, -0.3573],
          [-0.0083, 0.5922, -0.351],
          [-0.0266, 0.6066, -0.3643],
          [-0.0451, 0.6252, -0.358],
          [-0.0638, 0.6396, -0.3713],
          [-0.0828, 0.6582, -0.365],
          [-0.102, 0.6726, -0.3783],
          [-0.1214, 0.6912, -0.3721],
          [-0.1295, 0.6969, -0.3784],
          [-0.1411, 0.7028, -0.3796],
          [-0.1562, 0.7028, -0.3796],
          [-0.1672, 0.6969, -0.3784],
          [-0.159, 0.6912, -0.3721],
          [-0.1393, 0.6726, -0.3783],
          [-0.1199, 0.6582, -0.365],
          [-0.1007, 0.6396, -0.3713],
          [-0.0817, 0.6252, -0.358],
          [-0.0629, 0.6066, -0.3643],
          [-0.0445, 0.5922, -0.351],
          [-0.0262, 0.5736, -0.3573],
          [-0.0082, 0.5591, -0.344],
          [0.0095, 0.5405, -0.3502],
          [0.0271, 0.5261, -0.337],
          [0.0443, 0.5075, -0.3432],
          [0.0614, 0.4931, -0.3299],
          [0.0781, 0.4745, -0.3362],
          [0.0947, 0.4601, -0.3229],
          [0.111, 0.4415, -0.3292],
          [0.127, 0.427, -0.3159],
          [0.1428, 0.4084, -0.3222],
          [0.1584, 0.394, -0.3089],
          [0.1737, 0.3754, -0.3151],
          [0.1888, 0.361, -0.3019],
          [0.2036, 0.3424, -0.3081],
          [0.2182, 0.328, -0.2948],
          [0.2301, 0.3133, -0.2968],
          [0.2347, 0.3034, -0.2947],
          [0.2333, 0.2901, -0.2919],
          [0.2266, 0.2802, -0.2898],
          [0.2149, 0.2949, -0.2878],
          [0.2006, 0.3094, -0.3011],
          [0.186, 0.328, -0.2948],
          [0.1712, 0.3424, -0.3081],
          [0.1561, 0.361, -0.3019],
          [0.1408, 0.3754, -0.3151],
          [0.1252, 0.394, -0.3089],
          [0.1094, 0.4084, -0.3222],
          [0.0933, 0.427, -0.3159],
          [0.077, 0.4415, -0.3292],
          [0.0605, 0.4601, -0.3229],
          [0.0437, 0.4745, -0.3362],
          [0.0267, 0.4931, -0.3299],
          [0.0094, 0.5075, -0.3432],
          [-0.0081, 0.5261, -0.337],
          [-0.0259, 0.5405, -0.3502],
          [-0.0439, 0.5591, -0.344],
          [-0.0621, 0.5736, -0.3573],
          [-0.0806, 0.5922, -0.351],
          [-0.0993, 0.6066, -0.3643],
          [-0.1183, 0.6252, -0.358],
          [-0.1375, 0.6396, -0.3713],
          [-0.157, 0.6582, -0.365],
          [-0.1767, 0.6726, -0.3783],
          [-0.1966, 0.6912, -0.3721],
          [-0.2049, 0.6969, -0.3784],
          [-0.2167, 0.7028, -0.3796],
          [-0.2318, 0.7028, -0.3796],
          [-0.2426, 0.6969, -0.3784],
          [-0.2342, 0.6912, -0.3721],
          [-0.214, 0.6726, -0.3783],
          [-0.1941, 0.6582, -0.365],
          [-0.1744, 0.6396, -0.3713],
          [-0.1549, 0.6252, -0.358],
          [-0.1357, 0.6066, -0.3643],
          [-0.1167, 0.5922, -0.351],
          [-0.098, 0.5736, -0.3573],
          [-0.0795, 0.5591, -0.344],
          [-0.0613, 0.5405, -0.3502],
          [-0.0433, 0.5261, -0.337],
          [-0.0255, 0.5075, -0.3432],
          [-0.008, 0.4931, -0.3299],
          [0.0093, 0.4745, -0.3362],
          [0.0263, 0.4601, -0.3229],
          [0.0431, 0.4415, -0.3292],
          [0.0596, 0.427, -0.3159],
          [0.0759, 0.4084, -0.3222],
          [0.092, 0.394, -0.3089],
          [0.1078, 0.3754, -0.3151],
          [0.1234, 0.361, -0.3019],
          [0.1387, 0.3424, -0.3081],
          [0.1538, 0.328, -0.2948],
          [0.1686, 0.3094, -0.3011],
          [0.1832, 0.2949, -0.2878],
          [0.1975, 0.2763, -0.2941],
          [0.2116, 0.2619, -0.2808],
          [0.2231, 0.2472, -0.2828],
          [0.2275, 0.2373, -0.2807],
          [0.2261, 0.2241, -0.2779],
          [0.2196, 0.2142, -0.2758],
          [0.2083, 0.2289, -0.2738],
          [0.1945, 0.2433, -0.2871],
          [0.1804, 0.2619, -0.2808],
          [0.166, 0.2763, -0.2941],
          [0.1514, 0.2949, -0.2878],
          [0.1366, 0.3094, -0.3011],
          [0.1215, 0.328, -0.2948],
          [0.1062, 0.3424, -0.3081],
          [0.0906, 0.361, -0.3019],
          [0.0748, 0.3754, -0.3151],
          [0.0588, 0.394, -0.3089],
          [0.0425, 0.4084, -0.3222],
          [0.0259, 0.427, -0.3159],
          [0.0091, 0.4415, -0.3292],
          [-0.0079, 0.4601, -0.3229],
          [-0.0251, 0.4745, -0.3362],
          [-0.0427, 0.4931, -0.3299],
          [-0.0604, 0.5075, -0.3432],
          [-0.0784, 0.5261, -0.337],
          [-0.0967, 0.5405, -0.3502],
          [-0.1152, 0.5591, -0.344],
          [-0.1339, 0.5736, -0.3573],
          [-0.1529, 0.5922, -0.351],
          [-0.1721, 0.6066, -0.3643],
          [-0.1915, 0.6252, -0.358],
          [-0.2113, 0.6396, -0.3713],
          [-0.2312, 0.6582, -0.365],
          [-0.2514, 0.6726, -0.3783],
          [-0.2699, 0.6886, -0.3766],
          [-0.2754, 0.6787, -0.3745],
          [-0.274, 0.6655, -0.3717],
          [-0.2664, 0.6556, -0.3696],
          [-0.2481, 0.6396, -0.3713],
          [-0.2282, 0.6252, -0.358],
          [-0.2085, 0.6066, -0.3643],
          [-0.189, 0.5922, -0.351],
          [-0.1698, 0.5736, -0.3573],
          [-0.1508, 0.5591, -0.344],
          [-0.1321, 0.5405, -0.3502],
          [-0.1136, 0.5261, -0.337],
          [-0.0953, 0.5075, -0.3432],
          [-0.0773, 0.4931, -0.3299],
          [-0.0596, 0.4745, -0.3362],
          [-0.0421, 0.4601, -0.3229],
          [-0.0248, 0.4415, -0.3292],
          [-0.0078, 0.427, -0.3159],
          [0.009, 0.4084, -0.3222],
          [0.0256, 0.394, -0.3089],
          [0.0419, 0.3754, -0.3151],
          [0.0579, 0.361, -0.3019],
          [0.0737, 0.3424, -0.3081],
          [0.0893, 0.328, -0.2948],
          [0.1046, 0.3094, -0.3011],
          [0.1197, 0.2949, -0.2878],
          [0.1345, 0.2763, -0.2941],
          [0.1491, 0.2619, -0.2808],
          [0.1634, 0.2433, -0.2871],
          [0.1776, 0.2289, -0.2738],
          [0.1914, 0.2103, -0.2801],
          [0.205, 0.1958, -0.2668],
          [0.2105, 0.1881, -0.2702],
          [0.2009, 0.1822, -0.269],
          [0.1889, 0.1822, -0.269],
          [0.1803, 0.1881, -0.2702],
          [0.1747, 0.1958, -0.2668],
          [0.1609, 0.2103, -0.2801],
          [0.1468, 0.2289, -0.2738],
          [0.1324, 0.2433, -0.2871],
          [0.1178, 0.2619, -0.2808],
          [0.103, 0.2763, -0.2941],
          [0.0879, 0.2949, -0.2878],
          [0.0726, 0.3094, -0.3011],
          [0.057, 0.328, -0.2948],
          [0.0412, 0.3424, -0.3081],
          [0.0252, 0.361, -0.3019],
          [0.0089, 0.3754, -0.3151],
          [-0.0077, 0.394, -0.3089],
          [-0.0244, 0.4084, -0.3222],
          [-0.0415, 0.427, -0.3159],
          [-0.0587, 0.4415, -0.3292],
          [-0.0762, 0.4601, -0.3229],
          [-0.094, 0.4745, -0.3362],
          [-0.112, 0.4931, -0.3299],
          [-0.1303, 0.5075, -0.3432],
          [-0.1487, 0.5261, -0.337],
          [-0.1675, 0.5405, -0.3502],
          [-0.1864, 0.5591, -0.344],
          [-0.2057, 0.5736, -0.3573],
          [-0.2251, 0.5922, -0.351],
          [-0.2448, 0.6066, -0.3643],
          [-0.2629, 0.6226, -0.3626],
          [-0.2683, 0.6127, -0.3605],
          [-0.2668, 0.5995, -0.3577],
          [-0.2594, 0.5895, -0.3556],
          [-0.2416, 0.5736, -0.3573],
          [-0.2221, 0.5591, -0.344],
          [-0.2029, 0.5405, -0.3502],
          [-0.1839, 0.5261, -0.337],
          [-0.1652, 0.5075, -0.3432],
          [-0.1467, 0.4931, -0.3299],
          [-0.1284, 0.4745, -0.3362],
          [-0.1104, 0.4601, -0.3229],
          [-0.0927, 0.4415, -0.3292],
          [-0.0752, 0.427, -0.3159],
          [-0.0579, 0.4084, -0.3222],
          [-0.0409, 0.394, -0.3089],
          [-0.0241, 0.3754, -0.3151],
          [-0.0075, 0.361, -0.3019],
          [0.0088, 0.3424, -0.3081],
          [0.0248, 0.328, -0.2948],
          [0.0406, 0.3094, -0.3011],
          [0.0562, 0.2949, -0.2878],
          [0.0715, 0.2763, -0.2941],
          [0.0866, 0.2619, -0.2808],
          [0.1014, 0.2433, -0.2871],
          [0.116, 0.2289, -0.2738],
          [0.1304, 0.2103, -0.2801],
          [0.1445, 0.1958, -0.2668],
          [0.1502, 0.1881, -0.2702],
          [0.1407, 0.1822, -0.269],
          [0.1287, 0.1822, -0.269],
          [0.12, 0.1881, -0.2702],
          [0.1142, 0.1958, -0.2668],
          [0.0998, 0.2103, -0.2801],
          [0.0852, 0.2289, -0.2738],
          [0.0704, 0.2433, -0.2871],
          [0.0553, 0.2619, -0.2808],
          [0.04, 0.2763, -0.2941],
          [0.0244, 0.2949, -0.2878],
          [0.0086, 0.3094, -0.3011],
          [-0.0074, 0.328, -0.2948],
          [-0.0237, 0.3424, -0.3081],
          [-0.0403, 0.361, -0.3019],
          [-0.057, 0.3754, -0.3151],
          [-0.0741, 0.394, -0.3089],
          [-0.0913, 0.4084, -0.3222],
          [-0.1089, 0.427, -0.3159],
          [-0.1266, 0.4415, -0.3292],
          [-0.1446, 0.4601, -0.3229],
          [-0.1629, 0.4745, -0.3362],
          [-0.1813, 0.4931, -0.3299],
          [-0.2001, 0.5075, -0.3432],
          [-0.2191, 0.5261, -0.337],
          [-0.2383, 0.5405, -0.3502],
          [-0.2559, 0.5565, -0.3485],
          [-0.2611, 0.5466, -0.3464],
          [-0.2597, 0.5334, -0.3436],
          [-0.2524, 0.5235, -0.3415],
          [-0.235, 0.5075, -0.3432],
          [-0.216, 0.4931, -0.3299],
          [-0.1973, 0.4745, -0.3362],
          [-0.1788, 0.4601, -0.3229],
          [-0.1606, 0.4415, -0.3292],
          [-0.1426, 0.427, -0.3159],
          [-0.1248, 0.4084, -0.3222],
          [-0.1073, 0.394, -0.3089],
          [-0.09, 0.3754, -0.3151],
          [-0.073, 0.361, -0.3019],
          [-0.0562, 0.3424, -0.3081],
          [-0.0397, 0.328, -0.2948],
          [-0.0234, 0.3094, -0.3011],
          [-0.0073, 0.2949, -0.2878],
          [0.0085, 0.2763, -0.2941],
          [0.0241, 0.2619, -0.2808],
          [0.0394, 0.2433, -0.2871],
          [0.0545, 0.2289, -0.2738],
          [0.0693, 0.2103, -0.2801],
          [0.0839, 0.1958, -0.2668],
          [0.0898, 0.1881, -0.2702],
          [0.0805, 0.1822, -0.269],
          [0.0685, 0.1822, -0.269],
          [0.0596, 0.1881, -0.2702],
          [0.0536, 0.1958, -0.2668],
          [0.0388, 0.2103, -0.2801],
          [0.0237, 0.2289, -0.2738],
          [0.0084, 0.2433, -0.2871],
          [-0.0072, 0.2619, -0.2808],
          [-0.023, 0.2763, -0.2941],
          [-0.0391, 0.2949, -0.2878],
          [-0.0554, 0.3094, -0.3011],
          [-0.0719, 0.328, -0.2948],
          [-0.0887, 0.3424, -0.3081],
          [-0.1057, 0.361, -0.3019],
          [-0.123, 0.3754, -0.3151],
          [-0.1405, 0.394, -0.3089],
          [-0.1583, 0.4084, -0.3222],
          [-0.1763, 0.427, -0.3159],
          [-0.1945, 0.4415, -0.3292],
          [-0.213, 0.4601, -0.3229],
          [-0.2317, 0.4745, -0.3362],
          [-0.2489, 0.4905, -0.3345],
          [-0.2539, 0.4806, -0.3324],
          [-0.2525, 0.4673, -0.3296],
          [-0.2454, 0.4574, -0.3275],
          [-0.2284, 0.4415, -0.3292],
          [-0.21, 0.427, -0.3159],
          [-0.1917, 0.4084, -0.3222],
          [-0.1737, 0.394, -0.3089],
          [-0.1559, 0.3754, -0.3151],
          [-0.1384, 0.361, -0.3019],
          [-0.1212, 0.3424, -0.3081],
          [-0.1041, 0.328, -0.2948],
          [-0.0874, 0.3094, -0.3011],
          [-0.0708, 0.2949, -0.2878],
          [-0.0545, 0.2763, -0.2941],
          [-0.0385, 0.2619, -0.2808],
          [-0.0227, 0.2433, -0.2871],
          [-0.0071, 0.2289, -0.2738],
          [0.0082, 0.2103, -0.2801],
          [0.0233, 0.1958, -0.2668],
          [0.0294, 0.1881, -0.2702],
          [0.0203, 0.1822, -0.269],
          [0.0083, 0.1822, -0.269],
          [-0.0008, 0.1881, -0.2702],
          [-0.007, 0.1958, -0.2668],
          [-0.0223, 0.2103, -0.2801],
          [-0.0379, 0.2289, -0.2738],
          [-0.0537, 0.2433, -0.2871],
          [-0.0697, 0.2619, -0.2808],
          [-0.086, 0.2763, -0.2941],
          [-0.1026, 0.2949, -0.2878],
          [-0.1193, 0.3094, -0.3011],
          [-0.1364, 0.328, -0.2948],
          [-0.1536, 0.3424, -0.3081],
          [-0.1712, 0.361, -0.3019],
          [-0.1889, 0.3754, -0.3151],
          [-0.2069, 0.394, -0.3089],
          [-0.2252, 0.4084, -0.3222],
          [-0.2419, 0.4244, -0.3205],
          [-0.2468, 0.4145, -0.3183],
          [-0.2453, 0.4013, -0.3155],
          [-0.2384, 0.3914, -0.3134],
          [-0.2219, 0.3754, -0.3151],
          [-0.2039, 0.361, -0.3019],
          [-0.1861, 0.3424, -0.3081],
          [-0.1686, 0.328, -0.2948],
          [-0.1513, 0.3094, -0.3011],
          [-0.1343, 0.2949, -0.2878],
          [-0.1175, 0.2763, -0.2941],
          [-0.101, 0.2619, -0.2808],
          [-0.0847, 0.2433, -0.2871],
          [-0.0686, 0.2289, -0.2738],
          [-0.0528, 0.2103, -0.2801],
          [-0.0373, 0.1958, -0.2668],
          [-0.031, 0.1881, -0.2702],
          [-0.0399, 0.1822, -0.269],
          [-0.052, 0.1822, -0.269],
          [-0.0612, 0.1881, -0.2702],
          [-0.0676, 0.1958, -0.2668],
          [-0.0834, 0.2103, -0.2801],
          [-0.0994, 0.2289, -0.2738],
          [-0.1157, 0.2433, -0.2871],
          [-0.1322, 0.2619, -0.2808],
          [-0.149, 0.2763, -0.2941],
          [-0.1661, 0.2949, -0.2878],
          [-0.1833, 0.3094, -0.3011],
          [-0.2008, 0.328, -0.2948],
          [-0.2186, 0.3424, -0.3081],
          [-0.2349, 0.3584, -0.3064],
          [-0.2396, 0.3485, -0.3043],
          [-0.2381, 0.3352, -0.3015],
          [-0.2314, 0.3253, -0.2994],
          [-0.2153, 0.3094, -0.3011],
          [-0.1978, 0.2949, -0.2878],
          [-0.1805, 0.2763, -0.2941],
          [-0.1635, 0.2619, -0.2808],
          [-0.1467, 0.2433, -0.2871],
          [-0.1302, 0.2289, -0.2738],
          [-0.1139, 0.2103, -0.2801],
          [-0.0978, 0.1958, -0.2668],
          [-0.0913, 0.1881, -0.2702],
          [-0.1001, 0.1822, -0.269],
          [-0.1122, 0.1822, -0.269],
          [-0.1215, 0.1881, -0.2702],
          [-0.1281, 0.1958, -0.2668],
          [-0.1444, 0.2103, -0.2801],
          [-0.161, 0.2289, -0.2738],
          [-0.1777, 0.2433, -0.2871],
          [-0.1948, 0.2619, -0.2808],
          [-0.212, 0.2763, -0.2941],
          [-0.2279, 0.2923, -0.2924],
          [-0.2324, 0.2824, -0.2903],
          [-0.231, 0.2692, -0.2875],
          [-0.2244, 0.2593, -0.2854],
          [-0.2088, 0.2433, -0.2871],
          [-0.1917, 0.2289, -0.2738],
          [-0.175, 0.2103, -0.2801],
          [-0.1584, 0.1958, -0.2668],
          [-0.1517, 0.1881, -0.2702],
          [-0.1603, 0.1822, -0.269],
          [-0.1724, 0.1822, -0.269],
          [-0.1819, 0.1881, -0.2702],
          [-0.1887, 0.1958, -0.2668],
          [-0.2055, 0.2103, -0.2801],
          [-0.2209, 0.2263, -0.2783],
          [-0.2252, 0.2164, -0.2762],
          [-0.2238, 0.2031, -0.2734],
          [-0.2174, 0.1932, -0.2713],
          [-0.2121, 0.1881, -0.2702],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2153, -0.095, -0.2706],
        localEnd: [-0.2683, 0.41, -0.378],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.024,
        angleDeg: 45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.005,
        panelSize: { width: 0.4836, height: 0.519 },
        approximation:
          "reference motif is stacked chevron loops; modelled as a denser diamond lattice",
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.5,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.12],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "dense-lattice",
        kind: "ridge",
        description:
          "Denser rear lattice (d03), documented approximation of the chevron motif.",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r1c1.png"],
    details: [],
    fidelityTier: "form",
    uvContract: {
      status: "unwrapped",
      strategy: "generated procedural coordinates",
      materialId: "rope-braided",
    },
    materialRegions: [
      {
        regionId: "rope-dense-lattice",
        materialId: "rope-braided",
        profileId: "fabric.woven-matte",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\01-rope-dense-lattice.png",
          bbox: { x: 0, y: 0, width: 140, height: 180 },
          sourceWidth: 140,
          sourceHeight: 180,
          loaderWarnings: [],
          coverage: 1.0,
        },
      },
    ],
    colorMaterialRecipe: {
      componentId: "weave-rear",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_rear_26.userData.actionProfile = {
    animationRole: "weave-panel",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "weave",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, -0.12],
    },
  };
  (nodes["root"] ?? root).add(node_weave_rear_26);
  nodes["weave-rear"] = node_weave_rear_26;
  const mesh_weave_rear_26Geometry = endpoint_weave_rear_26
    ? new THREE.CylinderGeometry(
        endpoint_weave_rear_26.endRadius,
        endpoint_weave_rear_26.baseRadius,
        endpoint_weave_rear_26.length,
        16,
        6,
      )
    : buildTubeGeometry({
        points: [
          [0.2686, 0.6765, -0.374],
          [0.2545, 0.6912, -0.3721],
          [0.2475, 0.6969, -0.3784],
          [0.2367, 0.7028, -0.3796],
          [0.2216, 0.7028, -0.3796],
          [0.2098, 0.6969, -0.3784],
          [0.2169, 0.6912, -0.3721],
          [0.2342, 0.6726, -0.3783],
          [0.2512, 0.6582, -0.365],
          [0.2651, 0.6435, -0.367],
          [0.2705, 0.6336, -0.3649],
          [0.2691, 0.6204, -0.3621],
          [0.2616, 0.6105, -0.36],
          [0.2479, 0.6252, -0.358],
          [0.2311, 0.6396, -0.3713],
          [0.2141, 0.6582, -0.365],
          [0.1968, 0.6726, -0.3783],
          [0.1793, 0.6912, -0.3721],
          [0.1721, 0.6969, -0.3784],
          [0.1611, 0.7028, -0.3796],
          [0.146, 0.7028, -0.3796],
          [0.1344, 0.6969, -0.3784],
          [0.1417, 0.6912, -0.3721],
          [0.1595, 0.6726, -0.3783],
          [0.177, 0.6582, -0.365],
          [0.1943, 0.6396, -0.3713],
          [0.2113, 0.6252, -0.358],
          [0.2281, 0.6066, -0.3643],
          [0.2446, 0.5922, -0.351],
          [0.2581, 0.5775, -0.353],
          [0.2634, 0.5676, -0.3509],
          [0.2619, 0.5543, -0.3481],
          [0.2546, 0.5444, -0.346],
          [0.2413, 0.5591, -0.344],
          [0.225, 0.5736, -0.3573],
          [0.2085, 0.5922, -0.351],
          [0.1917, 0.6066, -0.3643],
          [0.1747, 0.6252, -0.358],
          [0.1574, 0.6396, -0.3713],
          [0.1399, 0.6582, -0.365],
          [0.1221, 0.6726, -0.3783],
          [0.1041, 0.6912, -0.3721],
          [0.0967, 0.6969, -0.3784],
          [0.0856, 0.7028, -0.3796],
          [0.0705, 0.7028, -0.3796],
          [0.059, 0.6969, -0.3784],
          [0.0665, 0.6912, -0.3721],
          [0.0848, 0.6726, -0.3783],
          [0.1028, 0.6582, -0.365],
          [0.1205, 0.6396, -0.3713],
          [0.138, 0.6252, -0.358],
          [0.1553, 0.6066, -0.3643],
          [0.1723, 0.5922, -0.351],
          [0.1891, 0.5736, -0.3573],
          [0.2057, 0.5591, -0.344],
          [0.222, 0.5405, -0.3502],
          [0.238, 0.5261, -0.337],
          [0.2511, 0.5114, -0.3389],
          [0.2562, 0.5015, -0.3368],
          [0.2548, 0.4883, -0.334],
          [0.2476, 0.4784, -0.3319],
          [0.2347, 0.4931, -0.3299],
          [0.2189, 0.5075, -0.3432],
          [0.2029, 0.5261, -0.337],
          [0.1866, 0.5405, -0.3502],
          [0.17, 0.5591, -0.344],
          [0.1532, 0.5736, -0.3573],
          [0.1362, 0.5922, -0.351],
          [0.1189, 0.6066, -0.3643],
          [0.1014, 0.6252, -0.358],
          [0.0837, 0.6396, -0.3713],
          [0.0657, 0.6582, -0.365],
          [0.0474, 0.6726, -0.3783],
          [0.0289, 0.6912, -0.3721],
          [0.0213, 0.6969, -0.3784],
          [0.01, 0.7028, -0.3796],
          [-0.0051, 0.7028, -0.3796],
          [-0.0164, 0.6969, -0.3784],
          [-0.0087, 0.6912, -0.3721],
          [0.0101, 0.6726, -0.3783],
          [0.0286, 0.6582, -0.365],
          [0.0468, 0.6396, -0.3713],
          [0.0648, 0.6252, -0.358],
          [0.0826, 0.6066, -0.3643],
          [0.1001, 0.5922, -0.351],
          [0.1173, 0.5736, -0.3573],
          [0.1344, 0.5591, -0.344],
          [0.1512, 0.5405, -0.3502],
          [0.1677, 0.5261, -0.337],
          [0.184, 0.5075, -0.3432],
          [0.2, 0.4931, -0.3299],
          [0.2159, 0.4745, -0.3362],
          [0.2314, 0.4601, -0.3229],
          [0.2441, 0.4454, -0.3249],
          [0.249, 0.4355, -0.3228],
          [0.2476, 0.4222, -0.32],
          [0.2406, 0.4123, -0.3179],
          [0.2281, 0.427, -0.3159],
          [0.2128, 0.4415, -0.3292],
          [0.1972, 0.4601, -0.3229],
          [0.1814, 0.4745, -0.3362],
          [0.1654, 0.4931, -0.3299],
          [0.1491, 0.5075, -0.3432],
          [0.1325, 0.5261, -0.337],
          [0.1158, 0.5405, -0.3502],
          [0.0987, 0.5591, -0.344],
          [0.0815, 0.5736, -0.3573],
          [0.0639, 0.5922, -0.351],
          [0.0462, 0.6066, -0.3643],
          [0.0282, 0.6252, -0.358],
          [0.0099, 0.6396, -0.3713],
          [-0.0086, 0.6582, -0.365],
          [-0.0273, 0.6726, -0.3783],
          [-0.0463, 0.6912, -0.3721],
          [-0.0541, 0.6969, -0.3784],
          [-0.0656, 0.7028, -0.3796],
          [-0.0807, 0.7028, -0.3796],
          [-0.0918, 0.6969, -0.3784],
          [-0.0839, 0.6912, -0.3721],
          [-0.0646, 0.6726, -0.3783],
          [-0.0457, 0.6582, -0.365],
          [-0.0269, 0.6396, -0.3713],
          [-0.0084, 0.6252, -0.358],
          [0.0098, 0.6066, -0.3643],
          [0.0278, 0.5922, -0.351],
          [0.0456, 0.5736, -0.3573],
          [0.0631, 0.5591, -0.344],
          [0.0803, 0.5405, -0.3502],
          [0.0974, 0.5261, -0.337],
          [0.1142, 0.5075, -0.3432],
          [0.1307, 0.4931, -0.3299],
          [0.147, 0.4745, -0.3362],
          [0.163, 0.4601, -0.3229],
          [0.1789, 0.4415, -0.3292],
          [0.1944, 0.427, -0.3159],
          [0.2097, 0.4084, -0.3222],
          [0.2248, 0.394, -0.3089],
          [0.2371, 0.3793, -0.3109],
          [0.2419, 0.3694, -0.3088],
          [0.2404, 0.3562, -0.306],
          [0.2336, 0.3463, -0.3038],
          [0.2215, 0.361, -0.3019],
          [0.2067, 0.3754, -0.3151],
          [0.1916, 0.394, -0.3089],
          [0.1763, 0.4084, -0.3222],
          [0.1607, 0.427, -0.3159],
          [0.1449, 0.4415, -0.3292],
          [0.1289, 0.4601, -0.3229],
          [0.1126, 0.4745, -0.3362],
          [0.096, 0.4931, -0.3299],
          [0.0792, 0.5075, -0.3432],
          [0.0622, 0.5261, -0.337],
          [0.0449, 0.5405, -0.3502],
          [0.0274, 0.5591, -0.344],
          [0.0097, 0.5736, -0.3573],
          [-0.0083, 0.5922, -0.351],
          [-0.0266, 0.6066, -0.3643],
          [-0.0451, 0.6252, -0.358],
          [-0.0638, 0.6396, -0.3713],
          [-0.0828, 0.6582, -0.365],
          [-0.102, 0.6726, -0.3783],
          [-0.1214, 0.6912, -0.3721],
          [-0.1295, 0.6969, -0.3784],
          [-0.1411, 0.7028, -0.3796],
          [-0.1562, 0.7028, -0.3796],
          [-0.1672, 0.6969, -0.3784],
          [-0.159, 0.6912, -0.3721],
          [-0.1393, 0.6726, -0.3783],
          [-0.1199, 0.6582, -0.365],
          [-0.1007, 0.6396, -0.3713],
          [-0.0817, 0.6252, -0.358],
          [-0.0629, 0.6066, -0.3643],
          [-0.0445, 0.5922, -0.351],
          [-0.0262, 0.5736, -0.3573],
          [-0.0082, 0.5591, -0.344],
          [0.0095, 0.5405, -0.3502],
          [0.0271, 0.5261, -0.337],
          [0.0443, 0.5075, -0.3432],
          [0.0614, 0.4931, -0.3299],
          [0.0781, 0.4745, -0.3362],
          [0.0947, 0.4601, -0.3229],
          [0.111, 0.4415, -0.3292],
          [0.127, 0.427, -0.3159],
          [0.1428, 0.4084, -0.3222],
          [0.1584, 0.394, -0.3089],
          [0.1737, 0.3754, -0.3151],
          [0.1888, 0.361, -0.3019],
          [0.2036, 0.3424, -0.3081],
          [0.2182, 0.328, -0.2948],
          [0.2301, 0.3133, -0.2968],
          [0.2347, 0.3034, -0.2947],
          [0.2333, 0.2901, -0.2919],
          [0.2266, 0.2802, -0.2898],
          [0.2149, 0.2949, -0.2878],
          [0.2006, 0.3094, -0.3011],
          [0.186, 0.328, -0.2948],
          [0.1712, 0.3424, -0.3081],
          [0.1561, 0.361, -0.3019],
          [0.1408, 0.3754, -0.3151],
          [0.1252, 0.394, -0.3089],
          [0.1094, 0.4084, -0.3222],
          [0.0933, 0.427, -0.3159],
          [0.077, 0.4415, -0.3292],
          [0.0605, 0.4601, -0.3229],
          [0.0437, 0.4745, -0.3362],
          [0.0267, 0.4931, -0.3299],
          [0.0094, 0.5075, -0.3432],
          [-0.0081, 0.5261, -0.337],
          [-0.0259, 0.5405, -0.3502],
          [-0.0439, 0.5591, -0.344],
          [-0.0621, 0.5736, -0.3573],
          [-0.0806, 0.5922, -0.351],
          [-0.0993, 0.6066, -0.3643],
          [-0.1183, 0.6252, -0.358],
          [-0.1375, 0.6396, -0.3713],
          [-0.157, 0.6582, -0.365],
          [-0.1767, 0.6726, -0.3783],
          [-0.1966, 0.6912, -0.3721],
          [-0.2049, 0.6969, -0.3784],
          [-0.2167, 0.7028, -0.3796],
          [-0.2318, 0.7028, -0.3796],
          [-0.2426, 0.6969, -0.3784],
          [-0.2342, 0.6912, -0.3721],
          [-0.214, 0.6726, -0.3783],
          [-0.1941, 0.6582, -0.365],
          [-0.1744, 0.6396, -0.3713],
          [-0.1549, 0.6252, -0.358],
          [-0.1357, 0.6066, -0.3643],
          [-0.1167, 0.5922, -0.351],
          [-0.098, 0.5736, -0.3573],
          [-0.0795, 0.5591, -0.344],
          [-0.0613, 0.5405, -0.3502],
          [-0.0433, 0.5261, -0.337],
          [-0.0255, 0.5075, -0.3432],
          [-0.008, 0.4931, -0.3299],
          [0.0093, 0.4745, -0.3362],
          [0.0263, 0.4601, -0.3229],
          [0.0431, 0.4415, -0.3292],
          [0.0596, 0.427, -0.3159],
          [0.0759, 0.4084, -0.3222],
          [0.092, 0.394, -0.3089],
          [0.1078, 0.3754, -0.3151],
          [0.1234, 0.361, -0.3019],
          [0.1387, 0.3424, -0.3081],
          [0.1538, 0.328, -0.2948],
          [0.1686, 0.3094, -0.3011],
          [0.1832, 0.2949, -0.2878],
          [0.1975, 0.2763, -0.2941],
          [0.2116, 0.2619, -0.2808],
          [0.2231, 0.2472, -0.2828],
          [0.2275, 0.2373, -0.2807],
          [0.2261, 0.2241, -0.2779],
          [0.2196, 0.2142, -0.2758],
          [0.2083, 0.2289, -0.2738],
          [0.1945, 0.2433, -0.2871],
          [0.1804, 0.2619, -0.2808],
          [0.166, 0.2763, -0.2941],
          [0.1514, 0.2949, -0.2878],
          [0.1366, 0.3094, -0.3011],
          [0.1215, 0.328, -0.2948],
          [0.1062, 0.3424, -0.3081],
          [0.0906, 0.361, -0.3019],
          [0.0748, 0.3754, -0.3151],
          [0.0588, 0.394, -0.3089],
          [0.0425, 0.4084, -0.3222],
          [0.0259, 0.427, -0.3159],
          [0.0091, 0.4415, -0.3292],
          [-0.0079, 0.4601, -0.3229],
          [-0.0251, 0.4745, -0.3362],
          [-0.0427, 0.4931, -0.3299],
          [-0.0604, 0.5075, -0.3432],
          [-0.0784, 0.5261, -0.337],
          [-0.0967, 0.5405, -0.3502],
          [-0.1152, 0.5591, -0.344],
          [-0.1339, 0.5736, -0.3573],
          [-0.1529, 0.5922, -0.351],
          [-0.1721, 0.6066, -0.3643],
          [-0.1915, 0.6252, -0.358],
          [-0.2113, 0.6396, -0.3713],
          [-0.2312, 0.6582, -0.365],
          [-0.2514, 0.6726, -0.3783],
          [-0.2699, 0.6886, -0.3766],
          [-0.2754, 0.6787, -0.3745],
          [-0.274, 0.6655, -0.3717],
          [-0.2664, 0.6556, -0.3696],
          [-0.2481, 0.6396, -0.3713],
          [-0.2282, 0.6252, -0.358],
          [-0.2085, 0.6066, -0.3643],
          [-0.189, 0.5922, -0.351],
          [-0.1698, 0.5736, -0.3573],
          [-0.1508, 0.5591, -0.344],
          [-0.1321, 0.5405, -0.3502],
          [-0.1136, 0.5261, -0.337],
          [-0.0953, 0.5075, -0.3432],
          [-0.0773, 0.4931, -0.3299],
          [-0.0596, 0.4745, -0.3362],
          [-0.0421, 0.4601, -0.3229],
          [-0.0248, 0.4415, -0.3292],
          [-0.0078, 0.427, -0.3159],
          [0.009, 0.4084, -0.3222],
          [0.0256, 0.394, -0.3089],
          [0.0419, 0.3754, -0.3151],
          [0.0579, 0.361, -0.3019],
          [0.0737, 0.3424, -0.3081],
          [0.0893, 0.328, -0.2948],
          [0.1046, 0.3094, -0.3011],
          [0.1197, 0.2949, -0.2878],
          [0.1345, 0.2763, -0.2941],
          [0.1491, 0.2619, -0.2808],
          [0.1634, 0.2433, -0.2871],
          [0.1776, 0.2289, -0.2738],
          [0.1914, 0.2103, -0.2801],
          [0.205, 0.1958, -0.2668],
          [0.2105, 0.1881, -0.2702],
          [0.2009, 0.1822, -0.269],
          [0.1889, 0.1822, -0.269],
          [0.1803, 0.1881, -0.2702],
          [0.1747, 0.1958, -0.2668],
          [0.1609, 0.2103, -0.2801],
          [0.1468, 0.2289, -0.2738],
          [0.1324, 0.2433, -0.2871],
          [0.1178, 0.2619, -0.2808],
          [0.103, 0.2763, -0.2941],
          [0.0879, 0.2949, -0.2878],
          [0.0726, 0.3094, -0.3011],
          [0.057, 0.328, -0.2948],
          [0.0412, 0.3424, -0.3081],
          [0.0252, 0.361, -0.3019],
          [0.0089, 0.3754, -0.3151],
          [-0.0077, 0.394, -0.3089],
          [-0.0244, 0.4084, -0.3222],
          [-0.0415, 0.427, -0.3159],
          [-0.0587, 0.4415, -0.3292],
          [-0.0762, 0.4601, -0.3229],
          [-0.094, 0.4745, -0.3362],
          [-0.112, 0.4931, -0.3299],
          [-0.1303, 0.5075, -0.3432],
          [-0.1487, 0.5261, -0.337],
          [-0.1675, 0.5405, -0.3502],
          [-0.1864, 0.5591, -0.344],
          [-0.2057, 0.5736, -0.3573],
          [-0.2251, 0.5922, -0.351],
          [-0.2448, 0.6066, -0.3643],
          [-0.2629, 0.6226, -0.3626],
          [-0.2683, 0.6127, -0.3605],
          [-0.2668, 0.5995, -0.3577],
          [-0.2594, 0.5895, -0.3556],
          [-0.2416, 0.5736, -0.3573],
          [-0.2221, 0.5591, -0.344],
          [-0.2029, 0.5405, -0.3502],
          [-0.1839, 0.5261, -0.337],
          [-0.1652, 0.5075, -0.3432],
          [-0.1467, 0.4931, -0.3299],
          [-0.1284, 0.4745, -0.3362],
          [-0.1104, 0.4601, -0.3229],
          [-0.0927, 0.4415, -0.3292],
          [-0.0752, 0.427, -0.3159],
          [-0.0579, 0.4084, -0.3222],
          [-0.0409, 0.394, -0.3089],
          [-0.0241, 0.3754, -0.3151],
          [-0.0075, 0.361, -0.3019],
          [0.0088, 0.3424, -0.3081],
          [0.0248, 0.328, -0.2948],
          [0.0406, 0.3094, -0.3011],
          [0.0562, 0.2949, -0.2878],
          [0.0715, 0.2763, -0.2941],
          [0.0866, 0.2619, -0.2808],
          [0.1014, 0.2433, -0.2871],
          [0.116, 0.2289, -0.2738],
          [0.1304, 0.2103, -0.2801],
          [0.1445, 0.1958, -0.2668],
          [0.1502, 0.1881, -0.2702],
          [0.1407, 0.1822, -0.269],
          [0.1287, 0.1822, -0.269],
          [0.12, 0.1881, -0.2702],
          [0.1142, 0.1958, -0.2668],
          [0.0998, 0.2103, -0.2801],
          [0.0852, 0.2289, -0.2738],
          [0.0704, 0.2433, -0.2871],
          [0.0553, 0.2619, -0.2808],
          [0.04, 0.2763, -0.2941],
          [0.0244, 0.2949, -0.2878],
          [0.0086, 0.3094, -0.3011],
          [-0.0074, 0.328, -0.2948],
          [-0.0237, 0.3424, -0.3081],
          [-0.0403, 0.361, -0.3019],
          [-0.057, 0.3754, -0.3151],
          [-0.0741, 0.394, -0.3089],
          [-0.0913, 0.4084, -0.3222],
          [-0.1089, 0.427, -0.3159],
          [-0.1266, 0.4415, -0.3292],
          [-0.1446, 0.4601, -0.3229],
          [-0.1629, 0.4745, -0.3362],
          [-0.1813, 0.4931, -0.3299],
          [-0.2001, 0.5075, -0.3432],
          [-0.2191, 0.5261, -0.337],
          [-0.2383, 0.5405, -0.3502],
          [-0.2559, 0.5565, -0.3485],
          [-0.2611, 0.5466, -0.3464],
          [-0.2597, 0.5334, -0.3436],
          [-0.2524, 0.5235, -0.3415],
          [-0.235, 0.5075, -0.3432],
          [-0.216, 0.4931, -0.3299],
          [-0.1973, 0.4745, -0.3362],
          [-0.1788, 0.4601, -0.3229],
          [-0.1606, 0.4415, -0.3292],
          [-0.1426, 0.427, -0.3159],
          [-0.1248, 0.4084, -0.3222],
          [-0.1073, 0.394, -0.3089],
          [-0.09, 0.3754, -0.3151],
          [-0.073, 0.361, -0.3019],
          [-0.0562, 0.3424, -0.3081],
          [-0.0397, 0.328, -0.2948],
          [-0.0234, 0.3094, -0.3011],
          [-0.0073, 0.2949, -0.2878],
          [0.0085, 0.2763, -0.2941],
          [0.0241, 0.2619, -0.2808],
          [0.0394, 0.2433, -0.2871],
          [0.0545, 0.2289, -0.2738],
          [0.0693, 0.2103, -0.2801],
          [0.0839, 0.1958, -0.2668],
          [0.0898, 0.1881, -0.2702],
          [0.0805, 0.1822, -0.269],
          [0.0685, 0.1822, -0.269],
          [0.0596, 0.1881, -0.2702],
          [0.0536, 0.1958, -0.2668],
          [0.0388, 0.2103, -0.2801],
          [0.0237, 0.2289, -0.2738],
          [0.0084, 0.2433, -0.2871],
          [-0.0072, 0.2619, -0.2808],
          [-0.023, 0.2763, -0.2941],
          [-0.0391, 0.2949, -0.2878],
          [-0.0554, 0.3094, -0.3011],
          [-0.0719, 0.328, -0.2948],
          [-0.0887, 0.3424, -0.3081],
          [-0.1057, 0.361, -0.3019],
          [-0.123, 0.3754, -0.3151],
          [-0.1405, 0.394, -0.3089],
          [-0.1583, 0.4084, -0.3222],
          [-0.1763, 0.427, -0.3159],
          [-0.1945, 0.4415, -0.3292],
          [-0.213, 0.4601, -0.3229],
          [-0.2317, 0.4745, -0.3362],
          [-0.2489, 0.4905, -0.3345],
          [-0.2539, 0.4806, -0.3324],
          [-0.2525, 0.4673, -0.3296],
          [-0.2454, 0.4574, -0.3275],
          [-0.2284, 0.4415, -0.3292],
          [-0.21, 0.427, -0.3159],
          [-0.1917, 0.4084, -0.3222],
          [-0.1737, 0.394, -0.3089],
          [-0.1559, 0.3754, -0.3151],
          [-0.1384, 0.361, -0.3019],
          [-0.1212, 0.3424, -0.3081],
          [-0.1041, 0.328, -0.2948],
          [-0.0874, 0.3094, -0.3011],
          [-0.0708, 0.2949, -0.2878],
          [-0.0545, 0.2763, -0.2941],
          [-0.0385, 0.2619, -0.2808],
          [-0.0227, 0.2433, -0.2871],
          [-0.0071, 0.2289, -0.2738],
          [0.0082, 0.2103, -0.2801],
          [0.0233, 0.1958, -0.2668],
          [0.0294, 0.1881, -0.2702],
          [0.0203, 0.1822, -0.269],
          [0.0083, 0.1822, -0.269],
          [-0.0008, 0.1881, -0.2702],
          [-0.007, 0.1958, -0.2668],
          [-0.0223, 0.2103, -0.2801],
          [-0.0379, 0.2289, -0.2738],
          [-0.0537, 0.2433, -0.2871],
          [-0.0697, 0.2619, -0.2808],
          [-0.086, 0.2763, -0.2941],
          [-0.1026, 0.2949, -0.2878],
          [-0.1193, 0.3094, -0.3011],
          [-0.1364, 0.328, -0.2948],
          [-0.1536, 0.3424, -0.3081],
          [-0.1712, 0.361, -0.3019],
          [-0.1889, 0.3754, -0.3151],
          [-0.2069, 0.394, -0.3089],
          [-0.2252, 0.4084, -0.3222],
          [-0.2419, 0.4244, -0.3205],
          [-0.2468, 0.4145, -0.3183],
          [-0.2453, 0.4013, -0.3155],
          [-0.2384, 0.3914, -0.3134],
          [-0.2219, 0.3754, -0.3151],
          [-0.2039, 0.361, -0.3019],
          [-0.1861, 0.3424, -0.3081],
          [-0.1686, 0.328, -0.2948],
          [-0.1513, 0.3094, -0.3011],
          [-0.1343, 0.2949, -0.2878],
          [-0.1175, 0.2763, -0.2941],
          [-0.101, 0.2619, -0.2808],
          [-0.0847, 0.2433, -0.2871],
          [-0.0686, 0.2289, -0.2738],
          [-0.0528, 0.2103, -0.2801],
          [-0.0373, 0.1958, -0.2668],
          [-0.031, 0.1881, -0.2702],
          [-0.0399, 0.1822, -0.269],
          [-0.052, 0.1822, -0.269],
          [-0.0612, 0.1881, -0.2702],
          [-0.0676, 0.1958, -0.2668],
          [-0.0834, 0.2103, -0.2801],
          [-0.0994, 0.2289, -0.2738],
          [-0.1157, 0.2433, -0.2871],
          [-0.1322, 0.2619, -0.2808],
          [-0.149, 0.2763, -0.2941],
          [-0.1661, 0.2949, -0.2878],
          [-0.1833, 0.3094, -0.3011],
          [-0.2008, 0.328, -0.2948],
          [-0.2186, 0.3424, -0.3081],
          [-0.2349, 0.3584, -0.3064],
          [-0.2396, 0.3485, -0.3043],
          [-0.2381, 0.3352, -0.3015],
          [-0.2314, 0.3253, -0.2994],
          [-0.2153, 0.3094, -0.3011],
          [-0.1978, 0.2949, -0.2878],
          [-0.1805, 0.2763, -0.2941],
          [-0.1635, 0.2619, -0.2808],
          [-0.1467, 0.2433, -0.2871],
          [-0.1302, 0.2289, -0.2738],
          [-0.1139, 0.2103, -0.2801],
          [-0.0978, 0.1958, -0.2668],
          [-0.0913, 0.1881, -0.2702],
          [-0.1001, 0.1822, -0.269],
          [-0.1122, 0.1822, -0.269],
          [-0.1215, 0.1881, -0.2702],
          [-0.1281, 0.1958, -0.2668],
          [-0.1444, 0.2103, -0.2801],
          [-0.161, 0.2289, -0.2738],
          [-0.1777, 0.2433, -0.2871],
          [-0.1948, 0.2619, -0.2808],
          [-0.212, 0.2763, -0.2941],
          [-0.2279, 0.2923, -0.2924],
          [-0.2324, 0.2824, -0.2903],
          [-0.231, 0.2692, -0.2875],
          [-0.2244, 0.2593, -0.2854],
          [-0.2088, 0.2433, -0.2871],
          [-0.1917, 0.2289, -0.2738],
          [-0.175, 0.2103, -0.2801],
          [-0.1584, 0.1958, -0.2668],
          [-0.1517, 0.1881, -0.2702],
          [-0.1603, 0.1822, -0.269],
          [-0.1724, 0.1822, -0.269],
          [-0.1819, 0.1881, -0.2702],
          [-0.1887, 0.1958, -0.2668],
          [-0.2055, 0.2103, -0.2801],
          [-0.2209, 0.2263, -0.2783],
          [-0.2252, 0.2164, -0.2762],
          [-0.2238, 0.2031, -0.2734],
          [-0.2174, 0.1932, -0.2713],
          [-0.2121, 0.1881, -0.2702],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      });
  if (!endpoint_weave_rear_26) {
    mesh_weave_rear_26Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_weave_rear_26 = new THREE.Mesh(
    mesh_weave_rear_26Geometry,
    materialMap["rope-braided"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_weave_rear_26.name = "Rear rope lattice (+45 deg run)";
  if (endpoint_weave_rear_26) {
    mesh_weave_rear_26.position.copy(endpoint_weave_rear_26.midpoint);
    mesh_weave_rear_26.quaternion.copy(endpoint_weave_rear_26.quaternion);
  }
  mesh_weave_rear_26.castShadow = options.castShadow ?? true;
  mesh_weave_rear_26.receiveShadow = options.receiveShadow ?? true;
  mesh_weave_rear_26.userData.sculptComponent = {
    id: "weave-rear",
    name: "Rear rope lattice (+45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.5,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
    geometryDescriptor: {
      topologyIntent:
        "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.2686, 0.6765, -0.374],
          [0.2545, 0.6912, -0.3721],
          [0.2475, 0.6969, -0.3784],
          [0.2367, 0.7028, -0.3796],
          [0.2216, 0.7028, -0.3796],
          [0.2098, 0.6969, -0.3784],
          [0.2169, 0.6912, -0.3721],
          [0.2342, 0.6726, -0.3783],
          [0.2512, 0.6582, -0.365],
          [0.2651, 0.6435, -0.367],
          [0.2705, 0.6336, -0.3649],
          [0.2691, 0.6204, -0.3621],
          [0.2616, 0.6105, -0.36],
          [0.2479, 0.6252, -0.358],
          [0.2311, 0.6396, -0.3713],
          [0.2141, 0.6582, -0.365],
          [0.1968, 0.6726, -0.3783],
          [0.1793, 0.6912, -0.3721],
          [0.1721, 0.6969, -0.3784],
          [0.1611, 0.7028, -0.3796],
          [0.146, 0.7028, -0.3796],
          [0.1344, 0.6969, -0.3784],
          [0.1417, 0.6912, -0.3721],
          [0.1595, 0.6726, -0.3783],
          [0.177, 0.6582, -0.365],
          [0.1943, 0.6396, -0.3713],
          [0.2113, 0.6252, -0.358],
          [0.2281, 0.6066, -0.3643],
          [0.2446, 0.5922, -0.351],
          [0.2581, 0.5775, -0.353],
          [0.2634, 0.5676, -0.3509],
          [0.2619, 0.5543, -0.3481],
          [0.2546, 0.5444, -0.346],
          [0.2413, 0.5591, -0.344],
          [0.225, 0.5736, -0.3573],
          [0.2085, 0.5922, -0.351],
          [0.1917, 0.6066, -0.3643],
          [0.1747, 0.6252, -0.358],
          [0.1574, 0.6396, -0.3713],
          [0.1399, 0.6582, -0.365],
          [0.1221, 0.6726, -0.3783],
          [0.1041, 0.6912, -0.3721],
          [0.0967, 0.6969, -0.3784],
          [0.0856, 0.7028, -0.3796],
          [0.0705, 0.7028, -0.3796],
          [0.059, 0.6969, -0.3784],
          [0.0665, 0.6912, -0.3721],
          [0.0848, 0.6726, -0.3783],
          [0.1028, 0.6582, -0.365],
          [0.1205, 0.6396, -0.3713],
          [0.138, 0.6252, -0.358],
          [0.1553, 0.6066, -0.3643],
          [0.1723, 0.5922, -0.351],
          [0.1891, 0.5736, -0.3573],
          [0.2057, 0.5591, -0.344],
          [0.222, 0.5405, -0.3502],
          [0.238, 0.5261, -0.337],
          [0.2511, 0.5114, -0.3389],
          [0.2562, 0.5015, -0.3368],
          [0.2548, 0.4883, -0.334],
          [0.2476, 0.4784, -0.3319],
          [0.2347, 0.4931, -0.3299],
          [0.2189, 0.5075, -0.3432],
          [0.2029, 0.5261, -0.337],
          [0.1866, 0.5405, -0.3502],
          [0.17, 0.5591, -0.344],
          [0.1532, 0.5736, -0.3573],
          [0.1362, 0.5922, -0.351],
          [0.1189, 0.6066, -0.3643],
          [0.1014, 0.6252, -0.358],
          [0.0837, 0.6396, -0.3713],
          [0.0657, 0.6582, -0.365],
          [0.0474, 0.6726, -0.3783],
          [0.0289, 0.6912, -0.3721],
          [0.0213, 0.6969, -0.3784],
          [0.01, 0.7028, -0.3796],
          [-0.0051, 0.7028, -0.3796],
          [-0.0164, 0.6969, -0.3784],
          [-0.0087, 0.6912, -0.3721],
          [0.0101, 0.6726, -0.3783],
          [0.0286, 0.6582, -0.365],
          [0.0468, 0.6396, -0.3713],
          [0.0648, 0.6252, -0.358],
          [0.0826, 0.6066, -0.3643],
          [0.1001, 0.5922, -0.351],
          [0.1173, 0.5736, -0.3573],
          [0.1344, 0.5591, -0.344],
          [0.1512, 0.5405, -0.3502],
          [0.1677, 0.5261, -0.337],
          [0.184, 0.5075, -0.3432],
          [0.2, 0.4931, -0.3299],
          [0.2159, 0.4745, -0.3362],
          [0.2314, 0.4601, -0.3229],
          [0.2441, 0.4454, -0.3249],
          [0.249, 0.4355, -0.3228],
          [0.2476, 0.4222, -0.32],
          [0.2406, 0.4123, -0.3179],
          [0.2281, 0.427, -0.3159],
          [0.2128, 0.4415, -0.3292],
          [0.1972, 0.4601, -0.3229],
          [0.1814, 0.4745, -0.3362],
          [0.1654, 0.4931, -0.3299],
          [0.1491, 0.5075, -0.3432],
          [0.1325, 0.5261, -0.337],
          [0.1158, 0.5405, -0.3502],
          [0.0987, 0.5591, -0.344],
          [0.0815, 0.5736, -0.3573],
          [0.0639, 0.5922, -0.351],
          [0.0462, 0.6066, -0.3643],
          [0.0282, 0.6252, -0.358],
          [0.0099, 0.6396, -0.3713],
          [-0.0086, 0.6582, -0.365],
          [-0.0273, 0.6726, -0.3783],
          [-0.0463, 0.6912, -0.3721],
          [-0.0541, 0.6969, -0.3784],
          [-0.0656, 0.7028, -0.3796],
          [-0.0807, 0.7028, -0.3796],
          [-0.0918, 0.6969, -0.3784],
          [-0.0839, 0.6912, -0.3721],
          [-0.0646, 0.6726, -0.3783],
          [-0.0457, 0.6582, -0.365],
          [-0.0269, 0.6396, -0.3713],
          [-0.0084, 0.6252, -0.358],
          [0.0098, 0.6066, -0.3643],
          [0.0278, 0.5922, -0.351],
          [0.0456, 0.5736, -0.3573],
          [0.0631, 0.5591, -0.344],
          [0.0803, 0.5405, -0.3502],
          [0.0974, 0.5261, -0.337],
          [0.1142, 0.5075, -0.3432],
          [0.1307, 0.4931, -0.3299],
          [0.147, 0.4745, -0.3362],
          [0.163, 0.4601, -0.3229],
          [0.1789, 0.4415, -0.3292],
          [0.1944, 0.427, -0.3159],
          [0.2097, 0.4084, -0.3222],
          [0.2248, 0.394, -0.3089],
          [0.2371, 0.3793, -0.3109],
          [0.2419, 0.3694, -0.3088],
          [0.2404, 0.3562, -0.306],
          [0.2336, 0.3463, -0.3038],
          [0.2215, 0.361, -0.3019],
          [0.2067, 0.3754, -0.3151],
          [0.1916, 0.394, -0.3089],
          [0.1763, 0.4084, -0.3222],
          [0.1607, 0.427, -0.3159],
          [0.1449, 0.4415, -0.3292],
          [0.1289, 0.4601, -0.3229],
          [0.1126, 0.4745, -0.3362],
          [0.096, 0.4931, -0.3299],
          [0.0792, 0.5075, -0.3432],
          [0.0622, 0.5261, -0.337],
          [0.0449, 0.5405, -0.3502],
          [0.0274, 0.5591, -0.344],
          [0.0097, 0.5736, -0.3573],
          [-0.0083, 0.5922, -0.351],
          [-0.0266, 0.6066, -0.3643],
          [-0.0451, 0.6252, -0.358],
          [-0.0638, 0.6396, -0.3713],
          [-0.0828, 0.6582, -0.365],
          [-0.102, 0.6726, -0.3783],
          [-0.1214, 0.6912, -0.3721],
          [-0.1295, 0.6969, -0.3784],
          [-0.1411, 0.7028, -0.3796],
          [-0.1562, 0.7028, -0.3796],
          [-0.1672, 0.6969, -0.3784],
          [-0.159, 0.6912, -0.3721],
          [-0.1393, 0.6726, -0.3783],
          [-0.1199, 0.6582, -0.365],
          [-0.1007, 0.6396, -0.3713],
          [-0.0817, 0.6252, -0.358],
          [-0.0629, 0.6066, -0.3643],
          [-0.0445, 0.5922, -0.351],
          [-0.0262, 0.5736, -0.3573],
          [-0.0082, 0.5591, -0.344],
          [0.0095, 0.5405, -0.3502],
          [0.0271, 0.5261, -0.337],
          [0.0443, 0.5075, -0.3432],
          [0.0614, 0.4931, -0.3299],
          [0.0781, 0.4745, -0.3362],
          [0.0947, 0.4601, -0.3229],
          [0.111, 0.4415, -0.3292],
          [0.127, 0.427, -0.3159],
          [0.1428, 0.4084, -0.3222],
          [0.1584, 0.394, -0.3089],
          [0.1737, 0.3754, -0.3151],
          [0.1888, 0.361, -0.3019],
          [0.2036, 0.3424, -0.3081],
          [0.2182, 0.328, -0.2948],
          [0.2301, 0.3133, -0.2968],
          [0.2347, 0.3034, -0.2947],
          [0.2333, 0.2901, -0.2919],
          [0.2266, 0.2802, -0.2898],
          [0.2149, 0.2949, -0.2878],
          [0.2006, 0.3094, -0.3011],
          [0.186, 0.328, -0.2948],
          [0.1712, 0.3424, -0.3081],
          [0.1561, 0.361, -0.3019],
          [0.1408, 0.3754, -0.3151],
          [0.1252, 0.394, -0.3089],
          [0.1094, 0.4084, -0.3222],
          [0.0933, 0.427, -0.3159],
          [0.077, 0.4415, -0.3292],
          [0.0605, 0.4601, -0.3229],
          [0.0437, 0.4745, -0.3362],
          [0.0267, 0.4931, -0.3299],
          [0.0094, 0.5075, -0.3432],
          [-0.0081, 0.5261, -0.337],
          [-0.0259, 0.5405, -0.3502],
          [-0.0439, 0.5591, -0.344],
          [-0.0621, 0.5736, -0.3573],
          [-0.0806, 0.5922, -0.351],
          [-0.0993, 0.6066, -0.3643],
          [-0.1183, 0.6252, -0.358],
          [-0.1375, 0.6396, -0.3713],
          [-0.157, 0.6582, -0.365],
          [-0.1767, 0.6726, -0.3783],
          [-0.1966, 0.6912, -0.3721],
          [-0.2049, 0.6969, -0.3784],
          [-0.2167, 0.7028, -0.3796],
          [-0.2318, 0.7028, -0.3796],
          [-0.2426, 0.6969, -0.3784],
          [-0.2342, 0.6912, -0.3721],
          [-0.214, 0.6726, -0.3783],
          [-0.1941, 0.6582, -0.365],
          [-0.1744, 0.6396, -0.3713],
          [-0.1549, 0.6252, -0.358],
          [-0.1357, 0.6066, -0.3643],
          [-0.1167, 0.5922, -0.351],
          [-0.098, 0.5736, -0.3573],
          [-0.0795, 0.5591, -0.344],
          [-0.0613, 0.5405, -0.3502],
          [-0.0433, 0.5261, -0.337],
          [-0.0255, 0.5075, -0.3432],
          [-0.008, 0.4931, -0.3299],
          [0.0093, 0.4745, -0.3362],
          [0.0263, 0.4601, -0.3229],
          [0.0431, 0.4415, -0.3292],
          [0.0596, 0.427, -0.3159],
          [0.0759, 0.4084, -0.3222],
          [0.092, 0.394, -0.3089],
          [0.1078, 0.3754, -0.3151],
          [0.1234, 0.361, -0.3019],
          [0.1387, 0.3424, -0.3081],
          [0.1538, 0.328, -0.2948],
          [0.1686, 0.3094, -0.3011],
          [0.1832, 0.2949, -0.2878],
          [0.1975, 0.2763, -0.2941],
          [0.2116, 0.2619, -0.2808],
          [0.2231, 0.2472, -0.2828],
          [0.2275, 0.2373, -0.2807],
          [0.2261, 0.2241, -0.2779],
          [0.2196, 0.2142, -0.2758],
          [0.2083, 0.2289, -0.2738],
          [0.1945, 0.2433, -0.2871],
          [0.1804, 0.2619, -0.2808],
          [0.166, 0.2763, -0.2941],
          [0.1514, 0.2949, -0.2878],
          [0.1366, 0.3094, -0.3011],
          [0.1215, 0.328, -0.2948],
          [0.1062, 0.3424, -0.3081],
          [0.0906, 0.361, -0.3019],
          [0.0748, 0.3754, -0.3151],
          [0.0588, 0.394, -0.3089],
          [0.0425, 0.4084, -0.3222],
          [0.0259, 0.427, -0.3159],
          [0.0091, 0.4415, -0.3292],
          [-0.0079, 0.4601, -0.3229],
          [-0.0251, 0.4745, -0.3362],
          [-0.0427, 0.4931, -0.3299],
          [-0.0604, 0.5075, -0.3432],
          [-0.0784, 0.5261, -0.337],
          [-0.0967, 0.5405, -0.3502],
          [-0.1152, 0.5591, -0.344],
          [-0.1339, 0.5736, -0.3573],
          [-0.1529, 0.5922, -0.351],
          [-0.1721, 0.6066, -0.3643],
          [-0.1915, 0.6252, -0.358],
          [-0.2113, 0.6396, -0.3713],
          [-0.2312, 0.6582, -0.365],
          [-0.2514, 0.6726, -0.3783],
          [-0.2699, 0.6886, -0.3766],
          [-0.2754, 0.6787, -0.3745],
          [-0.274, 0.6655, -0.3717],
          [-0.2664, 0.6556, -0.3696],
          [-0.2481, 0.6396, -0.3713],
          [-0.2282, 0.6252, -0.358],
          [-0.2085, 0.6066, -0.3643],
          [-0.189, 0.5922, -0.351],
          [-0.1698, 0.5736, -0.3573],
          [-0.1508, 0.5591, -0.344],
          [-0.1321, 0.5405, -0.3502],
          [-0.1136, 0.5261, -0.337],
          [-0.0953, 0.5075, -0.3432],
          [-0.0773, 0.4931, -0.3299],
          [-0.0596, 0.4745, -0.3362],
          [-0.0421, 0.4601, -0.3229],
          [-0.0248, 0.4415, -0.3292],
          [-0.0078, 0.427, -0.3159],
          [0.009, 0.4084, -0.3222],
          [0.0256, 0.394, -0.3089],
          [0.0419, 0.3754, -0.3151],
          [0.0579, 0.361, -0.3019],
          [0.0737, 0.3424, -0.3081],
          [0.0893, 0.328, -0.2948],
          [0.1046, 0.3094, -0.3011],
          [0.1197, 0.2949, -0.2878],
          [0.1345, 0.2763, -0.2941],
          [0.1491, 0.2619, -0.2808],
          [0.1634, 0.2433, -0.2871],
          [0.1776, 0.2289, -0.2738],
          [0.1914, 0.2103, -0.2801],
          [0.205, 0.1958, -0.2668],
          [0.2105, 0.1881, -0.2702],
          [0.2009, 0.1822, -0.269],
          [0.1889, 0.1822, -0.269],
          [0.1803, 0.1881, -0.2702],
          [0.1747, 0.1958, -0.2668],
          [0.1609, 0.2103, -0.2801],
          [0.1468, 0.2289, -0.2738],
          [0.1324, 0.2433, -0.2871],
          [0.1178, 0.2619, -0.2808],
          [0.103, 0.2763, -0.2941],
          [0.0879, 0.2949, -0.2878],
          [0.0726, 0.3094, -0.3011],
          [0.057, 0.328, -0.2948],
          [0.0412, 0.3424, -0.3081],
          [0.0252, 0.361, -0.3019],
          [0.0089, 0.3754, -0.3151],
          [-0.0077, 0.394, -0.3089],
          [-0.0244, 0.4084, -0.3222],
          [-0.0415, 0.427, -0.3159],
          [-0.0587, 0.4415, -0.3292],
          [-0.0762, 0.4601, -0.3229],
          [-0.094, 0.4745, -0.3362],
          [-0.112, 0.4931, -0.3299],
          [-0.1303, 0.5075, -0.3432],
          [-0.1487, 0.5261, -0.337],
          [-0.1675, 0.5405, -0.3502],
          [-0.1864, 0.5591, -0.344],
          [-0.2057, 0.5736, -0.3573],
          [-0.2251, 0.5922, -0.351],
          [-0.2448, 0.6066, -0.3643],
          [-0.2629, 0.6226, -0.3626],
          [-0.2683, 0.6127, -0.3605],
          [-0.2668, 0.5995, -0.3577],
          [-0.2594, 0.5895, -0.3556],
          [-0.2416, 0.5736, -0.3573],
          [-0.2221, 0.5591, -0.344],
          [-0.2029, 0.5405, -0.3502],
          [-0.1839, 0.5261, -0.337],
          [-0.1652, 0.5075, -0.3432],
          [-0.1467, 0.4931, -0.3299],
          [-0.1284, 0.4745, -0.3362],
          [-0.1104, 0.4601, -0.3229],
          [-0.0927, 0.4415, -0.3292],
          [-0.0752, 0.427, -0.3159],
          [-0.0579, 0.4084, -0.3222],
          [-0.0409, 0.394, -0.3089],
          [-0.0241, 0.3754, -0.3151],
          [-0.0075, 0.361, -0.3019],
          [0.0088, 0.3424, -0.3081],
          [0.0248, 0.328, -0.2948],
          [0.0406, 0.3094, -0.3011],
          [0.0562, 0.2949, -0.2878],
          [0.0715, 0.2763, -0.2941],
          [0.0866, 0.2619, -0.2808],
          [0.1014, 0.2433, -0.2871],
          [0.116, 0.2289, -0.2738],
          [0.1304, 0.2103, -0.2801],
          [0.1445, 0.1958, -0.2668],
          [0.1502, 0.1881, -0.2702],
          [0.1407, 0.1822, -0.269],
          [0.1287, 0.1822, -0.269],
          [0.12, 0.1881, -0.2702],
          [0.1142, 0.1958, -0.2668],
          [0.0998, 0.2103, -0.2801],
          [0.0852, 0.2289, -0.2738],
          [0.0704, 0.2433, -0.2871],
          [0.0553, 0.2619, -0.2808],
          [0.04, 0.2763, -0.2941],
          [0.0244, 0.2949, -0.2878],
          [0.0086, 0.3094, -0.3011],
          [-0.0074, 0.328, -0.2948],
          [-0.0237, 0.3424, -0.3081],
          [-0.0403, 0.361, -0.3019],
          [-0.057, 0.3754, -0.3151],
          [-0.0741, 0.394, -0.3089],
          [-0.0913, 0.4084, -0.3222],
          [-0.1089, 0.427, -0.3159],
          [-0.1266, 0.4415, -0.3292],
          [-0.1446, 0.4601, -0.3229],
          [-0.1629, 0.4745, -0.3362],
          [-0.1813, 0.4931, -0.3299],
          [-0.2001, 0.5075, -0.3432],
          [-0.2191, 0.5261, -0.337],
          [-0.2383, 0.5405, -0.3502],
          [-0.2559, 0.5565, -0.3485],
          [-0.2611, 0.5466, -0.3464],
          [-0.2597, 0.5334, -0.3436],
          [-0.2524, 0.5235, -0.3415],
          [-0.235, 0.5075, -0.3432],
          [-0.216, 0.4931, -0.3299],
          [-0.1973, 0.4745, -0.3362],
          [-0.1788, 0.4601, -0.3229],
          [-0.1606, 0.4415, -0.3292],
          [-0.1426, 0.427, -0.3159],
          [-0.1248, 0.4084, -0.3222],
          [-0.1073, 0.394, -0.3089],
          [-0.09, 0.3754, -0.3151],
          [-0.073, 0.361, -0.3019],
          [-0.0562, 0.3424, -0.3081],
          [-0.0397, 0.328, -0.2948],
          [-0.0234, 0.3094, -0.3011],
          [-0.0073, 0.2949, -0.2878],
          [0.0085, 0.2763, -0.2941],
          [0.0241, 0.2619, -0.2808],
          [0.0394, 0.2433, -0.2871],
          [0.0545, 0.2289, -0.2738],
          [0.0693, 0.2103, -0.2801],
          [0.0839, 0.1958, -0.2668],
          [0.0898, 0.1881, -0.2702],
          [0.0805, 0.1822, -0.269],
          [0.0685, 0.1822, -0.269],
          [0.0596, 0.1881, -0.2702],
          [0.0536, 0.1958, -0.2668],
          [0.0388, 0.2103, -0.2801],
          [0.0237, 0.2289, -0.2738],
          [0.0084, 0.2433, -0.2871],
          [-0.0072, 0.2619, -0.2808],
          [-0.023, 0.2763, -0.2941],
          [-0.0391, 0.2949, -0.2878],
          [-0.0554, 0.3094, -0.3011],
          [-0.0719, 0.328, -0.2948],
          [-0.0887, 0.3424, -0.3081],
          [-0.1057, 0.361, -0.3019],
          [-0.123, 0.3754, -0.3151],
          [-0.1405, 0.394, -0.3089],
          [-0.1583, 0.4084, -0.3222],
          [-0.1763, 0.427, -0.3159],
          [-0.1945, 0.4415, -0.3292],
          [-0.213, 0.4601, -0.3229],
          [-0.2317, 0.4745, -0.3362],
          [-0.2489, 0.4905, -0.3345],
          [-0.2539, 0.4806, -0.3324],
          [-0.2525, 0.4673, -0.3296],
          [-0.2454, 0.4574, -0.3275],
          [-0.2284, 0.4415, -0.3292],
          [-0.21, 0.427, -0.3159],
          [-0.1917, 0.4084, -0.3222],
          [-0.1737, 0.394, -0.3089],
          [-0.1559, 0.3754, -0.3151],
          [-0.1384, 0.361, -0.3019],
          [-0.1212, 0.3424, -0.3081],
          [-0.1041, 0.328, -0.2948],
          [-0.0874, 0.3094, -0.3011],
          [-0.0708, 0.2949, -0.2878],
          [-0.0545, 0.2763, -0.2941],
          [-0.0385, 0.2619, -0.2808],
          [-0.0227, 0.2433, -0.2871],
          [-0.0071, 0.2289, -0.2738],
          [0.0082, 0.2103, -0.2801],
          [0.0233, 0.1958, -0.2668],
          [0.0294, 0.1881, -0.2702],
          [0.0203, 0.1822, -0.269],
          [0.0083, 0.1822, -0.269],
          [-0.0008, 0.1881, -0.2702],
          [-0.007, 0.1958, -0.2668],
          [-0.0223, 0.2103, -0.2801],
          [-0.0379, 0.2289, -0.2738],
          [-0.0537, 0.2433, -0.2871],
          [-0.0697, 0.2619, -0.2808],
          [-0.086, 0.2763, -0.2941],
          [-0.1026, 0.2949, -0.2878],
          [-0.1193, 0.3094, -0.3011],
          [-0.1364, 0.328, -0.2948],
          [-0.1536, 0.3424, -0.3081],
          [-0.1712, 0.361, -0.3019],
          [-0.1889, 0.3754, -0.3151],
          [-0.2069, 0.394, -0.3089],
          [-0.2252, 0.4084, -0.3222],
          [-0.2419, 0.4244, -0.3205],
          [-0.2468, 0.4145, -0.3183],
          [-0.2453, 0.4013, -0.3155],
          [-0.2384, 0.3914, -0.3134],
          [-0.2219, 0.3754, -0.3151],
          [-0.2039, 0.361, -0.3019],
          [-0.1861, 0.3424, -0.3081],
          [-0.1686, 0.328, -0.2948],
          [-0.1513, 0.3094, -0.3011],
          [-0.1343, 0.2949, -0.2878],
          [-0.1175, 0.2763, -0.2941],
          [-0.101, 0.2619, -0.2808],
          [-0.0847, 0.2433, -0.2871],
          [-0.0686, 0.2289, -0.2738],
          [-0.0528, 0.2103, -0.2801],
          [-0.0373, 0.1958, -0.2668],
          [-0.031, 0.1881, -0.2702],
          [-0.0399, 0.1822, -0.269],
          [-0.052, 0.1822, -0.269],
          [-0.0612, 0.1881, -0.2702],
          [-0.0676, 0.1958, -0.2668],
          [-0.0834, 0.2103, -0.2801],
          [-0.0994, 0.2289, -0.2738],
          [-0.1157, 0.2433, -0.2871],
          [-0.1322, 0.2619, -0.2808],
          [-0.149, 0.2763, -0.2941],
          [-0.1661, 0.2949, -0.2878],
          [-0.1833, 0.3094, -0.3011],
          [-0.2008, 0.328, -0.2948],
          [-0.2186, 0.3424, -0.3081],
          [-0.2349, 0.3584, -0.3064],
          [-0.2396, 0.3485, -0.3043],
          [-0.2381, 0.3352, -0.3015],
          [-0.2314, 0.3253, -0.2994],
          [-0.2153, 0.3094, -0.3011],
          [-0.1978, 0.2949, -0.2878],
          [-0.1805, 0.2763, -0.2941],
          [-0.1635, 0.2619, -0.2808],
          [-0.1467, 0.2433, -0.2871],
          [-0.1302, 0.2289, -0.2738],
          [-0.1139, 0.2103, -0.2801],
          [-0.0978, 0.1958, -0.2668],
          [-0.0913, 0.1881, -0.2702],
          [-0.1001, 0.1822, -0.269],
          [-0.1122, 0.1822, -0.269],
          [-0.1215, 0.1881, -0.2702],
          [-0.1281, 0.1958, -0.2668],
          [-0.1444, 0.2103, -0.2801],
          [-0.161, 0.2289, -0.2738],
          [-0.1777, 0.2433, -0.2871],
          [-0.1948, 0.2619, -0.2808],
          [-0.212, 0.2763, -0.2941],
          [-0.2279, 0.2923, -0.2924],
          [-0.2324, 0.2824, -0.2903],
          [-0.231, 0.2692, -0.2875],
          [-0.2244, 0.2593, -0.2854],
          [-0.2088, 0.2433, -0.2871],
          [-0.1917, 0.2289, -0.2738],
          [-0.175, 0.2103, -0.2801],
          [-0.1584, 0.1958, -0.2668],
          [-0.1517, 0.1881, -0.2702],
          [-0.1603, 0.1822, -0.269],
          [-0.1724, 0.1822, -0.269],
          [-0.1819, 0.1881, -0.2702],
          [-0.1887, 0.1958, -0.2668],
          [-0.2055, 0.2103, -0.2801],
          [-0.2209, 0.2263, -0.2783],
          [-0.2252, 0.2164, -0.2762],
          [-0.2238, 0.2031, -0.2734],
          [-0.2174, 0.1932, -0.2713],
          [-0.2121, 0.1881, -0.2702],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2153, -0.095, -0.2706],
        localEnd: [-0.2683, 0.41, -0.378],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.024,
        angleDeg: 45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.005,
        panelSize: { width: 0.4836, height: 0.519 },
        approximation:
          "reference motif is stacked chevron loops; modelled as a denser diamond lattice",
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.5,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.12],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "dense-lattice",
        kind: "ridge",
        description:
          "Denser rear lattice (d03), documented approximation of the chevron motif.",
        realizedInPass: "form-refinement",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r1c1.png"],
    details: [],
    fidelityTier: "form",
    uvContract: {
      status: "unwrapped",
      strategy: "generated procedural coordinates",
      materialId: "rope-braided",
    },
    materialRegions: [
      {
        regionId: "rope-dense-lattice",
        materialId: "rope-braided",
        profileId: "fabric.woven-matte",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\01-rope-dense-lattice.png",
          bbox: { x: 0, y: 0, width: 140, height: 180 },
          sourceWidth: 140,
          sourceHeight: 180,
          loaderWarnings: [],
          coverage: 1.0,
        },
      },
    ],
    colorMaterialRecipe: {
      componentId: "weave-rear",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_rear_26.add(mesh_weave_rear_26);
  meshes["weave-rear"] = mesh_weave_rear_26;
  colliders["weave-rear"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["weave"] ??= [];
  destructionGroups["weave"].push(node_weave_rear_26);

  const attachment_weave_rear_b_27 = null;
  const endpoint_weave_rear_b_27 = makeAttachmentEndpoint(
    attachment_weave_rear_b_27,
  );
  const node_weave_rear_b_27 = new THREE.Group();
  node_weave_rear_b_27.name = "Rear rope lattice (-45 deg run)__pivot";
  node_weave_rear_b_27.scale.set(1, 1, 1);
  if (endpoint_weave_rear_b_27) {
    node_weave_rear_b_27.position.copy(endpoint_weave_rear_b_27.start);
    node_weave_rear_b_27.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_weave_rear_b_27.position.set(0.0, 0.0, 0.0);
    node_weave_rear_b_27.rotation.set(0.0, 0.0, 0.0);
  }
  node_weave_rear_b_27.userData.sculptComponent = {
    id: "weave-rear-b",
    name: "Rear rope lattice (-45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.5,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
    geometryDescriptor: {
      topologyIntent:
        "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.219, 0.2085, -0.2746],
          [0.205, 0.1938, -0.2765],
          [0.1982, 0.1881, -0.2702],
          [0.1886, 0.1822, -0.269],
          [0.1765, 0.1822, -0.269],
          [0.168, 0.1881, -0.2702],
          [0.1747, 0.1938, -0.2765],
          [0.1914, 0.2124, -0.2703],
          [0.2083, 0.2268, -0.2836],
          [0.2225, 0.2415, -0.2816],
          [0.229, 0.2514, -0.2837],
          [0.2305, 0.2646, -0.2865],
          [0.226, 0.2745, -0.2886],
          [0.2116, 0.2598, -0.2906],
          [0.1945, 0.2454, -0.2773],
          [0.1776, 0.2268, -0.2836],
          [0.1609, 0.2124, -0.2703],
          [0.1445, 0.1938, -0.2765],
          [0.1378, 0.1881, -0.2702],
          [0.1284, 0.1822, -0.269],
          [0.1163, 0.1822, -0.269],
          [0.1076, 0.1881, -0.2702],
          [0.1142, 0.1938, -0.2765],
          [0.1304, 0.2124, -0.2703],
          [0.1468, 0.2268, -0.2836],
          [0.1634, 0.2454, -0.2773],
          [0.1804, 0.2598, -0.2906],
          [0.1975, 0.2784, -0.2843],
          [0.2149, 0.2928, -0.2976],
          [0.2295, 0.3075, -0.2956],
          [0.2362, 0.3174, -0.2977],
          [0.2376, 0.3307, -0.3005],
          [0.233, 0.3406, -0.3026],
          [0.2182, 0.3259, -0.3046],
          [0.2006, 0.3114, -0.2913],
          [0.1832, 0.2928, -0.2976],
          [0.166, 0.2784, -0.2843],
          [0.1491, 0.2598, -0.2906],
          [0.1324, 0.2454, -0.2773],
          [0.116, 0.2268, -0.2836],
          [0.0998, 0.2124, -0.2703],
          [0.0839, 0.1938, -0.2765],
          [0.0774, 0.1881, -0.2702],
          [0.0682, 0.1822, -0.269],
          [0.0561, 0.1822, -0.269],
          [0.0472, 0.1881, -0.2702],
          [0.0536, 0.1938, -0.2765],
          [0.0693, 0.2124, -0.2703],
          [0.0852, 0.2268, -0.2836],
          [0.1014, 0.2454, -0.2773],
          [0.1178, 0.2598, -0.2906],
          [0.1345, 0.2784, -0.2843],
          [0.1514, 0.2928, -0.2976],
          [0.1686, 0.3114, -0.2913],
          [0.186, 0.3259, -0.3046],
          [0.2036, 0.3445, -0.2983],
          [0.2215, 0.3589, -0.3116],
          [0.2365, 0.3736, -0.3097],
          [0.2434, 0.3835, -0.3118],
          [0.2448, 0.3967, -0.3146],
          [0.24, 0.4066, -0.3167],
          [0.2248, 0.3919, -0.3187],
          [0.2067, 0.3775, -0.3054],
          [0.1888, 0.3589, -0.3116],
          [0.1712, 0.3445, -0.2983],
          [0.1538, 0.3259, -0.3046],
          [0.1366, 0.3114, -0.2913],
          [0.1197, 0.2928, -0.2976],
          [0.103, 0.2784, -0.2843],
          [0.0866, 0.2598, -0.2906],
          [0.0704, 0.2454, -0.2773],
          [0.0545, 0.2268, -0.2836],
          [0.0388, 0.2124, -0.2703],
          [0.0233, 0.1938, -0.2765],
          [0.0171, 0.1881, -0.2702],
          [0.008, 0.1822, -0.269],
          [-0.0041, 0.1822, -0.269],
          [-0.0131, 0.1881, -0.2702],
          [-0.007, 0.1938, -0.2765],
          [0.0082, 0.2124, -0.2703],
          [0.0237, 0.2268, -0.2836],
          [0.0394, 0.2454, -0.2773],
          [0.0553, 0.2598, -0.2906],
          [0.0715, 0.2784, -0.2843],
          [0.0879, 0.2928, -0.2976],
          [0.1046, 0.3114, -0.2913],
          [0.1215, 0.3259, -0.3046],
          [0.1387, 0.3445, -0.2983],
          [0.1561, 0.3589, -0.3116],
          [0.1737, 0.3775, -0.3054],
          [0.1916, 0.3919, -0.3187],
          [0.2097, 0.4105, -0.3124],
          [0.2281, 0.4249, -0.3257],
          [0.2435, 0.4396, -0.3237],
          [0.2506, 0.4495, -0.3258],
          [0.252, 0.4628, -0.3286],
          [0.247, 0.4727, -0.3307],
          [0.2314, 0.458, -0.3327],
          [0.2128, 0.4435, -0.3194],
          [0.1944, 0.4249, -0.3257],
          [0.1763, 0.4105, -0.3124],
          [0.1584, 0.3919, -0.3187],
          [0.1408, 0.3775, -0.3054],
          [0.1234, 0.3589, -0.3116],
          [0.1062, 0.3445, -0.2983],
          [0.0893, 0.3259, -0.3046],
          [0.0726, 0.3114, -0.2913],
          [0.0562, 0.2928, -0.2976],
          [0.04, 0.2784, -0.2843],
          [0.0241, 0.2598, -0.2906],
          [0.0084, 0.2454, -0.2773],
          [-0.0071, 0.2268, -0.2836],
          [-0.0223, 0.2124, -0.2703],
          [-0.0373, 0.1938, -0.2765],
          [-0.0433, 0.1881, -0.2702],
          [-0.0522, 0.1822, -0.269],
          [-0.0643, 0.1822, -0.269],
          [-0.0735, 0.1881, -0.2702],
          [-0.0676, 0.1938, -0.2765],
          [-0.0528, 0.2124, -0.2703],
          [-0.0379, 0.2268, -0.2836],
          [-0.0227, 0.2454, -0.2773],
          [-0.0072, 0.2598, -0.2906],
          [0.0085, 0.2784, -0.2843],
          [0.0244, 0.2928, -0.2976],
          [0.0406, 0.3114, -0.2913],
          [0.057, 0.3259, -0.3046],
          [0.0737, 0.3445, -0.2983],
          [0.0906, 0.3589, -0.3116],
          [0.1078, 0.3775, -0.3054],
          [0.1252, 0.3919, -0.3187],
          [0.1428, 0.4105, -0.3124],
          [0.1607, 0.4249, -0.3257],
          [0.1789, 0.4435, -0.3194],
          [0.1972, 0.458, -0.3327],
          [0.2159, 0.4766, -0.3264],
          [0.2347, 0.491, -0.3397],
          [0.2505, 0.5057, -0.3377],
          [0.2577, 0.5156, -0.3398],
          [0.2592, 0.5288, -0.3426],
          [0.254, 0.5387, -0.3447],
          [0.238, 0.524, -0.3467],
          [0.2189, 0.5096, -0.3334],
          [0.2, 0.491, -0.3397],
          [0.1814, 0.4766, -0.3264],
          [0.163, 0.458, -0.3327],
          [0.1449, 0.4435, -0.3194],
          [0.127, 0.4249, -0.3257],
          [0.1094, 0.4105, -0.3124],
          [0.092, 0.3919, -0.3187],
          [0.0748, 0.3775, -0.3054],
          [0.0579, 0.3589, -0.3116],
          [0.0412, 0.3445, -0.2983],
          [0.0248, 0.3259, -0.3046],
          [0.0086, 0.3114, -0.2913],
          [-0.0073, 0.2928, -0.2976],
          [-0.023, 0.2784, -0.2843],
          [-0.0385, 0.2598, -0.2906],
          [-0.0537, 0.2454, -0.2773],
          [-0.0686, 0.2268, -0.2836],
          [-0.0834, 0.2124, -0.2703],
          [-0.0978, 0.1938, -0.2765],
          [-0.1037, 0.1881, -0.2702],
          [-0.1124, 0.1822, -0.269],
          [-0.1245, 0.1822, -0.269],
          [-0.1339, 0.1881, -0.2702],
          [-0.1281, 0.1938, -0.2765],
          [-0.1139, 0.2124, -0.2703],
          [-0.0994, 0.2268, -0.2836],
          [-0.0847, 0.2454, -0.2773],
          [-0.0697, 0.2598, -0.2906],
          [-0.0545, 0.2784, -0.2843],
          [-0.0391, 0.2928, -0.2976],
          [-0.0234, 0.3114, -0.2913],
          [-0.0074, 0.3259, -0.3046],
          [0.0088, 0.3445, -0.2983],
          [0.0252, 0.3589, -0.3116],
          [0.0419, 0.3775, -0.3054],
          [0.0588, 0.3919, -0.3187],
          [0.0759, 0.4105, -0.3124],
          [0.0933, 0.4249, -0.3257],
          [0.111, 0.4435, -0.3194],
          [0.1289, 0.458, -0.3327],
          [0.147, 0.4766, -0.3264],
          [0.1654, 0.491, -0.3397],
          [0.184, 0.5096, -0.3334],
          [0.2029, 0.524, -0.3467],
          [0.222, 0.5426, -0.3405],
          [0.2413, 0.557, -0.3538],
          [0.2575, 0.5717, -0.3518],
          [0.2649, 0.5816, -0.3539],
          [0.2663, 0.5949, -0.3567],
          [0.261, 0.6048, -0.3588],
          [0.2446, 0.5901, -0.3608],
          [0.225, 0.5756, -0.3475],
          [0.2057, 0.557, -0.3538],
          [0.1866, 0.5426, -0.3405],
          [0.1677, 0.524, -0.3467],
          [0.1491, 0.5096, -0.3334],
          [0.1307, 0.491, -0.3397],
          [0.1126, 0.4766, -0.3264],
          [0.0947, 0.458, -0.3327],
          [0.077, 0.4435, -0.3194],
          [0.0596, 0.4249, -0.3257],
          [0.0425, 0.4105, -0.3124],
          [0.0256, 0.3919, -0.3187],
          [0.0089, 0.3775, -0.3054],
          [-0.0075, 0.3589, -0.3116],
          [-0.0237, 0.3445, -0.2983],
          [-0.0397, 0.3259, -0.3046],
          [-0.0554, 0.3114, -0.2913],
          [-0.0708, 0.2928, -0.2976],
          [-0.086, 0.2784, -0.2843],
          [-0.101, 0.2598, -0.2906],
          [-0.1157, 0.2454, -0.2773],
          [-0.1302, 0.2268, -0.2836],
          [-0.1444, 0.2124, -0.2703],
          [-0.1584, 0.1938, -0.2765],
          [-0.1641, 0.1881, -0.2702],
          [-0.1726, 0.1822, -0.269],
          [-0.1847, 0.1822, -0.269],
          [-0.1943, 0.1881, -0.2702],
          [-0.1887, 0.1938, -0.2765],
          [-0.175, 0.2124, -0.2703],
          [-0.161, 0.2268, -0.2836],
          [-0.1467, 0.2454, -0.2773],
          [-0.1322, 0.2598, -0.2906],
          [-0.1175, 0.2784, -0.2843],
          [-0.1026, 0.2928, -0.2976],
          [-0.0874, 0.3114, -0.2913],
          [-0.0719, 0.3259, -0.3046],
          [-0.0562, 0.3445, -0.2983],
          [-0.0403, 0.3589, -0.3116],
          [-0.0241, 0.3775, -0.3054],
          [-0.0077, 0.3919, -0.3187],
          [0.009, 0.4105, -0.3124],
          [0.0259, 0.4249, -0.3257],
          [0.0431, 0.4435, -0.3194],
          [0.0605, 0.458, -0.3327],
          [0.0781, 0.4766, -0.3264],
          [0.096, 0.491, -0.3397],
          [0.1142, 0.5096, -0.3334],
          [0.1325, 0.524, -0.3467],
          [0.1512, 0.5426, -0.3405],
          [0.17, 0.557, -0.3538],
          [0.1891, 0.5756, -0.3475],
          [0.2085, 0.5901, -0.3608],
          [0.2281, 0.6087, -0.3545],
          [0.2479, 0.6231, -0.3678],
          [0.2645, 0.6378, -0.3658],
          [0.2721, 0.6477, -0.3679],
          [0.2735, 0.6609, -0.3707],
          [0.268, 0.6708, -0.3728],
          [0.2512, 0.6561, -0.3748],
          [0.2311, 0.6417, -0.3615],
          [0.2113, 0.6231, -0.3678],
          [0.1917, 0.6087, -0.3545],
          [0.1723, 0.5901, -0.3608],
          [0.1532, 0.5756, -0.3475],
          [0.1344, 0.557, -0.3538],
          [0.1158, 0.5426, -0.3405],
          [0.0974, 0.524, -0.3467],
          [0.0792, 0.5096, -0.3334],
          [0.0614, 0.491, -0.3397],
          [0.0437, 0.4766, -0.3264],
          [0.0263, 0.458, -0.3327],
          [0.0091, 0.4435, -0.3194],
          [-0.0078, 0.4249, -0.3257],
          [-0.0244, 0.4105, -0.3124],
          [-0.0409, 0.3919, -0.3187],
          [-0.057, 0.3775, -0.3054],
          [-0.073, 0.3589, -0.3116],
          [-0.0887, 0.3445, -0.2983],
          [-0.1041, 0.3259, -0.3046],
          [-0.1193, 0.3114, -0.2913],
          [-0.1343, 0.2928, -0.2976],
          [-0.149, 0.2784, -0.2843],
          [-0.1635, 0.2598, -0.2906],
          [-0.1777, 0.2454, -0.2773],
          [-0.1917, 0.2268, -0.2836],
          [-0.2055, 0.2124, -0.2703],
          [-0.2177, 0.1964, -0.272],
          [-0.2241, 0.2063, -0.2741],
          [-0.2256, 0.2195, -0.2769],
          [-0.2212, 0.2294, -0.279],
          [-0.2088, 0.2454, -0.2773],
          [-0.1948, 0.2598, -0.2906],
          [-0.1805, 0.2784, -0.2843],
          [-0.1661, 0.2928, -0.2976],
          [-0.1513, 0.3114, -0.2913],
          [-0.1364, 0.3259, -0.3046],
          [-0.1212, 0.3445, -0.2983],
          [-0.1057, 0.3589, -0.3116],
          [-0.09, 0.3775, -0.3054],
          [-0.0741, 0.3919, -0.3187],
          [-0.0579, 0.4105, -0.3124],
          [-0.0415, 0.4249, -0.3257],
          [-0.0248, 0.4435, -0.3194],
          [-0.0079, 0.458, -0.3327],
          [0.0093, 0.4766, -0.3264],
          [0.0267, 0.491, -0.3397],
          [0.0443, 0.5096, -0.3334],
          [0.0622, 0.524, -0.3467],
          [0.0803, 0.5426, -0.3405],
          [0.0987, 0.557, -0.3538],
          [0.1173, 0.5756, -0.3475],
          [0.1362, 0.5901, -0.3608],
          [0.1553, 0.6087, -0.3545],
          [0.1747, 0.6231, -0.3678],
          [0.1943, 0.6417, -0.3615],
          [0.2141, 0.6561, -0.3748],
          [0.2342, 0.6747, -0.3685],
          [0.2545, 0.6892, -0.3818],
          [0.2629, 0.6969, -0.3784],
          [0.2522, 0.7028, -0.3796],
          [0.237, 0.7028, -0.3796],
          [0.2252, 0.6969, -0.3784],
          [0.2169, 0.6892, -0.3818],
          [0.1968, 0.6747, -0.3685],
          [0.177, 0.6561, -0.3748],
          [0.1574, 0.6417, -0.3615],
          [0.138, 0.6231, -0.3678],
          [0.1189, 0.6087, -0.3545],
          [0.1001, 0.5901, -0.3608],
          [0.0815, 0.5756, -0.3475],
          [0.0631, 0.557, -0.3538],
          [0.0449, 0.5426, -0.3405],
          [0.0271, 0.524, -0.3467],
          [0.0094, 0.5096, -0.3334],
          [-0.008, 0.491, -0.3397],
          [-0.0251, 0.4766, -0.3264],
          [-0.0421, 0.458, -0.3327],
          [-0.0587, 0.4435, -0.3194],
          [-0.0752, 0.4249, -0.3257],
          [-0.0913, 0.4105, -0.3124],
          [-0.1073, 0.3919, -0.3187],
          [-0.123, 0.3775, -0.3054],
          [-0.1384, 0.3589, -0.3116],
          [-0.1536, 0.3445, -0.2983],
          [-0.1686, 0.3259, -0.3046],
          [-0.1833, 0.3114, -0.2913],
          [-0.1978, 0.2928, -0.2976],
          [-0.212, 0.2784, -0.2843],
          [-0.2247, 0.2624, -0.286],
          [-0.2313, 0.2723, -0.2881],
          [-0.2328, 0.2856, -0.2909],
          [-0.2282, 0.2955, -0.293],
          [-0.2153, 0.3114, -0.2913],
          [-0.2008, 0.3259, -0.3046],
          [-0.1861, 0.3445, -0.2983],
          [-0.1712, 0.3589, -0.3116],
          [-0.1559, 0.3775, -0.3054],
          [-0.1405, 0.3919, -0.3187],
          [-0.1248, 0.4105, -0.3124],
          [-0.1089, 0.4249, -0.3257],
          [-0.0927, 0.4435, -0.3194],
          [-0.0762, 0.458, -0.3327],
          [-0.0596, 0.4766, -0.3264],
          [-0.0427, 0.491, -0.3397],
          [-0.0255, 0.5096, -0.3334],
          [-0.0081, 0.524, -0.3467],
          [0.0095, 0.5426, -0.3405],
          [0.0274, 0.557, -0.3538],
          [0.0456, 0.5756, -0.3475],
          [0.0639, 0.5901, -0.3608],
          [0.0826, 0.6087, -0.3545],
          [0.1014, 0.6231, -0.3678],
          [0.1205, 0.6417, -0.3615],
          [0.1399, 0.6561, -0.3748],
          [0.1595, 0.6747, -0.3685],
          [0.1793, 0.6892, -0.3818],
          [0.1875, 0.6969, -0.3784],
          [0.1766, 0.7028, -0.3796],
          [0.1615, 0.7028, -0.3796],
          [0.1498, 0.6969, -0.3784],
          [0.1417, 0.6892, -0.3818],
          [0.1221, 0.6747, -0.3685],
          [0.1028, 0.6561, -0.3748],
          [0.0837, 0.6417, -0.3615],
          [0.0648, 0.6231, -0.3678],
          [0.0462, 0.6087, -0.3545],
          [0.0278, 0.5901, -0.3608],
          [0.0097, 0.5756, -0.3475],
          [-0.0082, 0.557, -0.3538],
          [-0.0259, 0.5426, -0.3405],
          [-0.0433, 0.524, -0.3467],
          [-0.0604, 0.5096, -0.3334],
          [-0.0773, 0.491, -0.3397],
          [-0.094, 0.4766, -0.3264],
          [-0.1104, 0.458, -0.3327],
          [-0.1266, 0.4435, -0.3194],
          [-0.1426, 0.4249, -0.3257],
          [-0.1583, 0.4105, -0.3124],
          [-0.1737, 0.3919, -0.3187],
          [-0.1889, 0.3775, -0.3054],
          [-0.2039, 0.3589, -0.3116],
          [-0.2186, 0.3445, -0.2983],
          [-0.2317, 0.3285, -0.3001],
          [-0.2385, 0.3384, -0.3022],
          [-0.2399, 0.3516, -0.305],
          [-0.2352, 0.3615, -0.3071],
          [-0.2219, 0.3775, -0.3054],
          [-0.2069, 0.3919, -0.3187],
          [-0.1917, 0.4105, -0.3124],
          [-0.1763, 0.4249, -0.3257],
          [-0.1606, 0.4435, -0.3194],
          [-0.1446, 0.458, -0.3327],
          [-0.1284, 0.4766, -0.3264],
          [-0.112, 0.491, -0.3397],
          [-0.0953, 0.5096, -0.3334],
          [-0.0784, 0.524, -0.3467],
          [-0.0613, 0.5426, -0.3405],
          [-0.0439, 0.557, -0.3538],
          [-0.0262, 0.5756, -0.3475],
          [-0.0083, 0.5901, -0.3608],
          [0.0098, 0.6087, -0.3545],
          [0.0282, 0.6231, -0.3678],
          [0.0468, 0.6417, -0.3615],
          [0.0657, 0.6561, -0.3748],
          [0.0848, 0.6747, -0.3685],
          [0.1041, 0.6892, -0.3818],
          [0.1121, 0.6969, -0.3784],
          [0.101, 0.7028, -0.3796],
          [0.0859, 0.7028, -0.3796],
          [0.0744, 0.6969, -0.3784],
          [0.0665, 0.6892, -0.3818],
          [0.0474, 0.6747, -0.3685],
          [0.0286, 0.6561, -0.3748],
          [0.0099, 0.6417, -0.3615],
          [-0.0084, 0.6231, -0.3678],
          [-0.0266, 0.6087, -0.3545],
          [-0.0445, 0.5901, -0.3608],
          [-0.0621, 0.5756, -0.3475],
          [-0.0795, 0.557, -0.3538],
          [-0.0967, 0.5426, -0.3405],
          [-0.1136, 0.524, -0.3467],
          [-0.1303, 0.5096, -0.3334],
          [-0.1467, 0.491, -0.3397],
          [-0.1629, 0.4766, -0.3264],
          [-0.1788, 0.458, -0.3327],
          [-0.1945, 0.4435, -0.3194],
          [-0.21, 0.4249, -0.3257],
          [-0.2252, 0.4105, -0.3124],
          [-0.2387, 0.3945, -0.3141],
          [-0.2457, 0.4044, -0.3162],
          [-0.2471, 0.4177, -0.319],
          [-0.2422, 0.4276, -0.3211],
          [-0.2284, 0.4435, -0.3194],
          [-0.213, 0.458, -0.3327],
          [-0.1973, 0.4766, -0.3264],
          [-0.1813, 0.491, -0.3397],
          [-0.1652, 0.5096, -0.3334],
          [-0.1487, 0.524, -0.3467],
          [-0.1321, 0.5426, -0.3405],
          [-0.1152, 0.557, -0.3538],
          [-0.098, 0.5756, -0.3475],
          [-0.0806, 0.5901, -0.3608],
          [-0.0629, 0.6087, -0.3545],
          [-0.0451, 0.6231, -0.3678],
          [-0.0269, 0.6417, -0.3615],
          [-0.0086, 0.6561, -0.3748],
          [0.0101, 0.6747, -0.3685],
          [0.0289, 0.6892, -0.3818],
          [0.0367, 0.6969, -0.3784],
          [0.0255, 0.7028, -0.3796],
          [0.0104, 0.7028, -0.3796],
          [-0.001, 0.6969, -0.3784],
          [-0.0087, 0.6892, -0.3818],
          [-0.0273, 0.6747, -0.3685],
          [-0.0457, 0.6561, -0.3748],
          [-0.0638, 0.6417, -0.3615],
          [-0.0817, 0.6231, -0.3678],
          [-0.0993, 0.6087, -0.3545],
          [-0.1167, 0.5901, -0.3608],
          [-0.1339, 0.5756, -0.3475],
          [-0.1508, 0.557, -0.3538],
          [-0.1675, 0.5426, -0.3405],
          [-0.1839, 0.524, -0.3467],
          [-0.2001, 0.5096, -0.3334],
          [-0.216, 0.491, -0.3397],
          [-0.2317, 0.4766, -0.3264],
          [-0.2457, 0.4606, -0.3281],
          [-0.2528, 0.4705, -0.3302],
          [-0.2543, 0.4837, -0.3331],
          [-0.2492, 0.4936, -0.3352],
          [-0.235, 0.5096, -0.3334],
          [-0.2191, 0.524, -0.3467],
          [-0.2029, 0.5426, -0.3405],
          [-0.1864, 0.557, -0.3538],
          [-0.1698, 0.5756, -0.3475],
          [-0.1529, 0.5901, -0.3608],
          [-0.1357, 0.6087, -0.3545],
          [-0.1183, 0.6231, -0.3678],
          [-0.1007, 0.6417, -0.3615],
          [-0.0828, 0.6561, -0.3748],
          [-0.0646, 0.6747, -0.3685],
          [-0.0463, 0.6892, -0.3818],
          [-0.0387, 0.6969, -0.3784],
          [-0.0501, 0.7028, -0.3796],
          [-0.0652, 0.7028, -0.3796],
          [-0.0764, 0.6969, -0.3784],
          [-0.0839, 0.6892, -0.3818],
          [-0.102, 0.6747, -0.3685],
          [-0.1199, 0.6561, -0.3748],
          [-0.1375, 0.6417, -0.3615],
          [-0.1549, 0.6231, -0.3678],
          [-0.1721, 0.6087, -0.3545],
          [-0.189, 0.5901, -0.3608],
          [-0.2057, 0.5756, -0.3475],
          [-0.2221, 0.557, -0.3538],
          [-0.2383, 0.5426, -0.3405],
          [-0.2527, 0.5266, -0.3422],
          [-0.26, 0.5365, -0.3443],
          [-0.2614, 0.5498, -0.3471],
          [-0.2562, 0.5597, -0.3492],
          [-0.2416, 0.5756, -0.3475],
          [-0.2251, 0.5901, -0.3608],
          [-0.2085, 0.6087, -0.3545],
          [-0.1915, 0.6231, -0.3678],
          [-0.1744, 0.6417, -0.3615],
          [-0.157, 0.6561, -0.3748],
          [-0.1393, 0.6747, -0.3685],
          [-0.1214, 0.6892, -0.3818],
          [-0.1141, 0.6969, -0.3784],
          [-0.1257, 0.7028, -0.3796],
          [-0.1408, 0.7028, -0.3796],
          [-0.1518, 0.6969, -0.3784],
          [-0.159, 0.6892, -0.3818],
          [-0.1767, 0.6747, -0.3685],
          [-0.1941, 0.6561, -0.3748],
          [-0.2113, 0.6417, -0.3615],
          [-0.2282, 0.6231, -0.3678],
          [-0.2448, 0.6087, -0.3545],
          [-0.2597, 0.5927, -0.3562],
          [-0.2672, 0.6026, -0.3583],
          [-0.2686, 0.6158, -0.3611],
          [-0.2632, 0.6257, -0.3632],
          [-0.2481, 0.6417, -0.3615],
          [-0.2312, 0.6561, -0.3748],
          [-0.214, 0.6747, -0.3685],
          [-0.1966, 0.6892, -0.3818],
          [-0.1895, 0.6969, -0.3784],
          [-0.2012, 0.7028, -0.3796],
          [-0.2163, 0.7028, -0.3796],
          [-0.2271, 0.6969, -0.3784],
          [-0.2342, 0.6892, -0.3818],
          [-0.2514, 0.6747, -0.3685],
          [-0.2667, 0.6587, -0.3703],
          [-0.2743, 0.6686, -0.3724],
          [-0.2758, 0.6819, -0.3752],
          [-0.2702, 0.6918, -0.3773],
          [-0.2648, 0.6969, -0.3784],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2153, -0.095, -0.2706],
        localEnd: [-0.2683, 0.41, -0.378],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.024,
        angleDeg: -45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.005,
        panelSize: { width: 0.4836, height: 0.519 },
        approximation:
          "reference motif is stacked chevron loops; modelled as a denser diamond lattice",
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.5,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.12],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r1c1.png"],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-rear-b",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_rear_b_27.userData.actionProfile = {
    animationRole: "weave-panel",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "weave",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0, -0.12],
    },
  };
  (nodes["root"] ?? root).add(node_weave_rear_b_27);
  nodes["weave-rear-b"] = node_weave_rear_b_27;
  const mesh_weave_rear_b_27Geometry = endpoint_weave_rear_b_27
    ? new THREE.CylinderGeometry(
        endpoint_weave_rear_b_27.endRadius,
        endpoint_weave_rear_b_27.baseRadius,
        endpoint_weave_rear_b_27.length,
        16,
        6,
      )
    : buildTubeGeometry({
        points: [
          [0.219, 0.2085, -0.2746],
          [0.205, 0.1938, -0.2765],
          [0.1982, 0.1881, -0.2702],
          [0.1886, 0.1822, -0.269],
          [0.1765, 0.1822, -0.269],
          [0.168, 0.1881, -0.2702],
          [0.1747, 0.1938, -0.2765],
          [0.1914, 0.2124, -0.2703],
          [0.2083, 0.2268, -0.2836],
          [0.2225, 0.2415, -0.2816],
          [0.229, 0.2514, -0.2837],
          [0.2305, 0.2646, -0.2865],
          [0.226, 0.2745, -0.2886],
          [0.2116, 0.2598, -0.2906],
          [0.1945, 0.2454, -0.2773],
          [0.1776, 0.2268, -0.2836],
          [0.1609, 0.2124, -0.2703],
          [0.1445, 0.1938, -0.2765],
          [0.1378, 0.1881, -0.2702],
          [0.1284, 0.1822, -0.269],
          [0.1163, 0.1822, -0.269],
          [0.1076, 0.1881, -0.2702],
          [0.1142, 0.1938, -0.2765],
          [0.1304, 0.2124, -0.2703],
          [0.1468, 0.2268, -0.2836],
          [0.1634, 0.2454, -0.2773],
          [0.1804, 0.2598, -0.2906],
          [0.1975, 0.2784, -0.2843],
          [0.2149, 0.2928, -0.2976],
          [0.2295, 0.3075, -0.2956],
          [0.2362, 0.3174, -0.2977],
          [0.2376, 0.3307, -0.3005],
          [0.233, 0.3406, -0.3026],
          [0.2182, 0.3259, -0.3046],
          [0.2006, 0.3114, -0.2913],
          [0.1832, 0.2928, -0.2976],
          [0.166, 0.2784, -0.2843],
          [0.1491, 0.2598, -0.2906],
          [0.1324, 0.2454, -0.2773],
          [0.116, 0.2268, -0.2836],
          [0.0998, 0.2124, -0.2703],
          [0.0839, 0.1938, -0.2765],
          [0.0774, 0.1881, -0.2702],
          [0.0682, 0.1822, -0.269],
          [0.0561, 0.1822, -0.269],
          [0.0472, 0.1881, -0.2702],
          [0.0536, 0.1938, -0.2765],
          [0.0693, 0.2124, -0.2703],
          [0.0852, 0.2268, -0.2836],
          [0.1014, 0.2454, -0.2773],
          [0.1178, 0.2598, -0.2906],
          [0.1345, 0.2784, -0.2843],
          [0.1514, 0.2928, -0.2976],
          [0.1686, 0.3114, -0.2913],
          [0.186, 0.3259, -0.3046],
          [0.2036, 0.3445, -0.2983],
          [0.2215, 0.3589, -0.3116],
          [0.2365, 0.3736, -0.3097],
          [0.2434, 0.3835, -0.3118],
          [0.2448, 0.3967, -0.3146],
          [0.24, 0.4066, -0.3167],
          [0.2248, 0.3919, -0.3187],
          [0.2067, 0.3775, -0.3054],
          [0.1888, 0.3589, -0.3116],
          [0.1712, 0.3445, -0.2983],
          [0.1538, 0.3259, -0.3046],
          [0.1366, 0.3114, -0.2913],
          [0.1197, 0.2928, -0.2976],
          [0.103, 0.2784, -0.2843],
          [0.0866, 0.2598, -0.2906],
          [0.0704, 0.2454, -0.2773],
          [0.0545, 0.2268, -0.2836],
          [0.0388, 0.2124, -0.2703],
          [0.0233, 0.1938, -0.2765],
          [0.0171, 0.1881, -0.2702],
          [0.008, 0.1822, -0.269],
          [-0.0041, 0.1822, -0.269],
          [-0.0131, 0.1881, -0.2702],
          [-0.007, 0.1938, -0.2765],
          [0.0082, 0.2124, -0.2703],
          [0.0237, 0.2268, -0.2836],
          [0.0394, 0.2454, -0.2773],
          [0.0553, 0.2598, -0.2906],
          [0.0715, 0.2784, -0.2843],
          [0.0879, 0.2928, -0.2976],
          [0.1046, 0.3114, -0.2913],
          [0.1215, 0.3259, -0.3046],
          [0.1387, 0.3445, -0.2983],
          [0.1561, 0.3589, -0.3116],
          [0.1737, 0.3775, -0.3054],
          [0.1916, 0.3919, -0.3187],
          [0.2097, 0.4105, -0.3124],
          [0.2281, 0.4249, -0.3257],
          [0.2435, 0.4396, -0.3237],
          [0.2506, 0.4495, -0.3258],
          [0.252, 0.4628, -0.3286],
          [0.247, 0.4727, -0.3307],
          [0.2314, 0.458, -0.3327],
          [0.2128, 0.4435, -0.3194],
          [0.1944, 0.4249, -0.3257],
          [0.1763, 0.4105, -0.3124],
          [0.1584, 0.3919, -0.3187],
          [0.1408, 0.3775, -0.3054],
          [0.1234, 0.3589, -0.3116],
          [0.1062, 0.3445, -0.2983],
          [0.0893, 0.3259, -0.3046],
          [0.0726, 0.3114, -0.2913],
          [0.0562, 0.2928, -0.2976],
          [0.04, 0.2784, -0.2843],
          [0.0241, 0.2598, -0.2906],
          [0.0084, 0.2454, -0.2773],
          [-0.0071, 0.2268, -0.2836],
          [-0.0223, 0.2124, -0.2703],
          [-0.0373, 0.1938, -0.2765],
          [-0.0433, 0.1881, -0.2702],
          [-0.0522, 0.1822, -0.269],
          [-0.0643, 0.1822, -0.269],
          [-0.0735, 0.1881, -0.2702],
          [-0.0676, 0.1938, -0.2765],
          [-0.0528, 0.2124, -0.2703],
          [-0.0379, 0.2268, -0.2836],
          [-0.0227, 0.2454, -0.2773],
          [-0.0072, 0.2598, -0.2906],
          [0.0085, 0.2784, -0.2843],
          [0.0244, 0.2928, -0.2976],
          [0.0406, 0.3114, -0.2913],
          [0.057, 0.3259, -0.3046],
          [0.0737, 0.3445, -0.2983],
          [0.0906, 0.3589, -0.3116],
          [0.1078, 0.3775, -0.3054],
          [0.1252, 0.3919, -0.3187],
          [0.1428, 0.4105, -0.3124],
          [0.1607, 0.4249, -0.3257],
          [0.1789, 0.4435, -0.3194],
          [0.1972, 0.458, -0.3327],
          [0.2159, 0.4766, -0.3264],
          [0.2347, 0.491, -0.3397],
          [0.2505, 0.5057, -0.3377],
          [0.2577, 0.5156, -0.3398],
          [0.2592, 0.5288, -0.3426],
          [0.254, 0.5387, -0.3447],
          [0.238, 0.524, -0.3467],
          [0.2189, 0.5096, -0.3334],
          [0.2, 0.491, -0.3397],
          [0.1814, 0.4766, -0.3264],
          [0.163, 0.458, -0.3327],
          [0.1449, 0.4435, -0.3194],
          [0.127, 0.4249, -0.3257],
          [0.1094, 0.4105, -0.3124],
          [0.092, 0.3919, -0.3187],
          [0.0748, 0.3775, -0.3054],
          [0.0579, 0.3589, -0.3116],
          [0.0412, 0.3445, -0.2983],
          [0.0248, 0.3259, -0.3046],
          [0.0086, 0.3114, -0.2913],
          [-0.0073, 0.2928, -0.2976],
          [-0.023, 0.2784, -0.2843],
          [-0.0385, 0.2598, -0.2906],
          [-0.0537, 0.2454, -0.2773],
          [-0.0686, 0.2268, -0.2836],
          [-0.0834, 0.2124, -0.2703],
          [-0.0978, 0.1938, -0.2765],
          [-0.1037, 0.1881, -0.2702],
          [-0.1124, 0.1822, -0.269],
          [-0.1245, 0.1822, -0.269],
          [-0.1339, 0.1881, -0.2702],
          [-0.1281, 0.1938, -0.2765],
          [-0.1139, 0.2124, -0.2703],
          [-0.0994, 0.2268, -0.2836],
          [-0.0847, 0.2454, -0.2773],
          [-0.0697, 0.2598, -0.2906],
          [-0.0545, 0.2784, -0.2843],
          [-0.0391, 0.2928, -0.2976],
          [-0.0234, 0.3114, -0.2913],
          [-0.0074, 0.3259, -0.3046],
          [0.0088, 0.3445, -0.2983],
          [0.0252, 0.3589, -0.3116],
          [0.0419, 0.3775, -0.3054],
          [0.0588, 0.3919, -0.3187],
          [0.0759, 0.4105, -0.3124],
          [0.0933, 0.4249, -0.3257],
          [0.111, 0.4435, -0.3194],
          [0.1289, 0.458, -0.3327],
          [0.147, 0.4766, -0.3264],
          [0.1654, 0.491, -0.3397],
          [0.184, 0.5096, -0.3334],
          [0.2029, 0.524, -0.3467],
          [0.222, 0.5426, -0.3405],
          [0.2413, 0.557, -0.3538],
          [0.2575, 0.5717, -0.3518],
          [0.2649, 0.5816, -0.3539],
          [0.2663, 0.5949, -0.3567],
          [0.261, 0.6048, -0.3588],
          [0.2446, 0.5901, -0.3608],
          [0.225, 0.5756, -0.3475],
          [0.2057, 0.557, -0.3538],
          [0.1866, 0.5426, -0.3405],
          [0.1677, 0.524, -0.3467],
          [0.1491, 0.5096, -0.3334],
          [0.1307, 0.491, -0.3397],
          [0.1126, 0.4766, -0.3264],
          [0.0947, 0.458, -0.3327],
          [0.077, 0.4435, -0.3194],
          [0.0596, 0.4249, -0.3257],
          [0.0425, 0.4105, -0.3124],
          [0.0256, 0.3919, -0.3187],
          [0.0089, 0.3775, -0.3054],
          [-0.0075, 0.3589, -0.3116],
          [-0.0237, 0.3445, -0.2983],
          [-0.0397, 0.3259, -0.3046],
          [-0.0554, 0.3114, -0.2913],
          [-0.0708, 0.2928, -0.2976],
          [-0.086, 0.2784, -0.2843],
          [-0.101, 0.2598, -0.2906],
          [-0.1157, 0.2454, -0.2773],
          [-0.1302, 0.2268, -0.2836],
          [-0.1444, 0.2124, -0.2703],
          [-0.1584, 0.1938, -0.2765],
          [-0.1641, 0.1881, -0.2702],
          [-0.1726, 0.1822, -0.269],
          [-0.1847, 0.1822, -0.269],
          [-0.1943, 0.1881, -0.2702],
          [-0.1887, 0.1938, -0.2765],
          [-0.175, 0.2124, -0.2703],
          [-0.161, 0.2268, -0.2836],
          [-0.1467, 0.2454, -0.2773],
          [-0.1322, 0.2598, -0.2906],
          [-0.1175, 0.2784, -0.2843],
          [-0.1026, 0.2928, -0.2976],
          [-0.0874, 0.3114, -0.2913],
          [-0.0719, 0.3259, -0.3046],
          [-0.0562, 0.3445, -0.2983],
          [-0.0403, 0.3589, -0.3116],
          [-0.0241, 0.3775, -0.3054],
          [-0.0077, 0.3919, -0.3187],
          [0.009, 0.4105, -0.3124],
          [0.0259, 0.4249, -0.3257],
          [0.0431, 0.4435, -0.3194],
          [0.0605, 0.458, -0.3327],
          [0.0781, 0.4766, -0.3264],
          [0.096, 0.491, -0.3397],
          [0.1142, 0.5096, -0.3334],
          [0.1325, 0.524, -0.3467],
          [0.1512, 0.5426, -0.3405],
          [0.17, 0.557, -0.3538],
          [0.1891, 0.5756, -0.3475],
          [0.2085, 0.5901, -0.3608],
          [0.2281, 0.6087, -0.3545],
          [0.2479, 0.6231, -0.3678],
          [0.2645, 0.6378, -0.3658],
          [0.2721, 0.6477, -0.3679],
          [0.2735, 0.6609, -0.3707],
          [0.268, 0.6708, -0.3728],
          [0.2512, 0.6561, -0.3748],
          [0.2311, 0.6417, -0.3615],
          [0.2113, 0.6231, -0.3678],
          [0.1917, 0.6087, -0.3545],
          [0.1723, 0.5901, -0.3608],
          [0.1532, 0.5756, -0.3475],
          [0.1344, 0.557, -0.3538],
          [0.1158, 0.5426, -0.3405],
          [0.0974, 0.524, -0.3467],
          [0.0792, 0.5096, -0.3334],
          [0.0614, 0.491, -0.3397],
          [0.0437, 0.4766, -0.3264],
          [0.0263, 0.458, -0.3327],
          [0.0091, 0.4435, -0.3194],
          [-0.0078, 0.4249, -0.3257],
          [-0.0244, 0.4105, -0.3124],
          [-0.0409, 0.3919, -0.3187],
          [-0.057, 0.3775, -0.3054],
          [-0.073, 0.3589, -0.3116],
          [-0.0887, 0.3445, -0.2983],
          [-0.1041, 0.3259, -0.3046],
          [-0.1193, 0.3114, -0.2913],
          [-0.1343, 0.2928, -0.2976],
          [-0.149, 0.2784, -0.2843],
          [-0.1635, 0.2598, -0.2906],
          [-0.1777, 0.2454, -0.2773],
          [-0.1917, 0.2268, -0.2836],
          [-0.2055, 0.2124, -0.2703],
          [-0.2177, 0.1964, -0.272],
          [-0.2241, 0.2063, -0.2741],
          [-0.2256, 0.2195, -0.2769],
          [-0.2212, 0.2294, -0.279],
          [-0.2088, 0.2454, -0.2773],
          [-0.1948, 0.2598, -0.2906],
          [-0.1805, 0.2784, -0.2843],
          [-0.1661, 0.2928, -0.2976],
          [-0.1513, 0.3114, -0.2913],
          [-0.1364, 0.3259, -0.3046],
          [-0.1212, 0.3445, -0.2983],
          [-0.1057, 0.3589, -0.3116],
          [-0.09, 0.3775, -0.3054],
          [-0.0741, 0.3919, -0.3187],
          [-0.0579, 0.4105, -0.3124],
          [-0.0415, 0.4249, -0.3257],
          [-0.0248, 0.4435, -0.3194],
          [-0.0079, 0.458, -0.3327],
          [0.0093, 0.4766, -0.3264],
          [0.0267, 0.491, -0.3397],
          [0.0443, 0.5096, -0.3334],
          [0.0622, 0.524, -0.3467],
          [0.0803, 0.5426, -0.3405],
          [0.0987, 0.557, -0.3538],
          [0.1173, 0.5756, -0.3475],
          [0.1362, 0.5901, -0.3608],
          [0.1553, 0.6087, -0.3545],
          [0.1747, 0.6231, -0.3678],
          [0.1943, 0.6417, -0.3615],
          [0.2141, 0.6561, -0.3748],
          [0.2342, 0.6747, -0.3685],
          [0.2545, 0.6892, -0.3818],
          [0.2629, 0.6969, -0.3784],
          [0.2522, 0.7028, -0.3796],
          [0.237, 0.7028, -0.3796],
          [0.2252, 0.6969, -0.3784],
          [0.2169, 0.6892, -0.3818],
          [0.1968, 0.6747, -0.3685],
          [0.177, 0.6561, -0.3748],
          [0.1574, 0.6417, -0.3615],
          [0.138, 0.6231, -0.3678],
          [0.1189, 0.6087, -0.3545],
          [0.1001, 0.5901, -0.3608],
          [0.0815, 0.5756, -0.3475],
          [0.0631, 0.557, -0.3538],
          [0.0449, 0.5426, -0.3405],
          [0.0271, 0.524, -0.3467],
          [0.0094, 0.5096, -0.3334],
          [-0.008, 0.491, -0.3397],
          [-0.0251, 0.4766, -0.3264],
          [-0.0421, 0.458, -0.3327],
          [-0.0587, 0.4435, -0.3194],
          [-0.0752, 0.4249, -0.3257],
          [-0.0913, 0.4105, -0.3124],
          [-0.1073, 0.3919, -0.3187],
          [-0.123, 0.3775, -0.3054],
          [-0.1384, 0.3589, -0.3116],
          [-0.1536, 0.3445, -0.2983],
          [-0.1686, 0.3259, -0.3046],
          [-0.1833, 0.3114, -0.2913],
          [-0.1978, 0.2928, -0.2976],
          [-0.212, 0.2784, -0.2843],
          [-0.2247, 0.2624, -0.286],
          [-0.2313, 0.2723, -0.2881],
          [-0.2328, 0.2856, -0.2909],
          [-0.2282, 0.2955, -0.293],
          [-0.2153, 0.3114, -0.2913],
          [-0.2008, 0.3259, -0.3046],
          [-0.1861, 0.3445, -0.2983],
          [-0.1712, 0.3589, -0.3116],
          [-0.1559, 0.3775, -0.3054],
          [-0.1405, 0.3919, -0.3187],
          [-0.1248, 0.4105, -0.3124],
          [-0.1089, 0.4249, -0.3257],
          [-0.0927, 0.4435, -0.3194],
          [-0.0762, 0.458, -0.3327],
          [-0.0596, 0.4766, -0.3264],
          [-0.0427, 0.491, -0.3397],
          [-0.0255, 0.5096, -0.3334],
          [-0.0081, 0.524, -0.3467],
          [0.0095, 0.5426, -0.3405],
          [0.0274, 0.557, -0.3538],
          [0.0456, 0.5756, -0.3475],
          [0.0639, 0.5901, -0.3608],
          [0.0826, 0.6087, -0.3545],
          [0.1014, 0.6231, -0.3678],
          [0.1205, 0.6417, -0.3615],
          [0.1399, 0.6561, -0.3748],
          [0.1595, 0.6747, -0.3685],
          [0.1793, 0.6892, -0.3818],
          [0.1875, 0.6969, -0.3784],
          [0.1766, 0.7028, -0.3796],
          [0.1615, 0.7028, -0.3796],
          [0.1498, 0.6969, -0.3784],
          [0.1417, 0.6892, -0.3818],
          [0.1221, 0.6747, -0.3685],
          [0.1028, 0.6561, -0.3748],
          [0.0837, 0.6417, -0.3615],
          [0.0648, 0.6231, -0.3678],
          [0.0462, 0.6087, -0.3545],
          [0.0278, 0.5901, -0.3608],
          [0.0097, 0.5756, -0.3475],
          [-0.0082, 0.557, -0.3538],
          [-0.0259, 0.5426, -0.3405],
          [-0.0433, 0.524, -0.3467],
          [-0.0604, 0.5096, -0.3334],
          [-0.0773, 0.491, -0.3397],
          [-0.094, 0.4766, -0.3264],
          [-0.1104, 0.458, -0.3327],
          [-0.1266, 0.4435, -0.3194],
          [-0.1426, 0.4249, -0.3257],
          [-0.1583, 0.4105, -0.3124],
          [-0.1737, 0.3919, -0.3187],
          [-0.1889, 0.3775, -0.3054],
          [-0.2039, 0.3589, -0.3116],
          [-0.2186, 0.3445, -0.2983],
          [-0.2317, 0.3285, -0.3001],
          [-0.2385, 0.3384, -0.3022],
          [-0.2399, 0.3516, -0.305],
          [-0.2352, 0.3615, -0.3071],
          [-0.2219, 0.3775, -0.3054],
          [-0.2069, 0.3919, -0.3187],
          [-0.1917, 0.4105, -0.3124],
          [-0.1763, 0.4249, -0.3257],
          [-0.1606, 0.4435, -0.3194],
          [-0.1446, 0.458, -0.3327],
          [-0.1284, 0.4766, -0.3264],
          [-0.112, 0.491, -0.3397],
          [-0.0953, 0.5096, -0.3334],
          [-0.0784, 0.524, -0.3467],
          [-0.0613, 0.5426, -0.3405],
          [-0.0439, 0.557, -0.3538],
          [-0.0262, 0.5756, -0.3475],
          [-0.0083, 0.5901, -0.3608],
          [0.0098, 0.6087, -0.3545],
          [0.0282, 0.6231, -0.3678],
          [0.0468, 0.6417, -0.3615],
          [0.0657, 0.6561, -0.3748],
          [0.0848, 0.6747, -0.3685],
          [0.1041, 0.6892, -0.3818],
          [0.1121, 0.6969, -0.3784],
          [0.101, 0.7028, -0.3796],
          [0.0859, 0.7028, -0.3796],
          [0.0744, 0.6969, -0.3784],
          [0.0665, 0.6892, -0.3818],
          [0.0474, 0.6747, -0.3685],
          [0.0286, 0.6561, -0.3748],
          [0.0099, 0.6417, -0.3615],
          [-0.0084, 0.6231, -0.3678],
          [-0.0266, 0.6087, -0.3545],
          [-0.0445, 0.5901, -0.3608],
          [-0.0621, 0.5756, -0.3475],
          [-0.0795, 0.557, -0.3538],
          [-0.0967, 0.5426, -0.3405],
          [-0.1136, 0.524, -0.3467],
          [-0.1303, 0.5096, -0.3334],
          [-0.1467, 0.491, -0.3397],
          [-0.1629, 0.4766, -0.3264],
          [-0.1788, 0.458, -0.3327],
          [-0.1945, 0.4435, -0.3194],
          [-0.21, 0.4249, -0.3257],
          [-0.2252, 0.4105, -0.3124],
          [-0.2387, 0.3945, -0.3141],
          [-0.2457, 0.4044, -0.3162],
          [-0.2471, 0.4177, -0.319],
          [-0.2422, 0.4276, -0.3211],
          [-0.2284, 0.4435, -0.3194],
          [-0.213, 0.458, -0.3327],
          [-0.1973, 0.4766, -0.3264],
          [-0.1813, 0.491, -0.3397],
          [-0.1652, 0.5096, -0.3334],
          [-0.1487, 0.524, -0.3467],
          [-0.1321, 0.5426, -0.3405],
          [-0.1152, 0.557, -0.3538],
          [-0.098, 0.5756, -0.3475],
          [-0.0806, 0.5901, -0.3608],
          [-0.0629, 0.6087, -0.3545],
          [-0.0451, 0.6231, -0.3678],
          [-0.0269, 0.6417, -0.3615],
          [-0.0086, 0.6561, -0.3748],
          [0.0101, 0.6747, -0.3685],
          [0.0289, 0.6892, -0.3818],
          [0.0367, 0.6969, -0.3784],
          [0.0255, 0.7028, -0.3796],
          [0.0104, 0.7028, -0.3796],
          [-0.001, 0.6969, -0.3784],
          [-0.0087, 0.6892, -0.3818],
          [-0.0273, 0.6747, -0.3685],
          [-0.0457, 0.6561, -0.3748],
          [-0.0638, 0.6417, -0.3615],
          [-0.0817, 0.6231, -0.3678],
          [-0.0993, 0.6087, -0.3545],
          [-0.1167, 0.5901, -0.3608],
          [-0.1339, 0.5756, -0.3475],
          [-0.1508, 0.557, -0.3538],
          [-0.1675, 0.5426, -0.3405],
          [-0.1839, 0.524, -0.3467],
          [-0.2001, 0.5096, -0.3334],
          [-0.216, 0.491, -0.3397],
          [-0.2317, 0.4766, -0.3264],
          [-0.2457, 0.4606, -0.3281],
          [-0.2528, 0.4705, -0.3302],
          [-0.2543, 0.4837, -0.3331],
          [-0.2492, 0.4936, -0.3352],
          [-0.235, 0.5096, -0.3334],
          [-0.2191, 0.524, -0.3467],
          [-0.2029, 0.5426, -0.3405],
          [-0.1864, 0.557, -0.3538],
          [-0.1698, 0.5756, -0.3475],
          [-0.1529, 0.5901, -0.3608],
          [-0.1357, 0.6087, -0.3545],
          [-0.1183, 0.6231, -0.3678],
          [-0.1007, 0.6417, -0.3615],
          [-0.0828, 0.6561, -0.3748],
          [-0.0646, 0.6747, -0.3685],
          [-0.0463, 0.6892, -0.3818],
          [-0.0387, 0.6969, -0.3784],
          [-0.0501, 0.7028, -0.3796],
          [-0.0652, 0.7028, -0.3796],
          [-0.0764, 0.6969, -0.3784],
          [-0.0839, 0.6892, -0.3818],
          [-0.102, 0.6747, -0.3685],
          [-0.1199, 0.6561, -0.3748],
          [-0.1375, 0.6417, -0.3615],
          [-0.1549, 0.6231, -0.3678],
          [-0.1721, 0.6087, -0.3545],
          [-0.189, 0.5901, -0.3608],
          [-0.2057, 0.5756, -0.3475],
          [-0.2221, 0.557, -0.3538],
          [-0.2383, 0.5426, -0.3405],
          [-0.2527, 0.5266, -0.3422],
          [-0.26, 0.5365, -0.3443],
          [-0.2614, 0.5498, -0.3471],
          [-0.2562, 0.5597, -0.3492],
          [-0.2416, 0.5756, -0.3475],
          [-0.2251, 0.5901, -0.3608],
          [-0.2085, 0.6087, -0.3545],
          [-0.1915, 0.6231, -0.3678],
          [-0.1744, 0.6417, -0.3615],
          [-0.157, 0.6561, -0.3748],
          [-0.1393, 0.6747, -0.3685],
          [-0.1214, 0.6892, -0.3818],
          [-0.1141, 0.6969, -0.3784],
          [-0.1257, 0.7028, -0.3796],
          [-0.1408, 0.7028, -0.3796],
          [-0.1518, 0.6969, -0.3784],
          [-0.159, 0.6892, -0.3818],
          [-0.1767, 0.6747, -0.3685],
          [-0.1941, 0.6561, -0.3748],
          [-0.2113, 0.6417, -0.3615],
          [-0.2282, 0.6231, -0.3678],
          [-0.2448, 0.6087, -0.3545],
          [-0.2597, 0.5927, -0.3562],
          [-0.2672, 0.6026, -0.3583],
          [-0.2686, 0.6158, -0.3611],
          [-0.2632, 0.6257, -0.3632],
          [-0.2481, 0.6417, -0.3615],
          [-0.2312, 0.6561, -0.3748],
          [-0.214, 0.6747, -0.3685],
          [-0.1966, 0.6892, -0.3818],
          [-0.1895, 0.6969, -0.3784],
          [-0.2012, 0.7028, -0.3796],
          [-0.2163, 0.7028, -0.3796],
          [-0.2271, 0.6969, -0.3784],
          [-0.2342, 0.6892, -0.3818],
          [-0.2514, 0.6747, -0.3685],
          [-0.2667, 0.6587, -0.3703],
          [-0.2743, 0.6686, -0.3724],
          [-0.2758, 0.6819, -0.3752],
          [-0.2702, 0.6918, -0.3773],
          [-0.2648, 0.6969, -0.3784],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      });
  if (!endpoint_weave_rear_b_27) {
    mesh_weave_rear_b_27Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_weave_rear_b_27 = new THREE.Mesh(
    mesh_weave_rear_b_27Geometry,
    materialMap["rope-braided"] ??
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh_weave_rear_b_27.name = "Rear rope lattice (-45 deg run)";
  if (endpoint_weave_rear_b_27) {
    mesh_weave_rear_b_27.position.copy(endpoint_weave_rear_b_27.midpoint);
    mesh_weave_rear_b_27.quaternion.copy(endpoint_weave_rear_b_27.quaternion);
  }
  mesh_weave_rear_b_27.castShadow = options.castShadow ?? true;
  mesh_weave_rear_b_27.receiveShadow = options.receiveShadow ?? true;
  mesh_weave_rear_b_27.userData.sculptComponent = {
    id: "weave-rear-b",
    name: "Rear rope lattice (-45 deg run)",
    level: "meso",
    role: "weave-panel",
    importance: 0.75,
    confidence: 0.5,
    primitive: "tube",
    topologyClass: "fiber-strand",
    topologyRationale:
      "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
    geometryDescriptor: {
      topologyIntent:
        "Dense continuous constant-radius rope run across the reclined rear frame; approximates the chevron loop motif with a tighter interlaced lattice.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      tubePath: {
        points: [
          [0.219, 0.2085, -0.2746],
          [0.205, 0.1938, -0.2765],
          [0.1982, 0.1881, -0.2702],
          [0.1886, 0.1822, -0.269],
          [0.1765, 0.1822, -0.269],
          [0.168, 0.1881, -0.2702],
          [0.1747, 0.1938, -0.2765],
          [0.1914, 0.2124, -0.2703],
          [0.2083, 0.2268, -0.2836],
          [0.2225, 0.2415, -0.2816],
          [0.229, 0.2514, -0.2837],
          [0.2305, 0.2646, -0.2865],
          [0.226, 0.2745, -0.2886],
          [0.2116, 0.2598, -0.2906],
          [0.1945, 0.2454, -0.2773],
          [0.1776, 0.2268, -0.2836],
          [0.1609, 0.2124, -0.2703],
          [0.1445, 0.1938, -0.2765],
          [0.1378, 0.1881, -0.2702],
          [0.1284, 0.1822, -0.269],
          [0.1163, 0.1822, -0.269],
          [0.1076, 0.1881, -0.2702],
          [0.1142, 0.1938, -0.2765],
          [0.1304, 0.2124, -0.2703],
          [0.1468, 0.2268, -0.2836],
          [0.1634, 0.2454, -0.2773],
          [0.1804, 0.2598, -0.2906],
          [0.1975, 0.2784, -0.2843],
          [0.2149, 0.2928, -0.2976],
          [0.2295, 0.3075, -0.2956],
          [0.2362, 0.3174, -0.2977],
          [0.2376, 0.3307, -0.3005],
          [0.233, 0.3406, -0.3026],
          [0.2182, 0.3259, -0.3046],
          [0.2006, 0.3114, -0.2913],
          [0.1832, 0.2928, -0.2976],
          [0.166, 0.2784, -0.2843],
          [0.1491, 0.2598, -0.2906],
          [0.1324, 0.2454, -0.2773],
          [0.116, 0.2268, -0.2836],
          [0.0998, 0.2124, -0.2703],
          [0.0839, 0.1938, -0.2765],
          [0.0774, 0.1881, -0.2702],
          [0.0682, 0.1822, -0.269],
          [0.0561, 0.1822, -0.269],
          [0.0472, 0.1881, -0.2702],
          [0.0536, 0.1938, -0.2765],
          [0.0693, 0.2124, -0.2703],
          [0.0852, 0.2268, -0.2836],
          [0.1014, 0.2454, -0.2773],
          [0.1178, 0.2598, -0.2906],
          [0.1345, 0.2784, -0.2843],
          [0.1514, 0.2928, -0.2976],
          [0.1686, 0.3114, -0.2913],
          [0.186, 0.3259, -0.3046],
          [0.2036, 0.3445, -0.2983],
          [0.2215, 0.3589, -0.3116],
          [0.2365, 0.3736, -0.3097],
          [0.2434, 0.3835, -0.3118],
          [0.2448, 0.3967, -0.3146],
          [0.24, 0.4066, -0.3167],
          [0.2248, 0.3919, -0.3187],
          [0.2067, 0.3775, -0.3054],
          [0.1888, 0.3589, -0.3116],
          [0.1712, 0.3445, -0.2983],
          [0.1538, 0.3259, -0.3046],
          [0.1366, 0.3114, -0.2913],
          [0.1197, 0.2928, -0.2976],
          [0.103, 0.2784, -0.2843],
          [0.0866, 0.2598, -0.2906],
          [0.0704, 0.2454, -0.2773],
          [0.0545, 0.2268, -0.2836],
          [0.0388, 0.2124, -0.2703],
          [0.0233, 0.1938, -0.2765],
          [0.0171, 0.1881, -0.2702],
          [0.008, 0.1822, -0.269],
          [-0.0041, 0.1822, -0.269],
          [-0.0131, 0.1881, -0.2702],
          [-0.007, 0.1938, -0.2765],
          [0.0082, 0.2124, -0.2703],
          [0.0237, 0.2268, -0.2836],
          [0.0394, 0.2454, -0.2773],
          [0.0553, 0.2598, -0.2906],
          [0.0715, 0.2784, -0.2843],
          [0.0879, 0.2928, -0.2976],
          [0.1046, 0.3114, -0.2913],
          [0.1215, 0.3259, -0.3046],
          [0.1387, 0.3445, -0.2983],
          [0.1561, 0.3589, -0.3116],
          [0.1737, 0.3775, -0.3054],
          [0.1916, 0.3919, -0.3187],
          [0.2097, 0.4105, -0.3124],
          [0.2281, 0.4249, -0.3257],
          [0.2435, 0.4396, -0.3237],
          [0.2506, 0.4495, -0.3258],
          [0.252, 0.4628, -0.3286],
          [0.247, 0.4727, -0.3307],
          [0.2314, 0.458, -0.3327],
          [0.2128, 0.4435, -0.3194],
          [0.1944, 0.4249, -0.3257],
          [0.1763, 0.4105, -0.3124],
          [0.1584, 0.3919, -0.3187],
          [0.1408, 0.3775, -0.3054],
          [0.1234, 0.3589, -0.3116],
          [0.1062, 0.3445, -0.2983],
          [0.0893, 0.3259, -0.3046],
          [0.0726, 0.3114, -0.2913],
          [0.0562, 0.2928, -0.2976],
          [0.04, 0.2784, -0.2843],
          [0.0241, 0.2598, -0.2906],
          [0.0084, 0.2454, -0.2773],
          [-0.0071, 0.2268, -0.2836],
          [-0.0223, 0.2124, -0.2703],
          [-0.0373, 0.1938, -0.2765],
          [-0.0433, 0.1881, -0.2702],
          [-0.0522, 0.1822, -0.269],
          [-0.0643, 0.1822, -0.269],
          [-0.0735, 0.1881, -0.2702],
          [-0.0676, 0.1938, -0.2765],
          [-0.0528, 0.2124, -0.2703],
          [-0.0379, 0.2268, -0.2836],
          [-0.0227, 0.2454, -0.2773],
          [-0.0072, 0.2598, -0.2906],
          [0.0085, 0.2784, -0.2843],
          [0.0244, 0.2928, -0.2976],
          [0.0406, 0.3114, -0.2913],
          [0.057, 0.3259, -0.3046],
          [0.0737, 0.3445, -0.2983],
          [0.0906, 0.3589, -0.3116],
          [0.1078, 0.3775, -0.3054],
          [0.1252, 0.3919, -0.3187],
          [0.1428, 0.4105, -0.3124],
          [0.1607, 0.4249, -0.3257],
          [0.1789, 0.4435, -0.3194],
          [0.1972, 0.458, -0.3327],
          [0.2159, 0.4766, -0.3264],
          [0.2347, 0.491, -0.3397],
          [0.2505, 0.5057, -0.3377],
          [0.2577, 0.5156, -0.3398],
          [0.2592, 0.5288, -0.3426],
          [0.254, 0.5387, -0.3447],
          [0.238, 0.524, -0.3467],
          [0.2189, 0.5096, -0.3334],
          [0.2, 0.491, -0.3397],
          [0.1814, 0.4766, -0.3264],
          [0.163, 0.458, -0.3327],
          [0.1449, 0.4435, -0.3194],
          [0.127, 0.4249, -0.3257],
          [0.1094, 0.4105, -0.3124],
          [0.092, 0.3919, -0.3187],
          [0.0748, 0.3775, -0.3054],
          [0.0579, 0.3589, -0.3116],
          [0.0412, 0.3445, -0.2983],
          [0.0248, 0.3259, -0.3046],
          [0.0086, 0.3114, -0.2913],
          [-0.0073, 0.2928, -0.2976],
          [-0.023, 0.2784, -0.2843],
          [-0.0385, 0.2598, -0.2906],
          [-0.0537, 0.2454, -0.2773],
          [-0.0686, 0.2268, -0.2836],
          [-0.0834, 0.2124, -0.2703],
          [-0.0978, 0.1938, -0.2765],
          [-0.1037, 0.1881, -0.2702],
          [-0.1124, 0.1822, -0.269],
          [-0.1245, 0.1822, -0.269],
          [-0.1339, 0.1881, -0.2702],
          [-0.1281, 0.1938, -0.2765],
          [-0.1139, 0.2124, -0.2703],
          [-0.0994, 0.2268, -0.2836],
          [-0.0847, 0.2454, -0.2773],
          [-0.0697, 0.2598, -0.2906],
          [-0.0545, 0.2784, -0.2843],
          [-0.0391, 0.2928, -0.2976],
          [-0.0234, 0.3114, -0.2913],
          [-0.0074, 0.3259, -0.3046],
          [0.0088, 0.3445, -0.2983],
          [0.0252, 0.3589, -0.3116],
          [0.0419, 0.3775, -0.3054],
          [0.0588, 0.3919, -0.3187],
          [0.0759, 0.4105, -0.3124],
          [0.0933, 0.4249, -0.3257],
          [0.111, 0.4435, -0.3194],
          [0.1289, 0.458, -0.3327],
          [0.147, 0.4766, -0.3264],
          [0.1654, 0.491, -0.3397],
          [0.184, 0.5096, -0.3334],
          [0.2029, 0.524, -0.3467],
          [0.222, 0.5426, -0.3405],
          [0.2413, 0.557, -0.3538],
          [0.2575, 0.5717, -0.3518],
          [0.2649, 0.5816, -0.3539],
          [0.2663, 0.5949, -0.3567],
          [0.261, 0.6048, -0.3588],
          [0.2446, 0.5901, -0.3608],
          [0.225, 0.5756, -0.3475],
          [0.2057, 0.557, -0.3538],
          [0.1866, 0.5426, -0.3405],
          [0.1677, 0.524, -0.3467],
          [0.1491, 0.5096, -0.3334],
          [0.1307, 0.491, -0.3397],
          [0.1126, 0.4766, -0.3264],
          [0.0947, 0.458, -0.3327],
          [0.077, 0.4435, -0.3194],
          [0.0596, 0.4249, -0.3257],
          [0.0425, 0.4105, -0.3124],
          [0.0256, 0.3919, -0.3187],
          [0.0089, 0.3775, -0.3054],
          [-0.0075, 0.3589, -0.3116],
          [-0.0237, 0.3445, -0.2983],
          [-0.0397, 0.3259, -0.3046],
          [-0.0554, 0.3114, -0.2913],
          [-0.0708, 0.2928, -0.2976],
          [-0.086, 0.2784, -0.2843],
          [-0.101, 0.2598, -0.2906],
          [-0.1157, 0.2454, -0.2773],
          [-0.1302, 0.2268, -0.2836],
          [-0.1444, 0.2124, -0.2703],
          [-0.1584, 0.1938, -0.2765],
          [-0.1641, 0.1881, -0.2702],
          [-0.1726, 0.1822, -0.269],
          [-0.1847, 0.1822, -0.269],
          [-0.1943, 0.1881, -0.2702],
          [-0.1887, 0.1938, -0.2765],
          [-0.175, 0.2124, -0.2703],
          [-0.161, 0.2268, -0.2836],
          [-0.1467, 0.2454, -0.2773],
          [-0.1322, 0.2598, -0.2906],
          [-0.1175, 0.2784, -0.2843],
          [-0.1026, 0.2928, -0.2976],
          [-0.0874, 0.3114, -0.2913],
          [-0.0719, 0.3259, -0.3046],
          [-0.0562, 0.3445, -0.2983],
          [-0.0403, 0.3589, -0.3116],
          [-0.0241, 0.3775, -0.3054],
          [-0.0077, 0.3919, -0.3187],
          [0.009, 0.4105, -0.3124],
          [0.0259, 0.4249, -0.3257],
          [0.0431, 0.4435, -0.3194],
          [0.0605, 0.458, -0.3327],
          [0.0781, 0.4766, -0.3264],
          [0.096, 0.491, -0.3397],
          [0.1142, 0.5096, -0.3334],
          [0.1325, 0.524, -0.3467],
          [0.1512, 0.5426, -0.3405],
          [0.17, 0.557, -0.3538],
          [0.1891, 0.5756, -0.3475],
          [0.2085, 0.5901, -0.3608],
          [0.2281, 0.6087, -0.3545],
          [0.2479, 0.6231, -0.3678],
          [0.2645, 0.6378, -0.3658],
          [0.2721, 0.6477, -0.3679],
          [0.2735, 0.6609, -0.3707],
          [0.268, 0.6708, -0.3728],
          [0.2512, 0.6561, -0.3748],
          [0.2311, 0.6417, -0.3615],
          [0.2113, 0.6231, -0.3678],
          [0.1917, 0.6087, -0.3545],
          [0.1723, 0.5901, -0.3608],
          [0.1532, 0.5756, -0.3475],
          [0.1344, 0.557, -0.3538],
          [0.1158, 0.5426, -0.3405],
          [0.0974, 0.524, -0.3467],
          [0.0792, 0.5096, -0.3334],
          [0.0614, 0.491, -0.3397],
          [0.0437, 0.4766, -0.3264],
          [0.0263, 0.458, -0.3327],
          [0.0091, 0.4435, -0.3194],
          [-0.0078, 0.4249, -0.3257],
          [-0.0244, 0.4105, -0.3124],
          [-0.0409, 0.3919, -0.3187],
          [-0.057, 0.3775, -0.3054],
          [-0.073, 0.3589, -0.3116],
          [-0.0887, 0.3445, -0.2983],
          [-0.1041, 0.3259, -0.3046],
          [-0.1193, 0.3114, -0.2913],
          [-0.1343, 0.2928, -0.2976],
          [-0.149, 0.2784, -0.2843],
          [-0.1635, 0.2598, -0.2906],
          [-0.1777, 0.2454, -0.2773],
          [-0.1917, 0.2268, -0.2836],
          [-0.2055, 0.2124, -0.2703],
          [-0.2177, 0.1964, -0.272],
          [-0.2241, 0.2063, -0.2741],
          [-0.2256, 0.2195, -0.2769],
          [-0.2212, 0.2294, -0.279],
          [-0.2088, 0.2454, -0.2773],
          [-0.1948, 0.2598, -0.2906],
          [-0.1805, 0.2784, -0.2843],
          [-0.1661, 0.2928, -0.2976],
          [-0.1513, 0.3114, -0.2913],
          [-0.1364, 0.3259, -0.3046],
          [-0.1212, 0.3445, -0.2983],
          [-0.1057, 0.3589, -0.3116],
          [-0.09, 0.3775, -0.3054],
          [-0.0741, 0.3919, -0.3187],
          [-0.0579, 0.4105, -0.3124],
          [-0.0415, 0.4249, -0.3257],
          [-0.0248, 0.4435, -0.3194],
          [-0.0079, 0.458, -0.3327],
          [0.0093, 0.4766, -0.3264],
          [0.0267, 0.491, -0.3397],
          [0.0443, 0.5096, -0.3334],
          [0.0622, 0.524, -0.3467],
          [0.0803, 0.5426, -0.3405],
          [0.0987, 0.557, -0.3538],
          [0.1173, 0.5756, -0.3475],
          [0.1362, 0.5901, -0.3608],
          [0.1553, 0.6087, -0.3545],
          [0.1747, 0.6231, -0.3678],
          [0.1943, 0.6417, -0.3615],
          [0.2141, 0.6561, -0.3748],
          [0.2342, 0.6747, -0.3685],
          [0.2545, 0.6892, -0.3818],
          [0.2629, 0.6969, -0.3784],
          [0.2522, 0.7028, -0.3796],
          [0.237, 0.7028, -0.3796],
          [0.2252, 0.6969, -0.3784],
          [0.2169, 0.6892, -0.3818],
          [0.1968, 0.6747, -0.3685],
          [0.177, 0.6561, -0.3748],
          [0.1574, 0.6417, -0.3615],
          [0.138, 0.6231, -0.3678],
          [0.1189, 0.6087, -0.3545],
          [0.1001, 0.5901, -0.3608],
          [0.0815, 0.5756, -0.3475],
          [0.0631, 0.557, -0.3538],
          [0.0449, 0.5426, -0.3405],
          [0.0271, 0.524, -0.3467],
          [0.0094, 0.5096, -0.3334],
          [-0.008, 0.491, -0.3397],
          [-0.0251, 0.4766, -0.3264],
          [-0.0421, 0.458, -0.3327],
          [-0.0587, 0.4435, -0.3194],
          [-0.0752, 0.4249, -0.3257],
          [-0.0913, 0.4105, -0.3124],
          [-0.1073, 0.3919, -0.3187],
          [-0.123, 0.3775, -0.3054],
          [-0.1384, 0.3589, -0.3116],
          [-0.1536, 0.3445, -0.2983],
          [-0.1686, 0.3259, -0.3046],
          [-0.1833, 0.3114, -0.2913],
          [-0.1978, 0.2928, -0.2976],
          [-0.212, 0.2784, -0.2843],
          [-0.2247, 0.2624, -0.286],
          [-0.2313, 0.2723, -0.2881],
          [-0.2328, 0.2856, -0.2909],
          [-0.2282, 0.2955, -0.293],
          [-0.2153, 0.3114, -0.2913],
          [-0.2008, 0.3259, -0.3046],
          [-0.1861, 0.3445, -0.2983],
          [-0.1712, 0.3589, -0.3116],
          [-0.1559, 0.3775, -0.3054],
          [-0.1405, 0.3919, -0.3187],
          [-0.1248, 0.4105, -0.3124],
          [-0.1089, 0.4249, -0.3257],
          [-0.0927, 0.4435, -0.3194],
          [-0.0762, 0.458, -0.3327],
          [-0.0596, 0.4766, -0.3264],
          [-0.0427, 0.491, -0.3397],
          [-0.0255, 0.5096, -0.3334],
          [-0.0081, 0.524, -0.3467],
          [0.0095, 0.5426, -0.3405],
          [0.0274, 0.557, -0.3538],
          [0.0456, 0.5756, -0.3475],
          [0.0639, 0.5901, -0.3608],
          [0.0826, 0.6087, -0.3545],
          [0.1014, 0.6231, -0.3678],
          [0.1205, 0.6417, -0.3615],
          [0.1399, 0.6561, -0.3748],
          [0.1595, 0.6747, -0.3685],
          [0.1793, 0.6892, -0.3818],
          [0.1875, 0.6969, -0.3784],
          [0.1766, 0.7028, -0.3796],
          [0.1615, 0.7028, -0.3796],
          [0.1498, 0.6969, -0.3784],
          [0.1417, 0.6892, -0.3818],
          [0.1221, 0.6747, -0.3685],
          [0.1028, 0.6561, -0.3748],
          [0.0837, 0.6417, -0.3615],
          [0.0648, 0.6231, -0.3678],
          [0.0462, 0.6087, -0.3545],
          [0.0278, 0.5901, -0.3608],
          [0.0097, 0.5756, -0.3475],
          [-0.0082, 0.557, -0.3538],
          [-0.0259, 0.5426, -0.3405],
          [-0.0433, 0.524, -0.3467],
          [-0.0604, 0.5096, -0.3334],
          [-0.0773, 0.491, -0.3397],
          [-0.094, 0.4766, -0.3264],
          [-0.1104, 0.458, -0.3327],
          [-0.1266, 0.4435, -0.3194],
          [-0.1426, 0.4249, -0.3257],
          [-0.1583, 0.4105, -0.3124],
          [-0.1737, 0.3919, -0.3187],
          [-0.1889, 0.3775, -0.3054],
          [-0.2039, 0.3589, -0.3116],
          [-0.2186, 0.3445, -0.2983],
          [-0.2317, 0.3285, -0.3001],
          [-0.2385, 0.3384, -0.3022],
          [-0.2399, 0.3516, -0.305],
          [-0.2352, 0.3615, -0.3071],
          [-0.2219, 0.3775, -0.3054],
          [-0.2069, 0.3919, -0.3187],
          [-0.1917, 0.4105, -0.3124],
          [-0.1763, 0.4249, -0.3257],
          [-0.1606, 0.4435, -0.3194],
          [-0.1446, 0.458, -0.3327],
          [-0.1284, 0.4766, -0.3264],
          [-0.112, 0.491, -0.3397],
          [-0.0953, 0.5096, -0.3334],
          [-0.0784, 0.524, -0.3467],
          [-0.0613, 0.5426, -0.3405],
          [-0.0439, 0.557, -0.3538],
          [-0.0262, 0.5756, -0.3475],
          [-0.0083, 0.5901, -0.3608],
          [0.0098, 0.6087, -0.3545],
          [0.0282, 0.6231, -0.3678],
          [0.0468, 0.6417, -0.3615],
          [0.0657, 0.6561, -0.3748],
          [0.0848, 0.6747, -0.3685],
          [0.1041, 0.6892, -0.3818],
          [0.1121, 0.6969, -0.3784],
          [0.101, 0.7028, -0.3796],
          [0.0859, 0.7028, -0.3796],
          [0.0744, 0.6969, -0.3784],
          [0.0665, 0.6892, -0.3818],
          [0.0474, 0.6747, -0.3685],
          [0.0286, 0.6561, -0.3748],
          [0.0099, 0.6417, -0.3615],
          [-0.0084, 0.6231, -0.3678],
          [-0.0266, 0.6087, -0.3545],
          [-0.0445, 0.5901, -0.3608],
          [-0.0621, 0.5756, -0.3475],
          [-0.0795, 0.557, -0.3538],
          [-0.0967, 0.5426, -0.3405],
          [-0.1136, 0.524, -0.3467],
          [-0.1303, 0.5096, -0.3334],
          [-0.1467, 0.491, -0.3397],
          [-0.1629, 0.4766, -0.3264],
          [-0.1788, 0.458, -0.3327],
          [-0.1945, 0.4435, -0.3194],
          [-0.21, 0.4249, -0.3257],
          [-0.2252, 0.4105, -0.3124],
          [-0.2387, 0.3945, -0.3141],
          [-0.2457, 0.4044, -0.3162],
          [-0.2471, 0.4177, -0.319],
          [-0.2422, 0.4276, -0.3211],
          [-0.2284, 0.4435, -0.3194],
          [-0.213, 0.458, -0.3327],
          [-0.1973, 0.4766, -0.3264],
          [-0.1813, 0.491, -0.3397],
          [-0.1652, 0.5096, -0.3334],
          [-0.1487, 0.524, -0.3467],
          [-0.1321, 0.5426, -0.3405],
          [-0.1152, 0.557, -0.3538],
          [-0.098, 0.5756, -0.3475],
          [-0.0806, 0.5901, -0.3608],
          [-0.0629, 0.6087, -0.3545],
          [-0.0451, 0.6231, -0.3678],
          [-0.0269, 0.6417, -0.3615],
          [-0.0086, 0.6561, -0.3748],
          [0.0101, 0.6747, -0.3685],
          [0.0289, 0.6892, -0.3818],
          [0.0367, 0.6969, -0.3784],
          [0.0255, 0.7028, -0.3796],
          [0.0104, 0.7028, -0.3796],
          [-0.001, 0.6969, -0.3784],
          [-0.0087, 0.6892, -0.3818],
          [-0.0273, 0.6747, -0.3685],
          [-0.0457, 0.6561, -0.3748],
          [-0.0638, 0.6417, -0.3615],
          [-0.0817, 0.6231, -0.3678],
          [-0.0993, 0.6087, -0.3545],
          [-0.1167, 0.5901, -0.3608],
          [-0.1339, 0.5756, -0.3475],
          [-0.1508, 0.557, -0.3538],
          [-0.1675, 0.5426, -0.3405],
          [-0.1839, 0.524, -0.3467],
          [-0.2001, 0.5096, -0.3334],
          [-0.216, 0.491, -0.3397],
          [-0.2317, 0.4766, -0.3264],
          [-0.2457, 0.4606, -0.3281],
          [-0.2528, 0.4705, -0.3302],
          [-0.2543, 0.4837, -0.3331],
          [-0.2492, 0.4936, -0.3352],
          [-0.235, 0.5096, -0.3334],
          [-0.2191, 0.524, -0.3467],
          [-0.2029, 0.5426, -0.3405],
          [-0.1864, 0.557, -0.3538],
          [-0.1698, 0.5756, -0.3475],
          [-0.1529, 0.5901, -0.3608],
          [-0.1357, 0.6087, -0.3545],
          [-0.1183, 0.6231, -0.3678],
          [-0.1007, 0.6417, -0.3615],
          [-0.0828, 0.6561, -0.3748],
          [-0.0646, 0.6747, -0.3685],
          [-0.0463, 0.6892, -0.3818],
          [-0.0387, 0.6969, -0.3784],
          [-0.0501, 0.7028, -0.3796],
          [-0.0652, 0.7028, -0.3796],
          [-0.0764, 0.6969, -0.3784],
          [-0.0839, 0.6892, -0.3818],
          [-0.102, 0.6747, -0.3685],
          [-0.1199, 0.6561, -0.3748],
          [-0.1375, 0.6417, -0.3615],
          [-0.1549, 0.6231, -0.3678],
          [-0.1721, 0.6087, -0.3545],
          [-0.189, 0.5901, -0.3608],
          [-0.2057, 0.5756, -0.3475],
          [-0.2221, 0.557, -0.3538],
          [-0.2383, 0.5426, -0.3405],
          [-0.2527, 0.5266, -0.3422],
          [-0.26, 0.5365, -0.3443],
          [-0.2614, 0.5498, -0.3471],
          [-0.2562, 0.5597, -0.3492],
          [-0.2416, 0.5756, -0.3475],
          [-0.2251, 0.5901, -0.3608],
          [-0.2085, 0.6087, -0.3545],
          [-0.1915, 0.6231, -0.3678],
          [-0.1744, 0.6417, -0.3615],
          [-0.157, 0.6561, -0.3748],
          [-0.1393, 0.6747, -0.3685],
          [-0.1214, 0.6892, -0.3818],
          [-0.1141, 0.6969, -0.3784],
          [-0.1257, 0.7028, -0.3796],
          [-0.1408, 0.7028, -0.3796],
          [-0.1518, 0.6969, -0.3784],
          [-0.159, 0.6892, -0.3818],
          [-0.1767, 0.6747, -0.3685],
          [-0.1941, 0.6561, -0.3748],
          [-0.2113, 0.6417, -0.3615],
          [-0.2282, 0.6231, -0.3678],
          [-0.2448, 0.6087, -0.3545],
          [-0.2597, 0.5927, -0.3562],
          [-0.2672, 0.6026, -0.3583],
          [-0.2686, 0.6158, -0.3611],
          [-0.2632, 0.6257, -0.3632],
          [-0.2481, 0.6417, -0.3615],
          [-0.2312, 0.6561, -0.3748],
          [-0.214, 0.6747, -0.3685],
          [-0.1966, 0.6892, -0.3818],
          [-0.1895, 0.6969, -0.3784],
          [-0.2012, 0.7028, -0.3796],
          [-0.2163, 0.7028, -0.3796],
          [-0.2271, 0.6969, -0.3784],
          [-0.2342, 0.6892, -0.3818],
          [-0.2514, 0.6747, -0.3685],
          [-0.2667, 0.6587, -0.3703],
          [-0.2743, 0.6686, -0.3724],
          [-0.2758, 0.6819, -0.3752],
          [-0.2702, 0.6918, -0.3773],
          [-0.2648, 0.6969, -0.3784],
        ],
        radius: 0.009,
        radialSegments: 7,
        closed: false,
      },
      attachmentIntent: {
        parent: "seat-deck",
        parentSocket: "weave-mount",
        contactType: "embed",
        embedDepth: 0.012,
        localStart: [0.2153, -0.095, -0.2706],
        localEnd: [-0.2683, 0.41, -0.378],
        whyRootLevel:
          "A parented tube must declare a complete attachment, and the factory generator then replaces the tube path with a straight endpoint cylinder. Kept at root with world-space path points; the viewer swivels it together with the seat-deck group.",
      },
      lattice: {
        pitch: 0.024,
        angleDeg: -45,
        ropeRadius: 0.009,
        interlaceAmplitude: 0.005,
        panelSize: { width: 0.4836, height: 0.519 },
        approximation:
          "reference motif is stacked chevron loops; modelled as a denser diamond lattice",
      },
    },
    parent: null,
    attachment: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.5,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "weave-panel",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "weave",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0, -0.12],
      },
    },
    material: "rope-braided",
    materialLayers: ["rope-braided"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["analysis/detail-inventory/zone-r1c1.png"],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "weave-rear-b",
      dominantAlbedo: "rgba(113, 83, 62, 1.0)",
      secondaryAlbedo: "rgba(76, 50, 33, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.122,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "sharp, tight specular hotspot — supports low roughness/high specularity",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\rope-rear-panel.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.396 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.806.",
    },
  };
  node_weave_rear_b_27.add(mesh_weave_rear_b_27);
  meshes["weave-rear-b"] = mesh_weave_rear_b_27;
  colliders["weave-rear-b"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["weave"] ??= [];
  destructionGroups["weave"].push(node_weave_rear_b_27);

  const endpoint_cushion_seat_28 = makeAttachmentEndpoint(null);
  const node_cushion_seat_28 = new THREE.Group();
  node_cushion_seat_28.name = "Seat cushion__pivot";
  node_cushion_seat_28.scale.set(1, 1, 1);
  if (endpoint_cushion_seat_28) {
    node_cushion_seat_28.position.copy(endpoint_cushion_seat_28.start);
    node_cushion_seat_28.rotation.set(-1.5708, 0.0, 0.0);
  } else {
    node_cushion_seat_28.position.set(0.0, 0.085, 0.0166);
    node_cushion_seat_28.rotation.set(-1.5708, 0.0, 0.0);
  }
  node_cushion_seat_28.userData.sculptComponent = {
    id: "cushion-seat",
    name: "Seat cushion",
    level: "macro",
    role: "cushion",
    importance: 1.0,
    confidence: 0.5,
    primitive: "box",
    topologyClass: "implicit",
    topologyRationale:
      "Boxed foam cushion with softly radiused edges and a slightly crowned top: implicit box core smooth-unioned with an ellipsoid crown. Render blockout #1 showed a Catmull-Clark 1x1x1 cage collapsing into a blob, so the rounded form is carried by the SDF instead.",
    geometryDescriptor: {
      topologyIntent:
        "Boxed foam cushion with softly radiused edges and a slightly crowned top: implicit box core smooth-unioned with an ellipsoid crown. Render blockout #1 showed a Catmull-Clark 1x1x1 cage collapsing into a blob, so the rounded form is carried by the SDF instead.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      sdf: {
        primitives: [
          { id: "core", type: "box", size: [0.5183, 0.5709, 0.1204] },
          { id: "crown", type: "ellipsoid", radii: [0.253, 0.2659, 0.084] },
        ],
        operations: [
          {
            id: "cushion",
            type: "smooth-union",
            left: "core",
            right: "crown",
            radius: 0.05,
          },
        ],
        resolution: 32,
        bounds: {
          min: [-0.2892, -0.3155, -0.104],
          max: [0.2892, 0.3155, 0.104],
        },
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "cushion-mount",
      localStart: [0.0, 0.015, 0.0166],
      localEnd: [0.0, 0.155, 0.0166],
      contactType: "butt",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.5,
    },
    transform: {
      position: [0.0, 0.085, 0.0166],
      rotation: [-1.5708, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "cushion",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "cushions",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0.32, 0.18],
      },
    },
    material: "cushion-fabric",
    materialLayers: ["cushion-fabric"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png#lateral-panel"],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "cushion-seat",
      dominantAlbedo: "rgba(233, 228, 222, 1.0)",
      secondaryAlbedo: "rgba(254, 254, 254, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\cushion-back.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.522 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.721.",
    },
  };
  node_cushion_seat_28.userData.actionProfile = {
    animationRole: "cushion",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "cushions",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0.32, 0.18],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_cushion_seat_28);
  nodes["cushion-seat"] = node_cushion_seat_28;
  const mesh_cushion_seat_28Geometry = polygonizeSdf({
    primitives: [
      { id: "core", type: "box", size: [0.5183, 0.5709, 0.1204] },
      { id: "crown", type: "ellipsoid", radii: [0.253, 0.2659, 0.084] },
    ],
    operations: [
      {
        id: "cushion",
        type: "smooth-union",
        left: "core",
        right: "crown",
        radius: 0.05,
      },
    ],
    resolution: 32,
    bounds: { min: [-0.2892, -0.3155, -0.104], max: [0.2892, 0.3155, 0.104] },
  });
  if (!endpoint_cushion_seat_28) {
    mesh_cushion_seat_28Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_cushion_seat_28 = new THREE.Mesh(
    mesh_cushion_seat_28Geometry,
    createSculptMaterial(
      "cushion-fabric",
      {
        id: "cushion-fabric",
        name: "Slub outdoor upholstery",
        type: "physical",
        shaderModel: "MeshPhysicalMaterial",
        materialProfileId: "fabric.woven-matte",
        baseColor: "#E7E0DA",
        color: "#E7E0DA",
        albedo: {
          dominant: "#E7E0DA",
          secondary: ["#DECBBA", "#FEFEFE"],
          samplingNotes:
            "Sampled from reference pixels (20000 px): median / 20th / 80th luma percentile.",
        },
        colorVariation: {
          palette: ["#E7E0DA", "#DECBBA", "#FEFEFE"],
          pattern: "mottled",
          amplitude: 0.12,
          heightCorrelation: 0.3,
        },
        textureResolution: 1024,
        textureProjection: {
          mode: "uv",
          repeat: [2.0, 2.0],
          anisotropy: 8,
          texelDensityIntent: "Stable object-scale detail.",
        },
        surfaceFrequencyBands: [
          {
            id: "macro",
            frequency: 1.0,
            amplitude: 0.08,
            role: "soft fold shading",
          },
          {
            id: "meso",
            frequency: 30.0,
            amplitude: 0.15,
            role: "woven slub texture",
          },
          {
            id: "micro",
            frequency: 120.0,
            amplitude: 0.06,
            role: "yarn breakup",
          },
        ],
        roughness: {
          base: 0.85,
          variation: 0.08,
          map: "independent-procedural-field",
          localResponse: "see localOverrides",
        },
        metalness: { base: 0.0, variation: 0.0 },
        normal: {
          pattern: "derived-from-independent-height-field",
          strength: 0.3,
          scale: 24.0,
          space: "tangent",
        },
        bump: { pattern: "none", amplitude: 0.0, scale: 1.0 },
        displacement: {
          pattern: "none",
          amplitude: 0.0,
          scale: 1.0,
          silhouetteAffects: false,
        },
        ambientOcclusion: {
          cavityStrength: 0.3,
          contactShadowBias: 0.35,
          notes: "Darken joints and lattice crossings.",
        },
        wear: { edgeWear: 0.0, scratches: [], chips: [] },
        dirt: { amount: 0.0, cavityBias: 0.0, color: "#2F2A22" },
        localOverrides: [
          {
            id: "slub-flecks",
            kind: "stain",
            region: "cushion faces",
            dirtAmount: 0.12,
            cavityBias: 0.0,
            pattern: "sparse darker slub flecks",
            evidenceRef: "reference/chair-right.png#back-cushion",
          },
        ],
        shaderNotes: [
          "Matte woven fabric: sheen 0.3 with light sheenColor, no clearcoat.",
        ],
        referenceMaterialId: "fabric.woven-matte",
        materialFamily: "fabric",
        materialSubtype: "woven",
        materialFinish: "matte",
        materialReference: {
          registry:
            "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json",
          profileId: "fabric.woven-matte",
          method: "explicit-material-id",
          confidence: 1.0,
          sourceRefs: [
            "three.mesh-physical",
            "three.texture",
            "khronos.sheen",
            "mit.material-recognition",
          ],
          requiredMaps: ["map", "roughnessMap", "normalMap"],
          optionalMaps: ["sheenColorMap", "sheenRoughnessMap", "aoMap"],
          validationViews: [
            "albedo-unlit",
            "neutral-studio",
            "grazing",
            "reference-beauty",
          ],
        },
        sheen: { base: 0.65, variation: 0.0 },
        sheenRoughness: { base: 0.75, variation: 0.0 },
        referencePbr: {
          version: "1.0",
          sourceImage:
            "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
          extractor: "stage1_intake/extract_pbr_evidence.py",
          method:
            "single-image pixel evidence with de-lighting estimate; not photogrammetry",
          usable: true,
          verdict: "pass",
          confidence: 0.721,
          estimatedFidelity: 0.721,
          targetThreshold: 0.7,
          hardLimit:
            "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.",
          maps: {
            albedo: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_albedo.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_albedo.png",
              channel: "albedo",
              source: "reference-pixel-extraction",
            },
            roughness: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_roughness.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_roughness.png",
              channel: "roughness",
              source: "reference-pixel-extraction",
            },
            height: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_height.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_height.png",
              channel: "height",
              source: "reference-pixel-extraction",
            },
            normal: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_normal.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_normal.png",
              channel: "normal",
              source: "reference-pixel-extraction",
            },
            ao: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_ao.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_ao.png",
              channel: "ao",
              source: "reference-pixel-extraction",
            },
          },
          diagnostics: {
            sourceWidth: 140,
            sourceHeight: 45,
            mapSize: 512,
            cropBBoxPixels: { x: 0, y: 0, width: 140, height: 45 },
            mask: {
              backgroundColor: "#ECE3DC",
              backgroundNoise: 45.574,
              transparentPixelFraction: 0.0,
              foregroundCoverage: 1.0,
            },
            mapStats: {
              valueRange: 0.1872,
              heightP90Gradient: 0.1159,
              roughnessBase: 0.776,
              roughnessVariation: 0.202,
              normalStrength: 0.292,
              blurRadius: 10,
            },
            palette: ["#FEFEFE", "#E8E3DD", "#E0D9D2", "#F0EAE5", "#CDC4BD"],
          },
          warnings: [
            "foreground mask is tiny; material extraction is likely unreliable",
            "image is not clearly isolated from background; using most pixels as material evidence",
            "object/background separation is weak",
            "single-image inverse rendering cannot prove true physical PBR; confidence is capped",
            "low value range weakens height/roughness inference",
          ],
        },
        textureAnalysis: {
          finishClass: "brushed-steel",
          recipe: {
            metalness: 1.0,
            roughness: 0.35,
            clearcoat: 0.0,
            clearcoatRoughness: 0.0,
            transmission: 0.0,
            ior: 1.5,
            envMapIntensity: 1.0,
            anisotropy: 1.0,
            procedural: "brushed",
          },
          palette: ["#FAFAF9", "#F5F3F1", "#ECE8E3", "#E2DCD5", "#E3DCD5"],
          paletteHueRisk: [],
          gradientAxis: "vertical",
          stats: {
            meanLum: 233.3,
            meanSaturation: 0.038,
            gradientStrength: 0.113,
            mottle: 0.024,
            streakRatio: 1.6,
            hueSpread: 0.0,
            specularFraction: 0.376,
          },
        },
        materialEvidence: {
          componentId: "cushion-back",
          regionId: "cushion-slub-weave",
          crop: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
            bbox: { x: 0, y: 0, width: 140, height: 45 },
            sourceWidth: 140,
            sourceHeight: 45,
            loaderWarnings: [],
            coverage: 1.0,
          },
          observations: [
            "near-neutral colour response",
            "single-image PBR inference requires controlled render validation",
          ],
          hypothesis: {
            componentId: "cushion-back",
            regionId: "cushion-slub-weave",
            materialId: "fabric.woven-matte",
            family: "fabric",
            subtype: "woven",
            finish: "matte",
            aliases: [],
            confidence: 0.721,
            source: "vision",
          },
          alternatives: [],
        },
      },
      options,
      true,
    ),
  );
  mesh_cushion_seat_28.name = "Seat cushion";
  if (endpoint_cushion_seat_28) {
    mesh_cushion_seat_28.position.copy(endpoint_cushion_seat_28.midpoint);
    mesh_cushion_seat_28.quaternion.copy(endpoint_cushion_seat_28.quaternion);
  }
  mesh_cushion_seat_28.castShadow = options.castShadow ?? true;
  mesh_cushion_seat_28.receiveShadow = options.receiveShadow ?? true;
  mesh_cushion_seat_28.userData.sculptComponent = {
    id: "cushion-seat",
    name: "Seat cushion",
    level: "macro",
    role: "cushion",
    importance: 1.0,
    confidence: 0.5,
    primitive: "box",
    topologyClass: "implicit",
    topologyRationale:
      "Boxed foam cushion with softly radiused edges and a slightly crowned top: implicit box core smooth-unioned with an ellipsoid crown. Render blockout #1 showed a Catmull-Clark 1x1x1 cage collapsing into a blob, so the rounded form is carried by the SDF instead.",
    geometryDescriptor: {
      topologyIntent:
        "Boxed foam cushion with softly radiused edges and a slightly crowned top: implicit box core smooth-unioned with an ellipsoid crown. Render blockout #1 showed a Catmull-Clark 1x1x1 cage collapsing into a blob, so the rounded form is carried by the SDF instead.",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      sdf: {
        primitives: [
          { id: "core", type: "box", size: [0.5183, 0.5709, 0.1204] },
          { id: "crown", type: "ellipsoid", radii: [0.253, 0.2659, 0.084] },
        ],
        operations: [
          {
            id: "cushion",
            type: "smooth-union",
            left: "core",
            right: "crown",
            radius: 0.05,
          },
        ],
        resolution: 32,
        bounds: {
          min: [-0.2892, -0.3155, -0.104],
          max: [0.2892, 0.3155, 0.104],
        },
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "cushion-mount",
      localStart: [0.0, 0.015, 0.0166],
      localEnd: [0.0, 0.155, 0.0166],
      contactType: "butt",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.5,
    },
    transform: {
      position: [0.0, 0.085, 0.0166],
      rotation: [-1.5708, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "cushion",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "cushions",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0.32, 0.18],
      },
    },
    material: "cushion-fabric",
    materialLayers: ["cushion-fabric"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["reference/chair-right.png#lateral-panel"],
    details: [],
    fidelityTier: "form",
    colorMaterialRecipe: {
      componentId: "cushion-seat",
      dominantAlbedo: "rgba(233, 228, 222, 1.0)",
      secondaryAlbedo: "rgba(254, 254, 254, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\cushion-back.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.522 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.721.",
    },
  };
  node_cushion_seat_28.add(mesh_cushion_seat_28);
  meshes["cushion-seat"] = mesh_cushion_seat_28;
  colliders["cushion-seat"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["cushions"] ??= [];
  destructionGroups["cushions"].push(node_cushion_seat_28);

  const endpoint_cushion_back_29 = makeAttachmentEndpoint(null);
  const node_cushion_back_29 = new THREE.Group();
  node_cushion_back_29.name = "Back cushion__pivot";
  node_cushion_back_29.scale.set(1, 1, 1);
  if (endpoint_cushion_back_29) {
    node_cushion_back_29.position.copy(endpoint_cushion_back_29.start);
    node_cushion_back_29.rotation.set(-0.24435, 0.0, -0.0);
  } else {
    node_cushion_back_29.position.set(0.0, 0.3576, -0.2707);
    node_cushion_back_29.rotation.set(-0.24435, 0.0, -0.0);
  }
  node_cushion_back_29.userData.sculptComponent = {
    id: "cushion-back",
    name: "Back cushion",
    level: "meso",
    role: "cushion",
    importance: 0.75,
    confidence: 0.6,
    primitive: "box",
    topologyClass: "implicit",
    topologyRationale:
      "Tall boxed back cushion with a perimeter seam (d12) and a soft crown, reclined against the rear lattice; implicit box core smooth-unioned with an ellipsoid crown (see cushion-seat).",
    geometryDescriptor: {
      topologyIntent:
        "Tall boxed back cushion with a perimeter seam (d12) and a soft crown, reclined against the rear lattice; implicit box core smooth-unioned with an ellipsoid crown (see cushion-seat).",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      sdf: {
        primitives: [
          { id: "core", type: "box", size: [0.4983, 0.48, 0.1376] },
          { id: "crown", type: "ellipsoid", radii: [0.2436, 0.225, 0.1024] },
        ],
        operations: [
          {
            id: "cushion",
            type: "smooth-union",
            left: "core",
            right: "crown",
            radius: 0.05,
          },
        ],
        resolution: 32,
        bounds: { min: [-0.2792, -0.27, -0.1224], max: [0.2792, 0.27, 0.1224] },
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "cushion-mount",
      localStart: [0.0, 0.115, -0.2103],
      localEnd: [0.0, 0.6001, -0.3312],
      contactType: "butt",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [0.0, 0.3576, -0.2707],
      rotation: [-0.24435, 0.0, -0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "cushion",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "cushions",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0.38, 0.05],
      },
    },
    material: "cushion-fabric",
    materialLayers: ["cushion-fabric"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "perimeter-seam",
        kind: "seam",
        description: "Boxed perimeter seam along the cushion faces (d12).",
        realizedInPass: "surface-pass",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#back-cushion",
      "analysis/detail-inventory/zone-r0c2.png",
    ],
    details: [],
    fidelityTier: "form",
    uvContract: {
      status: "unwrapped",
      strategy: "generated procedural coordinates",
      materialId: "cushion-fabric",
    },
    materialRegions: [
      {
        regionId: "cushion-slub-weave",
        materialId: "cushion-fabric",
        profileId: "fabric.woven-matte",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
          bbox: { x: 0, y: 0, width: 140, height: 45 },
          sourceWidth: 140,
          sourceHeight: 45,
          loaderWarnings: [],
          coverage: 1.0,
        },
      },
    ],
    colorMaterialRecipe: {
      componentId: "cushion-back",
      dominantAlbedo: "rgba(233, 228, 222, 1.0)",
      secondaryAlbedo: "rgba(254, 254, 254, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\cushion-back.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.522 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.721.",
    },
  };
  node_cushion_back_29.userData.actionProfile = {
    animationRole: "cushion",
    pivot: {
      mode: "center",
      localPosition: [0, 0, 0],
      axis: [0, 1, 0],
      confidence: 0.7,
    },
    transformChannels: {
      translate: true,
      rotate: false,
      scale: false,
      bend: false,
      twist: false,
      detach: true,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
      notes: "Proxy sized to the component bounds.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "cushions",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 0.0,
      debrisMaterial: "none",
      explodeVector: [0, 0.38, 0.05],
    },
  };
  (nodes["seat-deck"] ?? root).add(node_cushion_back_29);
  nodes["cushion-back"] = node_cushion_back_29;
  const mesh_cushion_back_29Geometry = polygonizeSdf({
    primitives: [
      { id: "core", type: "box", size: [0.4983, 0.48, 0.1376] },
      { id: "crown", type: "ellipsoid", radii: [0.2436, 0.225, 0.1024] },
    ],
    operations: [
      {
        id: "cushion",
        type: "smooth-union",
        left: "core",
        right: "crown",
        radius: 0.05,
      },
    ],
    resolution: 32,
    bounds: { min: [-0.2792, -0.27, -0.1224], max: [0.2792, 0.27, 0.1224] },
  });
  if (!endpoint_cushion_back_29) {
    mesh_cushion_back_29Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_cushion_back_29 = new THREE.Mesh(
    mesh_cushion_back_29Geometry,
    createSculptMaterial(
      "cushion-fabric",
      {
        id: "cushion-fabric",
        name: "Slub outdoor upholstery",
        type: "physical",
        shaderModel: "MeshPhysicalMaterial",
        materialProfileId: "fabric.woven-matte",
        baseColor: "#E7E0DA",
        color: "#E7E0DA",
        albedo: {
          dominant: "#E7E0DA",
          secondary: ["#DECBBA", "#FEFEFE"],
          samplingNotes:
            "Sampled from reference pixels (20000 px): median / 20th / 80th luma percentile.",
        },
        colorVariation: {
          palette: ["#E7E0DA", "#DECBBA", "#FEFEFE"],
          pattern: "mottled",
          amplitude: 0.12,
          heightCorrelation: 0.3,
        },
        textureResolution: 1024,
        textureProjection: {
          mode: "uv",
          repeat: [2.0, 2.0],
          anisotropy: 8,
          texelDensityIntent: "Stable object-scale detail.",
        },
        surfaceFrequencyBands: [
          {
            id: "macro",
            frequency: 1.0,
            amplitude: 0.08,
            role: "soft fold shading",
          },
          {
            id: "meso",
            frequency: 30.0,
            amplitude: 0.15,
            role: "woven slub texture",
          },
          {
            id: "micro",
            frequency: 120.0,
            amplitude: 0.06,
            role: "yarn breakup",
          },
        ],
        roughness: {
          base: 0.85,
          variation: 0.08,
          map: "independent-procedural-field",
          localResponse: "see localOverrides",
        },
        metalness: { base: 0.0, variation: 0.0 },
        normal: {
          pattern: "derived-from-independent-height-field",
          strength: 0.3,
          scale: 24.0,
          space: "tangent",
        },
        bump: { pattern: "none", amplitude: 0.0, scale: 1.0 },
        displacement: {
          pattern: "none",
          amplitude: 0.0,
          scale: 1.0,
          silhouetteAffects: false,
        },
        ambientOcclusion: {
          cavityStrength: 0.3,
          contactShadowBias: 0.35,
          notes: "Darken joints and lattice crossings.",
        },
        wear: { edgeWear: 0.0, scratches: [], chips: [] },
        dirt: { amount: 0.0, cavityBias: 0.0, color: "#2F2A22" },
        localOverrides: [
          {
            id: "slub-flecks",
            kind: "stain",
            region: "cushion faces",
            dirtAmount: 0.12,
            cavityBias: 0.0,
            pattern: "sparse darker slub flecks",
            evidenceRef: "reference/chair-right.png#back-cushion",
          },
        ],
        shaderNotes: [
          "Matte woven fabric: sheen 0.3 with light sheenColor, no clearcoat.",
        ],
        referenceMaterialId: "fabric.woven-matte",
        materialFamily: "fabric",
        materialSubtype: "woven",
        materialFinish: "matte",
        materialReference: {
          registry:
            "C:\\Users\\NguyenDangPhat\\.claude\\skills\\img2threejs\\docs\\materials\\material-reference.json",
          profileId: "fabric.woven-matte",
          method: "explicit-material-id",
          confidence: 1.0,
          sourceRefs: [
            "three.mesh-physical",
            "three.texture",
            "khronos.sheen",
            "mit.material-recognition",
          ],
          requiredMaps: ["map", "roughnessMap", "normalMap"],
          optionalMaps: ["sheenColorMap", "sheenRoughnessMap", "aoMap"],
          validationViews: [
            "albedo-unlit",
            "neutral-studio",
            "grazing",
            "reference-beauty",
          ],
        },
        sheen: { base: 0.65, variation: 0.0 },
        sheenRoughness: { base: 0.75, variation: 0.0 },
        referencePbr: {
          version: "1.0",
          sourceImage:
            "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
          extractor: "stage1_intake/extract_pbr_evidence.py",
          method:
            "single-image pixel evidence with de-lighting estimate; not photogrammetry",
          usable: true,
          verdict: "pass",
          confidence: 0.721,
          estimatedFidelity: 0.721,
          targetThreshold: 0.7,
          hardLimit:
            "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.",
          maps: {
            albedo: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_albedo.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_albedo.png",
              channel: "albedo",
              source: "reference-pixel-extraction",
            },
            roughness: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_roughness.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_roughness.png",
              channel: "roughness",
              source: "reference-pixel-extraction",
            },
            height: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_height.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_height.png",
              channel: "height",
              source: "reference-pixel-extraction",
            },
            normal: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_normal.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_normal.png",
              channel: "normal",
              source: "reference-pixel-extraction",
            },
            ao: {
              path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\pbr-02-cushion-slub-weave\\cushion-fabric_ao.png",
              url: "/3d/swivel-chair/maps/cushion-fabric_ao.png",
              channel: "ao",
              source: "reference-pixel-extraction",
            },
          },
          diagnostics: {
            sourceWidth: 140,
            sourceHeight: 45,
            mapSize: 512,
            cropBBoxPixels: { x: 0, y: 0, width: 140, height: 45 },
            mask: {
              backgroundColor: "#ECE3DC",
              backgroundNoise: 45.574,
              transparentPixelFraction: 0.0,
              foregroundCoverage: 1.0,
            },
            mapStats: {
              valueRange: 0.1872,
              heightP90Gradient: 0.1159,
              roughnessBase: 0.776,
              roughnessVariation: 0.202,
              normalStrength: 0.292,
              blurRadius: 10,
            },
            palette: ["#FEFEFE", "#E8E3DD", "#E0D9D2", "#F0EAE5", "#CDC4BD"],
          },
          warnings: [
            "foreground mask is tiny; material extraction is likely unreliable",
            "image is not clearly isolated from background; using most pixels as material evidence",
            "object/background separation is weak",
            "single-image inverse rendering cannot prove true physical PBR; confidence is capped",
            "low value range weakens height/roughness inference",
          ],
        },
        textureAnalysis: {
          finishClass: "brushed-steel",
          recipe: {
            metalness: 1.0,
            roughness: 0.35,
            clearcoat: 0.0,
            clearcoatRoughness: 0.0,
            transmission: 0.0,
            ior: 1.5,
            envMapIntensity: 1.0,
            anisotropy: 1.0,
            procedural: "brushed",
          },
          palette: ["#FAFAF9", "#F5F3F1", "#ECE8E3", "#E2DCD5", "#E3DCD5"],
          paletteHueRisk: [],
          gradientAxis: "vertical",
          stats: {
            meanLum: 233.3,
            meanSaturation: 0.038,
            gradientStrength: 0.113,
            mottle: 0.024,
            streakRatio: 1.6,
            hueSpread: 0.0,
            specularFraction: 0.376,
          },
        },
        materialEvidence: {
          componentId: "cushion-back",
          regionId: "cushion-slub-weave",
          crop: {
            path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
            bbox: { x: 0, y: 0, width: 140, height: 45 },
            sourceWidth: 140,
            sourceHeight: 45,
            loaderWarnings: [],
            coverage: 1.0,
          },
          observations: [
            "near-neutral colour response",
            "single-image PBR inference requires controlled render validation",
          ],
          hypothesis: {
            componentId: "cushion-back",
            regionId: "cushion-slub-weave",
            materialId: "fabric.woven-matte",
            family: "fabric",
            subtype: "woven",
            finish: "matte",
            aliases: [],
            confidence: 0.721,
            source: "vision",
          },
          alternatives: [],
        },
      },
      options,
      true,
    ),
  );
  mesh_cushion_back_29.name = "Back cushion";
  if (endpoint_cushion_back_29) {
    mesh_cushion_back_29.position.copy(endpoint_cushion_back_29.midpoint);
    mesh_cushion_back_29.quaternion.copy(endpoint_cushion_back_29.quaternion);
  }
  mesh_cushion_back_29.castShadow = options.castShadow ?? true;
  mesh_cushion_back_29.receiveShadow = options.receiveShadow ?? true;
  mesh_cushion_back_29.userData.sculptComponent = {
    id: "cushion-back",
    name: "Back cushion",
    level: "meso",
    role: "cushion",
    importance: 0.75,
    confidence: 0.6,
    primitive: "box",
    topologyClass: "implicit",
    topologyRationale:
      "Tall boxed back cushion with a perimeter seam (d12) and a soft crown, reclined against the rear lattice; implicit box core smooth-unioned with an ellipsoid crown (see cushion-seat).",
    geometryDescriptor: {
      topologyIntent:
        "Tall boxed back cushion with a perimeter seam (d12) and a soft crown, reclined against the rear lattice; implicit box core smooth-unioned with an ellipsoid crown (see cushion-seat).",
      edgeTreatment: { type: "none", bevelRadius: 0.0, segments: 1 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
      sdf: {
        primitives: [
          { id: "core", type: "box", size: [0.4983, 0.48, 0.1376] },
          { id: "crown", type: "ellipsoid", radii: [0.2436, 0.225, 0.1024] },
        ],
        operations: [
          {
            id: "cushion",
            type: "smooth-union",
            left: "core",
            right: "crown",
            radius: 0.05,
          },
        ],
        resolution: 32,
        bounds: { min: [-0.2792, -0.27, -0.1224], max: [0.2792, 0.27, 0.1224] },
      },
    },
    parent: "seat-deck",
    attachment: {
      parentSocket: "cushion-mount",
      localStart: [0.0, 0.115, -0.2103],
      localEnd: [0.0, 0.6001, -0.3312],
      contactType: "butt",
      embedDepth: 0.004,
      overlap: 0.004,
      gapTolerance: 0.003,
    },
    dimensions: {
      width: 1,
      height: 1,
      depth: 1,
      units: "meters",
      confidence: 0.6,
    },
    transform: {
      position: [0.0, 0.3576, -0.2707],
      rotation: [-0.24435, 0.0, -0.0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "cushion",
      pivot: {
        mode: "center",
        localPosition: [0, 0, 0],
        axis: [0, 1, 0],
        confidence: 0.7,
      },
      transformChannels: {
        translate: true,
        rotate: false,
        scale: false,
        bend: false,
        twist: false,
        detach: true,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [1, 1, 1],
        isTrigger: false,
        notes: "Proxy sized to the component bounds.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "cushions",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 0.0,
        debrisMaterial: "none",
        explodeVector: [0, 0.38, 0.05],
      },
    },
    material: "cushion-fabric",
    materialLayers: ["cushion-fabric"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "perimeter-seam",
        kind: "seam",
        description: "Boxed perimeter seam along the cushion faces (d12).",
        realizedInPass: "surface-pass",
      },
    ],
    surfaceDetail: {
      macroRoughness: 0.0,
      microRoughness: 0.0,
      bumpAmplitude: 0.0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: [
      "reference/chair-right.png#back-cushion",
      "analysis/detail-inventory/zone-r0c2.png",
    ],
    details: [],
    fidelityTier: "form",
    uvContract: {
      status: "unwrapped",
      strategy: "generated procedural coordinates",
      materialId: "cushion-fabric",
    },
    materialRegions: [
      {
        regionId: "cushion-slub-weave",
        materialId: "cushion-fabric",
        profileId: "fabric.woven-matte",
        crop: {
          path: "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-evidence\\regions\\02-cushion-slub-weave.png",
          bbox: { x: 0, y: 0, width: 140, height: 45 },
          sourceWidth: 140,
          sourceHeight: 45,
          loaderWarnings: [],
          coverage: 1.0,
        },
      },
    ],
    colorMaterialRecipe: {
      componentId: "cushion-back",
      dominantAlbedo: "rgba(233, 228, 222, 1.0)",
      secondaryAlbedo: "rgba(254, 254, 254, 1.0)",
      materialClass: "fabric",
      materialClassConfidence: 0.6,
      roughnessEstimate: 0.87,
      metalnessEstimate: 0.0,
      highlightEvidence:
        "broad, gradually-fading highlight — supports high roughness/diffuse response",
      sourceCropPath:
        "C:\\Users\\NguyenDangPhat\\Documents\\GitHub\\bfc-landing-page\\3d\\swivel-chair\\analysis\\material-crops\\cushion-back.png",
      labClusterMeta: { clusterCount: 3, dominantClusterSharePct: 0.522 },
      materialClassProvenance:
        "Class asserted by agent vision from the verified crop; extract_part_color_recipe caps any hinted class at 0.6 by design. Albedo/roughness are pixel-derived; referencePbr extraction confidence 0.721.",
    },
  };
  node_cushion_back_29.add(mesh_cushion_back_29);
  meshes["cushion-back"] = mesh_cushion_back_29;
  colliders["cushion-back"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [1, 1, 1],
    isTrigger: false,
    notes: "Proxy sized to the component bounds.",
  };
  destructionGroups["cushions"] ??= [];
  destructionGroups["cushions"].push(node_cushion_back_29);
  // repetition system "rear-post-fastener-caps" describes 4 parts that are already built individually; not instanced.
  // repetition system "rope-lattice-runs" describes 6 parts that are already built individually; not instanced.

  root.userData.sculptRuntime = {
    nodes,
    meshes,
    sockets,
    colliders,
    destructionGroups,
  } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {
    qualityPriority: "reference-fidelity",
    materialPass: {
      albedoPaletteRequired: true,
      roughnessVariationRequired: true,
      normalOrBumpRequired: true,
      localOverridesRequired: true,
      minimumTextureResolution: 1024,
      preferredTextureResolution: 2048,
      independentMapChannels: [
        "albedo",
        "roughness",
        "height",
        "normal",
        "ambient-occlusion",
      ],
      requiredSurfaceFrequencyBands: ["macro", "meso", "micro"],
      geometryReliefRequiredWhenSilhouetteAffected: true,
      referencePbrExtraction: {
        requiredWhenSourceImagePresent: true,
        targetThreshold: 0.7,
        stopOnLowConfidence: true,
        script: "forge/stage1_intake/extract_pbr_evidence.py",
        acceptedLimitation:
          "single-image extraction is reference-derived inference, not exact photogrammetry",
      },
      mustAvoid: [
        "single flat albedo per material",
        "uniform roughness",
        "albedo texture reused as roughness/height/normal/AO",
        "single-frequency random noise",
        "plastic-looking smooth bark, stone, cloth, foliage, or aged material",
        "local color/detail described only in prose without material masks",
        "claiming exact PBR recovery when confidence is below the target threshold",
      ],
    },
    lightingPass: {
      requiredTerms: [
        "key light",
        "fill light",
        "rim or environment light",
        "exposure",
        "tone mapping",
        "background",
        "contact shadow",
      ],
      mustAvoid: [
        "ambient-only lighting",
        "flat value range",
        "missing contact shadow",
        "reference lighting copied without separating material readability",
      ],
    },
    screenshotReview: [
      "Compare albedo palette and local color zones.",
      "Compare roughness/normal/bump response under light.",
      "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.",
      "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.",
      "Capture a neutral-light render to verify material readability without reference lighting.",
      "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.",
      "Capture a reference-matched render from the same camera framing as the source.",
    ],
  };
  root.userData.actionReadiness = {
    note: "Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.",
  };
  return root;
}

export function createSwivelLoungeChairLookDevLights(
  mode: "neutral" | "grazing" | "reference" = "neutral",
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Swivel Lounge Chair look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === "reference" ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === "grazing" ? 0.28 : mode === "reference" ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === "reference" ? 0xffcf8a : 0xfff4e8,
    mode === "grazing" ? 4.2 : mode === "reference" ? 2.6 : 2.15,
  );
  if (mode === "grazing") key.position.set(7.5, 1.1, 4.0);
  else if (mode === "reference") key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(
    0xa8c4ff,
    mode === "grazing" ? 0.12 : 0.42,
  );
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(
    0xfff1c4,
    mode === "grazing" ? 0.28 : 0.85,
  );
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [
    {
      id: "key",
      type: "area/softbox",
      role: "key",
      direction: "upper front-left of the camera, ~45 deg elevation",
      intensity: 2.4,
      color: "#FFF8F0",
      softness: "large source, soft shadow edges",
      evidence:
        "lit teak faces #9F6A42 vs shadowed teak faces #6E4529 (ratio ~0.68): soft key with strong fill",
    },
    {
      id: "fill",
      type: "area/bounce",
      role: "fill",
      direction: "camera right, near eye level",
      intensity: 1.1,
      color: "#FFFFFF",
      softness: "very broad",
      evidence: "shadow sides of posts keep readable grain; no crushed blacks",
    },
    {
      id: "top",
      type: "area",
      role: "rim/top",
      direction: "overhead",
      intensity: 0.8,
      color: "#FFFFFF",
      softness: "broad",
      evidence: "bright crowns on cushion tops and armrest upper faces",
    },
    {
      id: "environment",
      type: "environment",
      role: "environment",
      direction: "white seamless cyclorama",
      intensity: 1.0,
      color: "#FFFFFF",
      exposure: 1.0,
      toneMapping: "ACESFilmic",
      evidence: "pure white background and floor, soft floor bounce",
    },
    {
      id: "contact-shadow",
      type: "shadow",
      role: "contact-shadow",
      direction: "straight down under the base ring",
      intensity: 0.35,
      color: "#000000",
      softness: "blur radius ~0.08 m",
      evidence:
        "soft low-opacity contact shadow on the ground under the swivel ring (zone r2c1)",
    },
  ];
  lights.userData.lookDevTargets = {
    qualityPriority: "reference-fidelity",
    materialPass: {
      albedoPaletteRequired: true,
      roughnessVariationRequired: true,
      normalOrBumpRequired: true,
      localOverridesRequired: true,
      minimumTextureResolution: 1024,
      preferredTextureResolution: 2048,
      independentMapChannels: [
        "albedo",
        "roughness",
        "height",
        "normal",
        "ambient-occlusion",
      ],
      requiredSurfaceFrequencyBands: ["macro", "meso", "micro"],
      geometryReliefRequiredWhenSilhouetteAffected: true,
      referencePbrExtraction: {
        requiredWhenSourceImagePresent: true,
        targetThreshold: 0.7,
        stopOnLowConfidence: true,
        script: "forge/stage1_intake/extract_pbr_evidence.py",
        acceptedLimitation:
          "single-image extraction is reference-derived inference, not exact photogrammetry",
      },
      mustAvoid: [
        "single flat albedo per material",
        "uniform roughness",
        "albedo texture reused as roughness/height/normal/AO",
        "single-frequency random noise",
        "plastic-looking smooth bark, stone, cloth, foliage, or aged material",
        "local color/detail described only in prose without material masks",
        "claiming exact PBR recovery when confidence is below the target threshold",
      ],
    },
    lightingPass: {
      requiredTerms: [
        "key light",
        "fill light",
        "rim or environment light",
        "exposure",
        "tone mapping",
        "background",
        "contact shadow",
      ],
      mustAvoid: [
        "ambient-only lighting",
        "flat value range",
        "missing contact shadow",
        "reference lighting copied without separating material readability",
      ],
    },
    screenshotReview: [
      "Compare albedo palette and local color zones.",
      "Compare roughness/normal/bump response under light.",
      "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.",
      "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.",
      "Capture a neutral-light render to verify material readability without reference lighting.",
      "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.",
      "Capture a reference-matched render from the same camera framing as the source.",
    ],
  };
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createSwivelLoungeChairEnvironment(
  renderer: THREE.WebGLRenderer,
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameSwivelLoungeChairCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = maxDim / 2 / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createSwivelLoungeChairPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: {
    dof?: boolean;
    bloom?: boolean;
    bloomStrength?: number;
    dofFocus?: number;
    dofAperture?: number;
  } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(
      new BokehPass(scene, camera, {
        focus: options.dofFocus ?? 10.0,
        aperture: options.dofAperture ?? 0.0002,
        maxblur: 0.01,
      }),
    );
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(
      new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85),
    );
  }
  return composer;
}

export function configureSwivelLoungeChairRenderer(
  renderer: THREE.WebGLRenderer,
): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createSwivelLoungeChairInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
