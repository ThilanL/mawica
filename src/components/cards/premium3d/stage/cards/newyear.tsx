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
const GAP = 0.36, DEPTH = 0.62;
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
    return { pos: { x: Math.sin(a) * dist, y: 0.85 + 0.2 * Math.sin(t * 0.4), z: Math.cos(a) * dist }, look: { x: 0, y: 1.5, z: 0 } }; // from slightly below, so the numerals stand tall against the fireworks
  },
};

/** Bold numerals built from extruded, bevelled shapes (no font file): two strokes of arcs, bars and diagonals that overlap into one solid glyph. */
function ring(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, ro, a0, a1, false); s.absarc(cx, cy, ri, a1, a0, true); s.closePath(); return s;
}
const poly = (pts: [number, number][]) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
const ex = (s: THREE.Shape) => new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.1, bevelSegments: 8, curveSegments: 36 });
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
  const g = mergeGeometries(parts.map(ex), true)!; // groups kept: faces and sides take different golds
  g.translate(-W / 2, -H / 2, -DEPTH / 2);
  return g;
}

const FW = 8, FW_N = 64, FW_EVERY = 0.55, FW_FROM = 5.0, FW_LIFE = 2.6; // bursts alive at once, sparks per burst, seconds between bursts
const PALETTE = [[1, 0.78, 0.38], [1, 0.86, 0.55], [0.95, 0.5, 0.74], [0.72, 0.58, 0.96], [1, 0.95, 0.78], [1, 0.72, 0.3]];
/** Every burst is a pure function of its slot and its round, so any moment of the show can be drawn directly (seeking, thumbnails, reduced motion). */
function burstAt(slot: number, round: number) {
  const r = rng(1000 + slot * 31 + round * 977); r();
  const depth = r(); // 0 = just behind the numerals, 1 = far away
  return { x: (r() - 0.5) * lerp(9, 17, depth), y: lerp(2.3, 3.2, depth) + r() * 1.9, z: lerp(-2.8, -11, depth), speed: lerp(2.8, 4.4, r()), col: PALETTE[(r() * PALETTE.length) | 0], dim: lerp(1, 0.6, depth) };
}

