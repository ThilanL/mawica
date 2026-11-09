"use client";

/* eslint-disable react-hooks/immutability -- react-three-fiber frame loop: typed arrays and Three.js objects are mutated imperatively by design */

/**
 * Lumi, the Mawica companion (react-three-fiber). The character is generated procedurally in code
 * (smooth-shaded inflated star, glossy eyes, satin gold). Three.js is only ever imported lazily:
 * by the /lab/lumi route and by the homepage "Meet Lumi" section after the visitor activates it.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { CELEBRATION_SECONDS, celebrationPose, clamp, pointerOffset, seeded } from "./lumiMath";

export type LumiControls = { celebrate: () => void; poke: (x: number, y: number) => void; look: (x: number, y: number, seconds?: number) => void };
export type LumiStats = { fps: number; calls: number; triangles: number; geometries: number; textures: number; dpr: number };
type Anchor = { x: number; y: number };

const GOLD = "#f9cd58";
const GOLD_EMISSIVE = "#f0a02a";

/** Soft rounded five-point star outline (unit outer radius). */
function starShape(outer = 1, inner = 0.52) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const shape = new THREE.Shape();
  const n = pts.length;
  pts.forEach((cur, i) => {
    const prev = pts[(i + n - 1) % n];
    const next = pts[(i + 1) % n];
    const k = i % 2 === 0 ? 0.26 : 0.22; // round the tips more than the valleys
    const a = cur.clone().lerp(prev, k);
    const b = cur.clone().lerp(next, k);
    if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  });
  shape.closePath();
  return shape;
}

function makeBodyGeometry() {
  const raw = new THREE.ExtrudeGeometry(starShape(), {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.17,
    bevelSegments: 12,
    curveSegments: 18,
  });
  // ExtrudeGeometry is non-indexed with per-face normals, which shows as faceted banding on the rounded edge.
  // Dropping normals/uvs, welding vertices and recomputing gives smooth, pillowy shading ("inflated" look).
  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");
  const g = mergeVertices(raw, 1e-4);
  raw.dispose();
  g.center();
  g.computeVertexNormals();
  return g;
}

