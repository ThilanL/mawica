"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ADD_LIGHT } from "../../Particles";
import { glowTexture } from "../../textures";
import { easeInOutSine, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, rng, shadowTexture } from "../gfx";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 11;
/** Window opening in the wall: a rectangle of w x h starting at y, with a half-round arch of radius w/2 on top. */
const WIN = { w: 4.6, h: 3.1, y: 1.0 };
const TOP = WIN.y + WIN.h + WIN.w / 2; // 6.4
const REVEAL = 0.75; // wall thickness at the opening
const GROUND = -0.6;

export const def: StageSceneDef = {
  duration: DURATION, heroT: 8.6,
  lift: (a) => (a < 0.9 ? 0.2 : 0.12),
  fog: ["#2b1420", 30, 90],
  camera(t, aspect) {
    const k = easeInOutSine(seg(t, 0, DURATION));
    const base = aspect < 0.9 ? fitDistance(6.3, 9.4, aspect, 1.0) : fitDistance(12.4, 7.9, aspect, 1.0);
    return { pos: { x: lerp(-1.25, 0.35, k), y: lerp(4.25, 3.95, k), z: base * lerp(1.12, 1, easeOutCubic(seg(t, 0, DURATION))) }, look: { x: lerp(-0.1, 0.02, k), y: 3.85, z: 0 } };
  },
};

function arch(w: number, h: number, y0 = 0) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, y0); s.lineTo(r, y0); s.lineTo(r, y0 + h); s.absarc(0, y0 + h, r, 0, Math.PI, false); s.lineTo(-r, y0);
  return s;
}
const archPath = (w: number, h: number, y0: number) => new THREE.Path(arch(w, h, y0).getPoints(40).reverse());
/** An arch-shaped band (outer arch minus inner arch), extruded. `grow` is how far the outer edge sits outside the inner one. */
function archBand(innerW: number, innerH: number, y0: number, grow: number, depth: number, bevel = 0) {
  const s = arch(innerW + grow * 2, innerH, y0 - grow);
  s.holes.push(archPath(innerW, innerH, y0));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 40 });
}
/** Arch-shaped plane with 0..1 UVs, so a texture fits the opening exactly. */
function archPlane(w: number, h: number) {
  const g = new THREE.ShapeGeometry(arch(w, h), 40);
  const p = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(p.count * 2), total = h + w / 2;
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / total; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return g;
}

