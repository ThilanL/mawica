"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CardMedia } from "../types";
import { presetById, totalParticles } from "./ambient";
import { CardModel } from "./CardModel";
import { Envelope } from "./Envelope";
import { LumiModel } from "./LumiModel";
import { MediaFrame } from "./MediaFrame";
import { Particles } from "./Particles";
import { newRig, type Shared } from "./rig";
import { DIM, FOV, T, poseAt } from "./timeline";

export type CanvasStats = { fps: number; calls: number; triangles: number; geometries: number; textures: number; dpr: number; particles: number; /** performance.now() of this sample: a stale value means rendering has stopped */ at: number };
export type CinemaEvents = { onReady?: () => void; onDone?: () => void; onLost?: () => void; onLowPerf?: () => void; onStats?: (s: CanvasStats) => void };

/** Procedural reflections (no HDR download) so gold, wax and clearcoat have something to reflect. */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.16;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); room.dispose?.(); };
  }, [gl, scene]);
  return null;
}

/** Applies the choreography every frame. Time is accumulated from frame deltas, so pausing (hidden tab, off screen) never skips the animation. */
function Choreographer({ shared, rig, mode, events }: { shared: { current: Shared }; rig: { current: ReturnType<typeof newRig> }; mode: "play" | "static"; events: React.MutableRefObject<CinemaEvents> }) {
  const { camera, size } = useThree();
  const done = useRef(false);
  useFrame((_, rawDt) => {
    const sh = shared.current;
    // Up to 0.1 s per frame: a slow device keeps (roughly) real time with choppier frames instead of playing in slow motion.
    const dt = Math.min(rawDt, 0.1);
    if (mode === "static") sh.t = T.end;
    else if (sh.playing) sh.t = Math.min(sh.t + dt, T.end + 30);
    const aspect = size.width / Math.max(1, size.height);
    const p = poseAt(sh.t, aspect);
    const r = rig.current;
    sh.wind = p.wind; sh.storm = p.storm; sh.lumi = p.lumi;
    if (r.envelope) {
      r.envelope.position.set(p.envelope.x, p.envelope.y, p.envelope.z);
      r.envelope.rotation.set(p.envelope.rx, p.envelope.ry, p.envelope.rz);
    }
    r.flap?.rotation.set(p.flap, 0, 0);
    if (r.card) { r.card.position.set(p.card.x, p.card.y, p.card.z); r.card.rotation.set(p.card.rx, p.card.ry, p.card.rz); }
    r.cover?.rotation.set(p.cover, 0, 0);
    // light spilling out of the opening, anchored to the envelope
    const g = p.glow;
    if (r.glowSprite) (r.glowSprite.material as THREE.SpriteMaterial).opacity = g * 0.32;
    if (r.glowShaft) (r.glowShaft.material as THREE.MeshBasicMaterial).opacity = g * 0.38;
    if (r.glowLight) r.glowLight.intensity = g * 2.4; // the light sits inside the envelope: it lights the lining and the card, not the outside of the pocket
    camera.position.set(p.camera.pos.x, p.camera.pos.y, p.camera.pos.z);
    camera.lookAt(p.camera.look.x, p.camera.look.y, p.camera.look.z);
    if (!done.current && sh.t >= T.end) { done.current = true; events.current.onDone?.(); }
  });
  return null;
}

/**
 * Drives rendering. frameloop is "demand": while the choreography plays (or anything is reacting) a frame is requested every display frame; once the
 * card is at rest it drops to about 30 frames a second for a short while (Lumi hops, the photo sways), then stops completely until the person touches
 * the card. It also steps the pixel density down when frames take too long, and reports devices that cannot keep up.
 */
function Driver({ shared, enabled, mode, events }: { shared: { current: Shared }; enabled: boolean; mode: "play" | "static"; events: React.MutableRefObject<CinemaEvents> }) {
  const { invalidate, gl, setDpr } = useThree();
  const frames = useRef(0);
  useFrame(() => { frames.current++; });
  useEffect(() => {
    if (!enabled) return;
    if (mode === "static") { invalidate(); const id = window.setTimeout(invalidate, 400); const id2 = window.setTimeout(invalidate, 1200); return () => { window.clearTimeout(id); window.clearTimeout(id2); }; }
    let raf = 0, timer = 0, winStart = performance.now(), warm = 0, slow = 0, bad = 0, restSince = -1;
    frames.current = 0;
    const tick = (now: number) => {
      const sh = shared.current;
      const active = sh.t < T.end + 0.2 || performance.now() / 1000 - sh.lastInput < 4 || performance.now() / 1000 - sh.celebrateAt < 2.2;
      if (active) restSince = -1; else if (restSince < 0) restSince = now;
      const idleFor = restSince < 0 ? 0 : now - restSince;
      if (idleFor > 25000) { return; } // at rest for a while: stop rendering until the next interaction restarts the loop (see wake())
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
      if (active) raf = requestAnimationFrame(tick);
      else timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 24);
    };
    raf = requestAnimationFrame(tick);
    const wake = () => { if (restSince >= 0 && performance.now() - restSince > 25000) { restSince = -1; raf = requestAnimationFrame(tick); } };
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("pointermove", wake, { passive: true });
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); window.removeEventListener("pointerdown", wake); window.removeEventListener("pointermove", wake); };
  }, [enabled, mode, shared, invalidate, gl, setDpr, events]);
  return null;
}

