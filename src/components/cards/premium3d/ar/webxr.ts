import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createGiftArScene, WISH_DONE } from "./scene";
import type { WishText } from "./wish";

/**
 * Android AR (WebXR `immersive-ar`, Chrome with ARCore). Loaded only when the recipient taps "View in AR".
 * Flow: find the floor (hit-test reticle) → tap to place the gift → it opens → the wish rises → the overlay offers the full message and the ending.
 */
/** "card": the recipient tapped the wish card in AR (the page shows it big). */
export type ArState = "starting" | "scanning" | "ready" | "playing" | "wish" | "card" | "ended" | "error";

export type ArHandle = { end(): void };

export async function startGiftAR(o: { wish: WishText; overlay: HTMLElement; reduced: boolean; onState(s: ArState, info?: { clipped?: boolean; error?: string }): void }): Promise<ArHandle> {
  const xr = navigator.xr;
  if (!xr) throw new Error("WebXR is not available");
  // Ask for the session first: it needs the tap's user activation, which expires if we build the scene before asking.
  const session = await xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay", "local-floor"], domOverlay: { root: o.overlay } });
  o.onState("starting");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.domElement.style.display = "none"; // the XR compositor shows the frames; the canvas itself stays out of the page
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // neutral studio light so gold and satin read on any floor
  scene.add(new THREE.HemisphereLight("#fff4e6", "#5a4a60", 0.6));
  const sun = new THREE.DirectionalLight("#fff1e0", 1.1); sun.position.set(0.5, 1.5, 0.8); scene.add(sun);
  const camera = new THREE.PerspectiveCamera();

  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd88a", transparent: true, opacity: 0.9 }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  // a soft shadow under the gift so it sits on the floor
  const shadowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!; const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));

  const ar = createGiftArScene(o.wish, { reduced: o.reduced });
  ar.root.add(shadow); shadow.position.y = 0.002;
  ar.root.visible = false; scene.add(ar.root);

  let hitSource: XRHitTestSource | undefined, placedAt = -1, state: ArState = "starting", ended = false;
  const set = (s: ArState, info?: { clipped?: boolean; error?: string }) => { if (s !== state) { state = s; o.onState(s, info); } };
  try {
    const viewer = await session.requestReferenceSpace("viewer");
    hitSource = await session.requestHitTestSource?.({ space: viewer });
  } catch { /* no hit-test source: handled below */ }
  if (!hitSource) { set("error", { error: "This phone can't find surfaces for AR." }); session.end().catch(() => {}); ar.dispose(); renderer.dispose(); renderer.domElement.remove(); return { end() {} }; }

  const camPos = new THREE.Vector3(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  // After placing, a tap that lands on the wish card opens it big on the page (the overlay shows over the camera).
  const ray = new THREE.Raycaster(), m4 = new THREE.Matrix4();
  const tapCard = (e: XRInputSourceEvent) => {
    const ref = renderer.xr.getReferenceSpace(), pose = ref && e.frame.getPose(e.inputSource.targetRaySpace, ref);
    if (!pose || !ar.panelShown()) return;
    m4.fromArray(pose.transform.matrix);
    ray.ray.origin.setFromMatrixPosition(m4); ray.ray.direction.set(0, 0, -1).transformDirection(m4);
    if (ray.intersectObject(ar.panel, false).length) o.onState("card");
  };
  const place = (e: XRInputSourceEvent) => {
    if (placedAt >= 0) return tapCard(e);
    if (!reticle.visible) return;
    reticle.matrix.decompose(pos, quat, scl);
    ar.root.position.copy(pos);
    renderer.xr.getCamera().getWorldPosition(camPos);
    ar.root.rotation.set(0, Math.atan2(camPos.x - pos.x, camPos.z - pos.z), 0); // face the viewer
    ar.root.visible = true; reticle.visible = false; placedAt = performance.now();
    set("playing");
  };
  session.addEventListener("select", place);

  await renderer.xr.setSession(session);
  set("scanning");
  renderer.setAnimationLoop((_, frame) => {
    if (!frame) return;
    if (placedAt < 0 && hitSource) {
      const ref = renderer.xr.getReferenceSpace(), hit = ref && frame.getHitTestResults(hitSource)[0], p = hit && ref ? hit.getPose(ref) : undefined;
      reticle.visible = !!p; if (p) reticle.matrix.fromArray(p.transform.matrix);
      set(p ? "ready" : "scanning");
    }
    if (placedAt >= 0) {
      const t = (performance.now() - placedAt) / 1000;
      ar.update(t, renderer.xr.getCamera());
      if (o.reduced || t > WISH_DONE) set("wish", { clipped: ar.clipped });
    }
    renderer.render(scene, camera);
  });

  const cleanup = () => {
    if (ended) return; ended = true;
    renderer.setAnimationLoop(null);
    hitSource?.cancel();
    session.removeEventListener("select", place);
    ar.dispose(); reticle.geometry.dispose(); (reticle.material as THREE.Material).dispose(); shadow.geometry.dispose(); (shadow.material as THREE.Material).dispose(); shadowTex.dispose();
    scene.environment?.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    set("ended");
  };
  session.addEventListener("end", cleanup);
  return { end: () => { session.end().catch(cleanup); } };
}
