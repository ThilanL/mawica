"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { ADD_LIGHT } from "./Particles";
import { glowTexture } from "./textures";
import { clamp01, easeOutBack } from "./timeline";
import type { Shared } from "./rig";

/**
 * Lumi, in 3D, for the cinematic card. Same character as the homepage Lumi (an inflated, rounded five-point star in satin gold with glossy eyes
 * and a smile) but built here, separately: the homepage implementation is untouched. Procedural mesh animation, no rig:
 * - squash and stretch: anticipation squash, airborne stretch, landing squash and settle, volume-preserving
 * - eye blinks at random intervals, pupils that follow the pointer, an open "happy" mouth while airborne
 * - the whole body tilts toward what it looks at; a tap triggers a celebration (bigger hops, a spin, a burst of sparkles)
 */
const GOLD = "#f2b83d";
const GOLD_EMISSIVE = "#e08e1c";

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
    const k = i % 2 === 0 ? 0.26 : 0.22;
    const a = cur.clone().lerp(prev, k);
    const b = cur.clone().lerp(next, k);
    if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  });
  shape.closePath();
  return shape;
}

function bodyGeometry(segments: number) {
  const raw = new THREE.ExtrudeGeometry(starShape(), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.17, bevelSegments: segments, curveSegments: segments + 6 });
  raw.deleteAttribute("normal"); raw.deleteAttribute("uv");
  const g = mergeVertices(raw, 1e-4);
  raw.dispose(); g.center(); g.computeVertexNormals();
  return g;
}

const SPARKS = 40;

