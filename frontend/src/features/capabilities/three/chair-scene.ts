import * as THREE from "three";
import {
  configureSwivelLoungeChairRenderer,
  createSwivelLoungeChairEnvironment,
  createSwivelLoungeChairInspectControls,
  createSwivelLoungeChairLookDevLights,
  createSwivelLoungeChairModel,
  frameSwivelLoungeChairCamera,
  type ProceduralModelRuntime,
} from "./createSwivelLoungeChairModel";

/**
 * Bộ điều khiển cảnh 3D của ghế xoay (không phụ thuộc React).
 * Model do img2threejs sinh ra (3d/swivel-chair/object-sculpt-spec.json) — mọi quyết định hình học
 * nằm trong spec; file này chỉ dựng sân khấu: renderer, đèn, bóng nền, xoay và tách rời.
 */

export type ChairSceneOptions = {
  azimuthDeg?: number;
  elevationDeg?: number;
  /** Cho phép kéo xoay bằng chuột/cảm ứng */
  interactive?: boolean;
  /** Chế độ đèn look-dev của factory */
  lightMode?: "neutral" | "grazing" | "reference";
  background?: string | null;
  margin?: number;
  /** Tự vẽ liên tục (animation loop); false = chỉ vẽ khi gọi render() */
  loop?: boolean;
  onFrame?: () => void;
  /** Bằng chứng blockout: thay mọi vật liệu bằng albedo phẳng, không texture (map-stripped render) */
  stripMaps?: boolean;
  /** Canh khung camera theo trạng thái tách rời này, để các bộ phận bay ra không bị cắt khỏi khung */
  frameExplode?: number;
  /** Độ đậm bóng đổ trên sàn */
  shadowOpacity?: number;
};

export type ChairScene = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  model: THREE.Group;
  runtime: ProceduralModelRuntime;
  /** 0 = lắp ráp, 1 = tách rời hoàn toàn */
  setExplode: (amount: number) => void;
  /** Góc xoay (radian) của phần trên ghế quanh trục đế xoay */
  setSwivel: (radians: number) => void;
  /** Góc xoay (radian) của cả ghế quanh trục đứng */
  setTurn: (radians: number) => void;
  /** Vị trí màn hình (px) của tâm một cụm tách rời — để gắn nhãn HTML */
  projectGroup: (group: string) => ScreenPoint | null;
  /** Vị trí màn hình (px) của tâm một component theo id trong spec */
  projectComponent: (componentId: string) => ScreenPoint | null;
  /** Khung chữ nhật (px) bao hình chiếu của cả ghế ở trạng thái hiện tại */
  projectBounds: () => ScreenRect;
  /** Tạm dừng / chạy lại vòng vẽ (khi canvas ra khỏi màn hình) */
  setActive: (active: boolean) => void;
  resize: () => void;
  render: () => void;
  dispose: () => void;
};

export type ScreenPoint = { x: number; y: number; visible: boolean };
export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type ExplodeEntry = {
  node: THREE.Object3D;
  base: THREE.Vector3;
  vector: THREE.Vector3;
  group: string;
};

