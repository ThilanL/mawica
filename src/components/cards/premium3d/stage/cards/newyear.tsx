"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ADD_LIGHT, Particles } from "../../Particles";
import { glowTexture } from "../../textures";
import { easeInOutSine, easeOutBack, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, poolTexture, rng } from "../gfx";
import { GOLD_DUST } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 12.5;
const W = 1.5, H = 2.5, T = 0.52; // numeral cell and stroke weight
const GAP = 0.34, DEPTH = 0.55;
const POP = [4.0, 4.28, 4.56, 4.84]; // when each numeral appears (after the countdown)

export const def: StageSceneDef = {
  duration: DURATION, heroT: 8.6,
  lift: (a) => (a < 0.9 ? 0.2 : 0.14),
  fog: ["#160c26", 16, 55],
  camera(t, aspect) {
    const total = W * 4 + GAP * 3;
    const base = fitDistance(total * (aspect < 0.9 ? 1.32 : 1.12), H * (aspect < 0.9 ? 3.2 : 2.5), aspect, 1.0); // the slow orbit widens the numerals a little: leave margin on phones
    const dist = base * lerp(0.86, 1, easeOutCubic(seg(t, 0, DURATION)));
    const a = Math.sin(t * 0.32) * 0.16;
    return { pos: { x: Math.sin(a) * dist, y: 1.5 + 0.2 * Math.sin(t * 0.4), z: Math.cos(a) * dist }, look: { x: 0, y: 1.25, z: 0 } };
  },
};

