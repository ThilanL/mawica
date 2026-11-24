"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { ADD_LIGHT } from "../../../Particles";
import type { Shared } from "../../../rig";
import { glowTexture } from "../../../textures";
import { shadowTexture } from "../../gfx";
import { GLOBE, WEB_SCALE, type ProfileName } from "../globe-model";
import { useGlobeBloom } from "./bloom";
import { buildSnowGlobe, type GlobeParts } from "./build";
import { GLOBE_DURATION as DURATION, INTRO, STORM_SETTLE, flicker, lanternOn, smooth, starGlow, starOn, stormEnergy, treeLightOn, twinkle, windowsOn } from "./motion";
import { createSmoke, createSnow, setPointScale, type Smoke, type Snow } from "./particles";
import { playShimmer } from "./sound";

/**
 * The snow globe in a react-three-fiber scene, lit and animated for the website.
 * Lighting: a small HDRI on the globe's own materials (the other cards' shared environment is untouched), a warm key with soft shadows
 * (desktop), a cool rim, golden light from the cottage, tree, lantern and star, a contact shadow, and desktop-only selective bloom.
 * Animation (Stage C): snow falling inside the glass, chimney smoke, the village lights coming on, twinkling garland, the star's glow and a
 * gentle flicker of the windows and lantern. A tap on the globe, or shaking a phone, whips up a snowstorm that settles over ten seconds.
 * `mode: "static"` (reduced motion) shows the finished, lit scene with the snow still and no interaction.
 */
const COUNTS: Record<ProfileName, { snow: number; smoke: number }> = { desktop: { snow: 650, smoke: 30 }, mobile: { snow: 380, smoke: 20 }, ar: { snow: 0, smoke: 0 } };