export function LumiModel({ shared, position, size, mobile, lookAtUser = true }: { shared: { current: Shared }; position: [number, number, number]; size: number; mobile: boolean; lookAtUser?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<(THREE.Group | null)[]>([]);
  const pupils = useRef<(THREE.Mesh | null)[]>([]);
  const smile = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const bodyMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const sparks = useRef<THREE.Points>(null);
  const geo = useMemo(() => bodyGeometry(mobile ? 6 : 10), [mobile]);
  const tex = useMemo(() => glowTexture(), []);
  const sp = useMemo(() => ({ pos: new Float32Array(SPARKS * 3), vel: new Float32Array(SPARKS * 3), life: new Float32Array(SPARKS), col: new Float32Array(SPARKS * 3) }), []);
  const st = useRef({ blinkAt: 2.4, blinkT: -1, gx: 0, gy: 0, lastCelebrate: -100, emitted: false, t: 0, yaw: 0 });
  useEffect(() => () => { geo.dispose(); tex.dispose(); }, [geo, tex]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const sh = shared.current;
    const s = st.current;
    s.t += dt;
    const t = s.t;
    const appear = sh.lumi;
    const g = root.current!;
    if (appear <= 0.001) { g.visible = false; return; }
    g.visible = true;

    // celebration: triggered by a tap
    if (sh.celebrateAt !== s.lastCelebrate) { s.lastCelebrate = sh.celebrateAt; s.emitted = false; }
    const now = performance.now() / 1000;
    const ct = now - sh.celebrateAt;
    const celebrating = ct >= 0 && ct < 1.9;

    // hop cycle
    const period = celebrating ? 0.95 : 1.55;
    const ph = ((t + 0.3) % period) / period;
    let lift = 0, sy = 1;
    const hopH = celebrating ? 0.5 : 0.24;
    if (ph < 0.16) { sy = 1 - 0.2 * Math.sin((ph / 0.16) * Math.PI * 0.5); }                       // anticipation: squash down
    else if (ph < 0.62) { const k = (ph - 0.16) / 0.46; lift = Math.sin(k * Math.PI) * hopH; sy = 0.8 + 0.4 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) - 0.18 * k; } // launch + stretch, then relax in the air
    else if (ph < 0.78) { const k = (ph - 0.62) / 0.16; sy = 1 - 0.24 * Math.sin(k * Math.PI); }   // landing squash
    else { const k = (ph - 0.78) / 0.22; sy = 1 + 0.045 * Math.sin(k * Math.PI * 2) * (1 - k); }   // settle
    const airborne = lift > 0.03;
    const sxz = 1 / Math.sqrt(sy);                                                                 // keep volume
    const drift = Math.sin(t * 0.6) * 0.07;                                                         // slow wander across the panel

    // appearance pop (overshoot) from the reveal timeline
    const pop = appear < 1 ? easeOutBack(clamp01(appear), 2.2) : 1;
    const sc = size * pop;
    g.position.set(position[0] + drift, position[1] + lift * size + 0.05 * Math.sin(t * 1.3), position[2]);
    g.scale.setScalar(Math.max(0.0001, sc));

    // gaze: pointer when recent, else wander
    const recent = now - sh.lastInput < 2.5;
    const tx = lookAtUser ? (recent ? sh.px : Math.sin(t * 0.7) * 0.7) : 0;
    const ty = lookAtUser ? (recent ? sh.py : Math.sin(t * 0.45 + 1) * 0.35) : 0;
    s.gx += (tx - s.gx) * Math.min(1, dt * 4);
    s.gy += (ty - s.gy) * Math.min(1, dt * 4);
    if (celebrating) s.yaw = (ct / 1.9) * Math.PI * 2 * (ct < 1.9 ? 1 : 0);
    else s.yaw += (0 - s.yaw) * Math.min(1, dt * 6);
    const b = body.current!;
    b.scale.set(sxz, sy, sxz);
    b.rotation.y = s.gx * 0.45 + s.yaw;
    b.rotation.x = -s.gy * 0.3 + Math.sin(t * 0.8) * 0.04;
    b.rotation.z = Math.sin(t * 0.9) * 0.05 - s.gx * 0.06 + (airborne ? Math.sin(t * 6) * 0.03 : 0);

    // eyes: random blinks, pupils follow the gaze, squint with joy
    if (t >= s.blinkAt && s.blinkT < 0) s.blinkT = t;
    if (s.blinkT >= 0 && t - s.blinkT > 0.16) { s.blinkT = -1; s.blinkAt = t + 2 + ((Math.sin(t * 12.9898) + 1) / 2) * 3; }
    const blink = s.blinkT >= 0 ? Math.abs(Math.cos(((t - s.blinkT) / 0.16) * Math.PI * 0.5)) * 0.9 + 0.1 : 1;
    const joy = celebrating ? 1 : airborne ? 0.5 : 0;
    const eyeY = Math.min(blink, 1 - 0.3 * joy);
    eyes.current.forEach((e) => { if (e) e.scale.y = eyeY; });
    pupils.current.forEach((p) => { if (p) p.position.set(s.gx * 0.04, s.gy * 0.035, 0.05); });
    smile.current!.visible = joy < 0.45;
    mouth.current!.visible = joy >= 0.45;
    mouth.current!.scale.setScalar(Math.max(0.0001, 0.6 + 0.4 * joy));

    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    bodyMat.current!.emissiveIntensity = 0.26 + pulse * 0.06 + (celebrating ? 0.25 : 0);
    halo.current!.material.opacity = (0.22 + pulse * 0.06 + (celebrating ? 0.25 : 0)) * clamp01(appear);

    // sparkle burst on celebration
    const pts = sparks.current!;
    if (celebrating && !s.emitted) {
      s.emitted = true;
      for (let i = 0; i < SPARKS; i++) {
        const a = (i / SPARKS) * Math.PI * 2 + i * 0.7, v = 1.1 + ((i * 37) % 10) / 8;
        sp.pos[i * 3] = Math.cos(a) * 0.4; sp.pos[i * 3 + 1] = Math.sin(a) * 0.4; sp.pos[i * 3 + 2] = 0.2;
        sp.vel[i * 3] = Math.cos(a) * v; sp.vel[i * 3 + 1] = Math.sin(a) * v + 0.9; sp.vel[i * 3 + 2] = 0.35;
        sp.life[i] = 1 + ((i * 13) % 10) / 14;
      }
    }
    let alive = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sp.life[i] > 0) {
        alive = true; sp.life[i] -= dt; sp.vel[i * 3 + 1] -= 1.6 * dt;
        sp.pos[i * 3] += sp.vel[i * 3] * dt; sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt; sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
        const f = clamp01(sp.life[i]);
        sp.col[i * 3] = f; sp.col[i * 3 + 1] = 0.8 * f; sp.col[i * 3 + 2] = 0.4 * f * f;
      } else { sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; sp.pos[i * 3 + 1] = 999; }
    }
    pts.visible = alive;
    if (alive) { (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (pts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
  });

  return (
    <group ref={root} position={position} visible={false}>
      <sprite ref={halo} position={[0, 0, -0.5]} scale={3.4}>
        <spriteMaterial map={tex} transparent opacity={0.4} depthWrite={false} {...ADD_LIGHT} />
      </sprite>
      <group ref={body}>
        <mesh geometry={geo}>
          <meshPhysicalMaterial ref={bodyMat} color={GOLD} emissive={GOLD_EMISSIVE} emissiveIntensity={0.26} roughness={0.5} sheen={1} sheenColor="#ffe3a3" sheenRoughness={0.55} clearcoat={0.12} clearcoatRoughness={0.6} />
        </mesh>
        <group position={[0, 0.02, 0.335]}>
          {[-1, 1].map((s, i) => (
            <group key={s} ref={(o) => { eyes.current[i] = o; }} position={[s * 0.2, 0.1, 0]}>
              <mesh scale={[1, 1.3, 0.55]}><sphereGeometry args={[0.095, 20, 16]} /><meshStandardMaterial color="#fffaf0" roughness={0.3} /></mesh>
              <mesh ref={(o) => { pupils.current[i] = o; }} position={[0, 0, 0.05]} scale={[1, 1.15, 0.6]}><sphereGeometry args={[0.058, 16, 12]} /><meshStandardMaterial color="#2a1b3d" roughness={0.25} /></mesh>
              <mesh position={[0.025, 0.045, 0.085]}><sphereGeometry args={[0.02, 10, 10]} /><meshBasicMaterial color="#ffffff" /></mesh>
            </group>
          ))}
          <mesh ref={smile} position={[0, -0.04, 0]} rotation={[0, 0, -Math.PI / 2 - (Math.PI * 0.8) / 2]}>
            <torusGeometry args={[0.15, 0.02, 8, 28, Math.PI * 0.8]} /><meshStandardMaterial color="#8a2f62" roughness={0.5} />
          </mesh>
          <mesh ref={mouth} position={[0, -0.02, 0.012]} rotation={[0, 0, Math.PI]} visible={false}>
            <circleGeometry args={[0.15, 24, 0, Math.PI]} /><meshStandardMaterial color="#8a2f62" roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.33, -0.04, 0.012]}><circleGeometry args={[0.06, 16]} /><meshBasicMaterial color="#ff8fb5" transparent opacity={0.45} /></mesh>
          ))}
        </group>
        {/* generous invisible hit area so taps on phones always land */}
        <mesh onPointerDown={(e) => { e.stopPropagation(); shared.current.celebrateAt = performance.now() / 1000; shared.current.lastInput = performance.now() / 1000; }}>
          <sphereGeometry args={[1.25, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <points ref={sparks} frustumCulled={false} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sp.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[sp.col, 3]} />
        </bufferGeometry>
        <pointsMaterial map={tex} size={0.28} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
      </points>
    </group>
  );
}
