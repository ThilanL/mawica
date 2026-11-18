import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ADD_LIGHT } from "../../Particles";
import { glowTexture, shaftTexture } from "../../textures";
import { easeInOutCubic, easeInOutSine, easeOutCubic, seg } from "../../timeline";
import { gold, poolTexture, satin, shadowTexture } from "../gfx";

/**
 * "A Special Gift": the model and its timeline, independent of React. The 3D card (gift.tsx) and the AR exports (ar/gift-ar.ts) both build from here,
 * so the box, ribbons, bow and opening motion exist once.
 */
export const DURATION = 11;
export const BOX = 2.0, LID_H = 0.55, BODY_H = 1.55, WALL = 0.08;

/** A ribbon: a strip of the given width swept along a path, with a soft crease down the middle so it catches the light like satin. */
export function ribbonStrip(path: THREE.Vector3[], width: number, across: THREE.Vector3, taper = 0) {
  const n = path.length, pos = new Float32Array(n * 9), idx: number[] = [], tan = new THREE.Vector3(), nor = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tan.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize(); nor.crossVectors(tan, across).normalize();
    const u = i / (n - 1), w = (width / 2) * (1 - taper * Math.pow(Math.abs(u - 0.5) * 2, 3)), puff = 0.022 + 0.012 * Math.sin(u * 19);
    [-1, 0, 1].forEach((k, j) => { const p = path[i]; pos.set([p.x + across.x * w * k + nor.x * (k === 0 ? puff : 0), p.y + across.y * w * k + nor.y * (k === 0 ? puff : 0), p.z + across.z * w * k + nor.z * (k === 0 ? puff : 0)], (i * 3 + j) * 3); });
    if (i < n - 1) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** One loop of a bow: a petal that leaves the knot, swells and returns to it. */
export function bowLoop(len: number, rise: number, spread: number, width: number) {
  const pts: THREE.Vector3[] = [], N = 40;
  for (let i = 0; i <= N; i++) { const th = (i / N) * Math.PI, rho = len * Math.pow(Math.sin(th), 0.75), ang = rise + (th - Math.PI / 2) * spread; pts.push(new THREE.Vector3(rho * Math.cos(ang), rho * Math.sin(ang), 0)); }
  return ribbonStrip(pts, width, new THREE.Vector3(0, 0, 1), 0.45);
}
/** A tail that leaves the knot, lies along the lid with a ripple and curls up a touch at its end. */
export function bowTail(len: number, width: number) {
  const pts: THREE.Vector3[] = [], N = 26;
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push(new THREE.Vector3(0.08 + u * len, 0.06 * (1 - u) * (1 - u) + 0.035 * Math.sin(u * 8.5) * u + 0.05 * Math.pow(u, 6), 0)); }
  return ribbonStrip(pts, width, new THREE.Vector3(0, 0, 1));
}
/** Warm light inside the box: bright at the heart, amber towards the walls. */
export function innerTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 88); g.addColorStop(0, "#fff3cf"); g.addColorStop(0.45, "#ffcd6e"); g.addColorStop(1, "#c8791f");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Geometry, materials and textures (`seg`: rounded-corner segments; fewer on phones). */
export function giftResources(mobile: boolean) {
  const seg = mobile ? 3 : 5;
  const innerTex = innerTexture(), glowTex = glowTexture(), shaftTex = shaftTexture();
  return {
    body: new RoundedBoxGeometry(BOX, BODY_H, BOX, seg, 0.1), wallX: new RoundedBoxGeometry(BOX, BODY_H, WALL, 2, 0.03), wallZ: new RoundedBoxGeometry(WALL, BODY_H, BOX, 2, 0.03), floor: new THREE.BoxGeometry(BOX - 0.02, 0.08, BOX - 0.02),
    lid: new RoundedBoxGeometry(BOX + 0.14, LID_H, BOX + 0.14, seg, 0.09),
    bandV: new RoundedBoxGeometry(0.34, BODY_H + 0.05, BOX + 0.06, 2, 0.04),
    bandH: new RoundedBoxGeometry(BOX + 0.06, BODY_H + 0.05, 0.34, 2, 0.04),
    lidV: new RoundedBoxGeometry(0.36, LID_H + 0.04, BOX + 0.2, 2, 0.04),
    lidH: new RoundedBoxGeometry(BOX + 0.2, LID_H + 0.04, 0.36, 2, 0.04),
    loop: bowLoop(0.98, 0.5, 0.66, 0.44), loopSmall: bowLoop(0.7, 1.0, 0.62, 0.38), knot: new RoundedBoxGeometry(0.34, 0.26, 0.4, 4, 0.12), tail: bowTail(0.95, 0.3), innerTex,
    innerPlane: new THREE.PlaneGeometry(BOX - 0.16, BOX - 0.16), shaftPlane: new THREE.PlaneGeometry(2.1, 3.4),
    rose: satin("#dc7aae", "#ffd9ec"), roseLid: satin("#e58bbb", "#ffe4f1"),
    ribbonMat: new THREE.MeshPhysicalMaterial({ color: "#f3c873", metalness: 0.3, roughness: 0.36, sheen: 1, sheenColor: new THREE.Color("#fff3d0"), sheenRoughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 1.1, side: THREE.DoubleSide }),
    ribbonFade: new THREE.MeshPhysicalMaterial({ color: "#f3c873", metalness: 0.3, roughness: 0.36, sheen: 1, sheenColor: new THREE.Color("#fff3d0"), sheenRoughness: 0.3, envMapIntensity: 1.1, transparent: true }),
    trim: gold(0.25), glowTex, shaftTex, shadowTex: shadowTexture(), poolTex: poolTexture("rgba(255,214,150,0.55)", "rgba(180,110,170,0.28)"),
    innerMat: new THREE.MeshBasicMaterial({ map: innerTex }),
    burstMat: new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, ...ADD_LIGHT }),
    shaftMat: new THREE.MeshBasicMaterial({ map: shaftTex, color: "#ffd9a0", transparent: true, opacity: 0, depthWrite: false, ...ADD_LIGHT }),
  };
}
export type GiftResources = ReturnType<typeof giftResources>;