export function GlobeWorld({ profile, engraving, onReady, shared, mode = "play", bloom = profile === "desktop" }: {
  profile: ProfileName; engraving?: string[]; onReady?: (parts: GlobeParts) => void; shared: { current: Shared }; mode?: "play" | "static"; bloom?: boolean;
}) {
  const { gl, invalidate, camera, size } = useThree();
  const [parts, setParts] = useState<GlobeParts | null>(null);
  const ready = useRef(onReady);
  useEffect(() => { ready.current = onReady; }, [onReady]);
  const engraveKey = (engraving ?? []).join("\n");
  const firstEngraving = useRef(engraveKey); // the model is built once with the engraving it starts with; later changes only redraw the plate
  useGlobeBloom(bloom);

  useEffect(() => {
    let alive = true, built: GlobeParts | null = null, env: THREE.Texture | null = null;
    const shadows = profile === "desktop";
    gl.shadowMap.enabled = shadows; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(gl);
    (async () => {
      const hdr = await new HDRLoader().loadAsync("/models/snow-globe/tex/env.hdr");
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      env = pmrem.fromEquirectangular(hdr).texture; hdr.dispose();
      const lines = firstEngraving.current;
      built = await buildSnowGlobe({ profile, envMap: env, engraving: lines ? lines.split("\n") : [] });
      if (!alive) { built.dispose(); return; }
      built.root.scale.setScalar(WEB_SCALE); built.root.updateMatrixWorld(true);
      setParts(built); ready.current?.(built); invalidate();
      [200, 800, 2000].forEach((ms) => window.setTimeout(invalidate, ms)); // textures decode a moment later
      // the miniature world never moves, so its shadows are drawn a few times while textures arrive, then kept (no shadow pass per frame)
      if (shadows) window.setTimeout(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; invalidate(); }, 2400);
    })().catch((e) => console.error("snow globe failed to load", e));
    return () => { alive = false; gl.shadowMap.autoUpdate = true; built?.dispose(); env?.dispose(); pmrem.dispose(); };
  }, [gl, invalidate, profile]);

  // the recipient's names on the back of the base: redrawn (debounced) when they change, e.g. while someone types in the create wizard
  useEffect(() => {
    if (!parts) return;
    const id = window.setTimeout(() => { parts.setEngraving(engraveKey ? engraveKey.split("\n") : []); invalidate(); }, 180);
    return () => window.clearTimeout(id);
  }, [parts, engraveKey, invalidate]);

  const fx = useMemo(() => ({ glow: glowTexture(), contact: shadowTexture() }), []);
  useEffect(() => () => { fx.glow.dispose(); fx.contact.dispose(); }, [fx]);

  // snow inside the glass and smoke from the chimney live in the model's own space (metres), so they scale and turn with it
  const fxRef = useRef<{ snow: Snow | null; smoke: Smoke | null }>({ snow: null, smoke: null });
  useEffect(() => {
    if (!parts) return;
    const c = COUNTS[profile];
    const snow = c.snow ? createSnow(c.snow, WEB_SCALE, profile === "mobile" ? 1.45 : 1) : null;
    const top = parts.root.worldToLocal(parts.nodes.chimneyTop.getWorldPosition(new THREE.Vector3()));
    const smoke = c.smoke && top.lengthSq() > 0 ? createSmoke([top.x, top.y + 0.001, top.z], WEB_SCALE, c.smoke) : null;
    if (snow) parts.root.add(snow.points);
    if (smoke) parts.root.add(smoke.points);
    fxRef.current = { snow, smoke };
    return () => { snow?.points.removeFromParent(); smoke?.points.removeFromParent(); snow?.dispose(); smoke?.dispose(); fxRef.current = { snow: null, smoke: null }; };
  }, [parts, profile]);

  // lights that follow parts of the model (lantern head, star) are placed once it is built
  const lantern = useMemo(() => (parts ? parts.nodes.lanternLight.getWorldPosition(new THREE.Vector3()) : null), [parts]);
  const tree = useMemo(() => (parts ? parts.root.getObjectByName("tree")!.getWorldPosition(new THREE.Vector3()) : null), [parts]);
  const star = useMemo(() => (parts ? parts.nodes.star.getWorldPosition(new THREE.Vector3()) : null), [parts]);
  // what the frame loop animates, with the brightness each was built with
  const live = useMemo(() => {
    if (!parts) return null;
    const lights = parts.nodes.lights, base: THREE.Color[] = [];
    if (lights?.instanceColor) for (let i = 0; i < lights.count; i++) { const c = new THREE.Color(); lights.getColorAt(i, c); base.push(c); }
    const windowMats = [...new Set(parts.nodes.windows.flatMap((m) => [m.material].flat() as THREE.MeshStandardMaterial[]))];
    const starMesh = parts.nodes.star.children[0] as THREE.Mesh | undefined;
    const bulb = parts.nodes.lanternLight.children[0] as THREE.Mesh | undefined;
    return {
      lights, base, windowMats, windowBase: windowMats.map((m) => m.emissiveIntensity),
      starMat: starMesh?.material as THREE.MeshPhysicalMaterial | undefined, bulbMat: bulb?.material as THREE.MeshStandardMaterial | undefined,
    };
  }, [parts]);
  const L = useRef<{ cottage: THREE.PointLight | null; tree: THREE.PointLight | null; lantern: THREE.PointLight | null; star: THREE.PointLight | null; lanternGlow: THREE.Sprite | null; starGlow: THREE.Sprite | null }>({ cottage: null, tree: null, lantern: null, star: null, lanternGlow: null, starGlow: null });
  const clock = useRef({ amb: 0, lastT: 0 });

  useFrame((_, rawDt) => {
    const sh = shared.current, dt = Math.min(rawDt, 0.1), c = clock.current, now = performance.now() / 1000;
    const still = mode === "static";
    const t = still ? DURATION : sh.t; // choreography time: the intro, then the finished scene
    // ambient time keeps flowing after the intro (the engine stops its own clock a minute after the intro); a replay or a seek resets it
    if (still) c.amb = DURATION + 4; else if (!sh.playing || t < c.lastT - 0.5) c.amb = t; else c.amb += dt;
    c.lastT = t;
    const amb = c.amb;
    // storm: the intro's first flurry, or the latest tap/shake, whichever is stronger
    const introAge = t - INTRO.storm, tapAge = sh.stormAt !== undefined ? now - sh.stormAt : -1;
    const eIntro = still ? 0 : stormEnergy(introAge), eTap = still ? 0 : stormEnergy(tapAge);
    const energy = Math.max(eIntro, eTap), age = eTap >= eIntro ? tapAge : introAge;
    if (energy > 0.01 && tapAge >= 0 && tapAge < STORM_SETTLE) sh.lastInput = now; // keep full frame rate while a storm settles
    const { snow, smoke } = fxRef.current;
    if (snow || smoke) setPointScale([snow?.points.material, smoke?.points.material].filter(Boolean) as THREE.ShaderMaterial[], size.height * gl.getPixelRatio(), camera as THREE.PerspectiveCamera);
    snow?.update(still ? DURATION : amb, energy, age);
    smoke?.update(still ? DURATION + 1.7 : amb, smooth(1.5, 3.5, t));
    if (!live) return;
    // village lights: windows, then the lantern, then the garland chases up the tree, then the star
    const w = windowsOn(t) * (still ? 1 : flicker(amb, 1.3));
    live.windowMats.forEach((m, i) => { m.emissiveIntensity = live.windowBase[i] * (0.08 + 0.92 * w); });
    if (L.current.cottage) L.current.cottage.intensity = 3.4 * w;
    const lt = lanternOn(t) * (still ? 1 : flicker(amb, 4.1));
    if (live.bulbMat) live.bulbMat.emissiveIntensity = 6 * lt;
    if (L.current.lantern) L.current.lantern.intensity = 2.4 * lt;
    if (L.current.lanternGlow) (L.current.lanternGlow.material as THREE.SpriteMaterial).opacity = 0.55 * lt;
    const lights = live.lights;
    if (lights?.instanceColor) {
      const tmp = new THREE.Color(), n = lights.count;
      for (let i = 0; i < n; i++) lights.setColorAt(i, tmp.copy(live.base[i]).multiplyScalar(0.05 + 0.95 * treeLightOn(t, i, n) * (still ? 1 : twinkle(amb, i))));
      lights.instanceColor.needsUpdate = true;
    }
    if (L.current.tree) L.current.tree.intensity = 2.6 * smooth(INTRO.tree[0], INTRO.tree[1], t);
    const s = starOn(t), g = s * (still ? 1 : starGlow(amb));
    parts?.nodes.star.scale.setScalar(Math.max(0.001, 0.4 + 0.6 * s));
    if (parts) parts.nodes.star.rotation.y = still ? 0.3 : Math.sin(amb * 0.35) * 0.35;
    if (live.starMat) live.starMat.emissiveIntensity = 3.2 * g;
    if (L.current.star) L.current.star.intensity = 2.4 * g;
    if (L.current.starGlow) { const m = L.current.starGlow.material as THREE.SpriteMaterial; m.opacity = 0.6 * g; L.current.starGlow.scale.setScalar(WEB_SCALE * (0.02 + 0.004 * g)); }
  });

  // tap the globe for a snowstorm; on an iPhone the same first tap asks for motion access so shaking works too
  const tap = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== "play") return;
    e.stopPropagation();
    const sh = shared.current, now = performance.now() / 1000;
    sh.stormAt = now; sh.lastInput = now; invalidate();
    if (sh.sound) playShimmer();
    askMotion(shared);
  };
  useEffect(() => {
    if (mode !== "play") return;
    return listenForShake(() => { const sh = shared.current, now = performance.now() / 1000; if (sh.stormAt === undefined || now - sh.stormAt > 1.2) { sh.stormAt = now; sh.lastInput = now; if (sh.sound) playShimmer(0.8); invalidate(); } });
  }, [mode, shared, invalidate]);

  const desktop = profile === "desktop";
  const S = WEB_SCALE;
  // lights live in world units (the model is scaled by WEB_SCALE; a light's range and falloff are not), so positions are scaled here
  const at = (x: number, y: number, z: number) => [x * S, y * S, z * S] as [number, number, number];
  return (
    <group>
      <hemisphereLight args={["#fff0e2", "#3a2238", 0.75]} />
      {/* warm key from above the front, the only shadow caster: soft shadows of the cottage, tree and snowman on the snow */}
      <spotLight position={at(0.16, 0.42, 0.3)} target-position={at(0, 0.09, 0)} angle={0.36} penumbra={0.9} intensity={desktop ? 1.9 : 1.6} decay={0} color="#ffe2bd"
        castShadow={desktop} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-near={5} shadow-camera-far={20} />
      <directionalLight position={at(-0.4, 0.3, -0.35)} intensity={0.9} color="#9fb4ff" />
      <directionalLight position={at(0.35, 0.12, 0.4)} intensity={0.35} color="#ffd2a8" />
      {/* warm light spilling from the cottage windows onto the snow in front of it */}
      <pointLight ref={(l) => { L.current.cottage = l; }} position={at(-0.01, 0.086, 0.006)} intensity={3.4} distance={2.4} decay={2} color="#ffa648" />
      {/* golden glow from inside the tree's lights onto its boughs and the snow around it */}
      {tree && <pointLight ref={(l) => { L.current.tree = l; }} position={[tree.x, tree.y + 0.035 * S, tree.z + 0.012 * S]} intensity={2.6} distance={2.2} decay={2} color="#ffbf62" />}
      {tree && <pointLight position={[tree.x, tree.y + 0.006 * S, tree.z + 0.03 * S]} intensity={1.8} distance={1.6} decay={2} color="#ffb35a" />}
      {lantern && <pointLight ref={(l) => { L.current.lantern = l; }} position={lantern.toArray()} intensity={2.4} distance={2} decay={2} color="#ffc271" />}
      {star && <pointLight ref={(l) => { L.current.star = l; }} position={star.toArray()} intensity={2.4} distance={2.6} decay={2} color="#ffd88c" />}
      {parts && <primitive object={parts.root} onPointerDown={tap} />}
      {/* gentle glow halos around the lantern and the star */}
      {lantern && <sprite ref={(s) => { L.current.lanternGlow = s; }} position={lantern.toArray()} scale={0.014 * S}><spriteMaterial map={fx.glow} color="#ffc56e" transparent opacity={0.55} depthWrite={false} {...ADD_LIGHT} /></sprite>}
      {star && <sprite ref={(s) => { L.current.starGlow = s; }} position={star.toArray()} scale={0.022 * S}><spriteMaterial map={fx.glow} color="#ffd27a" transparent opacity={0.6} depthWrite={false} {...ADD_LIGHT} /></sprite>}
      {/* contact shadow under the base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={-1}>
        <planeGeometry args={[GLOBE.baseRadius * 3.2 * S, GLOBE.baseRadius * 3.2 * S]} />
        <meshBasicMaterial map={fx.contact} transparent depthWrite={false} opacity={0.85} />
      </mesh>
    </group>
  );
}

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };
let motionAsked = false;
/** iPhone/iPad (iOS 13+) only report device motion after the person allows it, from a tap. Asked once, on the first tap of the globe. */
function askMotion(shared: { current: Shared }) {
  const D = (typeof window !== "undefined" ? window.DeviceMotionEvent : undefined) as unknown as MotionPermission | undefined;
  if (motionAsked || !D?.requestPermission) return;
  motionAsked = true;
  D.requestPermission().then((r) => { if (r === "granted") { shared.current.motion = true; window.dispatchEvent(new Event("globe-motion-granted")); } }).catch(() => {});
}

/** Calls `onShake` when the phone is given a real shake (a sharp change in acceleration), not when it is merely moved or turned. */
function listenForShake(onShake: () => void) {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return () => {};
  let last: [number, number, number] | null = null, lastAt = 0;
  const on = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity; if (!a || a.x === null || a.y === null || a.z === null) return;
    const cur: [number, number, number] = [a.x, a.y, a.z];
    if (last) { const d = Math.hypot(cur[0] - last[0], cur[1] - last[1], cur[2] - last[2]), now = performance.now(); if (d > 16 && now - lastAt > 900) { lastAt = now; onShake(); } }
    last = cur;
  };
  const attach = () => window.addEventListener("devicemotion", on);
  const needsPermission = typeof (window.DeviceMotionEvent as unknown as MotionPermission).requestPermission === "function";
  if (needsPermission) window.addEventListener("globe-motion-granted", attach, { once: true }); else attach();
  return () => { window.removeEventListener("devicemotion", on); window.removeEventListener("globe-motion-granted", attach); };
}
