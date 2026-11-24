import * as THREE from "three";
import { GLOBE } from "../stage/cards/globe-model";
import { buildSnowGlobe, type GlobeParts } from "../stage/cards/globe/build";
import { engravingLines } from "../stage/cards/globe/engraving";
import { STORM_SETTLE, flicker, smooth, starGlow, stormEnergy } from "../stage/cards/globe/motion";
import { createSmoke, createSnow, setPointScale } from "../stage/cards/globe/particles";
import { rng } from "../stage/gfx";
import { ALL, sampleClip, type ArModel, type ClipExtra } from "./model";

/**
 * "Christmas Snow Globe" as an AR model: the same model as the web card (globe-model.ts, built with the "ar" quality profile), at its real size,
 * 220 mm tall, resting on the floor, logo facing the viewer.
 *
 * Android (live WebXR, our own renderer): the full scene, plus real falling snow, chimney smoke, the star's light and glow, twinkling and the
 * snowstorm when the recipient taps the globe. iPhone (USDZ, Quick Look): transforms only, so the snow is 32 small flakes on a seamless
 * keyframed loop and the star breathes and turns; glass is plain transparency (no refraction), lighting is Quick Look's own.
 */
export const GLOBE_AR_LENGTH = 12; // seconds: the USDZ clip loops seamlessly
export const GLOBE_AR_FPS = 10; // the flakes fall slowly: 10 keyframes a second interpolate smoothly and keep the file small
const USDZ_FLAKES = 28;
/** The wish card hangs to the right of the globe (never in front of it), at 60% of the standard card size. */
export const GLOBE_WISH = { scale: 0.6, x: 0.205, y: 0.13, z: 0.03 };

type Options = { names?: { recipient: string; sender: string }; assets?: string };
export type GlobeAR = ArModel & { parts: GlobeParts; engraving: THREE.Mesh };