function Year({ shared, mobile, mode }: StageSceneProps) {
  const digits = useRef<(THREE.Mesh | null)[]>([]), flash = useRef<THREE.Sprite>(null), back = useRef<THREE.Sprite>(null), skyLight = useRef<THREE.PointLight>(null), blooms = useRef<(THREE.Sprite | null)[]>([]), fw = useRef<THREE.Points>(null), ringsRef = useRef<(THREE.Mesh | null)[]>([]), floor = useRef<THREE.Mesh>(null);
  const r = useMemo(() => {
    const geos = { "2": glyph("2"), "0": glyph("0"), "7": glyph("7") };
    const total = W * 4 + GAP * 3, xs = [0, 1, 2, 3].map((i) => -total / 2 + W / 2 + i * (W + GAP));
    const N = FW * (FW_N + 1), dirRnd = rng(5), dirs = new Float32Array(FW_N * 3);
    for (let k = 0; k < FW_N; k++) { const a = dirRnd() * Math.PI * 2, e = Math.acos(2 * dirRnd() - 1), sp = 0.55 + dirRnd() * 0.45; dirs.set([Math.sin(e) * Math.cos(a) * sp, Math.cos(e) * sp, Math.sin(e) * Math.sin(a) * sp], k * 3); }
    return { dirs,
      geos, xs, glowTex: glowTexture(), poolTex: poolTexture("rgba(255,200,110,0.55)", "rgba(120,70,160,0.25)"),
      gold: new THREE.MeshPhysicalMaterial({ color: "#f6cd6c", metalness: 1, roughness: 0.16, envMapIntensity: 2.3, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
      goldSide: new THREE.MeshPhysicalMaterial({ color: "#d99a34", metalness: 1, roughness: 0.3, envMapIntensity: 1.9 }),
      fwPos: new Float32Array(N * 3), fwCol: new Float32Array(N * 3),
    };
  }, []);
  useEffect(() => () => { dispose(r.geos["2"], r.geos["0"], r.geos["7"], r.glowTex, r.poolTex, r.gold, r.goldSide); }, [r]);
  const seq = useMemo(() => ["2", "0", "2", "7"] as const, []);

  useFrame(() => {
    const live = mode === "static" ? DURATION : shared.current.t;
    // countdown pulses (the numerals themselves are DOM text), then a golden flash and the reveal
    ringsRef.current.forEach((m, i) => { if (!m) return; const k = seg(live, 1 + i, 2.2 + i); m.visible = k > 0 && k < 1; m.scale.setScalar(0.5 + k * 9); (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.6; });
    const fl = Math.max(0, 1 - Math.abs(live - 4.05) * 1.25);
    if (flash.current) { (flash.current.material as THREE.SpriteMaterial).opacity = easeInOutSine(fl) * 0.6; flash.current.scale.setScalar(5 + fl * 5); }
    if (back.current) (back.current.material as THREE.SpriteMaterial).opacity = 0.3 * easeInOutSine(seg(live, 3.8, 6.2));
    digits.current.forEach((m, i) => {
      if (!m) return; const k = easeOutBack(seg(live, POP[i], POP[i] + 0.9), 1.6);
      m.visible = k > 0.001; m.scale.setScalar(Math.max(0.001, k)); m.position.set(r.xs[i], 1.25 + Math.sin(live * 1.1 + i * 0.7) * 0.07 * seg(live, POP[i] + 1, POP[i] + 2) + (1 - k) * -1.2, 0);
      m.rotation.y = (1 - Math.min(1, k)) * 1.6 + Math.sin(live * 0.6 + i) * 0.12 * seg(live, POP[i] + 1, POP[i] + 2.5);
    });
    if (floor.current) (floor.current.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.6 * easeInOutSine(seg(live, 3.8, 6));
    // fireworks: a rocket climbs, bursts, and the sparks spread, slow, droop and twinkle out. Near bursts are large, far ones small and dim.
    const fp = fw.current; if (!fp) return;
    const P = r.fwPos, C = r.fwCol, cycle = FW * FW_EVERY; let glow = 0; const gc = [0, 0, 0];
    for (let b = 0; b < FW; b++) {
      const since = live - FW_FROM - b * FW_EVERY, round = Math.floor(since / cycle), age = since - round * cycle, o = b * (FW_N + 1), bloom = blooms.current[b];
      const hide = (from: number) => { for (let i = from; i < o + FW_N + 1; i++) C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 0; };
      if (since < -0.7 || age > FW_LIFE) { hide(o); if (bloom) bloom.visible = false; continue; }
      const B = burstAt(b, Math.max(0, round)), rise = since < 0 ? since : age - cycle; // the next rocket is already climbing during the last 0.7 s of a slot
      const tr = o + FW_N; // the rocket's own spark
      if (rise > -0.7 && rise < 0) { const N2 = burstAt(b, round + (since < 0 ? 0 : 1)), k = 1 + rise / 0.7; P[tr * 3] = N2.x; P[tr * 3 + 1] = lerp(-2.5, N2.y, easeOutCubic(k)); P[tr * 3 + 2] = N2.z; C[tr * 3] = 1 * N2.dim; C[tr * 3 + 1] = 0.85 * N2.dim; C[tr * 3 + 2] = 0.6 * N2.dim; } else { C[tr * 3] = C[tr * 3 + 1] = C[tr * 3 + 2] = 0; }
      if (since < 0) { hide(o); C[tr * 3] = Math.max(C[tr * 3], 0); if (bloom) bloom.visible = false; continue; }
      const travel = (1 - Math.exp(-1.5 * age)) / 1.5, fade = Math.pow(Math.max(0, 1 - age / FW_LIFE), 0.8);
      for (let k = 0; k < FW_N; k++) {
        const i = o + k, tw = age > 1 ? 0.55 + 0.45 * Math.sin(age * 22 + k * 2.4) : 1, f = fade * tw * B.dim;
        P[i * 3] = B.x + r.dirs[k * 3] * B.speed * travel; P[i * 3 + 1] = B.y + r.dirs[k * 3 + 1] * B.speed * travel - 0.55 * age * age; P[i * 3 + 2] = B.z + r.dirs[k * 3 + 2] * B.speed * travel;
        C[i * 3] = B.col[0] * f; C[i * 3 + 1] = B.col[1] * f; C[i * 3 + 2] = B.col[2] * f;
      }
      const pop = Math.max(0, 1 - age / 0.9) * B.dim; // each burst lights the air around it and, softly, the numerals
      if (bloom) { bloom.visible = pop > 0.01; bloom.position.set(B.x, B.y, B.z); bloom.scale.setScalar(3 + age * 5); const m = bloom.material as THREE.SpriteMaterial; m.opacity = pop * 0.38; m.color.setRGB(B.col[0], B.col[1], B.col[2]); }
      if (pop > glow) { glow = pop; gc[0] = B.col[0]; gc[1] = B.col[1]; gc[2] = B.col[2]; }
    }
    if (skyLight.current) { skyLight.current.intensity = 5 + glow * 22; skyLight.current.color.setRGB(lerp(1, gc[0], glow), lerp(0.82, gc[1], glow), lerp(0.6, gc[2], glow)); }
    (fp.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (fp.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <>
      <hemisphereLight args={["#a98cf0", "#1f1030", 0.4]} />
      <directionalLight position={[3, 5, 7]} intensity={1.2} color="#fff0d8" />
      <directionalLight position={[-6, 2, 3]} intensity={0.9} color="#d9699f" />
      <directionalLight position={[6, 1, -2]} intensity={0.8} color="#9c7edb" />
      <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}><planeGeometry args={[18, 9]} /><meshBasicMaterial map={r.poolTex} transparent opacity={0.2} depthWrite={false} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} ref={(o) => { digits.current[i] = o; }} geometry={r.geos[seq[i]]} material={[r.gold, r.goldSide]} visible={false} />)}
      {/* soft warm haze behind the numerals, and the light the fireworks throw back onto them */}
      <sprite ref={back} position={[0, 1.4, -1.6]} scale={[16, 9, 1]}><spriteMaterial map={r.glowTex} color="#ffb060" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
      <pointLight ref={skyLight} position={[0, 4.5, -3]} color="#ffd9a0" intensity={5} distance={18} decay={1.3} />
      {Array.from({ length: FW }, (_, i) => <sprite key={i} ref={(o) => { blooms.current[i] = o; }} visible={false}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>)}
      {[0, 1, 2].map((i) => <mesh key={i} ref={(o) => { ringsRef.current[i] = o; }} position={[0, 1.25, -0.4]} visible={false}><torusGeometry args={[1, 0.018, 8, 80]} /><meshBasicMaterial color="#f4c371" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></mesh>)}
      <sprite ref={flash} position={[0, 1.25, 0.6]} scale={6}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
      <points ref={fw} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.fwPos, 3]} /><bufferAttribute attach="attributes-color" args={[r.fwCol, 3]} /></bufferGeometry>
        <pointsMaterial map={r.glowTex} size={mobile ? 0.4 : 0.36} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
      </points>
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Year };
export default mod;
export const Scene = Year;