export type GiftParts = {
  root: THREE.Group; ribbon: THREE.Group; lid: THREE.Group; bow: THREE.Group; inner: THREE.Mesh;
  light: THREE.PointLight | null; burst: THREE.Sprite | null; shaft: THREE.Mesh | null;
};

/**
 * Builds the gift (the box with its contents, lid and bow). `effects: false` leaves out the light, glow sprite and light shaft, which AR formats
 * cannot carry. Nodes are named so animation tracks can address them.
 */
export function buildGift(r: GiftResources, { effects = true } = {}): GiftParts {
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string, p: [number, number, number] = [0, 0, 0]) => { const o = new THREE.Mesh(g, m); o.name = name; o.position.set(...p); return o; };
  const root = new THREE.Group(); root.name = "gift";
  // an open box: four walls and a floor, so the inside is really there when the lid lifts
  for (const k of [-1, 1]) root.add(mesh(r.wallX, r.rose, `wall_x${k}`, [0, BODY_H / 2, k * (BOX / 2 - WALL / 2)]));
  for (const k of [-1, 1]) root.add(mesh(r.wallZ, r.rose, `wall_z${k}`, [k * (BOX / 2 - WALL / 2), BODY_H / 2, 0]));
  root.add(mesh(r.floor, r.rose, "floor", [0, 0.06, 0]));
  const base = mesh(r.body, r.trim, "base_trim", [0, 0.03, 0]); base.scale.set(1.02, 0.04, 1.02); root.add(base);
  const ribbon = new THREE.Group(); ribbon.name = "ribbon";
  ribbon.add(mesh(r.bandV, r.ribbonFade, "band_v", [0, BODY_H / 2, 0]), mesh(r.bandH, r.ribbonFade, "band_h", [0, BODY_H / 2, 0]));
  root.add(ribbon);
  // the inside glows: a golden plane just under the open lid line
  const inner = mesh(r.innerPlane, r.innerMat, "inner_glow", [0, BODY_H * 0.82, 0]); inner.rotation.x = -Math.PI / 2; root.add(inner);
  const lid = new THREE.Group(); lid.name = "lid"; lid.position.set(0, BODY_H + LID_H / 2, 0);
  const lidTrim = mesh(r.lid, r.trim, "lid_trim", [0, -LID_H / 2 + 0.02, 0]); lidTrim.scale.set(1.01, 0.05, 1.01);
  lid.add(mesh(r.lid, r.roseLid, "lid_box"), mesh(r.lidV, r.ribbonMat, "lid_band_v"), mesh(r.lidH, r.ribbonMat, "lid_band_h"), lidTrim);
  const bow = new THREE.Group(); bow.name = "bow"; bow.position.set(0, LID_H / 2 + 0.05, 0); bow.rotation.set(0, 0.5, 0);
  for (const a of [0, Math.PI]) { const o = mesh(r.loop, r.ribbonMat, `loop_${a ? 1 : 0}`); o.rotation.y = a; bow.add(o); }
  for (const a of [Math.PI / 2, -Math.PI / 2]) { const o = mesh(r.loopSmall, r.ribbonMat, `loop_small_${a > 0 ? 0 : 1}`); o.rotation.y = a; bow.add(o); }
  bow.add(mesh(r.knot, r.ribbonMat, "knot", [0, 0.13, 0]));
  const t0 = mesh(r.tail, r.ribbonMat, "tail_0", [0, -0.02, 0]); t0.rotation.y = 0.55;
  const t1 = mesh(r.tail, r.ribbonMat, "tail_1", [0, -0.02, 0]); t1.rotation.y = Math.PI + 0.35;
  bow.add(t0, t1); lid.add(bow); root.add(lid);
  let light: THREE.PointLight | null = null, burst: THREE.Sprite | null = null, shaft: THREE.Mesh | null = null;
  if (effects) {
    light = new THREE.PointLight("#ffc66a", 0, 8, 1.5); light.position.set(0, BODY_H * 0.85, 0); root.add(light);
    burst = new THREE.Sprite(r.burstMat); burst.position.set(0, BODY_H + 0.45, 0); burst.scale.setScalar(2); burst.renderOrder = 5; root.add(burst);
    shaft = mesh(r.shaftPlane, r.shaftMat, "shaft", [0, BODY_H + 1.9, 0]); root.add(shaft);
  }
  return { root, ribbon, lid, bow, inner, light, burst, shaft };
}