const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!] as const; };
const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/** Winter night sky: deep indigo falling to a soft lavender-rose horizon glow, with stars. */
function skyTexture() {
  const [c, x] = canvas(1024, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0a1030"); g.addColorStop(0.42, "#1b2458"); g.addColorStop(0.68, "#3d3c82"); g.addColorStop(0.84, "#7a5f9e"); g.addColorStop(1, "#c08fae");
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  const r = rng(21);
  for (let i = 0; i < 260; i++) { const px = r() * 1024, py = r() * r() * 400, s = 0.5 + r() * 1.3, a = 0.35 + r() * 0.65; x.fillStyle = `rgba(${235 + r() * 20},${232 + r() * 20},255,${a})`; x.beginPath(); x.arc(px, py, s, 0, 7); x.fill(); }
  for (let i = 0; i < 7; i++) { // thin drifting cloud bands near the horizon
    const py = 300 + r() * 150, px = r() * 1024, w = 220 + r() * 300, cl = x.createRadialGradient(px, py, 0, px, py, w);
    cl.addColorStop(0, "rgba(190,170,225,0.16)"); cl.addColorStop(1, "rgba(190,170,225,0)");
    x.save(); x.translate(0, py); x.scale(1, 0.16); x.translate(0, -py); x.fillStyle = cl; x.fillRect(px - w, py - w, w * 2, w * 2); x.restore();
  }
  return tex(c);
}
/** Crescent moon with a soft halo (drawn bright on transparent, used additively). */
function moonTexture() {
  const [c, x] = canvas(256, 256);
  const halo = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  halo.addColorStop(0, "rgba(255,244,214,0.5)"); halo.addColorStop(0.35, "rgba(214,200,255,0.16)"); halo.addColorStop(1, "rgba(200,190,255,0)");
  x.fillStyle = halo; x.fillRect(0, 0, 256, 256);
  x.save(); x.beginPath(); x.arc(128, 128, 46, 0, 7); x.clip();
  const m = x.createRadialGradient(112, 112, 6, 128, 128, 50); m.addColorStop(0, "#fffdf2"); m.addColorStop(1, "#f6e3b4");
  x.fillStyle = m; x.fillRect(0, 0, 256, 256);
  x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(150, 112, 42, 0, 7); x.fill();
  x.restore();
  return tex(c);
}
/** One ridge of snowy mountains on transparent: lit snow on the moon side, blue shadow on the other, treeline haze at the foot. */
function mountainTexture(seed: number, near: boolean) {
  const [c, x] = canvas(1024, 320); const r = rng(seed);
  const pts: [number, number][] = []; let px = -40;
  while (px < 1064) { const peak = 60 + r() * (near ? 120 : 150); pts.push([px, 320 - (near ? 70 : 110) - peak]); px += 70 + r() * 110; pts.push([px - 20 - r() * 30, 320 - (near ? 50 : 90) - r() * 40]); }
  const ridge = () => { x.beginPath(); x.moveTo(-40, 320); for (const [a, b] of pts) x.lineTo(a, b); x.lineTo(1064, 320); x.closePath(); };
  const body = x.createLinearGradient(0, 40, 0, 320);
  if (near) { body.addColorStop(0, "#c9cdf0"); body.addColorStop(0.5, "#7f86c4"); body.addColorStop(1, "#59609f"); }
  else { body.addColorStop(0, "#b7b3e2"); body.addColorStop(0.5, "#8581c0"); body.addColorStop(1, "#8f83bd"); }
  x.filter = "blur(0.8px)"; ridge(); x.fillStyle = body; x.fill();
  x.save(); ridge(); x.clip(); x.filter = "blur(3px)";
  for (let i = 0; i < pts.length; i += 2) { // shadowed flank to the left of every peak, bright snow to the right (moon side)
    const [a, b] = pts[i];
    x.fillStyle = near ? "rgba(52,58,120,0.55)" : "rgba(70,68,140,0.4)";
    x.beginPath(); x.moveTo(a, b); x.lineTo(a - 120, 320); x.lineTo(a - 10 + r() * 30, 320); x.lineTo(a + 6, b + 40 + r() * 30); x.closePath(); x.fill();
    x.fillStyle = "rgba(255,255,255,0.62)";
    x.beginPath(); x.moveTo(a, b - 4); x.lineTo(a + 34 + r() * 20, b + 62); x.lineTo(a + 14, b + 48); x.lineTo(a + 4, b + 70); x.lineTo(a - 6, b + 44); x.closePath(); x.fill();
  }
  const haze = x.createLinearGradient(0, 210, 0, 320); haze.addColorStop(0, "rgba(170,160,215,0)"); haze.addColorStop(1, near ? "rgba(214,210,244,0.9)" : "rgba(170,160,215,0.75)");
  x.filter = "none"; x.fillStyle = haze; x.fillRect(0, 210, 1024, 110);
  x.restore();
  return tex(c);
}
/** Moonlit snowfield: brighter in the distance under the moon, bluer and darker towards the house, with soft drifts. */
function snowfieldTexture() {
  const [c, x] = canvas(512, 512);
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, "#d6d2f4"); g.addColorStop(0.45, "#a9a8dc"); g.addColorStop(1, "#6f72b4");
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const r = rng(33);
  for (let i = 0; i < 46; i++) { const px = r() * 512, py = r() * 512, w = 50 + r() * 120, d = x.createRadialGradient(px, py, 0, px, py, w); const light = r() > 0.45; d.addColorStop(0, light ? "rgba(255,255,255,0.22)" : "rgba(60,66,140,0.2)"); d.addColorStop(1, "rgba(255,255,255,0)"); x.save(); x.translate(0, py); x.scale(1, 0.3); x.translate(0, -py); x.fillStyle = d; x.fillRect(px - w, py - w, w * 2, w * 2); x.restore(); }
  return tex(c);
}
/** Frost that grows in from the edges and corners of every pane, leaving the middle clear. */
function frostTexture() {
  const [c, x] = canvas(512, 640);
  const edge = x.createRadialGradient(256, 330, 150, 256, 330, 400);
  edge.addColorStop(0, "rgba(225,236,255,0)"); edge.addColorStop(0.72, "rgba(225,236,255,0.07)"); edge.addColorStop(1, "rgba(236,243,255,0.5)");
  x.fillStyle = edge; x.fillRect(0, 0, 512, 640);
  const low = x.createLinearGradient(0, 520, 0, 640); low.addColorStop(0, "rgba(236,243,255,0)"); low.addColorStop(1, "rgba(240,246,255,0.55)");
  x.fillStyle = low; x.fillRect(0, 520, 512, 120);
  const r = rng(5); x.strokeStyle = "rgba(255,255,255,0.2)"; x.lineWidth = 0.8;
  for (let i = 0; i < 80; i++) {
    const side = (r() * 3) | 0; let px = side < 2 ? (side ? 512 : 0) : r() * 512, py = side < 2 ? r() * 640 : 640;
    const a = Math.atan2(320 - py, 256 - px) + (r() - 0.5) * 1.3, len = 16 + r() * 40;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { const sl = len / 6; px += Math.cos(a) * sl; py += Math.sin(a) * sl; x.lineTo(px, py); if (k % 2) for (const o of [0.8, -0.8]) { x.moveTo(px, py); x.lineTo(px + Math.cos(a + o) * sl * 0.7, py + Math.sin(a + o) * sl * 0.7); x.moveTo(px, py); } }
    x.stroke();
  }
  return tex(c);
}
/** What the glass reflects of the room: two soft diagonal sheens and a few out-of-focus warm lights. Used additively and faintly. */
function reflectionTexture() {
  const [c, x] = canvas(256, 320);
  x.save(); x.translate(128, 160); x.rotate(-0.5);
  for (const [o, w, a] of [[-70, 34, 0.5], [-18, 12, 0.3], [70, 22, 0.22]] as const) { const g = x.createLinearGradient(o - w, 0, o + w, 0); g.addColorStop(0, "rgba(255,226,196,0)"); g.addColorStop(0.5, `rgba(255,226,196,${a})`); g.addColorStop(1, "rgba(255,226,196,0)"); x.fillStyle = g; x.fillRect(o - w, -320, w * 2, 640); }
  x.restore();
  const r = rng(12);
  for (let i = 0; i < 9; i++) { const px = 20 + r() * 216, py = 20 + r() * 110, s = 7 + r() * 9, g = x.createRadialGradient(px, py, 0, px, py, s); g.addColorStop(0, "rgba(255,196,120,0.55)"); g.addColorStop(1, "rgba(255,196,120,0)"); x.fillStyle = g; x.fillRect(px - s, py - s, s * 2, s * 2); }
  return tex(c);
}
/** Plaster wall with the warm light pooled around the window and falling away into the corners. */
function wallTexture() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = "#33142a"; x.fillRect(0, 0, 512, 512);
  const g = x.createRadialGradient(256, 262, 30, 256, 262, 300);
  g.addColorStop(0, "rgba(196,108,86,0.95)"); g.addColorStop(0.35, "rgba(146,70,72,0.72)"); g.addColorStop(0.75, "rgba(84,34,58,0.35)"); g.addColorStop(1, "rgba(51,20,42,0)");
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const r = rng(8);
  for (let i = 0; i < 1400; i++) { x.fillStyle = r() > 0.5 ? "rgba(255,220,190,0.022)" : "rgba(20,6,14,0.03)"; x.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3); }
  return tex(c);
}
function woodTexture() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = "#8a5236"; x.fillRect(0, 0, 256, 256);
  const r = rng(4);
  for (let i = 0; i < 90; i++) { x.strokeStyle = r() > 0.5 ? "rgba(60,28,16,0.18)" : "rgba(214,150,104,0.14)"; x.lineWidth = 0.6 + r() * 1.6; const py = r() * 256; x.beginPath(); x.moveTo(0, py); x.bezierCurveTo(80, py + (r() - 0.5) * 10, 170, py + (r() - 0.5) * 10, 256, py + (r() - 0.5) * 6); x.stroke(); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); return t;
}
/** Vertical dark-to-clear gradient, for the soft shadows a curtain or a sill throws on the wall. */
function fadeTexture() {
  const [c, x] = canvas(8, 128); const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(14,4,12,0.62)"); g.addColorStop(1, "rgba(14,4,12,0)"); x.fillStyle = g; x.fillRect(0, 0, 8, 128); return tex(c);
}

