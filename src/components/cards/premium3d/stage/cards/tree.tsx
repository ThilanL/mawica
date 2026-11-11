"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ADD_LIGHT, Particles } from "../../Particles";
import { glowTexture } from "../../textures";
import { easeInOutSine, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, gold, poolTexture, rng, shadowTexture, starGeometry } from "../gfx";
import { GOLD_DUST, SNOWFALL } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 11;
const TIERS = [{ r: 1.95, h: 1.55 }, { r: 1.65, h: 1.45 }, { r: 1.38, h: 1.35 }, { r: 1.12, h: 1.22 }, { r: 0.86, h: 1.08 }, { r: 0.6, h: 0.92 }];
const BASE_Y = 0.75;
const tierY = (i: number) => BASE_Y + TIERS.slice(0, i).reduce((y, t) => y + t.h * 0.58, 0) + TIERS[i].h / 2;
const TOP_Y = tierY(TIERS.length - 1) + TIERS[TIERS.length - 1].h / 2;

export const def: StageSceneDef = {
  duration: DURATION, heroT: 8.5,
  lift: (a) => (a < 0.9 ? 0.22 : 0.14),
  fog: ["#0f1c22", 14, 48],
  wind: (t) => 0.5 + 0.3 * Math.sin(t * 0.4),
  camera(t, aspect) {
    const base = fitDistance(4.8, (TOP_Y + 1.4) * (aspect < 0.9 ? 2.1 : 1.55), aspect, 1.02);
    const dist = base * lerp(0.74, 1, easeOutCubic(seg(t, 0, DURATION)));
    const a = -0.55 + 0.5 * easeInOutSine(seg(t, 0, DURATION)) + Math.sin(t * 0.25) * 0.05; // a slow orbit that settles slightly off-axis
    const y = lerp(1.6, 2.7, easeOutCubic(seg(t, 0, DURATION)));
    return { pos: { x: Math.sin(a) * dist, y: y + 0.6, z: Math.cos(a) * dist }, look: { x: 0, y: lerp(2.0, 2.55, seg(t, 0, DURATION)), z: 0 } };
  },
};

function needleTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const x = c.getContext("2d")!; x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 2600; i++) { const px = r() * 256, py = r() * 256, l = 8 + r() * 10, a = (r() - 0.5) * 1.2 + Math.PI / 2; const v = 90 + r() * 90; x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 2); return t;
}