/** Frame counter and renderer statistics, published on window.__cinema when the page asks for them (?perf=1) or in development. */
function Meter({ particles, onStats, publish }: { particles: number; onStats?: (s: CanvasStats) => void; publish: boolean }) {
  const { gl } = useThree();
  const acc = useRef({ frames: 0, t0: 0 });
  useFrame(() => {
    const a = acc.current; a.frames++;
    const t = performance.now() / 1000;
    if (a.t0 === 0) a.t0 = t;
    if (t - a.t0 > 3) { a.t0 = t; a.frames = 1; return; }
    if (t - a.t0 >= 1) {
      const s: CanvasStats = { fps: Math.round(a.frames / (t - a.t0)), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio(), particles, at: Math.round(performance.now()) };
      if (publish) (window as unknown as { __cinema?: CanvasStats }).__cinema = s;
      onStats?.(s); a.frames = 0; a.t0 = t;
    }
  });
  return null;
}

export default function CinematicCanvas({
  recipient, sender, media, shared, mode, enabled, mobile, ambient, events, publishStats,
}: {
  recipient: string; sender: string; media?: CardMedia | null; shared: { current: Shared }; mode: "play" | "static"; enabled: boolean; mobile: boolean; ambient?: string;
  events: React.MutableRefObject<CinemaEvents>; publishStats: boolean;
}) {
  const rig = useRef(newRig());
  const preset = presetById(ambient);
  const maxDpr = useMemo(() => {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 8 : 8;
    return mobile || cores <= 4 ? 1.5 : 1.75;
  }, [mobile]);
  const particles = mode === "static" ? 0 : totalParticles(preset, mobile);
  const hasPhoto = !!media;
  const lumiX = hasPhoto ? 0.72 : 0, lumiSize = hasPhoto ? 0.42 : 0.56;

  return (
    <Canvas
      frameloop={enabled ? "demand" : "never"}
      dpr={[1, maxDpr]}
      camera={{ position: [0, 0.3, 9], fov: FOV, near: 0.1, far: 90 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "default" }}
      style={{ touchAction: "pan-y" }}
      onCreated={({ gl, scene }) => {
        scene.fog = new THREE.Fog(new THREE.Color("#241638"), 14, 60); // far things sink into the plum night
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        // A lost context (GPU reset, tab discard) would leave a blank canvas: tell the host to show the fallback.
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); events.current.onLost?.(); }, { once: true });
        events.current.onReady?.();
      }}
    >
      <Environment />
      {/* soft cinematic lighting: lavender sky, warm key, rose and lavender rims, golden light from the opening */}
      <hemisphereLight args={["#a98cf0", "#2c1a42", 0.22]} />
      <directionalLight position={[3, 4, 6]} intensity={1.15} color="#fff1dc" />
      <directionalLight position={[-4, 1.5, -3]} intensity={1.1} color="#ffb347" />
      <directionalLight position={[-5, 1.5, 3]} intensity={0.7} color="#d9699f" />
      <directionalLight position={[5, -1, 2]} intensity={0.55} color="#9c7edb" />
      <Envelope rig={rig} />
      <CardModel rig={rig} recipient={recipient} sender={sender}>
        {/* the cover's inside (the upper panel when open) is Lumi's stage; the photo floats beside Lumi */}
        <LumiModel shared={shared} position={[lumiX, DIM.cardH * 0.98, 0.55]} size={lumiSize} mobile={mobile} />
        {media && <MediaFrame media={media} shared={shared} position={[-0.52, DIM.cardH * 1.0, 0.5]} mobile={mobile} />}
      </CardModel>
      {mode === "play" && <Particles preset={preset} mobile={mobile} shared={shared} />}
      <Choreographer shared={shared} rig={rig} mode={mode} events={events} />
      <Driver shared={shared} enabled={enabled} mode={mode} events={events} />
      <Meter particles={particles} onStats={(s) => events.current.onStats?.(s)} publish={publishStats} />
    </Canvas>
  );
}