/** A snow-laden pine: stacked tiers that are white on their upper shoulders and deep green underneath. */
function pineGeometry() {
  const tiers: THREE.BufferGeometry[] = [], green = new THREE.Color("#143246"), snow = new THREE.Color("#e4e8ff");
  const N = 5;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), rad = lerp(0.5, 0.13, u), h = lerp(0.5, 0.36, u), y = lerp(0.2, 1.0, u);
    const g = new THREE.ConeGeometry(rad, h, 9, 3, true); g.translate(0, y + h / 2, 0);
    const p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) { const k = Math.min(1, Math.max(0, (p.getY(v) - y) / h)); const lit = 0.72 + 0.28 * Math.min(1, Math.max(0, p.getX(v) / rad * 0.5 + 0.5)); const cc = green.clone().lerp(snow, Math.pow(k, 1.6) * 0.95).multiplyScalar(lit); col.set([cc.r, cc.g, cc.b], v * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); tiers.push(g);
  }
  const trunk = new THREE.CylinderGeometry(0.045, 0.06, 0.26, 6); trunk.translate(0, 0.13, 0);
  const tc = new Float32Array(trunk.attributes.position.count * 3); for (let v = 0; v < tc.length; v += 3) tc.set([0.1, 0.08, 0.12], v);
  trunk.setAttribute("color", new THREE.BufferAttribute(tc, 3)); tiers.push(trunk);
  const out = mergeGeometries(tiers.map((g) => g.toNonIndexed()))!; tiers.forEach((g) => g.dispose()); return out;
}