/** Radial glow texture drawn once on a tiny canvas (no image download). */
function makeGlowTexture(soft = true) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,244,214,1)");
  g.addColorStop(soft ? 0.25 : 0.4, "rgba(255,200,110,0.55)");
  g.addColorStop(1, "rgba(255,160,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Additive "light" blending that adds colour but leaves the canvas alpha untouched. Plain AdditiveBlending also
 * raises alpha, which on a transparent canvas composites as dark specks where a particle has faded to black.
 */
const ADD_LIGHT = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const BURST = 90;
const AMBIENT = 26;
const COUNT = BURST + AMBIENT;

type Shared = { active: boolean; wakeAt: number; px: number; py: number; lastMove: number; look: { x: number; y: number; until: number }; celebrateAt: number; burst: number[] };

function Scene({ anchor, size, reduced, controls, shared, awake, mood, still, onReady }: { anchor: Anchor; size: number; reduced: boolean; controls: React.MutableRefObject<LumiControls | null>; shared: React.MutableRefObject<Shared>; awake: boolean; mood: "happy" | "curious"; still: boolean; onReady?: () => void }) {
  const { viewport, invalidate } = useThree();
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const pupilL = useRef<THREE.Mesh>(null);
  const pupilR = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const points = useRef<THREE.Points>(null);
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);

  const bodyGeo = useMemo(() => makeBodyGeometry(), []);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const sparkTex = useMemo(() => makeGlowTexture(false), []);
  const sim = useMemo(() => {
    const rnd = seeded(7);
    return {
      pos: new Float32Array(COUNT * 3),
      col: new Float32Array(COUNT * 3),
      vel: new Float32Array(COUNT * 3),
      life: new Float32Array(COUNT),
      maxLife: new Float32Array(COUNT).fill(1),
      phase: Float32Array.from({ length: COUNT }, () => rnd() * Math.PI * 2),
      orbit: Float32Array.from({ length: COUNT }, () => 1.2 + rnd() * 1.5),
      rnd,
      next: 0,
    };
  }, []);

  // WebGL resources created here are not owned by react-three-fiber's disposal, so release them explicitly.
  useEffect(() => () => { bodyGeo.dispose(); glowTex.dispose(); sparkTex.dispose(); }, [bodyGeo, glowTex, sparkTex]);

  const state = useRef({ curious: 0, awake: awake ? 1 : 0, ready: false, rotX: 0, rotY: 0, gx: 0, gy: 0, blinkAt: 2.2, blinkT: -1, lastT: 0 });

  const emit = (n: number, speed: number, up: number) => {
    for (let k = 0; k < n; k++) {
      const i = AMBIENT + (sim.next++ % BURST);
      const a = sim.rnd() * Math.PI * 2;
      const s = speed * (0.45 + sim.rnd() * 0.9);
      sim.pos[i * 3] = Math.cos(a) * 0.3;
      sim.pos[i * 3 + 1] = Math.sin(a) * 0.3;
      sim.pos[i * 3 + 2] = (sim.rnd() - 0.5) * 0.3;
      sim.vel[i * 3] = Math.cos(a) * s;
      sim.vel[i * 3 + 1] = Math.sin(a) * s + up;
      sim.vel[i * 3 + 2] = (sim.rnd() - 0.2) * s * 0.6;
      sim.maxLife[i] = 1.0 + sim.rnd() * 1.0;
      sim.life[i] = sim.maxLife[i];
    }
  };

  useEffect(() => {
    controls.current = {
      celebrate: () => {
        const sh = shared.current;
        sh.celebrateAt = performance.now() / 1000;
        sh.burst = reduced ? [] : [0.25, 1.3];
        invalidate();
      },
      look: (x, y, seconds = 1.6) => {
        const sh = shared.current;
        sh.look = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: performance.now() / 1000 + seconds };
        invalidate();
      },
      poke: (x, y) => {
        const sh = shared.current;
        sh.look = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: performance.now() / 1000 + 1.4 };
        sh.lastMove = performance.now() / 1000;
        if (!reduced) sh.burst.push(0);
        invalidate();
      },
    };
    return () => { controls.current = null; };
  }, [controls, shared, reduced, invalidate]);

  useEffect(() => {
    if (awake) { shared.current.wakeAt = performance.now() / 1000; invalidate(); }
  }, [awake, shared, invalidate]);

  useFrame((frame, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    // Use wall-clock time, not R3F's clock: the clock restarts from zero every time rendering resumes after a pause.
    const now = performance.now() / 1000;
    const t = now;
    const sh = shared.current;
    const st = state.current;
    const unit = viewport.width * size;
    const baseX = anchor.x * (viewport.width / 2);
    const baseY = anchor.y * (viewport.height / 2);

    // gaze target: pointer when recently active, a poke, else wander around (idle "looks around")
    let tx: number, ty: number;
    if (now < sh.look.until) { tx = sh.look.x; ty = sh.look.y; }
    else if (now - sh.lastMove < 2.6) { tx = sh.px; ty = sh.py; }
    else if (reduced) { tx = 0; ty = 0; }
    else { tx = Math.sin(t * 0.7) * 0.75; ty = Math.sin(t * 0.45 + 1) * 0.4; }
    tx = clamp(tx, -1, 1); ty = clamp(ty, -1, 1);
    if (!st.ready) { st.ready = true; onReady?.(); }
    st.awake = THREE.MathUtils.damp(st.awake, awake ? 1 : 0, reduced ? 12 : 2.6, dt);
    const aw = st.awake;
    if (aw < 0.5) { tx = 0; ty = 0; }
    const lam = reduced ? 10 : 4.5;
    st.gx = THREE.MathUtils.damp(st.gx, tx, lam, dt);
    st.gy = THREE.MathUtils.damp(st.gy, ty, lam, dt);

    // celebration timeline
    const ct = now - sh.celebrateAt;
    sh.active = ct < CELEBRATION_SECONDS + 0.2 || now - sh.lastMove < 2.8 || now < sh.look.until || now - sh.wakeAt < 0.9 || Math.abs(st.awake - (awake ? 1 : 0)) > 0.01;
    const pose = reduced
      ? { spin: 0, hop: 0, squash: 1, joy: ct >= 0 && ct < 1.2 ? clamp(Math.min(ct / 0.2, (1.2 - ct) / 0.4), 0, 1) : 0, glow: ct >= 0 && ct < 1.2 ? 0.8 : 0 }
      : celebrationPose(ct);
    while (sh.burst.length && ct >= 0 && ct >= sh.burst[0]) { sh.burst.shift(); emit(sh.burst.length ? 48 : 40, 2.3, 1.4); }
    if (sh.burst.length && ct < 0) { /* poke sparkles use time 0 relative to poke */ }

    const wt = now - sh.wakeAt;
    const wakeHop = !reduced && wt >= 0 && wt < 0.7 ? Math.sin((wt / 0.7) * Math.PI) * 0.14 : 0;
    const float = reduced || still ? 0 : (Math.sin(t * 1.25) * 0.09 * aw + wakeHop) * unit + pose.hop * unit;
    const root_ = root.current!;
    root_.position.set(baseX, baseY + float, 0);
    root_.scale.setScalar(unit);

    const body_ = body.current!;
    body_.scale.set(1 / pose.squash ** 0.5, pose.squash, 1 / pose.squash ** 0.5);
    st.curious = THREE.MathUtils.damp(st.curious, mood === "curious" ? 1 : 0, 3, dt);
    body_.rotation.y = st.gx * 0.42 + pose.spin;
    body_.rotation.x = -st.gy * 0.3 + (reduced ? 0 : Math.sin(t * 0.8) * 0.04) + 0.32 * (1 - aw);
    body_.rotation.z = (reduced ? 0 : Math.sin(t * 0.9) * 0.05) - st.gx * 0.05 + 0.13 * st.curious;
    if (still) { body_.rotation.set(-0.06, 0.2, 0.05); body_.scale.set(1, 1, 1); }

    // eyes
    if (!reduced) {
      if (t >= st.blinkAt && st.blinkT < 0) st.blinkT = t;
      if (st.blinkT >= 0 && t - st.blinkT > 0.16) { st.blinkT = -1; st.blinkAt = t + 2.2 + ((Math.sin(t * 12.9898) + 1) / 2) * 3.2; }
    }
    const blink = st.blinkT >= 0 ? Math.abs(Math.cos(((t - st.blinkT) / 0.16) * Math.PI * 0.5)) * 0.9 + 0.1 : 1;
    const happy = 1 - 0.35 * pose.joy;
    const eyeScaleY = Math.min(blink, happy) * (0.06 + 0.94 * aw * aw * (3 - 2 * aw)) * (1 + 0.1 * st.curious);
    eyeL.current!.scale.y = eyeScaleY;
    eyeR.current!.scale.y = eyeScaleY;
    for (const p of [pupilL.current!, pupilR.current!]) p.position.set(st.gx * 0.04, st.gy * 0.035, 0.05);
    smile.current!.scale.set((1 + 0.25 * pose.joy) * (1 - 0.12 * st.curious), 1 - pose.joy * 0.2 - 0.1 * st.curious, 1);
    smile.current!.visible = pose.joy < 0.55;
    const m = mouth.current!;
    m.visible = pose.joy >= 0.55 || pose.joy > 0.25;
    m.scale.setScalar(Math.max(0.0001, pose.joy));

    // glow + emissive
    const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 1.6);
    mat.current!.emissiveIntensity = (0.44 + pulse * 0.08) * (0.55 + 0.45 * aw) + pose.glow * 0.4;
    glow.current!.visible = !still;
    glow.current!.material.opacity = (0.5 + pulse * 0.1) * (0.35 + 0.65 * aw) + pose.glow * 0.4;
    // keep the halo inside the canvas: its diameter is ~82% of the canvas width (+14% while celebrating)
    glow.current!.scale.setScalar((0.82 + 0.14 * pose.glow) / size);

    // particles (world positions relative to root group)
    if (points.current) points.current.visible = !still;
    if (points.current && !reduced && !still) {
      const pos = sim.pos, col = sim.col, vel = sim.vel;
      for (let i = 0; i < AMBIENT; i++) {
        const a = sim.phase[i] + t * (0.25 + (i % 5) * 0.05);
        const r = sim.orbit[i];
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = Math.sin(a * 1.3) * r * 0.7;
        pos[i * 3 + 2] = Math.sin(a) * 0.4;
        const tw = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + sim.phase[i] * 3));
        col[i * 3] = 1 * tw; col[i * 3 + 1] = 0.78 * tw; col[i * 3 + 2] = 0.4 * tw;
      }
      for (let i = AMBIENT; i < COUNT; i++) {
        if (sim.life[i] > 0) {
          sim.life[i] -= dt;
          vel[i * 3 + 1] -= 1.5 * dt;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          const f = clamp(sim.life[i] / sim.maxLife[i], 0, 1);
          col[i * 3] = f; col[i * 3 + 1] = 0.8 * f; col[i * 3 + 2] = 0.38 * f * f;
        } else { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; pos[i * 3 + 1] = 9999; }
      }
      const g = points.current.geometry;
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    // demand mode (reduced motion): keep rendering only while something is still settling
    if (reduced) {
      const settling = Math.abs(st.gx - tx) > 0.002 || Math.abs(st.gy - ty) > 0.002 || Math.abs(st.awake - (awake ? 1 : 0)) > 0.01 || (ct >= 0 && ct < 1.3);
      if (settling) invalidate();
    }
    void CELEBRATION_SECONDS;
  });

  return (
    <>
      {/* soft cinematic key, warm gold rim, and a purple fill so the shadows stay in the brand palette */}
      <hemisphereLight args={["#a88cf0", "#3b2452", 0.95]} />
      <directionalLight position={[2.5, 3.5, 5]} intensity={1.9} color="#fff1dc" />
      <directionalLight position={[-4, 1.5, -3]} intensity={1.7} color="#ffb347" />
      <directionalLight position={[3, -2, 2]} intensity={0.35} color="#d969a3" />
      <group ref={root}>
        <sprite ref={glow} position={[0, 0, -0.5]} scale={3.4}>
          <spriteMaterial map={glowTex} transparent opacity={0.5} depthWrite={false} {...ADD_LIGHT} />
        </sprite>
        <group ref={body}>
          <mesh geometry={bodyGeo}>
            <meshPhysicalMaterial ref={mat} color={GOLD} emissive={GOLD_EMISSIVE} emissiveIntensity={0.46} roughness={0.5} metalness={0} sheen={1} sheenColor="#ffe3a3" sheenRoughness={0.55} clearcoat={0.12} clearcoatRoughness={0.6} />
          </mesh>
          {/* face sits on the flat front of the star */}
          <group position={[0, 0.02, 0.335]}>
            {[-1, 1].map((s) => (
              <group key={s} ref={s < 0 ? eyeL : eyeR} position={[s * 0.2, 0.1, 0]}>
                <mesh scale={[1, 1.3, 0.55]}><sphereGeometry args={[0.095, 20, 16]} /><meshStandardMaterial color="#fffaf0" roughness={0.3} /></mesh>
                <mesh ref={s < 0 ? pupilL : pupilR} position={[0, 0, 0.05]} scale={[1, 1.15, 0.6]}><sphereGeometry args={[0.058, 16, 12]} /><meshStandardMaterial color="#2a1b3d" roughness={0.25} /></mesh>
                <mesh position={[0.025, 0.045, 0.085]}><sphereGeometry args={[0.02, 10, 10]} /><meshBasicMaterial color="#ffffff" /></mesh>
                <mesh position={[-0.02, -0.04, 0.08]}><sphereGeometry args={[0.009, 8, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.7} /></mesh>
              </group>
            ))}
            <mesh ref={smile} position={[0, -0.04, 0]} rotation={[0, 0, -Math.PI / 2 - (Math.PI * 0.8) / 2]}>
              <torusGeometry args={[0.15, 0.02, 8, 28, Math.PI * 0.8]} /><meshStandardMaterial color="#8a2f62" roughness={0.5} />
            </mesh>
            <mesh ref={mouth} position={[0, -0.02, 0.012]} rotation={[0, 0, Math.PI]} scale={0.0001} visible={false}>
              <circleGeometry args={[0.15, 24, 0, Math.PI]} /><meshStandardMaterial color="#8a2f62" roughness={0.6} side={THREE.DoubleSide} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.33, -0.04, 0.012]}><circleGeometry args={[0.06, 16]} /><meshBasicMaterial color="#ff8fb5" transparent opacity={0.45} /></mesh>
            ))}
          </group>
          {/* generous invisible hit area so taps on phones always land */}
          <mesh onPointerDown={(e) => { e.stopPropagation(); controls.current?.celebrate(); }}>
            <sphereGeometry args={[1.25, 12, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        <points ref={points} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[sim.pos, 3]} />
            <bufferAttribute attach="attributes-color" args={[sim.col, 3]} />
          </bufferGeometry>
          <pointsMaterial map={sparkTex} size={0.28} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
        </points>
      </group>
    </>
  );
}