export function createChairScene(
  canvas: HTMLCanvasElement,
  options: ChairSceneOptions = {},
): ChairScene {
  const {
    azimuthDeg = 135,
    elevationDeg = 18,
    interactive = false,
    lightMode = "reference",
    background = "#ffffff",
    margin = 1.18,
    loop = true,
    onFrame,
    stripMaps = false,
    frameExplode = 0,
    shadowOpacity = 0.22,
  } = options;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: background === null,
    preserveDrawingBuffer: !loop,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  configureSwivelLoungeChairRenderer(renderer);
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  scene.environment = createSwivelLoungeChairEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  scene.add(createSwivelLoungeChairLookDevLights(lightMode));

  const model = createSwivelLoungeChairModel({
    castShadow: true,
    receiveShadow: true,
  });
  const runtime = model.userData.sculptRuntime as ProceduralModelRuntime;

  if (stripMaps) {
    const flat = new Map<string, THREE.MeshStandardMaterial>();
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const spec = (mesh.material as THREE.Material).userData
        ?.sculptMaterial as { id?: string; baseColor?: string } | undefined;
      const key = spec?.id ?? "unknown";
      if (!flat.has(key)) {
        flat.set(
          key,
          new THREE.MeshStandardMaterial({
            color: spec?.baseColor ?? "#888888",
            roughness: 0.85,
            metalness: 0,
          }),
        );
      }
      (mesh.material as THREE.Material).dispose();
      mesh.material = flat.get(key)!;
    });
  }

  // Gom mọi thứ trên đế vào một nhóm xoay: sàn ghế + các lưới đan cấp gốc (xem spec: whyRootLevel)
  const swivel = new THREE.Group();
  swivel.name = "swivel-upper";
  for (const child of [...model.children]) {
    const componentId = (
      child.userData.sculptComponent as { id?: string } | undefined
    )?.id;
    if (
      componentId &&
      !componentId.startsWith("base-") &&
      componentId !== "swivel-plate"
    ) {
      swivel.add(child);
    }
  }
  model.add(swivel);
  scene.add(model);

  // Mặt sàn chỉ hứng bóng — giữ nền trắng liền như ảnh studio
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.ShadowMaterial({ opacity: shadowOpacity }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Tách rời theo actionProfile.destruction.explodeVector của từng bộ phận
  const explodeEntries: ExplodeEntry[] = [];
  const groupAnchors = new Map<string, THREE.Object3D[]>();
  const componentNodes = new Map<string, THREE.Object3D>();
  model.traverse((object) => {
    const componentId = (
      object.userData.sculptComponent as { id?: string } | undefined
    )?.id;
    if (componentId && !componentNodes.has(componentId))
      componentNodes.set(componentId, object);
    const profile = object.userData.actionProfile as
      | { destruction?: { explodeVector?: number[]; fractureGroup?: string } }
      | undefined;
    const vector = profile?.destruction?.explodeVector;
    if (!vector) return;
    const group = profile?.destruction?.fractureGroup ?? "frame";
    explodeEntries.push({
      node: object,
      base: object.position.clone(),
      vector: new THREE.Vector3(vector[0], vector[1], vector[2]),
      group,
    });
    groupAnchors.set(group, [...(groupAnchors.get(group) ?? []), object]);
  });
  // Vector tách của đế hướng xuống sàn; khi hiển thị thì nâng cả ghế lên đúng quãng đó để đế nằm yên trên sàn
  const lift = Math.max(0, ...explodeEntries.map((entry) => -entry.vector.y));

  const applyExplode = (amount: number) => {
    const t = THREE.MathUtils.clamp(amount, 0, 1);
    for (const entry of explodeEntries) {
      entry.node.position.copy(entry.base).addScaledVector(entry.vector, t);
    }
    model.position.y = lift * t;
  };

  // Ống kính dài (fov 22°) như ảnh sản phẩm studio: ít méo phối cảnh hơn
  const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 50);
  const controls = interactive
    ? createSwivelLoungeChairInspectControls(camera, renderer.domElement)
    : null;
  if (controls) {
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.maxDistance = 50;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.49;
  }

  const frame = () => {
    // frameSwivelLoungeChairCamera canh theo chiều dọc; khung dọc (aspect < 1) cần nới lề để khỏi cắt ngang
    const fitMargin = margin / Math.min(1, camera.aspect);
    applyExplode(frameExplode);
    frameSwivelLoungeChairCamera(camera, model, {
      margin: fitMargin,
      azimuthDeg,
      elevationDeg,
    });
    if (controls) {
      controls.target.copy(
        new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()),
      );
      controls.update();
    }
    applyExplode(currentExplode);
  };

  let currentExplode = 0;

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const render = () => {
    controls?.update();
    renderer.render(scene, camera);
  };

  resize();
  frame();

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    render();
    onFrame?.();
  };
  if (loop) tick();
  else render();

  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const toScreen = (): ScreenPoint => {
    centre.project(camera);
    return {
      x: (centre.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-centre.y * 0.5 + 0.5) * canvas.clientHeight,
      visible: centre.z < 1,
    };
  };

  return {
    renderer,
    scene,
    camera,
    model,
    runtime,
    setExplode(amount) {
      currentExplode = THREE.MathUtils.clamp(amount, 0, 1);
      applyExplode(currentExplode);
    },
    setSwivel(radians) {
      swivel.rotation.y = radians;
    },
    setTurn(radians) {
      model.rotation.y = radians;
    },
    projectGroup(group) {
      const nodes = groupAnchors.get(group);
      if (!nodes?.length) return null;
      box.makeEmpty();
      for (const node of nodes) box.expandByObject(node);
      box.getCenter(centre);
      return toScreen();
    },
    projectComponent(componentId) {
      const node = componentNodes.get(componentId);
      if (!node) return null;
      box.makeEmpty().expandByObject(node).getCenter(centre);
      return toScreen();
    },
    projectBounds() {
      box.makeEmpty().expandByObject(model);
      const rect = {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      };
      for (let i = 0; i < 8; i++) {
        corner
          .set(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z,
          )
          .project(camera);
        const x = (corner.x * 0.5 + 0.5) * canvas.clientWidth;
        const y = (-corner.y * 0.5 + 0.5) * canvas.clientHeight;
        rect.left = Math.min(rect.left, x);
        rect.right = Math.max(rect.right, x);
        rect.top = Math.min(rect.top, y);
        rect.bottom = Math.max(rect.bottom, y);
      }
      return rect;
    },
    resize() {
      resize();
      frame();
    },
    render,
    setActive(active) {
      if (!loop) return;
      cancelAnimationFrame(raf);
      if (active) tick();
    },
    dispose() {
      cancelAnimationFrame(raf);
      controls?.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
