"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ADD_LIGHT } from "../../Particles";
import { glowTexture } from "../../textures";
import { easeInOutSine, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, rng } from "../gfx";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 11;
const WIN = { w: 2.8, h: 3.0, y: 1.6 }; // inner opening; the arch rises above the rectangle

export const def: StageSceneDef = {
  duration: DURATION, heroT: 8.2,
  lift: (a) => (a < 0.9 ? 0.2 : 0.13),
  fog: ["#2b1420", 18, 60],
  camera(t, aspect) {
    const base = fitDistance(7.2, 8.4 * (aspect < 0.9 ? 1.5 : 1.3), aspect, 1.0);
    const dist = base * lerp(0.82, 1, easeOutCubic(seg(t, 0, DURATION)));
    return { pos: { x: lerp(-0.7, 0.1, easeInOutSine(seg(t, 0, DURATION))), y: 4.3, z: dist }, look: { x: 0, y: 4.1, z: 0 } };
  },
};

function archShape(w: number, h: number, hole = false) {
  const s = new THREE.Shape(), r = w / 2, x0 = -r, y0 = 0;
  s.moveTo(x0, y0); s.lineTo(x0 + w, y0); s.lineTo(x0 + w, y0 + h); s.absarc(0, y0 + h, r, 0, Math.PI, false); s.lineTo(x0, y0);
  void hole; return s;
}

/** Arch-shaped plane with 0..1 UVs, so a texture fits the window opening exactly. */
function archPlane(w: number, h: number) {
  const g = new THREE.ShapeGeometry(archShape(w, h), 32);
  const p = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(p.count * 2), total = h + w / 2;
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / total; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return g;
}

function frostTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 768;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 512, 768);
  const edge = x.createRadialGradient(256, 400, 120, 256, 400, 420);
  edge.addColorStop(0, "rgba(220,235,255,0)"); edge.addColorStop(0.6, "rgba(220,235,255,0.14)"); edge.addColorStop(1, "rgba(230,240,255,0.78)");
  x.fillStyle = edge; x.fillRect(0, 0, 512, 768);
  const r = rng(5);
  x.strokeStyle = "rgba(255,255,255,0.55)"; x.lineWidth = 1.3;
  for (let i = 0; i < 160; i++) { // fern-like frost crystals growing in from the edges
    const side = (r() * 4) | 0; let px = side < 2 ? (side ? 512 : 0) : r() * 512, py = side < 2 ? r() * 768 : side === 2 ? 0 : 768;
    const a = Math.atan2(384 - py, 256 - px) + (r() - 0.5) * 1.2; const len = 40 + r() * 110;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 7; k++) { const sl = len / 7; px += Math.cos(a) * sl; py += Math.sin(a) * sl; x.lineTo(px, py); if (k % 2) { x.moveTo(px, py); x.lineTo(px + Math.cos(a + 0.8) * sl * 0.7, py + Math.sin(a + 0.8) * sl * 0.7); x.moveTo(px, py); x.lineTo(px + Math.cos(a - 0.8) * sl * 0.7, py + Math.sin(a - 0.8) * sl * 0.7); x.moveTo(px, py); } }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function nightTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 512; const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, "#0d1530"); g.addColorStop(0.6, "#1c2c55"); g.addColorStop(1, "#3a4a7a");
  x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  const r = rng(9); for (let i = 0; i < 26; i++) { const px = r() * 256, py = 330 + r() * 170, rad = 4 + r() * 10; const gl = x.createRadialGradient(px, py, 0, px, py, rad); gl.addColorStop(0, "rgba(255,200,130,0.9)"); gl.addColorStop(1, "rgba(255,200,130,0)"); x.fillStyle = gl; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wallTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d")!;
  x.fillStyle = "#4a2230"; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "rgba(255,190,150,0.05)"; x.lineWidth = 2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const px = i * 64 + 32 + (j % 2) * 32, py = j * 64 + 32; x.beginPath(); x.ellipse(px, py, 11, 18, 0, 0, 7); x.stroke(); x.beginPath(); x.moveTo(px, py - 18); x.lineTo(px, py + 18); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); return t;
}

