import * as THREE from "three";
import { easeOutCubic, lerp, seg } from "../../timeline";
import { rng } from "../gfx";

/**
 * "Magical Christmas Tree": the layout and timeline, independent of React. The 3D card (tree.tsx) and the AR model (ar/tree-ar.ts) both build from
 * here, so the boughs, ornaments, garland and the order they light up in exist once.
 */
export const DURATION = 11;
export const BASE_Y = 0.85, HEIGHT = 6.5, TOP_Y = BASE_Y + HEIGHT;
/** Radius of the tree's silhouette at height fraction v (0 = lowest boughs, 1 = tip). */
export const radiusAt = (v: number) => 2.3 * Math.pow(1 - v, 0.88) + 0.1;

/** One bough: two crossed, serrated, drooping blades. The saw-tooth edge reads as needles; dark at the trunk, bright at the tip. `N`: segments. */
export function frondGeometry(N = 9) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const blade = (roll: number, wide: number) => {
    const o = pos.length / 3, c = Math.cos(roll), s = Math.sin(roll);
    for (let i = 0; i <= N; i++) {
      const u = i / N, w = wide * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.75) * (i % 2 ? 1 : 0.5) + 0.004;
      const sag = -0.3 * u * u + 0.1 * Math.pow(u, 5), shade = 0.22 + 0.78 * Math.pow(u, 0.7);
      for (const k of [-1, 0, 1]) { const x = k * w, y = sag + (k === 0 ? 0.035 * Math.sin(Math.PI * u) : 0); pos.push(x * c - y * s, x * s + y * c, u); const e = k === 0 ? shade * 0.72 : shade; col.push(e, e, e); }
      if (i < N) for (let j = 0; j < 2; j++) { const p = o + i * 3 + j, q = p + 3; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    }
  };
  blade(0, 0.2); blade(Math.PI / 2, 0.11);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** Soft halo with four long rays, for the star. */