/** Bold numerals built from extruded, bevelled shapes (no font file): two strokes of arcs, bars and diagonals that overlap into one solid glyph. */
function ring(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, ro, a0, a1, false); s.absarc(cx, cy, ri, a1, a0, true); s.closePath(); return s;
}
const poly = (pts: [number, number][]) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
const ex = (s: THREE.Shape) => new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.08, bevelSegments: 5, curveSegments: 28 });
function glyph(ch: "2" | "0" | "7") {
  const parts: THREE.Shape[] = [];
  if (ch === "0") {
    const s = new THREE.Shape(); s.absellipse(W / 2, H / 2, W / 2, H / 2, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absellipse(W / 2, H / 2, W / 2 - T, H / 2 - T * 0.92, 0, Math.PI * 2, true); s.holes.push(h); parts.push(s);
  } else if (ch === "2") {
    parts.push(ring(W / 2, H - W / 2, W / 2, W / 2 - T, -0.35, Math.PI + 0.15)); // the bowl
    parts.push(poly([[W - 0.05, H - W / 2 - 0.1], [W - T - 0.02, H - W / 2 - 0.2], [0, T * 0.7], [T * 1.05, T * 0.7]])); // the neck, sweeping down-left
    parts.push(poly([[0, 0], [W, 0], [W, T * 0.86], [0, T * 0.86]])); // the base
  } else {
    parts.push(poly([[0, H], [W, H], [W, H - T * 0.86], [0, H - T * 0.86]])); // the bar
    parts.push(poly([[W, H - T * 0.5], [W - T * 1.05, H - T * 0.5], [W * 0.18, 0], [W * 0.18 + T * 1.05, 0]])); // the stem
  }
  const g = mergeGeometries(parts.map(ex), false)!;
  g.translate(-W / 2, -H / 2, -DEPTH / 2);
  return g;
}

const FW = 7, FW_N = 70; // simultaneous fireworks and particles per burst

function Year({ shared, mobile, mode }: StageSceneProps) {
  const digits = useRef<(THREE.Mesh | null)[]>([]), flash = useRef<THREE.Sprite>(null), fw = useRef<THREE.Points>(null), ringsRef = useRef<(THREE.Mesh | null)[]>([]), floor = useRef<THREE.Mesh>(null);
  const r = useMemo(() => {
    const geos = { "2": glyph("2"), "0": glyph("0"), "7": glyph("7") };
    const total = W * 4 + GAP * 3, xs = [0, 1, 2, 3].map((i) => -total / 2 + W / 2 + i * (W + GAP));
    const N = FW * FW_N;
    return {
      geos, xs, glowTex: glowTexture(), poolTex: poolTexture("rgba(255,200,110,0.55)", "rgba(120,70,160,0.25)"),
      gold: new THREE.MeshPhysicalMaterial({ color: "#f3c25a", metalness: 1, roughness: 0.2, envMapIntensity: 1.9, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
      fwPos: new Float32Array(N * 3), fwVel: new Float32Array(N * 3), fwCol: new Float32Array(N * 3), fwLife: new Float32Array(N), burst: new Int8Array(FW).fill(-1), rnd: rng(99),
    };
  }, []);
  useEffect(() => () => { dispose(r.geos["2"], r.geos["0"], r.geos["7"], r.glowTex, r.poolTex, r.gold); }, [r]);
  const seq = useMemo(() => ["2", "0", "2", "7"] as const, []);
  const state = useRef({ next: 0, lastT: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05), live = mode === "static" ? DURATION : shared.current.t;
    // countdown pulses (the numerals themselves are DOM text), then a golden flash and the reveal
    ringsRef.current.forEach((m, i) => { if (!m) return; const k = seg(live, 1 + i, 2.2 + i); m.visible = k > 0 && k < 1; m.scale.setScalar(0.5 + k * 9); (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.6; });
    const fl = Math.max(0, 1 - Math.abs(live - 4.0) * 1.6);
    if (flash.current) { (flash.current.material as THREE.SpriteMaterial).opacity = Math.min(1, fl); flash.current.scale.setScalar(6 + fl * 10); }
    digits.current.forEach((m, i) => {
      if (!m) return; const k = easeOutBack(seg(live, POP[i], POP[i] + 0.9), 1.6);
      m.visible = k > 0.001; m.scale.setScalar(Math.max(0.001, k)); m.position.set(r.xs[i], 1.25 + Math.sin(live * 1.1 + i * 0.7) * 0.07 * seg(live, POP[i] + 1, POP[i] + 2) + (1 - k) * -1.2, 0);
      m.rotation.y = (1 - Math.min(1, k)) * 1.6 + Math.sin(live * 0.6 + i) * 0.12 * seg(live, POP[i] + 1, POP[i] + 2.5);
    });
    if (floor.current) (floor.current.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.6 * easeInOutSine(seg(live, 3.8, 6));
    // fireworks: a new burst every ~0.85 s after the reveal, in a ring behind the numerals
    const fp = fw.current; if (!fp) return;
    const st = state.current;
    if (mode === "play" && live > 5.0 && Math.floor((live - 5.0) / 0.85) >= st.next) {
      const b = st.next % FW; st.next++;
      const cx = (r.rnd() - 0.5) * 8, cy = 2.4 + r.rnd() * 3.2, cz = -3.5 - r.rnd() * 2.5;
      const pal = [[1, 0.78, 0.38], [0.95, 0.45, 0.72], [0.7, 0.55, 0.95], [1, 0.95, 0.75]][(r.rnd() * 4) | 0];
      for (let k = 0; k < FW_N; k++) {
        const i = b * FW_N + k, a = r.rnd() * Math.PI * 2, e = Math.acos(2 * r.rnd() - 1), sp = 2.2 + r.rnd() * 2.2;
        r.fwPos[i * 3] = cx; r.fwPos[i * 3 + 1] = cy; r.fwPos[i * 3 + 2] = cz;
        r.fwVel[i * 3] = Math.sin(e) * Math.cos(a) * sp; r.fwVel[i * 3 + 1] = Math.cos(e) * sp; r.fwVel[i * 3 + 2] = Math.sin(e) * Math.sin(a) * sp;
        r.fwCol[i * 3] = pal[0]; r.fwCol[i * 3 + 1] = pal[1]; r.fwCol[i * 3 + 2] = pal[2]; r.fwLife[i] = 1.4 + r.rnd() * 0.7;
      }
    }
    const col = fp.geometry.attributes.color as THREE.BufferAttribute, pos = fp.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < FW * FW_N; i++) {
      if (r.fwLife[i] > 0) { r.fwLife[i] -= dt; r.fwVel[i * 3 + 1] -= 2.4 * dt; r.fwPos[i * 3] += r.fwVel[i * 3] * dt; r.fwPos[i * 3 + 1] += r.fwVel[i * 3 + 1] * dt; r.fwPos[i * 3 + 2] += r.fwVel[i * 3 + 2] * dt; const f = Math.max(0, Math.min(1, r.fwLife[i] / 1.2)); r.fwVel[i * 3] *= 0.992; r.fwVel[i * 3 + 2] *= 0.992; (col.array as Float32Array)[i * 3] = r.fwCol[i * 3] * f; (col.array as Float32Array)[i * 3 + 1] = r.fwCol[i * 3 + 1] * f; (col.array as Float32Array)[i * 3 + 2] = r.fwCol[i * 3 + 2] * f; }
      else { (col.array as Float32Array)[i * 3] = (col.array as Float32Array)[i * 3 + 1] = (col.array as Float32Array)[i * 3 + 2] = 0; }
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  });

  return (
    <>
      <hemisphereLight args={["#a98cf0", "#1f1030", 0.4]} />
      <directionalLight position={[3, 5, 7]} intensity={1.2} color="#fff0d8" />
      <directionalLight position={[-6, 2, 3]} intensity={0.9} color="#d9699f" />
      <directionalLight position={[6, 1, -2]} intensity={0.8} color="#9c7edb" />
      <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}><planeGeometry args={[18, 9]} /><meshBasicMaterial map={r.poolTex} transparent opacity={0.2} depthWrite={false} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} ref={(o) => { digits.current[i] = o; }} geometry={r.geos[seq[i]]} material={r.gold} visible={false} />)}
      {[0, 1, 2].map((i) => <mesh key={i} ref={(o) => { ringsRef.current[i] = o; }} position={[0, 1.25, -0.4]} visible={false}><torusGeometry args={[1, 0.018, 8, 80]} /><meshBasicMaterial color="#f4c371" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></mesh>)}
      <sprite ref={flash} position={[0, 1.25, 0.6]} scale={6}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
      <points ref={fw} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.fwPos, 3]} /><bufferAttribute attach="attributes-color" args={[r.fwCol.slice(), 3]} /></bufferGeometry>
        <pointsMaterial map={r.glowTex} size={mobile ? 0.34 : 0.28} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
      </points>
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Year };
export default mod;
export const Scene = Year;