/** Everything the opening moves at time t. A pure function of t, so seeks, thumbnails and baked animation clips all show the same moment. */
export function giftPose(t: number) {
  const bob = Math.sin(t * 1.3) * 0.09;
  const un = easeInOutCubic(seg(t, 3.0, 4.9)); // 1) the ribbon loosens: the bands slacken, slip down and fall away
  // 2) the lid stirs, then rises on the light, tips back and hovers (it never passes through the box)
  const stir = Math.sin(seg(t, 4.7, 5.4) * Math.PI * 3) * 0.035 * (1 - seg(t, 5.2, 5.6));
  const lift = easeInOutCubic(seg(t, 5.2, 7.0)), tip = easeInOutCubic(seg(t, 5.6, 7.4)), hover = Math.sin(t * 1.1 + 1) * 0.04 * tip;
  // 3) golden light wells up from inside
  const glow = easeInOutSine(seg(t, 5.0, 7.6)) * (0.9 + 0.1 * Math.sin(t * 2.2));
  return {
    bob, rise: 0.25 * easeOutCubic(seg(t, 0, 3)), spin: t * 0.16,
    ribbon: { visible: un < 0.999, scale: [1 + un * 0.16, 1 - un * 0.5, 1 + un * 0.16] as const, y: -un * un * 0.55, rotY: un * 0.22, opacity: 1 - easeInOutCubic(seg(t, 3.5, 4.6)), loosen: un },
    lid: { pos: [0.1 * tip, BODY_H + LID_H / 2 + lift * 1.0 + hover, -0.95 * tip] as const, rot: [-tip * 0.72 + stir, 0.18 * tip, stir * 0.6 + 0.07 * tip] as const, open: lift },
    bowRotY: 0.5 + Math.sin(t * 0.9) * 0.03,
    glow,
  };
}
export type GiftPose = ReturnType<typeof giftPose>;
