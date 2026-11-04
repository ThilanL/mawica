"use client";

/* eslint-disable react-hooks/immutability -- react-three-fiber frame loop: typed arrays and Three.js objects are mutated imperatively by design */

/**
 * Lumi, the Mawica companion: procedural prototype (react-three-fiber).
 * Everything here is generated in code for testing; it is NOT final character art.
 * This module (and Three.js) is only ever imported lazily by the /lab/lumi route.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CELEBRATION_SECONDS, celebrationPose, clamp, pointerOffset, seeded } from "./lumiMath";

export type LumiControls = { celebrate: () => void; poke: (x: number, y: number) => void };
export type LumiStats = { fps: number; calls: number; triangles: number; geometries: number; textures: number; dpr: number };
type Anchor = { x: number; y: number };

const GOLD = "#f6c453";
const GOLD_EMISSIVE = "#ff9d2e";

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
  const g = new THREE.ExtrudeGeometry(starShape(), {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.16,
    bevelSegments: 8,
    curveSegments: 10,
  });
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

type Shared = { px: number; py: number; lastMove: number; look: { x: number; y: number; until: number }; celebrateAt: number; burst: number[] };

function Scene({ anchor, size, reduced, controls, shared }: { anchor: Anchor; size: number; reduced: boolean; controls: React.MutableRefObject<LumiControls | null>; shared: React.MutableRefObject<Shared> }) {
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
  const mat = useRef<THREE.MeshStandardMaterial>(null);

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

  const state = useRef({ rotX: 0, rotY: 0, gx: 0, gy: 0, blinkAt: 2.2, blinkT: -1, lastT: 0 });

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

  useFrame((frame, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = frame.clock.elapsedTime;
    const now = performance.now() / 1000;
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
    const lam = reduced ? 10 : 4.5;
    st.gx = THREE.MathUtils.damp(st.gx, tx, lam, dt);
    st.gy = THREE.MathUtils.damp(st.gy, ty, lam, dt);

    // celebration timeline
    const ct = now - sh.celebrateAt;
    const pose = reduced
      ? { spin: 0, hop: 0, squash: 1, joy: ct >= 0 && ct < 1.2 ? clamp(Math.min(ct / 0.2, (1.2 - ct) / 0.4), 0, 1) : 0, glow: ct >= 0 && ct < 1.2 ? 0.8 : 0 }
      : celebrationPose(ct);
    while (sh.burst.length && ct >= 0 && ct >= sh.burst[0]) { sh.burst.shift(); emit(sh.burst.length ? 48 : 40, 2.3, 1.4); }
    if (sh.burst.length && ct < 0) { /* poke sparkles use time 0 relative to poke */ }

    const float = reduced ? 0 : Math.sin(t * 1.25) * 0.09 * unit + pose.hop * unit;
    const root_ = root.current!;
    root_.position.set(baseX, baseY + float, 0);
    root_.scale.setScalar(unit);

    const body_ = body.current!;
    body_.scale.set(1 / pose.squash ** 0.5, pose.squash, 1 / pose.squash ** 0.5);
    body_.rotation.y = st.gx * 0.55 + pose.spin;
    body_.rotation.x = -st.gy * 0.38 + (reduced ? 0 : Math.sin(t * 0.8) * 0.05);
    body_.rotation.z = reduced ? 0 : Math.sin(t * 0.9) * 0.07 - st.gx * 0.06;

    // eyes
    if (!reduced) {
      if (t >= st.blinkAt && st.blinkT < 0) st.blinkT = t;
      if (st.blinkT >= 0 && t - st.blinkT > 0.16) { st.blinkT = -1; st.blinkAt = t + 2.2 + ((Math.sin(t * 12.9898) + 1) / 2) * 3.2; }
    }
    const blink = st.blinkT >= 0 ? Math.abs(Math.cos(((t - st.blinkT) / 0.16) * Math.PI * 0.5)) * 0.9 + 0.1 : 1;
    const happy = 1 - 0.35 * pose.joy;
    const eyeScaleY = Math.min(blink, happy);
    eyeL.current!.scale.y = eyeScaleY;
    eyeR.current!.scale.y = eyeScaleY;
    for (const p of [pupilL.current!, pupilR.current!]) p.position.set(st.gx * 0.04, st.gy * 0.035, 0.05);
    smile.current!.scale.set(1 + 0.25 * pose.joy, 1 - pose.joy * 0.2, 1);
    smile.current!.visible = pose.joy < 0.55;
    const m = mouth.current!;
    m.visible = pose.joy >= 0.55 || pose.joy > 0.25;
    m.scale.setScalar(Math.max(0.0001, pose.joy));

    // glow + emissive
    const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 1.6);
    mat.current!.emissiveIntensity = 0.42 + pulse * 0.1 + pose.glow * 0.45;
    glow.current!.material.opacity = 0.5 + pulse * 0.1 + pose.glow * 0.4;
    glow.current!.scale.setScalar(3.4 + pose.glow * 1.4);

    // particles (world positions relative to root group)
    if (points.current && !reduced) {
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
      const settling = Math.abs(st.gx - tx) > 0.002 || Math.abs(st.gy - ty) > 0.002 || (ct >= 0 && ct < 1.3);
      if (settling) invalidate();
    }
    void CELEBRATION_SECONDS;
  });

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[2.5, 3.5, 5]} intensity={2.4} color="#fff0d6" />
      <directionalLight position={[-4, 1, -2]} intensity={1.2} color="#ff8fc4" />
      <group ref={root}>
        <sprite ref={glow} position={[0, 0, -0.5]} scale={3.4}>
          <spriteMaterial map={glowTex} transparent opacity={0.5} depthWrite={false} {...ADD_LIGHT} />
        </sprite>
        <group ref={body}>
          <mesh geometry={bodyGeo}>
            <meshStandardMaterial ref={mat} color={GOLD} emissive={GOLD_EMISSIVE} emissiveIntensity={0.45} roughness={0.38} metalness={0.15} />
          </mesh>
          {/* face sits on the flat front of the star */}
          <group position={[0, 0.02, 0.43]}>
            {[-1, 1].map((s) => (
              <group key={s} ref={s < 0 ? eyeL : eyeR} position={[s * 0.2, 0.1, 0]}>
                <mesh scale={[1, 1.3, 0.55]}><sphereGeometry args={[0.095, 20, 16]} /><meshStandardMaterial color="#fffaf0" roughness={0.3} /></mesh>
                <mesh ref={s < 0 ? pupilL : pupilR} position={[0, 0, 0.05]} scale={[1, 1.15, 0.6]}><sphereGeometry args={[0.058, 16, 12]} /><meshStandardMaterial color="#2a1b3d" roughness={0.25} /></mesh>
                <mesh position={[0.025, 0.045, 0.085]}><sphereGeometry args={[0.02, 8, 8]} /><meshBasicMaterial color="#ffffff" /></mesh>
              </group>
            ))}
            <mesh ref={smile} position={[0, -0.04, 0]} rotation={[0, 0, -Math.PI / 2 - (Math.PI * 0.8) / 2]}>
              <torusGeometry args={[0.15, 0.02, 8, 28, Math.PI * 0.8]} /><meshStandardMaterial color="#8a2f62" roughness={0.5} />
            </mesh>
            <mesh ref={mouth} position={[0, -0.02, 0.005]} rotation={[0, 0, Math.PI]} scale={0.0001} visible={false}>
              <circleGeometry args={[0.15, 24, 0, Math.PI]} /><meshStandardMaterial color="#8a2f62" roughness={0.6} side={THREE.DoubleSide} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.33, -0.04, -0.01]}><circleGeometry args={[0.06, 16]} /><meshBasicMaterial color="#ff8fb5" transparent opacity={0.45} /></mesh>
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
  useFrame(({ clock }) => {
    const a = acc.current;
    a.frames++;
    const t = clock.elapsedTime;
    if (a.t0 === 0) a.t0 = t;
    if (t - a.t0 >= 1) {
      const s: LumiStats = { fps: Math.round(a.frames / (t - a.t0)), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio() };
      (window as unknown as { __lumi?: LumiStats }).__lumi = s;
      onStats?.(s);
      a.frames = 0; a.t0 = t;
    }
  });
  return null;
}

export default function LumiCanvas({ anchor, size, running, reduced, controls, onStats }: { anchor: Anchor; size: number; running: boolean; reduced: boolean; controls: React.MutableRefObject<LumiControls | null>; onStats?: (s: LumiStats) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const shared = useRef<Shared>({ px: 0, py: 0, lastMove: -10, look: { x: 0, y: 0, until: 0 }, celebrateAt: -100, burst: [] });

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
        frameloop={!running ? "never" : reduced ? "demand" : "always"}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 8], fov: 30, near: 0.1, far: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: "default" }}
        style={{ touchAction: "pan-y" }}
        onPointerMissed={(e) => {
          const r = wrap.current?.getBoundingClientRect();
          if (!r) return;
          const o = pointerOffset(e.clientX, e.clientY, r);
          controls.current?.poke(o.x - anchor.x, o.y - anchor.y);
        }}
      >
        <Scene anchor={anchor} size={size} reduced={reduced} controls={controls} shared={shared} />
        <Meter onStats={onStats} />
      </Canvas>
    </div>
  );
}