/** A hanging velvet curtain: vertical folds, gathered by a tie-back a third of the way up. `side` is -1 (left) or 1 (right). */
function curtainGeometry(side: number, width: number, height: number) {
  const g = new THREE.PlaneGeometry(width, height, 36, 28), p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / width + 0.5, v = p.getY(i) / height + 0.5; // v: 0 bottom .. 1 top
    const tie = Math.exp(-(((v - 0.36) / 0.13) ** 2)); // pinch at the tie-back
    const inner = side < 0 ? u : 1 - u; // 1 at the edge nearest the window
    const pull = (v > 0.36 ? tie : 1 - 0.35 * (1 - v / 0.36)) * 0.6 * inner * Math.min(1, (1 - v) * 2.6);
    const x = p.getX(i) + side * pull * width * 0.8;
    const fold = Math.sin(u * 30 + v * 1.4) * 0.11 * (1 - tie * 0.55) + Math.sin(u * 13 + 1.7) * 0.05;
    p.setXYZ(i, x, p.getY(i), fold + tie * 0.08);
  }
  g.computeVertexNormals(); return g;
}

/** String-light bulbs draped around the arch: up one side, over the top, down the other, with a little sag between fixings. */
function swagPoints(n: number) {
  const pts: THREE.Vector3[] = [], R = WIN.w / 2 + 0.78, cy = WIN.y + WIN.h, side = 1.9, total = Math.PI * R + side * 2;
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * total; let x: number, y: number;
    if (d < side) { x = -R; y = cy - side + d; } else if (d > total - side) { x = R; y = cy - (d - (total - side)); } else { const a = Math.PI - (d - side) / R; x = Math.cos(a) * R; y = cy + Math.sin(a) * R; }
    const sag = Math.abs(Math.sin((i / (n - 1)) * Math.PI * 6)) * 0.09;
    pts.push(new THREE.Vector3(x * (1 + sag * 0.12), y - sag * (Math.abs(x) < R * 0.98 ? 1 : 0.2), 0.2));
  }
  return pts;
}

const BULB_COLORS = ["#ffd58a", "#ff9ccd", "#ffe9b0", "#c7a8ff", "#ffb36b"];
const CANDLES: [number, number, number][] = [[-1.72, 0.62, 0.28], [-1.3, 0.92, 0.36], [1.5, 0.74, 0.3], [1.9, 0.44, 0.38]];