/** Frame counter + renderer stats, exposed on window.__lumi for measurement. */
function Meter({ onStats }: { onStats?: (s: LumiStats) => void }) {
  const { gl } = useThree();
  const acc = useRef({ frames: 0, t0: 0 });
  useFrame(() => {
    const a = acc.current;
    a.frames++;
    const t = performance.now() / 1000;
    if (a.t0 === 0) a.t0 = t;
    // a gap (rendering was paused) restarts the window instead of reporting a bogus low rate
    if (t - a.t0 > 3) { a.t0 = t; a.frames = 1; return; }
    if (t - a.t0 >= 1) {
      const s: LumiStats = { fps: Math.round(a.frames / (t - a.t0)), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio() };
      (window as unknown as { __lumi?: LumiStats }).__lumi = s;
      onStats?.(s);
      a.frames = 0; a.t0 = t;
    }
  });
  return null;
}

/**
 * The single render driver. The canvas runs with frameloop="demand"; this ticker requests frames at 60 fps
 * while Lumi is reacting (celebrating, tracking the pointer, waking) and at 30 fps while idle, so a resting
 * Lumi costs about half the GPU time. It also adapts pixel density and gives up (static fallback) on devices
 * that cannot hold a usable frame rate. Disabled under reduced motion, where frames are requested only while
 * something is still settling.
 */