function Interior({ shared, mobile, mode }: StageSceneProps) {
  const flames = useRef<THREE.Sprite[]>([]), candleLights = useRef<THREE.PointLight[]>([]), bulbs = useRef<THREE.Points>(null), snow = useRef<THREE.Points>(null), roomLight = useRef<THREE.PointLight>(null);
  const bulbMats = useRef<THREE.Mesh[]>([]);
  const r = useMemo(() => {
    const frame = new THREE.ExtrudeGeometry(archShape(WIN.w + 0.62, WIN.h + 0.31), { depth: 0.38, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 32 });
    const hole = archShape(WIN.w, WIN.h);
    const outer = archShape(WIN.w + 0.62, WIN.h + 0.31);
    outer.holes.push(new THREE.Path(hole.getPoints(32).map((p) => new THREE.Vector2(p.x, p.y + 0.155)).reverse()));
    const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.38, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 32 });
    frame.dispose();
    const N = mobile ? 140 : 260, pos = new Float32Array(N * 3), rnd = rng(3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * (WIN.w + 0.8); pos[i * 3 + 1] = WIN.y - 0.2 + rnd() * (WIN.h + 1.4); pos[i * 3 + 2] = -0.5 - rnd() * 3.5; }
    // string lights: a catenary swag above the window
    const nb = mobile ? 11 : 15, bp: THREE.Vector3[] = [];
    for (let i = 0; i < nb; i++) { const u = i / (nb - 1), x = lerp(-3.9, 3.9, u); bp.push(new THREE.Vector3(x, 7.9 - 1.0 * Math.sin(u * Math.PI) + 0.1 * Math.sin(u * 20), 0.25)); }
    // the wall has a real opening, so the night and the snow behind it are visible through the glass
    const wallShape = new THREE.Shape(); wallShape.moveTo(-16, -9); wallShape.lineTo(16, -9); wallShape.lineTo(16, 16); wallShape.lineTo(-16, 16); wallShape.lineTo(-16, -9);
    wallShape.holes.push(new THREE.Path(archShape(WIN.w, WIN.h).getPoints(32).map((p) => new THREE.Vector2(p.x, p.y + WIN.y)).reverse()));
    return { wallGeo: new THREE.ShapeGeometry(wallShape, 32), glassGeo: archPlane(WIN.w, WIN.h), frameGeo, frost: frostTexture(), night: nightTexture(), wall: wallTexture(), glowTex: glowTexture(), snowPos: pos, bulbPos: bp,
      wood: new THREE.MeshPhysicalMaterial({ color: "#7a4430", roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 }), candle: new THREE.MeshStandardMaterial({ color: "#fbeedd", roughness: 0.6, emissive: "#ffcf9a", emissiveIntensity: 0.18 }) };
  }, [mobile]);
  useEffect(() => () => { dispose(r.wallGeo, r.glassGeo, r.frameGeo, r.frost, r.night, r.wall, r.glowTex, r.wood, r.candle); }, [r]);

  useFrame((_, dt) => {
    const t = mode === "static" ? DURATION : shared.current.t;
    const warm = easeInOutSine(seg(t, 0.4, 4.2));
    if (roomLight.current) roomLight.current.intensity = 3.2 * warm;
    candleLights.current.forEach((l, i) => { if (l) l.intensity = (1.8 + Math.sin(t * 9 + i * 2.1) * 0.25 + Math.sin(t * 15 + i) * 0.12) * easeOutCubic(seg(t, 0.8 + i * 0.5, 2.2 + i * 0.5)); });
    flames.current.forEach((f, i) => { if (!f) return; const on = easeOutCubic(seg(t, 0.8 + i * 0.5, 2.0 + i * 0.5)); const fl = 1 + Math.sin(t * 11 + i * 1.7) * 0.07 + Math.sin(t * 19 + i) * 0.04; f.scale.set(0.5 * fl, 0.9 * fl * on, 1); (f.material as THREE.SpriteMaterial).opacity = on; });
    bulbMats.current.forEach((m, i) => { if (!m) return; const on = seg(t, 1.2 + (i / bulbMats.current.length) * 3, 1.7 + (i / bulbMats.current.length) * 3); const tw = 0.75 + 0.25 * Math.sin(t * 2.4 + i * 1.9); (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05 + 1.1 * on * tw; });
    if (snow.current) {
      const p = r.snowPos; const d = Math.min(dt, 0.05);
      for (let i = 0; i < p.length; i += 3) { p[i + 1] -= (0.55 + (i % 7) * 0.05) * d; p[i] += Math.sin(t * 0.8 + i) * 0.12 * d; if (p[i + 1] < WIN.y - 0.4) p[i + 1] = WIN.y + WIN.h + WIN.w / 2 + 0.8; }
      (snow.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (bulbs.current) (bulbs.current.material as THREE.PointsMaterial).opacity = 0.9 * warm;
  });

  const colors = ["#ffd58a", "#ff9ccd", "#ffe9b0", "#c7a8ff"];
  return (
    <>
      <hemisphereLight args={["#e0a890", "#2a1420", 0.28]} />
      <directionalLight position={[2, 4, 8]} intensity={0.55} color="#ffd6b0" />
      <pointLight ref={roomLight} position={[0, 3.2, 3.5]} color="#ffb070" intensity={0} distance={14} decay={1.4} />
      {/* wall */}
      <mesh geometry={r.wallGeo} position={[0, 0, -0.01]}><meshStandardMaterial map={r.wall} roughness={0.95} /></mesh>
      {/* night outside, snow outside, frosted glass */}
      <mesh position={[0, WIN.y + WIN.h / 2 + 0.8, -4.2]}><planeGeometry args={[9, 10]} /><meshBasicMaterial map={r.night} /></mesh>
      <points ref={snow} frustumCulled={false} position={[0, 0, 0]}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.snowPos, 3]} /></bufferGeometry>
        <pointsMaterial map={r.glowTex} size={0.2} sizeAttenuation transparent opacity={0.95} depthWrite={false} color="#ffffff" />
      </points>
      <mesh geometry={r.glassGeo} position={[0, WIN.y, 0.12]}><meshBasicMaterial map={r.frost} transparent depthWrite={false} /></mesh>
      {/* frame, bars, sill */}
      <mesh geometry={r.frameGeo} material={r.wood} position={[0, WIN.y - 0.155, -0.1]} />
      <mesh material={r.wood} position={[0, WIN.y + (WIN.h + WIN.w / 2) / 2, 0.1]}><boxGeometry args={[0.1, WIN.h + WIN.w / 2, 0.12]} /></mesh>
      <mesh material={r.wood} position={[0, WIN.y + WIN.h * 0.4, 0.1]}><boxGeometry args={[WIN.w, 0.1, 0.12]} /></mesh>
      <mesh material={r.wood} position={[0, WIN.y - 0.02, 0.28]}><boxGeometry args={[WIN.w + 1.3, 0.2, 0.75]} /></mesh>
      {/* candles */}
      {[[-1.05, 0.55, 0.4], [-0.55, 0.78, 0.46], [1.15, 0.45, 0.4]].map(([x, h, z], i) => (
        <group key={i} position={[x as number, WIN.y + 0.08, z as number]}>
          <mesh material={r.candle} position={[0, (h as number) / 2, 0]}><cylinderGeometry args={[0.13, 0.14, h as number, 20]} /></mesh>
          <sprite ref={(o) => { if (o) flames.current[i] = o; }} position={[0, (h as number) + 0.2, 0]} scale={[0.5, 0.9, 1]}><spriteMaterial map={r.glowTex} color="#ffb347" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
          <mesh position={[0, (h as number) + 0.07, 0]}><coneGeometry args={[0.035, 0.16, 8]} /><meshBasicMaterial color="#fff3d2" /></mesh>
          <pointLight ref={(o) => { if (o) candleLights.current[i] = o; }} position={[0, (h as number) + 0.3, 0.2]} color="#ffa24a" intensity={0} distance={5} decay={1.6} />
        </group>
      ))}
      {/* string lights */}
      <mesh position={[0, 6.55, 0.22]} visible={false}><planeGeometry args={[0.1, 0.1]} /></mesh>
      {r.bulbPos.map((p, i) => <mesh key={i} position={p} ref={(o) => { if (o) bulbMats.current[i] = o; }}><sphereGeometry args={[0.09, 14, 10]} /><meshStandardMaterial color="#8a7060" emissive={colors[i % colors.length]} emissiveIntensity={0.05} /></mesh>)}
      <points ref={bulbs} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[Float32Array.from(r.bulbPos.flatMap((v) => [v.x, v.y, v.z + 0.1])), 3]} /></bufferGeometry>
        <pointsMaterial map={r.glowTex} size={0.8} sizeAttenuation color="#ffb86a" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} />
      </points>
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Interior };
export default mod;
export const Scene = Interior;
