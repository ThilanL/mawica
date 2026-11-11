"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { TemplateKey } from "@/modules/templates/registry";
import type { CanvasStats, CinemaEvents } from "../CinematicCanvas";
import type { Shared } from "../rig";
import { easeInOutCubic, seg } from "../timeline";
import { STAGE_LOADERS } from "./loaders";
import type { StageSceneModule } from "./types";

function Environment({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env; scene.environmentIntensity = intensity;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); room.dispose?.(); };
  }, [gl, scene, intensity]);
  return null;
}

/** Time, camera and the reading-stage lift. Time comes from frame deltas (pausing never skips the story). */
function Choreo({ mod, shared, mode, events, bare, zoom }: { mod: StageSceneModule; shared: { current: Shared }; mode: "play" | "static"; events: React.MutableRefObject<CinemaEvents>; bare: boolean; zoom: number }) {
  const { camera, size } = useThree();
  const done = useRef(false);
  const { def } = mod;
  useFrame((_, rawDt) => {
    const sh = shared.current;
    const dt = Math.min(rawDt, 0.1);
    if (mode === "static") sh.t = def.duration;
    else if (sh.playing) sh.t = Math.min(sh.t + dt, def.duration + 60);
    const aspect = size.width / Math.max(1, size.height);
    const c = def.camera(sh.t, aspect);
    const cam = camera as THREE.PerspectiveCamera;
    if (c.fov && cam.fov !== c.fov) { cam.fov = c.fov; }
    cam.position.set(c.look.x + (c.pos.x - c.look.x) * zoom, c.look.y + (c.pos.y - c.look.y) * zoom, c.look.z + (c.pos.z - c.look.z) * zoom); // zoom is 1 except for thumbnail renders
    cam.lookAt(c.look.x, c.look.y, c.look.z);
    const lift = bare ? 0 : def.lift(aspect) * easeInOutCubic(seg(sh.t, def.duration - 1.6, def.duration));
    cam.setViewOffset(size.width, size.height, 0, lift * size.height, size.width, size.height); // moves the picture up so the message sheet sits below it
    sh.wind = def.wind ? def.wind(sh.t) : 0;
    sh.storm = 1;
    if (!done.current && sh.t >= def.duration) { done.current = true; events.current.onDone?.(); }
  });
  return null;
}

function Driver({ mod, shared, enabled, mode, events, bare }: { mod: StageSceneModule; shared: { current: Shared }; enabled: boolean; mode: "play" | "static"; events: React.MutableRefObject<CinemaEvents>; bare: boolean }) {
  const { invalidate, gl, setDpr } = useThree();
  const frames = useRef(0);
  useFrame(() => { frames.current++; });
  useEffect(() => {
    if (!enabled) return;
    if (bare) { const ids = [300, 1200, 3500, 8000].map((ms) => window.setTimeout(invalidate, ms)); invalidate(); return () => ids.forEach(clearTimeout); } // thumbnail renders: a few frames, then the picture is left alone
    if (mode === "static") { invalidate(); const a = window.setTimeout(invalidate, 400), b = window.setTimeout(invalidate, 1200); return () => { clearTimeout(a); clearTimeout(b); }; }
    let raf = 0, timer = 0, winStart = performance.now(), warm = 0, slow = 0, bad = 0, restSince = -1;
    frames.current = 0;
    const tick = (now: number) => {
      const sh = shared.current;
      const active = sh.t < mod.def.duration + 0.2 || performance.now() / 1000 - sh.lastInput < 4;
      if (active) restSince = -1; else if (restSince < 0) restSince = now;
      if (restSince >= 0 && now - restSince > 25000) return; // at rest for a while: stop until the next interaction
      invalidate();
      if (now - winStart >= 1000) {
        const fps = (frames.current * 1000) / (now - winStart);
        const expected = active ? 55 : 28;
        frames.current = 0; winStart = now;
        if (++warm > 2) {
          if (fps < expected * 0.65) slow++; else slow = Math.max(0, slow - 1);
          if (slow >= 2 && gl.getPixelRatio() > 1) { setDpr(Math.max(1, gl.getPixelRatio() * 0.8)); slow = 0; }
          if (fps < 14 && gl.getPixelRatio() <= 1) { if (++bad >= 3) events.current.onLowPerf?.(); } else bad = 0;
        }
      }
      if (active) raf = requestAnimationFrame(tick); else timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 24);
    };
    raf = requestAnimationFrame(tick);
    const wake = () => { if (restSince >= 0 && performance.now() - restSince > 25000) { restSince = -1; raf = requestAnimationFrame(tick); } };
    window.addEventListener("pointerdown", wake, { passive: true }); window.addEventListener("pointermove", wake, { passive: true });
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener("pointerdown", wake); window.removeEventListener("pointermove", wake); };
  }, [enabled, mode, mod, shared, invalidate, gl, setDpr, events, bare]);
  return null;
}

function Meter({ onStats, publish }: { onStats?: (s: CanvasStats) => void; publish: boolean }) {
  const { gl } = useThree();
  const acc = useRef({ frames: 0, t0: 0 });
  useFrame(() => {
    const a = acc.current; a.frames++;
    const t = performance.now() / 1000;
    if (a.t0 === 0) a.t0 = t;
    if (t - a.t0 > 3) { a.t0 = t; a.frames = 1; return; }
    if (t - a.t0 >= 1) {
      const s: CanvasStats = { fps: Math.round(a.frames / (t - a.t0)), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio(), particles: 0, at: Math.round(performance.now()) };
      if (publish) (window as unknown as { __cinema?: CanvasStats }).__cinema = s;
      onStats?.(s); a.frames = 0; a.t0 = t;
    }
  });
  return null;
}

export default function StageCanvas({ sceneKey, shared, mode, enabled, mobile, events, publishStats, bare = false, zoom = 1 }: {
  sceneKey: TemplateKey; shared: { current: Shared }; mode: "play" | "static"; enabled: boolean; mobile: boolean; events: React.MutableRefObject<CinemaEvents>; publishStats: boolean; bare?: boolean; zoom?: number;
}) {
  const [mod, setMod] = useState<StageSceneModule | null>(null);
  useEffect(() => {
    let alive = true;
    STAGE_LOADERS[sceneKey]?.().then((m) => { if (alive) setMod(m); }, () => events.current.onLost?.());
    return () => { alive = false; };
  }, [sceneKey, events]);
  if (!mod) return null;
  const { Scene, def } = mod;
  const maxDpr = mobile || (typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) <= 4) ? 1.5 : 1.75;
  return (
    <Canvas
      frameloop={enabled ? "demand" : "never"}
      dpr={[1, maxDpr]}
      camera={{ position: [0, 1, 9], fov: def.camera(0, 1).fov ?? 38, near: 0.1, far: 90 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "default" }}
      style={{ touchAction: "pan-y" }}
      onCreated={({ gl, scene }) => {
        const f = def.fog ?? ["#1a1028", 16, 60];
        scene.fog = new THREE.Fog(new THREE.Color(f[0]), f[1], f[2]);
        gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); events.current.onLost?.(); }, { once: true });
        events.current.onReady?.();
      }}
    >
      <Environment intensity={0.3} />
      <Scene shared={shared} mobile={mobile} mode={mode} />
      <Choreo mod={mod} shared={shared} mode={mode} events={events} bare={bare} zoom={zoom} />
      <Driver mod={mod} shared={shared} enabled={enabled} mode={mode} events={events} bare={bare} />
      <Meter onStats={(s) => events.current.onStats?.(s)} publish={publishStats} />
    </Canvas>
  );
}
