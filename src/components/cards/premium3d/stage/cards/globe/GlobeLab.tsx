"use client";

/* eslint-disable react-hooks/immutability -- frame loop: the shared clock and Three.js objects are mutated imperatively by design */
 
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLOBE, WEB_SCALE, type ProfileName } from "@/components/cards/premium3d/stage/cards/globe-model";
import { GlobeWorld } from "@/components/cards/premium3d/stage/cards/globe/GlobeWorld";
import type { GlobeParts } from "@/components/cards/premium3d/stage/cards/globe/build";
import { STAGE_BACKDROP } from "@/components/cards/premium3d/stage/loaders";
import { newShared, type Shared } from "@/components/cards/premium3d/rig";
import { backdropTexture } from "@/components/cards/premium3d/stage/StageCanvas";

/**
 * Snow globe lab: drag to turn the globe through 360°, scroll to zoom. Review views for the approval gallery:
 *   /lab/globe?view=front|three-quarter|left|right|rear|elevated|cottage|base  &q=mobile  &spin (turntable)
 *   &t=SECONDS freezes the choreography at that moment (0–11 is the intro), &storm=AGE holds a snowstorm AGE seconds after a tap,
 *   &still shows the reduced-motion scene, &nobloom turns the desktop bloom off, &transparent renders with no backdrop (for stills with alpha).
 *   Tap the globe to make it snow.
 * Engraving sample text comes from ?eng=line1|line2 (the card itself passes the recipient's own text in Stage D).
 * window.__globeStats reports triangles, draw calls, textures and geometry memory for the validation report.
 */
const S = WEB_SCALE, C = GLOBE.centerY * S;
const VIEWS: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  front: { pos: [0, C * 0.95, 13.2], look: [0, C * 0.86, 0] },
  "three-quarter": { pos: [8.4, C * 1.15, 10.2], look: [0, C * 0.86, 0] },
  left: { pos: [-13.2, C * 0.95, 0], look: [0, C * 0.86, 0] },
  right: { pos: [13.2, C * 0.95, 0], look: [0, C * 0.86, 0] },
  rear: { pos: [0, C * 0.95, -13.2], look: [0, C * 0.86, 0] },
  elevated: { pos: [0, C + 10.5, 7.8], look: [0, C * 0.8, 0] },
  cottage: { pos: [-1.0, 3.0, 8.2], look: [0.05, 2.55, -0.2] },
  base: { pos: [1.3, 1.25, 6.4], look: [0, 0.85, 0] },
};

function Rig({ view, spin }: { view: string; spin: boolean }) {
  const { camera, gl, invalidate } = useThree();
  const ctl = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const v = VIEWS[view] ?? VIEWS.front;
    camera.position.set(...v.pos);
    const c = new OrbitControls(camera, gl.domElement); c.target.set(...v.look); c.enableDamping = true; c.minDistance = 2; c.maxDistance = 30; c.update();
    c.addEventListener("change", () => invalidate()); ctl.current = c;
    return () => { c.dispose(); };
  }, [camera, gl, view, invalidate]);
  useFrame((_, dt) => { const c = ctl.current; if (!c) return; if (spin) { c.autoRotate = true; c.autoRotateSpeed = 2; } c.update(dt); });
  return null;
}

/** The lab's clock: plays the intro then keeps going, or holds a frame for review renders. */
function Clock({ shared, t, storm }: { shared: { current: Shared }; t: number | null; storm: number | null }) {
  useFrame((_, dt) => {
    const sh = shared.current;
    if (t !== null) { sh.t = t; sh.playing = false; } else sh.t += Math.min(dt, 0.1);
    if (storm !== null) sh.stormAt = performance.now() / 1000 - storm;
  });
  return null;
}

function Stats({ parts }: { parts: GlobeParts | null }) {
  const { gl, scene } = useThree();
  useFrame(() => {
    if (!parts) return;
    let tris = 0, verts = 0, geoBytes = 0; const geos = new Set<THREE.BufferGeometry>(); const texs = new Map<string, string>();
    parts.root.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1, g = m.geometry;
      const t = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += t * n; verts += g.attributes.position.count * n;
      if (!geos.has(g)) { geos.add(g); for (const a of Object.values(g.attributes)) geoBytes += (a as THREE.BufferAttribute).array.byteLength; if (g.index) geoBytes += g.index.array.byteLength; }
      for (const mm of [m.material].flat() as THREE.MeshStandardMaterial[]) for (const k of ["map", "normalMap", "roughnessMap", "aoMap", "alphaMap", "emissiveMap", "metalnessMap"] as const) {
        const tx = mm[k]; const img = tx?.image as { width?: number; height?: number } | undefined; if (tx && img?.width) texs.set(tx.uuid, `${img.width}x${img.height}`);
      }
    });
    (window as unknown as { __globeStats?: unknown }).__globeStats = { triangles: Math.round(tris), vertices: verts, drawCalls: gl.info.render.calls, frameTriangles: gl.info.render.triangles, textures: [...texs.values()], gpuTextures: gl.info.memory.textures, geometryMB: +(geoBytes / 1e6).toFixed(2), shadows: gl.shadowMap.enabled, sceneChildren: scene.children.length };
  });
  return null;
}

export function GlobeLab() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [parts, setParts] = useState<GlobeParts | null>(null);
  const shared = useRef<Shared>(newShared());
  useEffect(() => { setQ(new URLSearchParams(window.location.search)); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- read once on the client
  if (!q) return null;
  const profile: ProfileName = q.get("q") === "mobile" ? "mobile" : "desktop";
  const b = STAGE_BACKDROP["snow-globe"];
  const bg = `radial-gradient(${b.glow.w}% ${b.glow.h}% at ${b.glow.x}% ${b.glow.y}%, rgb(${b.glow.rgb.join(" ")} / ${b.glow.a}), transparent 70%), linear-gradient(180deg,${b.stops.map(([c, p]) => `${c} ${p}%`).join(",")})`;
  const eng = q.get("eng")?.split("|").filter(Boolean);
  return (
    <div className="relative h-dvh w-full" style={{ background: q.has("transparent") ? "transparent" : bg }} data-ready={parts ? "1" : "0"}>
      <Canvas dpr={profile === "mobile" ? [1, 1.5] : [1, 2]} camera={{ fov: 34, near: 0.1, far: 90 }} gl={{ antialias: profile !== "mobile", alpha: true, preserveDrawingBuffer: true }}
        onCreated={({ gl, scene, camera }) => { (window as unknown as { __globeCamera?: THREE.Camera }).__globeCamera = camera; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; const p = new THREE.PMREMGenerator(gl); scene.environment = p.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3; if (!new URLSearchParams(location.search).has("transparent")) scene.background = backdropTexture(STAGE_BACKDROP["snow-globe"]); (window as unknown as { __globeScene?: THREE.Scene }).__globeScene = scene; }}>
        <GlobeWorld profile={profile} engraving={eng} onReady={setParts} shared={shared} mode={q.has("still") ? "static" : "play"} bloom={profile === "desktop" && !q.has("nobloom")} />
        <Clock shared={shared} t={q.has("t") ? Number(q.get("t")) : null} storm={q.has("storm") ? Number(q.get("storm")) : null} />
        <Rig view={q.get("view") ?? "front"} spin={q.has("spin")} />
        <Stats parts={parts} />
      </Canvas>
      {!q.has("bare") && <p className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">snow globe · {profile} · drag to rotate 360°</p>}
    </div>
  );
}
