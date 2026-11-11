import * as THREE from "three";

/** Shared materials and small procedural helpers for the standard cards' 3D scenes. */
export const gold = (rough = 0.3) => new THREE.MeshPhysicalMaterial({ color: "#e9b356", metalness: 1, roughness: rough, envMapIntensity: 1.1 });
export const satin = (color: string, sheen = "#ffd6ea") => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, sheen: 1, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4 });
export const glass = (opacity = 0.2) => new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false });

export function starGeometry(outer: number, inner: number, depth: number, bevel = 0.02) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 === 0 ? outer : inner;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
  g.center();
  return g;
}

/** Soft contact shadow texture (dark in the middle, fading to nothing). */
export function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(8,3,16,0.75)"); g.addColorStop(0.6, "rgba(8,3,16,0.28)"); g.addColorStop(1, "rgba(8,3,16,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Deterministic pseudo-random sequence (same layout on every render and in every thumbnail). */
export function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export const dispose = (...things: ({ dispose(): void } | null | undefined)[]) => things.forEach((t) => t?.dispose());
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Soft round pool of light/snow that fades to nothing at the edge (a ground that dissolves into the dark instead of a hard disc). */
export function poolTexture(inner = "rgba(214,214,246,0.95)", mid = "rgba(150,140,200,0.55)") {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.55, mid); g.addColorStop(1, "rgba(60,40,100,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
