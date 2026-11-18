"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ADD_LIGHT, Particles } from "../../Particles";
import { glowTexture } from "../../textures";
import { easeInOutSine, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, gold, poolTexture, shadowTexture, starGeometry } from "../gfx";
import { GOLD_DUST, SNOWFALL } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";
import { BASE_Y, DURATION, HEIGHT, PRESENTS, TOP_Y, TREE_DENSITY, fairyLit, flareTexture, frondGeometry, ornamentLit, radiusAt, starOn as starOnAt, treeLayout } from "./tree-model";

export const def: StageSceneDef = {
  duration: DURATION, heroT: 8.6,
  lift: (a) => (a < 0.9 ? 0.22 : 0.13),
  fog: ["#0f1c22", 16, 52],
  wind: (t) => 0.5 + 0.3 * Math.sin(t * 0.4),
  camera(t, aspect) {
    const k = easeInOutSine(seg(t, 0, DURATION));
    const base = fitDistance(5.6, (TOP_Y + 1.5) * (aspect < 0.9 ? 1.5 : 1.2), aspect, 1.0);
    const dist = base * lerp(0.7, 1, easeOutCubic(seg(t, 0, DURATION)));
    const a = -0.62 + 0.56 * k + Math.sin(t * 0.25) * 0.04; // a slow orbit that settles slightly off-axis
    // starts low among the presents looking up at the tree, then rises to take in the whole of it
    return { pos: { x: Math.sin(a) * dist, y: lerp(1.5, 3.6, k), z: Math.cos(a) * dist }, look: { x: 0, y: lerp(3.4, 3.9, k), z: 0 } };
  },
};