export function flareTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, "rgba(255,246,214,0.95)"); g.addColorStop(0.12, "rgba(255,214,130,0.5)"); g.addColorStop(0.45, "rgba(255,190,100,0.12)"); g.addColorStop(1, "rgba(255,180,90,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.globalCompositeOperation = "lighter";
  for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) { const long = a === 0 || a === Math.PI / 2; x.save(); x.translate(128, 128); x.rotate(a); const r = x.createLinearGradient(-128, 0, 128, 0); r.addColorStop(0, "rgba(255,230,170,0)"); r.addColorStop(0.5, `rgba(255,240,200,${long ? 0.8 : 0.35})`); r.addColorStop(1, "rgba(255,230,170,0)"); x.fillStyle = r; x.scale(long ? 1 : 0.55, 1); x.beginPath(); x.moveTo(-128, 0); x.quadraticCurveTo(0, -5, 128, 0); x.quadraticCurveTo(0, 5, -128, 0); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export type Frond = { m: THREE.Matrix4; c: THREE.Color };
export type Ornament = { p: THREE.Vector3; c: THREE.Color; s: number };
/** Density of the tree. "desktop" and "mobile" are the 3D card's; "ar" is a lighter tree for AR files. */
export const TREE_DENSITY = {
  desktop: { levels: 21, base: 7, extra: 13, rows: 8, lights: 120 },
  mobile: { levels: 15, base: 5, extra: 9, rows: 7, lights: 70 },
  ar: { levels: 12, base: 4, extra: 7, rows: 6, lights: 48 },
} as const;

/** Places every bough, ornament and garland light (deterministic: the same tree on every render). */
export function treeLayout(d: (typeof TREE_DENSITY)[keyof typeof TREE_DENSITY]) {
  const rnd = rng(42);
  // boughs: whorls from the lowest, longest, most drooping ones to short upright shoots at the tip, each with its own length, angle and colour
  const fronds: Frond[] = [];
  const up = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), q = new THREE.Quaternion(), roll = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const greens = ["#1a5a3e", "#226b49", "#2d8058", "#1f5f48", "#35906a"].map((c) => new THREE.Color(c)), snowC = new THREE.Color("#e9f0ff");
  const add = (base: THREE.Vector3, th: number, pitch: number, len: number, v: number) => {
    dir.set(Math.cos(th) * Math.cos(pitch), Math.sin(pitch), Math.sin(th) * Math.cos(pitch)); q.setFromUnitVectors(up, dir);
    // keep the wide blade roughly level: roll it about its own length so its width lies across, not up
    const side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)), cur = new THREE.Vector3(1, 0, 0).applyQuaternion(q); roll.setFromAxisAngle(dir, Math.atan2(cur.clone().cross(side).dot(dir), cur.dot(side)) + (rnd() - 0.5) * 0.5); q.premultiply(roll);
    sc.set(len * (0.95 + rnd() * 0.5), len * (0.9 + rnd() * 0.4), len);
    const c = greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.72 + rnd() * 0.5); if (rnd() < 0.1 + v * 0.08) c.lerp(snowC, 0.16 + rnd() * 0.2);
    fronds.push({ m: new THREE.Matrix4().compose(pos.copy(base), q.clone(), sc.clone()), c });
  };
  const LEVELS = d.levels;
  for (let l = 0; l < LEVELS; l++) {
    const v = l / (LEVELS - 1), R = radiusAt(v), y = BASE_Y + v * HEIGHT * 0.97, n = Math.round(d.base + d.extra * (1 - v));
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2 + l * 0.9 + (rnd() - 0.5) * 0.35, pitch = lerp(-0.42, 0.75, Math.pow(v, 1.3)) + (rnd() - 0.5) * 0.24, len = R * (0.8 + rnd() * 0.34) + 0.12;
      const base = new THREE.Vector3(Math.cos(th) * 0.1, y + (rnd() - 0.5) * 0.16, Math.sin(th) * 0.1);
      add(base, th, pitch, len, v);
      if (len > 0.9) for (const sgn of [-1, 1]) { // side shoots fill the bough out
        const at = 0.38 + rnd() * 0.22, b2 = base.clone().add(new THREE.Vector3(Math.cos(th) * Math.cos(pitch), Math.sin(pitch) - 0.3 * at * at, Math.sin(th) * Math.cos(pitch)).multiplyScalar(len * at));
        add(b2, th + sgn * (0.5 + rnd() * 0.3), pitch - 0.06, len * (0.5 + rnd() * 0.16), v);
      }
    }
  }
  // ornaments hang just under the tips of the boughs, spread over the whole tree
  const orn: Ornament[] = [];
  const palette = ["#f4c371", "#d9699f", "#9c7edb", "#f6d48a", "#e8a0c8", "#c9a4ff"].map((c) => new THREE.Color(c));
  const rows = d.rows;
  for (let i = 0; i < rows; i++) {
    const v = 0.06 + (i / rows) * 0.8, n = Math.max(3, Math.round(9 * (1 - v) + 2));
    for (let k = 0; k < n; k++) { const th = (k / n) * Math.PI * 2 + i * 1.1 + (rnd() - 0.5) * 0.3, rr = radiusAt(v) * (0.84 + rnd() * 0.1); orn.push({ p: new THREE.Vector3(Math.cos(th) * rr, BASE_Y + v * HEIGHT - 0.22 * (1 - v) - 0.1, Math.sin(th) * rr), c: palette[(k + i * 2) % palette.length], s: 0.13 + rnd() * 0.06 }); }
  }
  orn.sort((a, b) => a.p.y - b.p.y); // they light from the bottom of the tree to the top
  // fairy lights: a garland that winds up the tree, resting on the boughs
  const fl: THREE.Vector3[] = [], N = d.lights;
  for (let i = 0; i < N; i++) { const u = i / N, rr = radiusAt(u * 0.94) * 1.0 + 0.04, th = u * Math.PI * 2 * 8; fl.push(new THREE.Vector3(Math.cos(th) * rr, BASE_Y + 0.15 + u * 0.94 * HEIGHT - 0.2 * (1 - u), Math.sin(th) * rr)); }
  return { fronds, orn, fl };
}

/** Presents under the tree: [x, y, z, size, colour, turn]. */
export const PRESENTS: [number, number, number, number, string, number][] = [[-1.75, 0.36, 1.75, 0.72, "#d9699f", 0.3], [1.6, 0.29, 1.95, 0.58, "#9c7edb", -0.4], [0.15, 0.22, 2.55, 0.44, "#f4c371", 0.8], [-0.75, 0.19, 2.45, 0.38, "#e8a0c8", -0.2]];

/** Timeline (pure functions of t). Ornament i of n lights bottom to top; garland light i of m chases up the spiral; then the star appears. */
export const ornamentLit = (t: number, i: number, n: number) => { const when = 1.6 + (i / n) * 4.6; return easeOutCubic(seg(t, when, when + 0.5)); };
export const fairyLit = (t: number, i: number, m: number) => { const when = 0.8 + (i / m) * 4.2; return seg(t, when, when + 0.35); };
export const starOn = (t: number) => easeOutCubic(seg(t, 6.2, 7.4));
