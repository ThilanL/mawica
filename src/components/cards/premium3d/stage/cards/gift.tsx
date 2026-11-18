"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Particles } from "../../Particles";
import { easeInOutSine, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose } from "../gfx";
import { GOLD_DUST } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";
import { DURATION, buildGift, giftPose, giftResources } from "./gift-model";

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

function Gift({ shared, mobile, mode }: StageSceneProps) {
  const shadow = useRef<THREE.Mesh>(null), poolMat = useRef<THREE.MeshBasicMaterial>(null);
  const r = useMemo(() => giftResources(mobile), [mobile]);
  const parts = useMemo(() => buildGift(r), [r]);
  useEffect(() => () => { dispose(...(Object.values(r) as { dispose(): void }[])); }, [r]);

  useFrame(() => {
    const t = mode === "static" ? DURATION : shared.current.t;
    const p = giftPose(t), { root, ribbon, lid, bow, inner, light, burst, shaft } = parts;
    root.position.y = 0.3 + p.bob + p.rise; root.rotation.y = p.spin;
    ribbon.visible = p.ribbon.visible; ribbon.scale.set(...p.ribbon.scale); ribbon.position.y = p.ribbon.y; ribbon.rotation.y = p.ribbon.rotY;
    r.ribbonFade.opacity = p.ribbon.opacity;
    lid.position.set(...p.lid.pos); lid.rotation.set(...p.lid.rot);
    bow.rotation.y = p.bowRotY;
    if (light) light.intensity = p.glow * 8;
    (inner.material as THREE.MeshBasicMaterial).color.setScalar(0.25 + 0.75 * p.glow);
    if (burst) { (burst.material as THREE.SpriteMaterial).opacity = p.glow * 0.8; burst.scale.setScalar(2.4 + p.glow * 1.8); }
    if (shaft) (shaft.material as THREE.MeshBasicMaterial).opacity = p.glow * 0.6;
    if (poolMat.current) poolMat.current.opacity = 0.5 + p.glow * 0.3;
    if (shadow.current) { const k = 1 - p.bob * 0.9; shadow.current.scale.setScalar(k); (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.9 - p.bob * 1.2; }
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
      <primitive object={parts.root} />
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Gift };
export default mod;
export const Scene = Gift;