function Tree({ shared, mobile, mode }: StageSceneProps) {
  const star = useRef<THREE.Mesh>(null), starGlow = useRef<THREE.Sprite>(null), starFlare = useRef<THREE.Sprite>(null), starLight = useRef<THREE.PointLight>(null), warm = useRef<THREE.PointLight>(null);
  const baubles = useRef<THREE.InstancedMesh>(null), caps = useRef<THREE.InstancedMesh>(null), baubleGlow = useRef<THREE.Points>(null), fairy = useRef<THREE.Points>(null), root = useRef<THREE.Group>(null);
  const r = useMemo(() => {
    const { fronds, orn, fl } = treeLayout(TREE_DENSITY[mobile ? "mobile" : "desktop"]);
    return {
      orn, fl, fronds, frondGeo: frondGeometry(), frondMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
      core: new THREE.MeshStandardMaterial({ color: "#0b241b", roughness: 1 }), poolTex: poolTexture(), glowTex: glowTexture(), shadowTex: shadowTexture(), flareTex: flareTexture(),
      baubleGeo: new THREE.SphereGeometry(1, mobile ? 14 : 20, mobile ? 10 : 14), baubleMat: new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0.92, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 2.4 }),
      capGeo: new THREE.CylinderGeometry(0.3, 0.34, 0.3, 10), starGeo: starGeometry(0.5, 0.21, 0.16, 0.035), starMat: new THREE.MeshPhysicalMaterial({ color: "#f8cf6a", metalness: 1, roughness: 0.2, envMapIntensity: 1.8, emissive: "#f2a52e", emissiveIntensity: 0.75 }),
      trunk: new THREE.MeshStandardMaterial({ color: "#4f3323", roughness: 0.92 }),
      giftGeo: new RoundedBoxGeometry(1, 1, 1, 3, 0.07), gold: gold(0.3),
      fairyPos: Float32Array.from(fl.flatMap((v) => [v.x, v.y, v.z])), fairyCol: new Float32Array(fl.length * 3),
      glowPos: Float32Array.from(orn.flatMap((o) => [o.p.x * 1.04, o.p.y, o.p.z * 1.04])), glowCol: new Float32Array(orn.length * 3),
    };
  }, [mobile]);
  useEffect(() => () => { dispose(r.frondGeo, r.frondMat, r.core, r.poolTex, r.glowTex, r.shadowTex, r.flareTex, r.baubleGeo, r.baubleMat, r.capGeo, r.starGeo, r.starMat, r.trunk, r.giftGeo, r.gold); }, [r]);

  const frondMesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = frondMesh.current; if (!im) return;
    r.fronds.forEach((n, i) => { im.setMatrixAt(i, n.m); im.setColorAt(i, n.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [r]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), v: new THREE.Vector3(), q: new THREE.Quaternion() }), []);
  useEffect(() => {
    const im = baubles.current, cm = caps.current; if (!im || !cm) return;
    r.orn.forEach((o, i) => {
      tmp.m.compose(o.p, tmp.q.identity(), tmp.v.setScalar(o.s)); im.setMatrixAt(i, tmp.m); im.setColorAt(i, tmp.c.set(o.c).multiplyScalar(0.3));
      tmp.m.compose(tmp.v.set(o.p.x, o.p.y + o.s * 1.02, o.p.z), tmp.q.identity(), new THREE.Vector3(o.s, o.s, o.s)); cm.setMatrixAt(i, tmp.m);
    });
    im.instanceMatrix.needsUpdate = true; cm.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [r, tmp]);

  useFrame(() => {
    const t = shared.current.t, live = mode === "static" ? DURATION : t;
    // ornaments light one after another, bottom to top; fairy lights chase up the spiral
    const im = baubles.current, bg = baubleGlow.current, fp = fairy.current;
    const n = r.orn.length;
    if (im && bg) {
      for (let i = 0; i < n; i++) {
        const lit = ornamentLit(live, i, n);
        const tw = 0.85 + 0.15 * Math.sin(live * 3 + i * 1.7);
        const b = 0.3 + 0.7 * lit * tw;
        im.setColorAt(i, tmp.c.set(r.orn[i].c).multiplyScalar(b));
        const g = lit * 0.55 * tw; r.glowCol[i * 3] = r.orn[i].c.r * g; r.glowCol[i * 3 + 1] = r.orn[i].c.g * g; r.glowCol[i * 3 + 2] = r.orn[i].c.b * g;
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      (bg.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    if (fp) {
      const m = r.fl.length;
      for (let i = 0; i < m; i++) {
        const lit = fairyLit(live, i, m), tw = 0.6 + 0.4 * Math.sin(live * 4 + i * 2.3);
        const warmWhite = i % 3 === 0 ? [1, 0.55, 0.7] : i % 3 === 1 ? [1, 0.82, 0.5] : [1, 0.95, 0.8];
        r.fairyCol[i * 3] = warmWhite[0] * lit * tw; r.fairyCol[i * 3 + 1] = warmWhite[1] * lit * tw; r.fairyCol[i * 3 + 2] = warmWhite[2] * lit * tw;
      }
      (fp.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    const starOn = starOnAt(live), pulse = 0.5 + 0.5 * Math.sin(live * 2.2);
    if (star.current) { star.current.scale.setScalar(Math.max(0.001, starOn)); star.current.rotation.y = live * 0.6; }
    if (starGlow.current) { starGlow.current.scale.setScalar(3.4 + pulse * 0.5); (starGlow.current.material as THREE.SpriteMaterial).opacity = starOn * (0.34 + 0.1 * pulse); }
    if (starFlare.current) { const m = starFlare.current.material as THREE.SpriteMaterial; m.opacity = starOn * (0.75 + 0.2 * pulse); m.rotation = live * 0.12; starFlare.current.scale.setScalar(2.3 + pulse * 0.35); }
    if (starLight.current) starLight.current.intensity = starOn * (5 + pulse * 1.2);
    if (warm.current) warm.current.intensity = 2.6 * easeOutCubic(seg(live, 1.5, 6.5));
    if (root.current) root.current.rotation.y = 0; // the camera orbits; the tree stays put
  });

  return (
    <>
      <hemisphereLight args={["#9fb8c8", "#1a0f22", 0.42]} />
      <directionalLight position={[4, 6, 5]} intensity={1.5} color="#fff0dc" />
      <directionalLight position={[-5, 3, -3]} intensity={0.9} color="#d969a3" />
      <directionalLight position={[3, 1.5, -5]} intensity={0.6} color="#9c7edb" />
      <pointLight ref={warm} position={[0, 2.4, 2.2]} color="#ffb86b" intensity={0} distance={9} decay={1.5} />
      <group ref={root}>
        {/* snowy ground with a soft contact shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><planeGeometry args={[11, 11]} /><meshBasicMaterial map={r.poolTex} transparent depthWrite={false} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={1}><planeGeometry args={[5.6, 5.6]} /><meshBasicMaterial map={r.shadowTex} transparent depthWrite={false} /></mesh>
        <mesh position={[0, BASE_Y / 2 + 0.1, 0]} material={r.trunk}><cylinderGeometry args={[0.2, 0.3, BASE_Y + 0.5, 14]} /></mesh>
        {/* a dark core: what you see between the boughs is shadow, not the far side of the scene */}
        <mesh position={[0, BASE_Y + HEIGHT * 0.47, 0]} material={r.core}><coneGeometry args={[radiusAt(0) * 0.62, HEIGHT * 0.94, 20, 1, true]} /></mesh>
        <instancedMesh ref={frondMesh} args={[r.frondGeo, r.frondMat, r.fronds.length]} frustumCulled={false} />
        <instancedMesh ref={baubles} args={[r.baubleGeo, r.baubleMat, r.orn.length]} frustumCulled={false} />
        <instancedMesh ref={caps} args={[r.capGeo, r.gold, r.orn.length]} frustumCulled={false} />
        <points ref={baubleGlow} frustumCulled={false}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.glowPos, 3]} /><bufferAttribute attach="attributes-color" args={[r.glowCol, 3]} /></bufferGeometry>
          <pointsMaterial map={r.glowTex} size={0.62} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
        </points>
        <points ref={fairy} frustumCulled={false}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.fairyPos, 3]} /><bufferAttribute attach="attributes-color" args={[r.fairyCol, 3]} /></bufferGeometry>
          <pointsMaterial map={r.glowTex} size={0.36} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
        </points>
        <group position={[0, TOP_Y + 0.42, 0]}>
          <mesh ref={star} geometry={r.starGeo} material={r.starMat} />
          <sprite ref={starGlow} scale={3.4}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
          <sprite ref={starFlare} scale={2.3}><spriteMaterial map={r.flareTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
          <pointLight ref={starLight} position={[0, -0.2, 0.5]} color="#ffd98a" intensity={0} distance={7} decay={1.5} />
        </group>
        {/* presents under the tree */}
        {PRESENTS.map(([x, y, z, s, c, ry], i) => (
          <group key={i} position={[x as number, y as number, z as number]} rotation={[0, ry as number, 0]} scale={s as number}>
            <mesh geometry={r.giftGeo}><meshPhysicalMaterial color={c as string} roughness={0.4} sheen={1} sheenColor="#ffe3ef" /></mesh>
            <mesh geometry={r.giftGeo} material={r.gold} scale={[0.16, 1.02, 1.02]} />
            <mesh geometry={r.giftGeo} material={r.gold} scale={[1.02, 1.02, 0.16]} />
          </group>
        ))}
      </group>
      {mode === "play" && <Particles preset={SNOWFALL} mobile={mobile} shared={shared} />}
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

const mod: StageSceneModule = { def, Scene: Tree };
export default mod;
export const Scene = Tree;