function Interior({ shared, mobile, mode }: StageSceneProps) {
  const flames = useRef<THREE.Sprite[]>([]), halos = useRef<THREE.Sprite[]>([]), candleLights = useRef<THREE.PointLight[]>([]), bulbMeshes = useRef<THREE.Mesh[]>([]);
  const bulbGlow = useRef<THREE.Points>(null), roomLight = useRef<THREE.PointLight>(null), fill = useRef<THREE.HemisphereLight>(null), wallMat = useRef<THREE.MeshStandardMaterial>(null), reflMat = useRef<THREE.MeshBasicMaterial>(null), sillGlow = useRef<THREE.Mesh>(null);
  const snowRefs = useRef<(THREE.Points | null)[]>([]), pines = useRef<THREE.InstancedMesh>(null), garland = useRef<THREE.InstancedMesh>(null), berries = useRef<THREE.InstancedMesh>(null);

  const r = useMemo(() => {
    const wallShape = new THREE.Shape(); wallShape.moveTo(-24, -10); wallShape.lineTo(24, -10); wallShape.lineTo(24, 20); wallShape.lineTo(-24, 20); wallShape.lineTo(-24, -10);
    wallShape.holes.push(archPath(WIN.w, WIN.h, WIN.y));
    const wallGeo = new THREE.ShapeGeometry(wallShape, 40);
    { const p = wallGeo.attributes.position as THREE.BufferAttribute, uv = wallGeo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 13) / 26, (p.getY(i) + 9) / 26); } // one light pool, centred on the window
    const F = 0.2; // sash thickness
    // snow at three depths outside: fine and slow far away, larger and faster close to the glass
    const layers = [
      { n: mobile ? 150 : 300, size: 0.13, speed: 0.5, zn: -7, zf: -18, sx: 20, op: 0.75 },
      { n: mobile ? 90 : 170, size: 0.12, speed: 0.75, zn: -2.4, zf: -7, sx: 10, op: 0.9 },
      { n: mobile ? 34 : 60, size: 0.15, speed: 1.05, zn: -0.9, zf: -2.4, sx: 6, op: 0.95 },
    ].map((l, li) => { const rnd = rng(40 + li), pos = new Float32Array(l.n * 3); for (let i = 0; i < l.n; i++) { pos[i * 3] = (rnd() - 0.5) * l.sx; pos[i * 3 + 1] = GROUND + rnd() * 11; pos[i * 3 + 2] = lerp(l.zn, l.zf, rnd()); } return { ...l, pos }; });
    const nb = mobile ? 21 : 29, bulbPos = swagPoints(nb);
    const wire = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bulbPos.map((v) => new THREE.Vector3(v.x, v.y + 0.07, v.z - 0.05))), 120, 0.012, 5);
    const rnd = rng(77);
    const D = mobile ? 20 : 11.5; // roughly where the camera rests; used only to place things inside the view through the opening
    const pineSpec = Array.from({ length: mobile ? 20 : 30 }, (_, i) => { // tall pines framing both flanks, a low treeline at the foot of the mountains, the middle left open
      const flank = i % 2 ? 1 : -1, line = i % 5 >= 3, z = line ? -17 - rnd() * 5 : -5 - rnd() * 8;
      const spread = (1 - z / D) * (WIN.w / 2); // half-width of the view at this depth
      const x = line ? (rnd() - 0.5) * spread * 2.1 : flank * spread * (0.6 + rnd() * 0.5);
      return { x, z, s: line ? 1.4 + rnd() * 1.0 : 1.7 + rnd() * 1.25, tilt: (rnd() - 0.5) * 0.05, shade: lerp(1, 0.8, Math.min(1, -z / 22)) };
    });
    const sprigs = Array.from({ length: 34 }, (_, i) => { const u = i / 33; return { x: lerp(-2.2, 2.2, u) + (rnd() - 0.5) * 0.1, y: 0.07 + rnd() * 0.07 + Math.sin(u * Math.PI) * 0.02, z: 0.02 + rnd() * 0.16, rot: rnd() * 6.28, s: 0.15 + rnd() * 0.09 }; }).filter((s) => !CANDLES.some(([cx]) => Math.abs(cx - s.x) < 0.2));
    const berrySpec = Array.from({ length: 11 }, () => ({ x: (rnd() - 0.5) * 4.2, y: 0.15 + rnd() * 0.06, z: 0.12 + rnd() * 0.14, gold: rnd() > 0.55 })).filter((s) => !CANDLES.some(([cx]) => Math.abs(cx - s.x) < 0.2));
    return {
      wallGeo, glassGeo: archPlane(WIN.w - F * 2, WIN.h - F), revealGeo: archBand(WIN.w, WIN.h, WIN.y, 0.02, REVEAL), sashGeo: archBand(WIN.w - F * 2, WIN.h - F, WIN.y + F, F, 0.16, 0.012), casingGeo: archBand(WIN.w + 0.04, WIN.h, WIN.y, 0.3, 0.09, 0.03),
      pineGeo: pineGeometry(), curtainL: curtainGeometry(-1, 2.5, 8.6), curtainR: curtainGeometry(1, 2.5, 8.6), wire, sprigGeo: new THREE.ConeGeometry(0.5, 1.5, 5), berryGeo: new THREE.SphereGeometry(1, 10, 8),
      sky: skyTexture(), moon: moonTexture(), mtnFar: mountainTexture(3, false), mtnNear: mountainTexture(17, true), field: snowfieldTexture(), frost: frostTexture(), refl: reflectionTexture(), wall: wallTexture(), woodTex: woodTexture(), fade: fadeTexture(), shadow: shadowTexture(), glowTex: glowTexture(),
      layers, bulbPos, pineSpec, sprigs, berrySpec,
      wood: new THREE.MeshPhysicalMaterial({ color: "#b0714c", roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45 }),
      plaster: new THREE.MeshStandardMaterial({ color: "#a86a5c", roughness: 0.95 }),
      candle: new THREE.MeshStandardMaterial({ color: "#fbeedd", roughness: 0.55, emissive: "#ffc48a", emissiveIntensity: 0.22 }),
      brass: new THREE.MeshStandardMaterial({ color: "#d9a54e", metalness: 1, roughness: 0.32 }),
      velvet: new THREE.MeshPhysicalMaterial({ color: "#6a2247", roughness: 0.85, sheen: 1, sheenColor: new THREE.Color("#ff9cc0"), sheenRoughness: 0.5, side: THREE.DoubleSide }),
    };
  }, [mobile]);
  useEffect(() => { r.wood.map = r.woodTex; r.wood.needsUpdate = true; }, [r]);
  useEffect(() => () => { dispose(r.wallGeo, r.glassGeo, r.revealGeo, r.sashGeo, r.casingGeo, r.pineGeo, r.curtainL, r.curtainR, r.wire, r.sprigGeo, r.berryGeo, r.sky, r.moon, r.mtnFar, r.mtnNear, r.field, r.frost, r.refl, r.wall, r.woodTex, r.fade, r.shadow, r.glowTex, r.wood, r.plaster, r.candle, r.brass, r.velvet); }, [r]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    if (pines.current) { r.pineSpec.forEach((p, i) => { m.compose(new THREE.Vector3(p.x, GROUND - 0.1, p.z), q.setFromEuler(e.set(0, i * 1.3, p.tilt)), new THREE.Vector3(p.s * 0.95, p.s, p.s * 0.95)); pines.current!.setMatrixAt(i, m); pines.current!.setColorAt(i, c.setRGB(p.shade * 0.86, p.shade * 0.9, p.shade)); }); pines.current.instanceMatrix.needsUpdate = true; if (pines.current.instanceColor) pines.current.instanceColor.needsUpdate = true; }
    if (garland.current) { r.sprigs.forEach((s, i) => { m.compose(new THREE.Vector3(s.x, WIN.y + s.y, s.z), q.setFromEuler(e.set(Math.PI / 2 - 0.35, 0, s.rot)), new THREE.Vector3(s.s * 0.5, s.s, s.s * 0.5)); garland.current!.setMatrixAt(i, m); garland.current!.setColorAt(i, c.set(i % 3 ? "#2c6a4c" : "#3f8560")); }); garland.current.instanceMatrix.needsUpdate = true; if (garland.current.instanceColor) garland.current.instanceColor.needsUpdate = true; }
    if (berries.current) { r.berrySpec.forEach((s, i) => { const k = s.gold ? 0.075 : 0.055; m.compose(new THREE.Vector3(s.x, WIN.y + s.y, s.z), q.identity(), new THREE.Vector3(k, k, k)); berries.current!.setMatrixAt(i, m); berries.current!.setColorAt(i, c.set(s.gold ? "#e9b356" : "#c2415e")); }); berries.current.instanceMatrix.needsUpdate = true; if (berries.current.instanceColor) berries.current.instanceColor.needsUpdate = true; }
  }, [r]);

  useFrame((_, dt) => {
    const t = mode === "static" ? DURATION : shared.current.t, clock = shared.current.t;
    const warm = easeInOutSine(seg(t, 0.6, 5.2)); // the room goes from moonlit to candle-lit
    if (roomLight.current) roomLight.current.intensity = 5.5 * warm;
    if (fill.current) fill.current.intensity = lerp(0.16, 0.42, warm);
    if (wallMat.current) wallMat.current.color.setScalar(lerp(0.42, 1, warm));
    if (reflMat.current) reflMat.current.opacity = 0.05 + 0.2 * warm;
    if (sillGlow.current) (sillGlow.current.material as THREE.MeshBasicMaterial).opacity = 0.34 * warm;
    CANDLES.forEach((_c, i) => {
      const on = easeOutCubic(seg(t, 0.7 + i * 0.55, 1.9 + i * 0.55)), fl = 1 + Math.sin(clock * 11 + i * 1.7) * 0.06 + Math.sin(clock * 19 + i) * 0.035;
      const l = candleLights.current[i]; if (l) l.intensity = 2.2 * on * fl;
      const f = flames.current[i]; if (f) { f.scale.set(0.16 * fl, 0.4 * fl * on + 0.001, 1); (f.material as THREE.SpriteMaterial).opacity = on; }
      const h = halos.current[i]; if (h) (h.material as THREE.SpriteMaterial).opacity = 0.42 * on * fl;
    });
    const nb = bulbMeshes.current.length;
    bulbMeshes.current.forEach((m, i) => { if (!m) return; const u = Math.abs(i / (nb - 1) - 0.5) * 2; const on = seg(t, 1.6 + (1 - u) * 2.6, 2.2 + (1 - u) * 2.6); const tw = 0.82 + 0.18 * Math.sin(clock * 2.1 + i * 1.9); (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.04 + 1.5 * on * tw; });
    if (bulbGlow.current) (bulbGlow.current.material as THREE.PointsMaterial).opacity = 0.55 * easeInOutSine(seg(t, 2.2, 5));
    const d = Math.min(dt, 0.05);
    r.layers.forEach((l, li) => {
      const pts = snowRefs.current[li]; if (!pts || mode === "static") return; const p = l.pos;
      for (let i = 0; i < p.length; i += 3) { p[i + 1] -= l.speed * (0.8 + ((i / 3) % 5) * 0.09) * d; p[i] += Math.sin(clock * 0.7 + i) * 0.1 * d; if (p[i + 1] < GROUND) p[i + 1] = GROUND + 11; }
      (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    });
  });

  const zs = -REVEAL + 0.14; // sash plane (recessed into the wall)
  const bar = 0.085;
  return (
    <>
      <hemisphereLight ref={fill} args={["#f0b8a0", "#2a1420", 0.16]} />
      <directionalLight position={[3, 6, 9]} intensity={0.35} color="#ffd9b8" />
      <pointLight ref={roomLight} position={[0, 4.4, 4.6]} color="#ffae72" intensity={0} distance={22} decay={1.3} />
      {/* cool moonlight spilling in through the opening: rims the bars, the reveal and the sill */}
      <pointLight position={[1.4, 5.2, -2.2]} color="#9fb4ff" intensity={9} distance={9} decay={1.6} />

      {/* ---- outside: sky, moon, two mountain ridges, snowfield, pines, snowfall ---- */}
      <mesh position={[0, 8, -34]}><planeGeometry args={[90, 36]} /><meshBasicMaterial map={r.sky} fog={false} /></mesh>
      <mesh position={mobile ? [2.3, 8.1, -33] : [3.5, 9.8, -33]}><planeGeometry args={mobile ? [5.4, 5.4] : [7, 7]} /><meshBasicMaterial map={r.moon} transparent depthWrite={false} fog={false} {...ADD_LIGHT} /></mesh>
      <mesh position={[2, GROUND + (mobile ? 3.1 : 4.2), -30]} scale={mobile ? 0.72 : 1}><planeGeometry args={[64, 10]} /><meshBasicMaterial map={r.mtnFar} transparent depthWrite={false} fog={false} /></mesh>
      <mesh position={[-3, GROUND + (mobile ? 2.1 : 2.9), -24]} scale={mobile ? 0.72 : 1}><planeGeometry args={[52, 7.2]} /><meshBasicMaterial map={r.mtnNear} transparent depthWrite={false} fog={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND, -13.5]}><planeGeometry args={[60, 25]} /><meshBasicMaterial map={r.field} fog={false} /></mesh>
      <instancedMesh ref={pines} args={[r.pineGeo, undefined, r.pineSpec.length]} frustumCulled={false}><meshBasicMaterial vertexColors fog={false} /></instancedMesh>
      {r.layers.map((l, i) => (
        <points key={i} ref={(o) => { snowRefs.current[i] = o as THREE.Points | null; }} frustumCulled={false}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[l.pos, 3]} /></bufferGeometry>
          <pointsMaterial map={r.glowTex} size={l.size} sizeAttenuation transparent opacity={l.op} depthWrite={false} color="#ffffff" fog={false} />
        </points>
      ))}

      {/* ---- the window: deep plaster reveal, recessed sash with glazing bars, glass, casing, sill ---- */}
      <mesh geometry={r.revealGeo} material={r.plaster} position={[0, 0, -REVEAL]} />
      <mesh geometry={r.sashGeo} material={r.wood} position={[0, 0, zs - 0.08]} />
      <mesh material={r.wood} position={[0, (WIN.y + TOP) / 2, zs]}><boxGeometry args={[bar, TOP - WIN.y - 0.3, 0.1]} /></mesh>
      <mesh material={r.wood} position={[0, WIN.y + WIN.h, zs]}><boxGeometry args={[WIN.w - 0.3, bar, 0.1]} /></mesh>
      <mesh material={r.wood} position={[0, WIN.y + WIN.h * 0.5, zs]}><boxGeometry args={[WIN.w - 0.3, bar, 0.1]} /></mesh>
      {[Math.PI / 4, (3 * Math.PI) / 4].map((a) => <mesh key={a} material={r.wood} position={[Math.cos(a) * (WIN.w / 4 - 0.05), WIN.y + WIN.h + Math.sin(a) * (WIN.w / 4 - 0.05), zs]} rotation={[0, 0, a]}><boxGeometry args={[WIN.w / 2 - 0.2, bar * 0.9, 0.09]} /></mesh>)}
      <mesh geometry={r.glassGeo} position={[0, WIN.y + 0.2, zs - 0.03]}><meshBasicMaterial map={r.frost} transparent depthWrite={false} fog={false} /></mesh>
      <mesh geometry={r.glassGeo} position={[0, WIN.y + 0.2, zs - 0.02]}><meshBasicMaterial ref={reflMat} map={r.refl} transparent opacity={0.05} depthWrite={false} fog={false} {...ADD_LIGHT} /></mesh>
      <mesh geometry={r.wallGeo}><meshStandardMaterial ref={wallMat} map={r.wall} roughness={0.96} /></mesh>
      <mesh geometry={r.casingGeo} material={r.wood} position={[0, 0, 0.01]} />
      <mesh material={r.wood} position={[0, WIN.y - 0.1, -0.05]}><boxGeometry args={[WIN.w + 1.5, 0.2, REVEAL + 0.95]} /></mesh>
      <mesh material={r.wood} position={[0, WIN.y - 0.36, 0.06]}><boxGeometry args={[WIN.w + 1.1, 0.34, 0.12]} /></mesh>
      {/* soft shadow under the sill and warm pool of candle light on top of it */}
      <mesh position={[0, WIN.y - 0.75, 0.02]}><planeGeometry args={[WIN.w + 3.4, 2.2]} /><meshBasicMaterial map={r.shadow} transparent opacity={0.7} depthWrite={false} /></mesh>
      <mesh ref={sillGlow} rotation={[-Math.PI / 2, 0, 0]} position={[0, WIN.y + 0.011, 0.05]}><planeGeometry args={[WIN.w + 1.2, 1.3]} /><meshBasicMaterial map={r.glowTex} color="#ffb060" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></mesh>

      {/* ---- on the sill: candles in brass holders, a pine garland with berries ---- */}
      {CANDLES.map(([x, h, z], i) => (
        <group key={i} position={[x, WIN.y, z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.006, 0.03]}><planeGeometry args={[0.8, 0.8]} /><meshBasicMaterial map={r.shadow} transparent depthWrite={false} /></mesh>
          <mesh material={r.brass} position={[0, 0.025, 0]}><cylinderGeometry args={[0.2, 0.22, 0.05, 24]} /></mesh>
          <mesh material={r.brass} position={[0, 0.07, 0]}><cylinderGeometry args={[0.105, 0.13, 0.06, 20]} /></mesh>
          <mesh material={r.candle} position={[0, 0.09 + h / 2, 0]}><cylinderGeometry args={[0.085, 0.09, h, 20]} /></mesh>
          <mesh position={[0, 0.09 + h + 0.03, 0]}><cylinderGeometry args={[0.006, 0.006, 0.06, 5]} /><meshBasicMaterial color="#2a1a14" /></mesh>
          <sprite ref={(o) => { if (o) halos.current[i] = o; }} position={[0, 0.09 + h + 0.16, 0.02]} scale={[1.5, 1.5, 1]}><spriteMaterial map={r.glowTex} color="#ffa040" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
          <sprite ref={(o) => { if (o) flames.current[i] = o; }} position={[0, 0.09 + h + 0.17, 0.03]} scale={[0.16, 0.4, 1]}><spriteMaterial map={r.glowTex} color="#fff0c8" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
          <pointLight ref={(o) => { if (o) candleLights.current[i] = o; }} position={[0, 0.09 + h + 0.25, 0.25]} color="#ffa24a" intensity={0} distance={6} decay={1.5} />
        </group>
      ))}
      <instancedMesh ref={garland} args={[r.sprigGeo, undefined, r.sprigs.length]}><meshStandardMaterial roughness={0.85} flatShading /></instancedMesh>
      <instancedMesh ref={berries} args={[r.berryGeo, undefined, r.berrySpec.length]}><meshStandardMaterial roughness={0.25} metalness={0.35} /></instancedMesh>

      {/* ---- velvet curtains on a brass rod, with the shadow they throw on the wall ---- */}
      {!mobile && (
        <>
          <mesh material={r.brass} rotation={[0, 0, Math.PI / 2]} position={[0, 8.15, 0.5]}><cylinderGeometry args={[0.055, 0.055, 12.4, 12]} /></mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={s < 0 ? r.curtainL : r.curtainR} material={r.velvet} position={[s * 4.85, 3.85, 0.5]} />
              <mesh material={r.brass} position={[s * 5.5, 2.65, 0.62]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.2, 0.035, 8, 20]} /></mesh>
              <mesh position={[s * 4.7, 3.8, 0.03]}><planeGeometry args={[4.6, 13]} /><meshBasicMaterial map={r.shadow} transparent depthWrite={false} opacity={0.85} /></mesh>
            </group>
          ))}
        </>
      )}

      {/* ---- string lights draped around the arch ---- */}
      <mesh geometry={r.wire}><meshBasicMaterial color="#1c0d14" /></mesh>
      {r.bulbPos.map((p, i) => <mesh key={i} position={p} ref={(o) => { if (o) bulbMeshes.current[i] = o; }}><sphereGeometry args={[0.062, 12, 8]} /><meshStandardMaterial color="#8a7060" emissive={BULB_COLORS[i % BULB_COLORS.length]} emissiveIntensity={0.04} roughness={0.3} /></mesh>)}
      <points ref={bulbGlow} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[Float32Array.from(r.bulbPos.flatMap((v) => [v.x, v.y, v.z + 0.08])), 3]} /></bufferGeometry>
        <pointsMaterial map={r.glowTex} size={0.6} sizeAttenuation color="#ffb86a" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} />
      </points>
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Interior };
export default mod;
export const Scene = Interior;