/** A tier: a cone with a scalloped, drooping rim and noisy flanks, so it reads as layered branches, not a smooth cone. */
function tierGeometry(r: number, h: number, seed: number, radial: number) {
  const g = new THREE.ConeGeometry(r, h, radial, 6, true);
  const p = g.attributes.position as THREE.BufferAttribute;
  const rnd = rng(seed);
  const colors = new Float32Array(p.count * 3);
  const dark = new THREE.Color("#10402f"), light = new THREE.Color("#2f8a62");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = (h / 2 - y) / h; // 0 at the tip .. 1 at the rim
    const th = Math.atan2(z, x);
    const scallop = 1 + 0.1 * Math.cos(th * 11) * k + (rnd() - 0.5) * 0.06 * k;
    p.setXYZ(i, x * scallop, y - 0.18 * k * (0.5 + 0.5 * Math.cos(th * 11)), z * scallop);
    const c = dark.clone().lerp(light, Math.min(1, 0.25 + (1 - k) * 0.55 + rnd() * 0.2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function Tree({ shared, mobile, mode }: StageSceneProps) {
  const star = useRef<THREE.Mesh>(null), starGlow = useRef<THREE.Sprite>(null), starLight = useRef<THREE.PointLight>(null), warm = useRef<THREE.PointLight>(null);
  const baubles = useRef<THREE.InstancedMesh>(null), baubleGlow = useRef<THREE.Points>(null), fairy = useRef<THREE.Points>(null), root = useRef<THREE.Group>(null);
  const r = useMemo(() => {
    const radial = mobile ? 36 : 56;
    const bump = needleTexture();
    const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, bumpMap: bump, bumpScale: 2.2, side: THREE.DoubleSide, color: "#8aa090" }); // darker core: the needle clusters carry the colour
    const geos = TIERS.map((t, i) => tierGeometry(t.r, t.h, 11 + i * 5, radial));
    const rnd = rng(42);
    // needle clusters: thousands of small drooping cones sampled over every tier, so the silhouette is furry and branchy instead of smooth
    const needles: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const nCount = mobile ? 1400 : 3600, up = new THREE.Vector3(0, 1, 0), pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sc = new THREE.Vector3();
    const greens = ["#164a35", "#1f5e43", "#2a7752", "#358a5f", "#1b4a3b"].map((c) => new THREE.Color(c));
    const tw = TIERS.reduce((a, t) => a + t.r * t.h, 0);
    TIERS.forEach((t, i) => {
      const n = Math.round((nCount * t.r * t.h) / tw);
      for (let k = 0; k < n; k++) {
        const th = rnd() * Math.PI * 2, f = Math.sqrt(0.08 + rnd() * 0.92), rr = t.r * f, y = tierY(i) + t.h / 2 - f * t.h - 0.04;
        const out = new THREE.Vector3(Math.cos(th), -0.55 - rnd() * 0.5, Math.sin(th)).normalize(); // outward and drooping
        qa.setFromUnitVectors(up, out);
        const len = 0.3 + rnd() * 0.22 + f * 0.2;
        pa.set(Math.cos(th) * rr, y, Math.sin(th) * rr).addScaledVector(out, len * 0.35);
        sc.set(1.0 + rnd() * 0.7, len, 1.0 + rnd() * 0.7);
        const m = new THREE.Matrix4().compose(pa.clone(), qa.clone(), sc.clone());
        const c = greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.8 + f * 0.5);
        if (rnd() < 0.07) c.lerp(new THREE.Color("#eef0ff"), 0.75); // a dusting of snow
        needles.push({ m, c });
      }
    });
    // ornaments on the cone surfaces
    const orn: { p: THREE.Vector3; c: THREE.Color; s: number }[] = [];
    const palette = ["#f4c371", "#d9699f", "#9c7edb", "#f4c371", "#e8a0c8"].map((c) => new THREE.Color(c));
    TIERS.forEach((t, i) => {
      const n = 4 + (TIERS.length - i);
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2 + i * 0.8 + rnd() * 0.3, f = 0.55 + rnd() * 0.4; // how far down the tier
        const rr = t.r * f * 1.12 + 0.12, y = tierY(i) + t.h / 2 - f * t.h - 0.2;
        orn.push({ p: new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr), c: palette[(k + i) % palette.length], s: 0.15 + rnd() * 0.06 });
      }
    });
    // fairy lights: a spiral that follows the cone
    const fl: THREE.Vector3[] = [];
    const N = mobile ? 60 : 96;
    for (let i = 0; i < N; i++) { const u = i / N, y = BASE_Y + 0.5 + u * (TOP_Y - BASE_Y - 0.9), rr = (1 - u) * 1.95 + 0.38; const th = u * Math.PI * 2 * 7; fl.push(new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr)); }
    return {
      bump, foliage, geos, orn, fl, needles, needleGeo: new THREE.ConeGeometry(0.075, 1, 5, 1, true), needleMat: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), poolTex: poolTexture(), glowTex: glowTexture(), shadowTex: shadowTexture(),
      baubleGeo: new THREE.SphereGeometry(1, 14, 10), baubleMat: new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0.35, roughness: 0.28, clearcoat: 0.8, envMapIntensity: 1.6, emissive: "#ffffff", emissiveIntensity: 0.12 }),
      starGeo: starGeometry(0.46, 0.2, 0.14, 0.03), starMat: new THREE.MeshPhysicalMaterial({ color: "#f6c85f", metalness: 0.9, roughness: 0.25, emissive: "#f0a02a", emissiveIntensity: 0.9 }),
      trunk: new THREE.MeshStandardMaterial({ color: "#5a3a28", roughness: 0.9 }), snow: new THREE.MeshStandardMaterial({ color: "#eef0ff", roughness: 0.85 }),
      giftGeo: new RoundedBoxGeometry(1, 1, 1, 3, 0.07), gold: gold(0.32),
      fairyPos: Float32Array.from(fl.flatMap((v) => [v.x, v.y, v.z])), fairyCol: new Float32Array(fl.length * 3),
      glowPos: Float32Array.from(orn.flatMap((o) => [o.p.x * 1.02, o.p.y, o.p.z * 1.02])), glowCol: new Float32Array(orn.length * 3),
    };
  }, [mobile]);
  useEffect(() => () => { dispose(r.bump, r.foliage, r.needleGeo, r.needleMat, r.poolTex, r.glowTex, r.shadowTex, r.baubleGeo, r.baubleMat, r.starGeo, r.starMat, r.trunk, r.snow, r.giftGeo, r.gold, ...r.geos); }, [r]);

  const needleMesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = needleMesh.current; if (!im) return;
    r.needles.forEach((n, i) => { im.setMatrixAt(i, n.m); im.setColorAt(i, n.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [r]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), v: new THREE.Vector3(), q: new THREE.Quaternion() }), []);
  useEffect(() => {
    const im = baubles.current; if (!im) return;
    r.orn.forEach((o, i) => { tmp.m.compose(o.p, tmp.q.identity(), tmp.v.setScalar(o.s)); im.setMatrixAt(i, tmp.m); im.setColorAt(i, tmp.c.set(o.c).multiplyScalar(0.12)); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [r, tmp]);

  useFrame(() => {
    const t = shared.current.t, live = mode === "static" ? DURATION : t;
    // ornaments light one after another, bottom to top; fairy lights chase up the spiral
    const im = baubles.current, bg = baubleGlow.current, fp = fairy.current;
    const n = r.orn.length;
    if (im && bg) {
      for (let i = 0; i < n; i++) {
        const when = 1.6 + (i / n) * 4.6, lit = easeOutCubic(seg(live, when, when + 0.5));
        const tw = 0.85 + 0.15 * Math.sin(live * 3 + i * 1.7);
        const b = 0.12 + 0.88 * lit * tw;
        im.setColorAt(i, tmp.c.set(r.orn[i].c).multiplyScalar(b));
        const g = lit * 0.9 * tw; r.glowCol[i * 3] = r.orn[i].c.r * g; r.glowCol[i * 3 + 1] = r.orn[i].c.g * g; r.glowCol[i * 3 + 2] = r.orn[i].c.b * g;
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      (bg.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    if (fp) {
      const m = r.fl.length;
      for (let i = 0; i < m; i++) {
        const when = 0.8 + (i / m) * 4.2, lit = seg(live, when, when + 0.35), tw = 0.6 + 0.4 * Math.sin(live * 4 + i * 2.3);
        const warmWhite = i % 3 === 0 ? [1, 0.55, 0.7] : i % 3 === 1 ? [1, 0.82, 0.5] : [1, 0.95, 0.8];
        r.fairyCol[i * 3] = warmWhite[0] * lit * tw; r.fairyCol[i * 3 + 1] = warmWhite[1] * lit * tw; r.fairyCol[i * 3 + 2] = warmWhite[2] * lit * tw;
      }
      (fp.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    const starOn = easeOutCubic(seg(live, 6.2, 7.4)), pulse = 0.5 + 0.5 * Math.sin(live * 2.2);
    if (star.current) { star.current.scale.setScalar(Math.max(0.001, starOn)); star.current.rotation.y = live * 0.6; }
    if (starGlow.current) { starGlow.current.scale.setScalar(2.6 + pulse * 0.5); (starGlow.current.material as THREE.SpriteMaterial).opacity = starOn * (0.7 + 0.2 * pulse); }
    if (starLight.current) starLight.current.intensity = starOn * (2.2 + pulse * 0.6);
    if (warm.current) warm.current.intensity = 1.8 * easeOutCubic(seg(live, 1.5, 6.5));
    if (root.current) root.current.rotation.y = 0; // the camera orbits; the tree stays put
  });

  return (
    <>
      <hemisphereLight args={["#9fb8c8", "#1a0f22", 0.42]} />
      <directionalLight position={[4, 6, 5]} intensity={1.15} color="#fff0dc" />
      <directionalLight position={[-5, 3, -3]} intensity={0.9} color="#d969a3" />
      <directionalLight position={[3, 1.5, -5]} intensity={0.6} color="#9c7edb" />
      <pointLight ref={warm} position={[0, 2.4, 2.2]} color="#ffb86b" intensity={0} distance={9} decay={1.5} />
      <group ref={root}>
        {/* snowy ground with a soft contact shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><planeGeometry args={[11, 11]} /><meshBasicMaterial map={r.poolTex} transparent depthWrite={false} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={1}><planeGeometry args={[5.6, 5.6]} /><meshBasicMaterial map={r.shadowTex} transparent depthWrite={false} /></mesh>
        <mesh position={[0, BASE_Y / 2 + 0.05, 0]} material={r.trunk}><cylinderGeometry args={[0.28, 0.36, BASE_Y + 0.4, 16]} /></mesh>
        {TIERS.map((t, i) => <mesh key={i} geometry={r.geos[i]} material={r.foliage} position={[0, tierY(i), 0]} />)}
        <instancedMesh ref={needleMesh} args={[r.needleGeo, r.needleMat, r.needles.length]} frustumCulled={false} />
        <instancedMesh ref={baubles} args={[r.baubleGeo, r.baubleMat, r.orn.length]} />
        <points ref={baubleGlow} frustumCulled={false}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.glowPos, 3]} /><bufferAttribute attach="attributes-color" args={[r.glowCol, 3]} /></bufferGeometry>
          <pointsMaterial map={r.glowTex} size={0.7} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
        </points>
        <points ref={fairy} frustumCulled={false}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.fairyPos, 3]} /><bufferAttribute attach="attributes-color" args={[r.fairyCol, 3]} /></bufferGeometry>
          <pointsMaterial map={r.glowTex} size={0.34} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
        </points>
        <group position={[0, TOP_Y + 0.2, 0]}>
          <mesh ref={star} geometry={r.starGeo} material={r.starMat} />
          <sprite ref={starGlow} scale={2.8}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
          <pointLight ref={starLight} color="#ffd98a" intensity={0} distance={7} decay={1.6} />
        </group>
        {/* presents under the tree */}
        {[[-1.5, 0.3, 1.5, 0.7, "#d9699f", 0.3], [1.35, 0.25, 1.7, 0.55, "#9c7edb", -0.4], [0.2, 0.2, 2.2, 0.42, "#f4c371", 0.8]].map(([x, y, z, s, c, ry], i) => (
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
