"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ADD_LIGHT, Particles } from "../../Particles";
import { glowTexture, shaftTexture } from "../../textures";
import { easeInOutCubic, easeInOutSine, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, gold, poolTexture, satin, shadowTexture } from "../gfx";
import { GOLD_DUST } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 11;
const BOX = 2.0, LID_H = 0.55, BODY_H = 1.55, WALL = 0.08;

export const def: StageSceneDef = {
  duration: DURATION, heroT: 7.2,
  lift: (a) => (a < 0.9 ? 0.2 : 0.12),
  fog: ["#2a1740", 14, 50],
  camera(t, aspect) {
    const base = fitDistance(4.6, 5.2 * (aspect < 0.9 ? 1.9 : 1.5), aspect, 1.0);
    const dist = base * lerp(0.82, 1, easeOutCubic(seg(t, 0, DURATION)));
    const a = 0.55 - 0.45 * easeInOutSine(seg(t, 0, DURATION)) + Math.sin(t * 0.3) * 0.04;
    return { pos: { x: Math.sin(a) * dist, y: 2.7 + 0.5 * easeOutCubic(seg(t, 0, 6)), z: Math.cos(a) * dist }, look: { x: 0, y: 1.45 + 0.3 * seg(t, 4, 8), z: 0 } };
  },
};

