"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ADD_LIGHT, Particles } from "../../Particles";
import { glowTexture, shaftTexture } from "../../textures";
import { easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, gold, poolTexture, satin, shadowTexture } from "../gfx";
import { GOLD_DUST } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 11;
const BOX = 2.0, LID_H = 0.55, BODY_H = 1.55;

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

function bowLoop(r: number) {
  // a flat ribbon loop: a torus squashed into a lens
  const g = new THREE.TorusGeometry(r, 0.115, 16, 44);
  g.scale(1, 0.7, 0.42);
  return g;
}

function Gift({ shared, mobile, mode }: StageSceneProps) {
  const root = useRef<THREE.Group>(null), lid = useRef<THREE.Group>(null), ribbon = useRef<THREE.Group>(null), bow = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null), burst = useRef<THREE.Sprite>(null), shaft = useRef<THREE.Mesh>(null), poolMat = useRef<THREE.MeshBasicMaterial>(null);
  const r = useMemo(() => {
    const seg = mobile ? 3 : 5;
    return {
      body: new RoundedBoxGeometry(BOX, BODY_H, BOX, seg, 0.1),
      lid: new RoundedBoxGeometry(BOX + 0.14, LID_H, BOX + 0.14, seg, 0.09),
      bandV: new RoundedBoxGeometry(0.34, BODY_H + 0.05, BOX + 0.06, 2, 0.04),
      bandH: new RoundedBoxGeometry(BOX + 0.06, BODY_H + 0.05, 0.34, 2, 0.04),
      lidV: new RoundedBoxGeometry(0.36, LID_H + 0.04, BOX + 0.2, 2, 0.04),
      lidH: new RoundedBoxGeometry(BOX + 0.2, LID_H + 0.04, 0.36, 2, 0.04),
      loop: bowLoop(0.42), knot: new THREE.SphereGeometry(0.17, 20, 14), tail: new RoundedBoxGeometry(0.2, 0.72, 0.04, 2, 0.02),
      rose: satin("#d96aa6", "#ffd1ea"), roseLid: satin("#e27db3", "#ffe0f0"), ribbonMat: new THREE.MeshPhysicalMaterial({ color: "#ffc95c", metalness: 0.85, roughness: 0.24, sheen: 1, sheenColor: new THREE.Color("#fff0c2"), envMapIntensity: 1.5, emissive: "#a8641a", emissiveIntensity: 0.18 }),
      trim: gold(0.25), glowTex: glowTexture(), shaftTex: shaftTexture(), shadowTex: shadowTexture(), poolTex: poolTexture("rgba(255,214,150,0.55)", "rgba(180,110,170,0.28)"),
    };
  }, [mobile]);
  useEffect(() => () => { dispose(...(Object.values(r) as { dispose(): void }[])); }, [r]);

  useFrame(() => {
    const t = mode === "static" ? DURATION : shared.current.t;
    const bob = Math.sin(t * 1.3) * 0.09;
    if (root.current) { root.current.position.y = 0.3 + bob + 0.25 * easeOutCubic(seg(t, 0, 3)); root.current.rotation.y = t * 0.16; }
    // 1) ribbon unwraps: the bands slide away and fade, the bow lifts off and floats up
    const un = easeInOutCubic(seg(t, 3.2, 5.2));
    if (ribbon.current) { ribbon.current.scale.set(1, 1, 1); ribbon.current.visible = un < 0.999; ribbon.current.position.y = -un * 0.0; ribbon.current.children.forEach((c, i) => { c.position.x = (i === 0 ? 1 : 0) * un * 1.9; c.position.z = (i === 1 ? 1 : 0) * un * 1.9; c.rotation.y = un * (i === 0 ? 0.8 : -0.8); c.scale.setScalar(Math.max(0.0001, 1 - un * 0.2)); }); }
    if (bow.current) { bow.current.position.y = BODY_H + LID_H + 0.22 + un * 1.5 + Math.sin(t * 2.0) * 0.05 * un; bow.current.rotation.y = un * 2.4; bow.current.rotation.z = un * 0.4; bow.current.scale.setScalar(Math.max(0.0001, 1 - 0.55 * easeInOutCubic(seg(t, 5.0, 7.5)))); bow.current.visible = t < 7.6; }
    // 2) the lid opens: lifts, then tips back on a hinge
    const open = easeOutBack(seg(t, 5.2, 6.8), 1.2), lift = easeInOutCubic(seg(t, 5.2, 6.0));
    if (lid.current) { lid.current.position.set(0, BODY_H + LID_H / 2 + lift * 0.5, -BOX / 2 * open * 0.9); lid.current.rotation.x = -open * 1.25; lid.current.position.z = open * -1.05; }
    // 3) golden light pours out
    const g = easeInOutSine(seg(t, 5.6, 7.4)) * (0.82 + 0.18 * Math.sin(t * 3));
    if (light.current) light.current.intensity = g * 7;
    if (burst.current) { (burst.current.material as THREE.SpriteMaterial).opacity = g * 0.9; burst.current.scale.setScalar(3 + g * 2.2); }
    if (shaft.current) (shaft.current.material as THREE.MeshBasicMaterial).opacity = g * 0.8;
    if (poolMat.current) poolMat.current.opacity = 0.55 + g * 0.45;
  });

  return (
    <>
      <hemisphereLight args={["#b79cf2", "#3a1d50", 0.45]} />
      <directionalLight position={[4, 6, 5]} intensity={1.3} color="#fff1e0" />
      <directionalLight position={[-5, 2, -3]} intensity={1.0} color="#ff9ccd" />
      <directionalLight position={[4, 1, -5]} intensity={0.6} color="#9c7edb" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[12, 12]} /><meshBasicMaterial map={r.poolTex} transparent depthWrite={false} opacity={0.55} ref={poolMat} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={1}><planeGeometry args={[5.4, 5.4]} /><meshBasicMaterial map={r.shadowTex} transparent depthWrite={false} /></mesh>
      <group ref={root}>
        <mesh geometry={r.body} material={r.rose} position={[0, BODY_H / 2, 0]} />
        <mesh geometry={r.body} material={r.trim} position={[0, 0.03, 0]} scale={[1.02, 0.04, 1.02]} />
        <group ref={ribbon}>
          <mesh geometry={r.bandV} material={r.ribbonMat} position={[0, BODY_H / 2, 0]} />
          <mesh geometry={r.bandH} material={r.ribbonMat} position={[0, BODY_H / 2, 0]} />
        </group>
        {/* the inside glows: a golden plane just under the open lid line */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BODY_H - 0.02, 0]}><planeGeometry args={[BOX - 0.2, BOX - 0.2]} /><meshBasicMaterial color="#ffd98a" /></mesh>
        <group ref={lid} position={[0, BODY_H + LID_H / 2, 0]}>
          <mesh geometry={r.lid} material={r.roseLid} />
          <mesh geometry={r.lidV} material={r.ribbonMat} />
          <mesh geometry={r.lidH} material={r.ribbonMat} />
          <mesh geometry={r.lid} material={r.trim} position={[0, -LID_H / 2 + 0.02, 0]} scale={[1.01, 0.05, 1.01]} />
        </group>
        <group ref={bow} position={[0, BODY_H + LID_H + 0.22, 0]}>
          {[0, 1, 2, 3].map((i) => <mesh key={i} geometry={r.loop} material={r.ribbonMat} position={[Math.cos((i * Math.PI) / 2) * 0.34, 0.1, Math.sin((i * Math.PI) / 2) * 0.34]} rotation={[0.35, (i * Math.PI) / 2, 0]} />)}
          <mesh geometry={r.knot} material={r.ribbonMat} position={[0, 0.05, 0]} />
          <mesh geometry={r.tail} material={r.ribbonMat} position={[0.2, -0.35, 0.2]} rotation={[0, 0.5, 0.3]} />
          <mesh geometry={r.tail} material={r.ribbonMat} position={[-0.2, -0.35, 0.18]} rotation={[0, -0.4, -0.3]} />
        </group>
        <pointLight ref={light} position={[0, BODY_H + 0.4, 0]} color="#ffcf7a" intensity={0} distance={9} decay={1.4} />
        <sprite ref={burst} position={[0, BODY_H + 0.5, 0]} scale={3}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
        <mesh ref={shaft} position={[0, BODY_H + 1.9, 0]}><planeGeometry args={[2.6, 3.8]} /><meshBasicMaterial map={r.shaftTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></mesh>
      </group>
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Gift };
export default mod;
export const Scene = Gift;
