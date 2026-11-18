import * as THREE from "three";

/**
 * What every AR card model provides, so the live Android scene (scene.ts), the iPhone export (quicklook.ts) and the file export (ArLab) work the
 * same for each card. Models are in metres, Y up, origin at the centre of their base, resting on the floor.
 */
export const AR_FPS = 20; // keyframes are interpolated; 20 per second keeps long clips within the file-size budget
/** The personal wish card (metres) and how long it takes to rise into place. */
export const PANEL_W = 0.28, PANEL_H = 0.36, WISH_IN = 1.6;

/** Extra animated nodes (the personal wish on iPhone) sampled into the same clip. Node names must be unique. */
export type ClipExtra = { nodes: THREE.Object3D[]; pose(time: number): void };

export type ArModel = {
  scene: THREE.Group;
  /** Clip length in seconds: the card's own build-up, then a long hold so the wish can be read before Quick Look loops. */
  length: number;
  /** Keyframes per second of its clip (exporters must be told the same rate). */
  fps: number;
  /** Where the wish card starts (hidden inside the model) and where its centre ends up, in scene metres, and when it starts to rise. */
  wish: { from: THREE.Vector3; to: THREE.Vector3; at: number };
  /** A real light only the live (Android) scene can show: position in scene metres and its level (0..1) over time. */
  light?: { pos: THREE.Vector3; color: string; range: number; level(time: number): number };
  pose(time: number): void;
  clip(extra?: ClipExtra): THREE.AnimationClip;
  dispose(): void;
};

type Prop = "position" | "quaternion" | "scale";
/**
 * Samples a pose function into keyframe tracks. Only the listed properties are recorded per node (a light that only pulses needs scale alone), which
 * keeps USDZ files small.
 */
export function sampleClip(nodes: { o: THREE.Object3D; props: readonly Prop[] }[], pose: (time: number) => void, length: number, name = "play", fps = AR_FPS) {
  const n = Math.round(length * fps) + 1, times = new Float32Array(n);
  const data = nodes.map(({ props }) => Object.fromEntries(props.map((p) => [p, new Float32Array(n * (p === "quaternion" ? 4 : 3))])) as Partial<Record<Prop, Float32Array>>);
  for (let i = 0; i < n; i++) {
    const time = i / fps; times[i] = time; pose(time);
    nodes.forEach(({ o, props }, j) => { for (const p of props) o[p].toArray(data[j][p]!, i * (p === "quaternion" ? 4 : 3)); });
  }
  pose(0);
  const tracks = nodes.flatMap(({ o, props }, j) => props.map((p) => p === "quaternion" ? new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, times, data[j][p]!) : new THREE.VectorKeyframeTrack(`${o.name}.${p}`, times, data[j][p]!)));
  return new THREE.AnimationClip(name, length, tracks);
}
export const ALL: readonly Prop[] = ["position", "quaternion", "scale"];

/** A sheet with its back faces added as real triangles (reversed winding, flipped normals, nudged out along them so they never z-fight). USDZ has no double-sided flag in the exporter. */
export function twoSided(g: THREE.BufferGeometry, nudge = 0.007) {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, idx = g.index!, n = pos.count;
  const extra = Object.entries(g.attributes).filter(([k]) => k !== "position" && k !== "normal") as [string, THREE.BufferAttribute][];
  const p = new Float32Array(n * 6), q = new Float32Array(n * 6), ix: number[] = [];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const v = pos.getComponent(i, c), m = nor.getComponent(i, c);
    p[i * 3 + c] = v + m * nudge; q[i * 3 + c] = m; p[(n + i) * 3 + c] = v - m * nudge; q[(n + i) * 3 + c] = -m;
  }
  for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2); ix.push(a, b, c, n + a, n + c, n + b); }
  const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(p, 3)); out.setAttribute("normal", new THREE.BufferAttribute(q, 3));
  for (const [k, a] of extra) { const d = new Float32Array(a.count * a.itemSize * 2); d.set(a.array as Float32Array); d.set(a.array as Float32Array, a.count * a.itemSize); out.setAttribute(k, new THREE.BufferAttribute(d, a.itemSize)); } // uvs and colours repeat on the back
  out.setIndex(ix); return out;
}

import type { ArKey } from "../../arSupport";
export { AR_KEYS, isArKey, type ArKey } from "../../arSupport"; // the list lives with the (three-free) route detection so pages can read it

/** Builds a card's AR model (each card's code is its own chunk). */
export async function buildArModel(key: ArKey): Promise<ArModel> {
  if (key === "christmas-tree") return (await import("./tree-ar")).buildTreeAR();
  return (await import("./gift-ar")).buildGiftAR();
}