function Driver({ running, reduced, shared, onLowPerf }: { running: boolean; reduced: boolean; shared: React.MutableRefObject<Shared>; onLowPerf?: () => void }) {
  const { invalidate, gl, setDpr } = useThree();
  const frames = useRef(0);
  useFrame(() => { frames.current++; });
  useEffect(() => {
    if (!running || reduced) return;
    let raf = 0, timer = 0, winStart = performance.now(), warm = 0, slow = 0, veryBad = 0, expectedSum = 0, ticks = 0;
    frames.current = 0;
    const schedule = () => {
      // Active: follow the display (rAF). Idle: wake only ~30 times a second instead of every display frame.
      if (shared.current.active) raf = requestAnimationFrame(tick);
      else timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 24); // ~30 fps once aligned to the display
    };
    const tick = (now: number) => {
      invalidate();
      expectedSum += shared.current.active ? 60 : 30; ticks++;
      if (now - winStart >= 1000) {
        const fps = (frames.current * 1000) / (now - winStart);
        const expected = Math.min(60, expectedSum / Math.max(1, ticks)); // nominal rate we were asking for
        frames.current = 0; winStart = now; expectedSum = 0; ticks = 0;
        if (++warm > 2) {
          // adaptive pixel density: step down when the delivered rate is well below what we asked for
          if (fps < expected * 0.65) slow++; else slow = Math.max(0, slow - 1);
          if (slow >= 2 && gl.getPixelRatio() > 1) { setDpr(Math.max(1, gl.getPixelRatio() * 0.8)); slow = 0; }
          if (fps < 14 && gl.getPixelRatio() <= 1) { if (++veryBad >= 3) onLowPerf?.(); } else veryBad = 0;
        }
      }
      schedule();
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, [running, reduced, shared, invalidate, gl, setDpr, onLowPerf]);
  return null;
}

export default function LumiCanvas({ anchor, size, running, reduced, controls, onStats, awake = true, mood = "happy", still = false, onReady, onLost, onLowPerf }: { anchor: Anchor; size: number; running: boolean; reduced: boolean; controls: React.MutableRefObject<LumiControls | null>; onStats?: (s: LumiStats) => void; awake?: boolean; mood?: "happy" | "curious"; still?: boolean; onReady?: () => void; onLost?: () => void; onLowPerf?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const shared = useRef<Shared>({ active: false, wakeAt: -100, px: 0, py: 0, lastMove: -10, look: { x: 0, y: 0, until: 0 }, celebrateAt: -100, burst: [] });
  // Mid-range phones get a lower pixel-density ceiling from the start (further reduced adaptively).
  const maxDpr = useMemo(() => {
    if (still) return 3;
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 8 : 8;
    return cores <= 4 ? 1.4 : 1.75;
  }, [still]);

  // Track the pointer anywhere on the page (mouse, pen and touch drags), relative to the canvas.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r) return;
      const o = pointerOffset(e.clientX, e.clientY, r);
      const sh = shared.current;
      // convert to gaze relative to Lumi's anchor
      sh.px = o.x - anchor.x; sh.py = o.y - anchor.y;
      sh.lastMove = performance.now() / 1000;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [anchor.x, anchor.y]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        frameloop={running ? "demand" : "never"}
        dpr={[1, maxDpr]}
        camera={{ position: [0, 0, 8], fov: 30, near: 0.1, far: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: "default" }}
        style={{ touchAction: "pan-y" }}
        onCreated={({ gl }) => {
          // A lost context (GPU reset, tab discard) would leave a blank canvas: tell the host to show the static fallback.
          gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onLost?.(); }, { once: true });
        }}
        onPointerMissed={(e) => {
          const r = wrap.current?.getBoundingClientRect();
          if (!r) return;
          const o = pointerOffset(e.clientX, e.clientY, r);
          controls.current?.poke(o.x - anchor.x, o.y - anchor.y);
        }}
      >
        <Scene anchor={anchor} size={size} reduced={reduced} controls={controls} shared={shared} awake={awake} mood={mood} still={still} onReady={onReady} />
        <Driver running={running} reduced={reduced} shared={shared} onLowPerf={onLowPerf} />
        <Meter onStats={onStats} />
      </Canvas>
    </div>
  );
}
