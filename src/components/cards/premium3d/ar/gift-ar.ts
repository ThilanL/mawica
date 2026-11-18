import * as THREE from "three";
import { rng } from "../stage/gfx";
import { easeInOutCubic, easeInOutSine, easeOutCubic, seg } from "../timeline";
import { BODY_H, buildGift, giftPose, giftResources, type GiftResources } from "../stage/cards/gift-model";
import { ALL, AR_FPS, PANEL_H, sampleClip, twoSided, type ArModel, type ClipExtra } from "./model";

export { AR_FPS };

/**
 * "A Special Gift" as a self-contained AR model (Phase AR-1a): the same box, ribbons, bow and opening timeline as the 3D card, adapted to what
 * glTF (Android) and USDZ / AR Quick Look (iPhone) can carry. It holds no personal data: names and messages are added on the recipient's phone later.
 *
 * What changes for AR, and why:
 * - Real-world size: the 2-unit box becomes 0.30 m (the formats use metres, Y up). Origin at the centre of the box's base, resting on the floor.
 * - No bob, spin or float: the box sits where the person places it.
 * - Transforms only: neither format can animate opacity, light intensity or material colour, so the ribbon slips down and shrinks into the box
 *   instead of fading, and the glow is a constant emissive plane revealed by the lid. The point light, additive glow sprite and light shaft are
 *   left out (AR viewers ignore custom lights and blending).
 * - Gold sparkles are small emissive meshes moved by keyframes (no point sprites in either format).
 * - No ground or shadow planes: AR viewers draw their own contact shadow.
 */
export const AR_SCALE = 0.15; // 2.0 units -> 0.30 m
/** The AR clip plays the card's timeline from just before the ribbon loosens to the lid at rest, then holds. */
export const AR_FROM = 2.6, AR_OPEN = 7.6, AR_HOLD = 9; // a long hold so the wish card can be read before Quick Look loops
export const AR_LENGTH = AR_OPEN - AR_FROM + AR_HOLD; // 14 s
const SPARKS = 16;

type Spark ={ mesh: THREE.Mesh; at: number; ang: number; rad: number; top: number; turn: number };

export type GiftAR = ArModel & { anchor: THREE.Object3D };

/** Builds the AR gift. `pose(time)` sets the model at a moment of the AR clip (seconds from its start); `clip()` samples it into keyframes. */
export function buildGiftAR(): GiftAR {
  const r: GiftResources = giftResources(false);
  // Materials both formats understand: the inside glow becomes emissive, the bands keep the satin ribbon look without transparency.
  const innerAR = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#ffffff", emissiveMap: r.innerTex, roughness: 1, metalness: 0 });
  const sparkMat = new THREE.MeshStandardMaterial({ color: "#f6cf7a", emissive: "#ffcc66", emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 });
  const sparkGeo = new THREE.OctahedronGeometry(0.07, 0);
  // The bow is single-sheet ribbon drawn double-sided on the card. USDZ has no double-sided flag in the exporter, so the back faces are real geometry here.
  for (const k of ["loop", "loopSmall", "tail"] as const) { const old = r[k]; r[k] = twoSided(old); old.dispose(); }
  r.ribbonMat.side = THREE.FrontSide;
  const parts = buildGift(r, { effects: false });
  parts.inner.material = innerAR;
  for (const band of parts.ribbon.children) (band as THREE.Mesh).material = r.ribbonMat;

  const scene = new THREE.Group(); scene.name = "mawica_special_gift";
  scene.scale.setScalar(AR_SCALE);
  scene.add(parts.root);
  const anchor = new THREE.Object3D(); anchor.name = "wish_anchor"; anchor.position.set(0, BODY_H + 1.6, 0.4); scene.add(anchor); // where the personal wish rises to (AR-1b/1c)

  const rand = rng(20261117), sparks: Spark[] = [];
  for (let i = 0; i < SPARKS; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat); mesh.name = `spark_${i}`; parts.root.add(mesh);
    sparks.push({ mesh, at: 5.3 + (i / SPARKS) * 1.6 + rand() * 0.2, ang: rand() * Math.PI * 2, rad: 0.25 + rand() * 0.55, top: 2.6 + rand() * 1.6, turn: 1.5 + rand() * 2 });
  }

  function pose(time: number) {
    const t = AR_FROM + time, p = giftPose(t); // during the hold the lid keeps its gentle hover
    const fade = p.ribbon.opacity; // what fades on the card shrinks into the box here
    const s = 0.35 + 0.65 * fade;
    parts.ribbon.visible = true;
    parts.ribbon.scale.set(p.ribbon.scale[0] * s, p.ribbon.scale[1] * Math.max(0.02, fade), p.ribbon.scale[2] * s);
    parts.ribbon.position.y = p.ribbon.y * fade;
    parts.ribbon.rotation.y = p.ribbon.rotY;
    parts.lid.position.set(...p.lid.pos); parts.lid.rotation.set(...p.lid.rot);
    parts.bow.rotation.y = p.bowRotY;
    for (const k of sparks) {
      const u = seg(t, k.at, k.at + 3.2), grow = easeOutCubic(seg(u, 0, 0.18)) * (1 - easeInOutSine(seg(u, 0.7, 1)));
      const a = k.ang + u * k.turn, rad = k.rad * (0.4 + 0.6 * u);
      k.mesh.position.set(Math.cos(a) * rad, BODY_H * 0.8 + (k.top - BODY_H * 0.8) * easeOutCubic(u), Math.sin(a) * rad);
      k.mesh.rotation.set(u * 3, u * 5 + k.ang, 0);
      k.mesh.scale.setScalar(Math.max(0.001, grow)); // USDZ cannot hide a node, so unborn and spent sparks shrink to a point inside the box
    }
  }

  function clip(extra?: ClipExtra) {
    const nodes = [parts.ribbon, parts.lid, parts.bow, ...sparks.map((k) => k.mesh), ...(extra?.nodes ?? [])].map((o) => ({ o, props: ALL }));
    return sampleClip(nodes, (time) => { pose(time); extra?.pose(time); }, AR_LENGTH, "open");
  }

  pose(0);
  scene.updateMatrixWorld(true);
  parts.root.position.y = -new THREE.Box3().setFromObject(parts.root).min.y / AR_SCALE; // rest exactly on the floor (the gold base trim dips a few mm below 0)
  // the wish card rises out of the open box once the lid has tipped back, to just above and in front of it
  const wish = { from: new THREE.Vector3(0, 0.22, 0), to: anchor.position.clone().multiplyScalar(AR_SCALE).add(new THREE.Vector3(0, PANEL_H / 2 + 0.05, 0.1)), at: 7.5 - AR_FROM };
  const light = { pos: new THREE.Vector3(0, 0.2, 0), color: "#ffc66a", range: 0.9, level: (time: number) => easeInOutCubic(seg(AR_FROM + time, 5.0, 7.6)) }; // golden light from inside the box
  return {
    scene, anchor, pose, clip, length: AR_LENGTH, fps: AR_FPS, wish, light,
    dispose() { (Object.values(r) as { dispose(): void }[]).forEach((x) => x.dispose()); innerAR.dispose(); sparkMat.dispose(); sparkGeo.dispose(); },
  };
}