export async function buildGlobeAR(o: Options = {}): Promise<GlobeAR> {
  const engraving = o.names ? engravingLines(o.names.recipient, o.names.sender) : [];
  const parts = await buildSnowGlobe({ profile: "ar", engraving, assets: o.assets });
  const scene = new THREE.Group(); scene.name = "mawica_snow_globe_ar";
  scene.add(parts.root);

  // iPhone snow: small bright flakes, each falling down its own column on a loop that divides the clip length exactly (no jump when Quick Look loops)
  const rnd = rng(1225), flakeGeo = new THREE.IcosahedronGeometry(0.0011, 0), flakeMat = new THREE.MeshStandardMaterial({ name: "ar_flake", color: "#ffffff", emissive: "#eef2ff", emissiveIntensity: 0.6, roughness: 0.6 });
  const flakes = Array.from({ length: USDZ_FLAKES }, (_, i) => {
    const r = Math.sqrt(rnd()) * 0.055, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const top = GLOBE.centerY + Math.sqrt((GLOBE.radius - 0.008) ** 2 - r * r) - 0.004, bottom = 0.085;
    const mesh = new THREE.Mesh(flakeGeo, flakeMat); mesh.name = `flake_${i}`; parts.root.add(mesh);
    return { mesh, x, z, top, bottom, laps: 1 + (rnd() < 0.5 ? 1 : 0), phase: rnd(), sway: 0.002 + rnd() * 0.002, s: 0.7 + rnd() * 0.6 };
  });
  const star = parts.nodes.star;

  function pose(time: number) {
    const k = time / GLOBE_AR_LENGTH;
    for (const f of flakes) {
      const u = (f.phase + k * f.laps) % 1, w = (f.phase + k) * Math.PI * 2;
      f.mesh.position.set(f.x + Math.cos(w * 2) * f.sway, f.top - u * (f.top - f.bottom), f.z + Math.sin(w * 2) * f.sway);
      f.mesh.scale.setScalar(Math.max(0.001, f.s * smooth(0, 0.08, u) * (1 - smooth(0.92, 1, u)))); // Quick Look cannot fade: flakes grow in at the top and melt into the snow
    }
    star.scale.setScalar(1 + 0.06 * Math.sin(k * Math.PI * 2 * 3)); // the star breathes three times per loop
    star.rotation.y = Math.sin(k * Math.PI * 2) * 0.35;
  }
  function clip(extra?: ClipExtra) {
    const nodes = [...flakes.map((f) => ({ o: f.mesh as THREE.Object3D, props: ["position", "scale"] as const })), { o: star as THREE.Object3D, props: ["quaternion", "scale"] as const }, ...(extra?.nodes ?? []).map((n) => ({ o: n, props: ALL }))];
    return sampleClip(nodes, (time) => { pose(time); extra?.pose(time); }, GLOBE_AR_LENGTH, "snow", GLOBE_AR_FPS);
  }

  // Android only: real snow and smoke (points are never written to the files), lights and the snowstorm
  let snow: ReturnType<typeof createSnow> | null = null, smoke: ReturnType<typeof createSmoke> | null = null, stormAt = -1, clock = 0;
  const top = parts.root.worldToLocal(parts.nodes.chimneyTop.getWorldPosition(new THREE.Vector3()));
  const windowMats = [...new Set(parts.nodes.windows.flatMap((m) => [m.material].flat() as THREE.MeshStandardMaterial[]))], windowBase = windowMats.map((m) => m.emissiveIntensity);
  const starMat = (star.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshPhysicalMaterial | undefined, starBase = starMat?.emissiveIntensity ?? 1;
  function live(time: number, camera: THREE.Camera, bufferHeight: number) {
    if (!snow) { // created on first use, so the iPhone export never pays for them
      snow = createSnow(320, 1, 1.6); parts.root.add(snow.points);
      if (top.lengthSq() > 0) { smoke = createSmoke([top.x, top.y + 0.001, top.z], 1, 18); parts.root.add(smoke.points); }
      flakes.forEach((f) => { f.mesh.visible = false; }); // real snow replaces the keyframed flakes
    }
    clock = time;
    const age = stormAt >= 0 ? time - stormAt : -1, e = age >= 0 && age < STORM_SETTLE ? stormEnergy(age) : 0;
    setPointScale([snow.points.material as THREE.ShaderMaterial, ...(smoke ? [smoke.points.material as THREE.ShaderMaterial] : [])], bufferHeight, camera as THREE.PerspectiveCamera);
    snow.update(time, e, age); smoke?.update(time, smooth(0.5, 2, time));
    windowMats.forEach((m, i) => { m.emissiveIntensity = windowBase[i] * flicker(time, 1.3); });
    if (starMat) starMat.emissiveIntensity = starBase * starGlow(time);
    star.rotation.y = Math.sin(time * 0.35) * 0.35;
  }

  pose(0);
  scene.updateMatrixWorld(true);
  const minY = new THREE.Box3().setFromObject(scene).min.y; if (Math.abs(minY) > 1e-6) parts.root.position.y -= minY; // exactly on the floor
  return {
    scene, parts, engraving: parts.nodes.engraving, length: GLOBE_AR_LENGTH, fps: GLOBE_AR_FPS, pose, clip, live, shadow: 0.3,
    onTap() { stormAt = clock; },
    wish: { from: new THREE.Vector3(GLOBE_WISH.x, 0.02, GLOBE_WISH.z), to: new THREE.Vector3(GLOBE_WISH.x, GLOBE_WISH.y, GLOBE_WISH.z), at: 1.2, scale: GLOBE_WISH.scale },
    light: { pos: star.getWorldPosition(new THREE.Vector3()), color: "#ffd98a", range: 0.35, level: (time: number) => 0.6 * starGlow(time) },
    dispose() { snow?.dispose(); smoke?.dispose(); flakeGeo.dispose(); flakeMat.dispose(); parts.dispose(); },
  };
}