/** A ribbon: a strip of the given width swept along a path, with a soft crease down the middle so it catches the light like satin. */
function ribbonStrip(path: THREE.Vector3[], width: number, across: THREE.Vector3, taper = 0) {
  const n = path.length, pos = new Float32Array(n * 9), idx: number[] = [], tan = new THREE.Vector3(), nor = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tan.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize(); nor.crossVectors(tan, across).normalize();
    const u = i / (n - 1), w = (width / 2) * (1 - taper * Math.pow(Math.abs(u - 0.5) * 2, 3)), puff = 0.022 + 0.012 * Math.sin(u * 19);
    [-1, 0, 1].forEach((k, j) => { const p = path[i]; pos.set([p.x + across.x * w * k + nor.x * (k === 0 ? puff : 0), p.y + across.y * w * k + nor.y * (k === 0 ? puff : 0), p.z + across.z * w * k + nor.z * (k === 0 ? puff : 0)], (i * 3 + j) * 3); });
    if (i < n - 1) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** One loop of a bow: a petal that leaves the knot, swells and returns to it. */
function bowLoop(len: number, rise: number, spread: number, width: number) {
  const pts: THREE.Vector3[] = [], N = 40;
  for (let i = 0; i <= N; i++) { const th = (i / N) * Math.PI, rho = len * Math.pow(Math.sin(th), 0.75), ang = rise + (th - Math.PI / 2) * spread; pts.push(new THREE.Vector3(rho * Math.cos(ang), rho * Math.sin(ang), 0)); }
  return ribbonStrip(pts, width, new THREE.Vector3(0, 0, 1), 0.45);
}
/** A tail that leaves the knot, lies along the lid with a ripple and curls up a touch at its end. */
function bowTail(len: number, width: number) {
  const pts: THREE.Vector3[] = [], N = 26;
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push(new THREE.Vector3(0.08 + u * len, 0.06 * (1 - u) * (1 - u) + 0.035 * Math.sin(u * 8.5) * u + 0.05 * Math.pow(u, 6), 0)); }
  return ribbonStrip(pts, width, new THREE.Vector3(0, 0, 1));
}
/** Warm light inside the box: bright at the heart, amber towards the walls. */
function innerTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 88); g.addColorStop(0, "#fff3cf"); g.addColorStop(0.45, "#ffcd6e"); g.addColorStop(1, "#c8791f");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function Gift({ shared, mobile, mode }: StageSceneProps) {
  const root = useRef<THREE.Group>(null), lid = useRef<THREE.Group>(null), ribbon = useRef<THREE.Group>(null), bow = useRef<THREE.Group>(null), inner = useRef<THREE.MeshBasicMaterial>(null), shadow = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null), burst = useRef<THREE.Sprite>(null), shaft = useRef<THREE.Mesh>(null), poolMat = useRef<THREE.MeshBasicMaterial>(null);
  const r = useMemo(() => {
    const seg = mobile ? 3 : 5;
    return {
      body: new RoundedBoxGeometry(BOX, BODY_H, BOX, seg, 0.1), wallX: new RoundedBoxGeometry(BOX, BODY_H, WALL, 2, 0.03), wallZ: new RoundedBoxGeometry(WALL, BODY_H, BOX, 2, 0.03), floor: new THREE.BoxGeometry(BOX - 0.02, 0.08, BOX - 0.02),
      lid: new RoundedBoxGeometry(BOX + 0.14, LID_H, BOX + 0.14, seg, 0.09),
      bandV: new RoundedBoxGeometry(0.34, BODY_H + 0.05, BOX + 0.06, 2, 0.04),
      bandH: new RoundedBoxGeometry(BOX + 0.06, BODY_H + 0.05, 0.34, 2, 0.04),
      lidV: new RoundedBoxGeometry(0.36, LID_H + 0.04, BOX + 0.2, 2, 0.04),
      lidH: new RoundedBoxGeometry(BOX + 0.2, LID_H + 0.04, 0.36, 2, 0.04),
      loop: bowLoop(0.98, 0.5, 0.66, 0.44), loopSmall: bowLoop(0.7, 1.0, 0.62, 0.38), knot: new RoundedBoxGeometry(0.34, 0.26, 0.4, 4, 0.12), tail: bowTail(0.95, 0.3), innerTex: innerTexture(),
      rose: satin("#dc7aae", "#ffd9ec"), roseLid: satin("#e58bbb", "#ffe4f1"),
      ribbonMat: new THREE.MeshPhysicalMaterial({ color: "#f3c873", metalness: 0.3, roughness: 0.36, sheen: 1, sheenColor: new THREE.Color("#fff3d0"), sheenRoughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 1.1, side: THREE.DoubleSide }),
      ribbonFade: new THREE.MeshPhysicalMaterial({ color: "#f3c873", metalness: 0.3, roughness: 0.36, sheen: 1, sheenColor: new THREE.Color("#fff3d0"), sheenRoughness: 0.3, envMapIntensity: 1.1, transparent: true }),
      trim: gold(0.25), glowTex: glowTexture(), shaftTex: shaftTexture(), shadowTex: shadowTexture(), poolTex: poolTexture("rgba(255,214,150,0.55)", "rgba(180,110,170,0.28)"),
    };
  }, [mobile]);
  useEffect(() => () => { dispose(...(Object.values(r) as { dispose(): void }[])); }, [r]);

  useFrame(() => {
    const t = mode === "static" ? DURATION : shared.current.t;
    const bob = Math.sin(t * 1.3) * 0.09;
    if (root.current) { root.current.position.y = 0.3 + bob + 0.25 * easeOutCubic(seg(t, 0, 3)); root.current.rotation.y = t * 0.16; }
    // 1) the ribbon loosens: the bands around the box slacken, slip down and fall away
    const un = easeInOutCubic(seg(t, 3.0, 4.9));
    if (ribbon.current) { ribbon.current.visible = un < 0.999; ribbon.current.scale.set(1 + un * 0.16, 1 - un * 0.5, 1 + un * 0.16); ribbon.current.position.y = -un * un * 0.55; ribbon.current.rotation.y = un * 0.22; }
    r.ribbonFade.opacity = 1 - easeInOutCubic(seg(t, 3.5, 4.6));
    // 2) the lid stirs, then rises on the light, tips back and hovers (it never passes through the box)
    const stir = Math.sin(seg(t, 4.7, 5.4) * Math.PI * 3) * 0.035 * (1 - seg(t, 5.2, 5.6));
    const lift = easeInOutCubic(seg(t, 5.2, 7.0)), tip = easeInOutCubic(seg(t, 5.6, 7.4)), hover = Math.sin(t * 1.1 + 1) * 0.04 * tip;
    if (lid.current) { lid.current.position.set(0.1 * tip, BODY_H + LID_H / 2 + lift * 1.0 + hover, -0.95 * tip); lid.current.rotation.set(-tip * 0.72 + stir, 0.18 * tip, stir * 0.6 + 0.07 * tip); }
    if (bow.current) bow.current.rotation.y = 0.5 + Math.sin(t * 0.9) * 0.03;
    // 3) golden light wells up from inside: it starts as a line under the lid and grows
    const g = easeInOutSine(seg(t, 5.0, 7.6)) * (0.9 + 0.1 * Math.sin(t * 2.2));
    if (light.current) light.current.intensity = g * 8;
    if (inner.current) inner.current.color.setScalar(0.25 + 0.75 * g);
    if (burst.current) { (burst.current.material as THREE.SpriteMaterial).opacity = g * 0.8; burst.current.scale.setScalar(2.4 + g * 1.8); }
    if (shaft.current) (shaft.current.material as THREE.MeshBasicMaterial).opacity = g * 0.6;
    if (poolMat.current) poolMat.current.opacity = 0.5 + g * 0.3;
    if (shadow.current) { const k = 1 - bob * 0.9; shadow.current.scale.setScalar(k); (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.9 - bob * 1.2; }
  });

  return (
    <>
      <hemisphereLight args={["#b79cf2", "#3a1d50", 0.45]} />
      <directionalLight position={[4, 6, 5]} intensity={1.0} color="#fff1e0" />
      <directionalLight position={[-5, 2, -3]} intensity={1.0} color="#ff9ccd" />
      <directionalLight position={[4, 1, -5]} intensity={0.6} color="#9c7edb" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[12, 12]} /><meshBasicMaterial map={r.poolTex} transparent depthWrite={false} opacity={0.55} ref={poolMat} /></mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={1}><planeGeometry args={[5.2, 5.2]} /><meshBasicMaterial map={r.shadowTex} transparent depthWrite={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} renderOrder={2}><planeGeometry args={[3.1, 3.1]} /><meshBasicMaterial map={r.shadowTex} transparent depthWrite={false} opacity={0.8} /></mesh>
      <group ref={root}>
        {/* an open box: four walls and a floor, so the inside is really there when the lid lifts */}
        {[-1, 1].map((k) => <mesh key={`x${k}`} geometry={r.wallX} material={r.rose} position={[0, BODY_H / 2, k * (BOX / 2 - WALL / 2)]} />)}
        {[-1, 1].map((k) => <mesh key={`z${k}`} geometry={r.wallZ} material={r.rose} position={[k * (BOX / 2 - WALL / 2), BODY_H / 2, 0]} />)}
        <mesh geometry={r.floor} material={r.rose} position={[0, 0.06, 0]} />
        <mesh geometry={r.body} material={r.trim} position={[0, 0.03, 0]} scale={[1.02, 0.04, 1.02]} />
        <group ref={ribbon}>
          <mesh geometry={r.bandV} material={r.ribbonFade} position={[0, BODY_H / 2, 0]} />
          <mesh geometry={r.bandH} material={r.ribbonFade} position={[0, BODY_H / 2, 0]} />
        </group>
        {/* the inside glows: a golden plane just under the open lid line */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BODY_H * 0.82, 0]}><planeGeometry args={[BOX - 0.16, BOX - 0.16]} /><meshBasicMaterial ref={inner} map={r.innerTex} /></mesh>
        <group ref={lid} position={[0, BODY_H + LID_H / 2, 0]}>
          <mesh geometry={r.lid} material={r.roseLid} />
          <mesh geometry={r.lidV} material={r.ribbonMat} />
          <mesh geometry={r.lidH} material={r.ribbonMat} />
          <mesh geometry={r.lid} material={r.trim} position={[0, -LID_H / 2 + 0.02, 0]} scale={[1.01, 0.05, 1.01]} />
          <group ref={bow} position={[0, LID_H / 2 + 0.05, 0]} rotation={[0, 0.5, 0]}>
            {[0, Math.PI].map((a) => <mesh key={a} geometry={r.loop} material={r.ribbonMat} rotation={[0, a, 0]} />)}
            {[Math.PI / 2, -Math.PI / 2].map((a) => <mesh key={a} geometry={r.loopSmall} material={r.ribbonMat} rotation={[0, a, 0]} />)}
            <mesh geometry={r.knot} material={r.ribbonMat} position={[0, 0.13, 0]} />
            <mesh geometry={r.tail} material={r.ribbonMat} rotation={[0, 0.55, 0]} position={[0, -0.02, 0]} />
            <mesh geometry={r.tail} material={r.ribbonMat} rotation={[0, Math.PI + 0.35, 0]} position={[0, -0.02, 0]} />
          </group>
        </group>
        <pointLight ref={light} position={[0, BODY_H * 0.85, 0]} color="#ffc66a" intensity={0} distance={8} decay={1.5} />
        <sprite ref={burst} position={[0, BODY_H + 0.45, 0]} scale={2} renderOrder={5}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} depthTest={false} {...ADD_LIGHT} /></sprite>
        <mesh ref={shaft} position={[0, BODY_H + 1.9, 0]}><planeGeometry args={[2.1, 3.4]} /><meshBasicMaterial map={r.shaftTex} color="#ffd9a0" transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></mesh>
      </group>
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Gift };
export default mod;
export const Scene = Gift;
