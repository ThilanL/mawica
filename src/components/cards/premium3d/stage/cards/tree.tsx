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
const BASE_Y = 0.85, HEIGHT = 6.5, TOP_Y = BASE_Y + HEIGHT;
/** Radius of the tree's silhouette at height fraction v (0 = lowest boughs, 1 = tip). */
const radiusAt = (v: number) => 2.3 * Math.pow(1 - v, 0.88) + 0.1;

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

/** One bough: two crossed, serrated, drooping blades. The saw-tooth edge reads as needles; dark at the trunk, bright at the tip. */
function frondGeometry() {
  const N = 9, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const blade = (roll: number, wide: number) => {
    const o = pos.length / 3, c = Math.cos(roll), s = Math.sin(roll);
    for (let i = 0; i <= N; i++) {
      const u = i / N, w = wide * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.75) * (i % 2 ? 1 : 0.5) + 0.004;
      const sag = -0.3 * u * u + 0.1 * Math.pow(u, 5), shade = 0.22 + 0.78 * Math.pow(u, 0.7);
      for (const k of [-1, 0, 1]) { const x = k * w, y = sag + (k === 0 ? 0.035 * Math.sin(Math.PI * u) : 0); pos.push(x * c - y * s, x * s + y * c, u); const e = k === 0 ? shade * 0.72 : shade; col.push(e, e, e); }
      if (i < N) for (let j = 0; j < 2; j++) { const p = o + i * 3 + j, q = p + 3; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    }
  };
  blade(0, 0.2); blade(Math.PI / 2, 0.11);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Soft halo with four long rays, for the star. */
function flareTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, "rgba(255,246,214,0.95)"); g.addColorStop(0.12, "rgba(255,214,130,0.5)"); g.addColorStop(0.45, "rgba(255,190,100,0.12)"); g.addColorStop(1, "rgba(255,180,90,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.globalCompositeOperation = "lighter";
  for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) { const long = a === 0 || a === Math.PI / 2; x.save(); x.translate(128, 128); x.rotate(a); const r = x.createLinearGradient(-128, 0, 128, 0); r.addColorStop(0, "rgba(255,230,170,0)"); r.addColorStop(0.5, `rgba(255,240,200,${long ? 0.8 : 0.35})`); r.addColorStop(1, "rgba(255,230,170,0)"); x.fillStyle = r; x.scale(long ? 1 : 0.55, 1); x.beginPath(); x.moveTo(-128, 0); x.quadraticCurveTo(0, -5, 128, 0); x.quadraticCurveTo(0, 5, -128, 0); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function Tree({ shared, mobile, mode }: StageSceneProps) {
  const star = useRef<THREE.Mesh>(null), starGlow = useRef<THREE.Sprite>(null), starFlare = useRef<THREE.Sprite>(null), starLight = useRef<THREE.PointLight>(null), warm = useRef<THREE.PointLight>(null);
  const baubles = useRef<THREE.InstancedMesh>(null), caps = useRef<THREE.InstancedMesh>(null), baubleGlow = useRef<THREE.Points>(null), fairy = useRef<THREE.Points>(null), root = useRef<THREE.Group>(null);
  const r = useMemo(() => {
    const rnd = rng(42);
    // boughs: whorls from the lowest, longest, most drooping ones to short upright shoots at the tip, each with its own length, angle and colour
    const fronds: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const up = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), q = new THREE.Quaternion(), roll = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const greens = ["#1a5a3e", "#226b49", "#2d8058", "#1f5f48", "#35906a"].map((c) => new THREE.Color(c)), snowC = new THREE.Color("#e9f0ff");
    const add = (base: THREE.Vector3, th: number, pitch: number, len: number, v: number) => {
      dir.set(Math.cos(th) * Math.cos(pitch), Math.sin(pitch), Math.sin(th) * Math.cos(pitch)); q.setFromUnitVectors(up, dir);
      // keep the wide blade roughly level: roll it about its own length so its width lies across, not up
      const side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)), cur = new THREE.Vector3(1, 0, 0).applyQuaternion(q); roll.setFromAxisAngle(dir, Math.atan2(cur.clone().cross(side).dot(dir), cur.dot(side)) + (rnd() - 0.5) * 0.5); q.premultiply(roll);
      sc.set(len * (0.95 + rnd() * 0.5), len * (0.9 + rnd() * 0.4), len);
      const c = greens[(rnd() * greens.length) | 0].clone().multiplyScalar(0.72 + rnd() * 0.5); if (rnd() < 0.1 + v * 0.08) c.lerp(snowC, 0.16 + rnd() * 0.2);
      fronds.push({ m: new THREE.Matrix4().compose(pos.copy(base), q.clone(), sc.clone()), c });
    };
    const LEVELS = mobile ? 15 : 21;
    for (let l = 0; l < LEVELS; l++) {
      const v = l / (LEVELS - 1), R = radiusAt(v), y = BASE_Y + v * HEIGHT * 0.97, n = Math.round((mobile ? 5 : 7) + (mobile ? 9 : 13) * (1 - v));
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2 + l * 0.9 + (rnd() - 0.5) * 0.35, pitch = lerp(-0.42, 0.75, Math.pow(v, 1.3)) + (rnd() - 0.5) * 0.24, len = R * (0.8 + rnd() * 0.34) + 0.12;
        const base = new THREE.Vector3(Math.cos(th) * 0.1, y + (rnd() - 0.5) * 0.16, Math.sin(th) * 0.1);
        add(base, th, pitch, len, v);
        if (len > 0.9) for (const sgn of [-1, 1]) { // side shoots fill the bough out
          const at = 0.38 + rnd() * 0.22, b2 = base.clone().add(new THREE.Vector3(Math.cos(th) * Math.cos(pitch), Math.sin(pitch) - 0.3 * at * at, Math.sin(th) * Math.cos(pitch)).multiplyScalar(len * at));
          add(b2, th + sgn * (0.5 + rnd() * 0.3), pitch - 0.06, len * (0.5 + rnd() * 0.16), v);
        }
      }
    }
    // ornaments hang just under the tips of the boughs, spread over the whole tree
    const orn: { p: THREE.Vector3; c: THREE.Color; s: number }[] = [];
    const palette = ["#f4c371", "#d9699f", "#9c7edb", "#f6d48a", "#e8a0c8", "#c9a4ff"].map((c) => new THREE.Color(c));
    const rows = mobile ? 7 : 8;
    for (let i = 0; i < rows; i++) {
      const v = 0.06 + (i / rows) * 0.8, n = Math.max(3, Math.round(9 * (1 - v) + 2));
      for (let k = 0; k < n; k++) { const th = (k / n) * Math.PI * 2 + i * 1.1 + (rnd() - 0.5) * 0.3, rr = radiusAt(v) * (0.84 + rnd() * 0.1); orn.push({ p: new THREE.Vector3(Math.cos(th) * rr, BASE_Y + v * HEIGHT - 0.22 * (1 - v) - 0.1, Math.sin(th) * rr), c: palette[(k + i * 2) % palette.length], s: 0.13 + rnd() * 0.06 }); }
    }
    orn.sort((a, b) => a.p.y - b.p.y); // they light from the bottom of the tree to the top
    // fairy lights: a garland that winds up the tree, resting on the boughs
    const fl: THREE.Vector3[] = [], N = mobile ? 70 : 120;
    for (let i = 0; i < N; i++) { const u = i / N, rr = radiusAt(u * 0.94) * 1.0 + 0.04, th = u * Math.PI * 2 * 8; fl.push(new THREE.Vector3(Math.cos(th) * rr, BASE_Y + 0.15 + u * 0.94 * HEIGHT - 0.2 * (1 - u), Math.sin(th) * rr)); }
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
        const when = 1.6 + (i / n) * 4.6, lit = easeOutCubic(seg(live, when, when + 0.5));
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
        const when = 0.8 + (i / m) * 4.2, lit = seg(live, when, when + 0.35), tw = 0.6 + 0.4 * Math.sin(live * 4 + i * 2.3);
        const warmWhite = i % 3 === 0 ? [1, 0.55, 0.7] : i % 3 === 1 ? [1, 0.82, 0.5] : [1, 0.95, 0.8];
        r.fairyCol[i * 3] = warmWhite[0] * lit * tw; r.fairyCol[i * 3 + 1] = warmWhite[1] * lit * tw; r.fairyCol[i * 3 + 2] = warmWhite[2] * lit * tw;
      }
      (fp.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    const starOn = easeOutCubic(seg(live, 6.2, 7.4)), pulse = 0.5 + 0.5 * Math.sin(live * 2.2);
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
        {[[-1.75, 0.36, 1.75, 0.72, "#d9699f", 0.3], [1.6, 0.29, 1.95, 0.58, "#9c7edb", -0.4], [0.15, 0.22, 2.55, 0.44, "#f4c371", 0.8], [-0.75, 0.19, 2.45, 0.38, "#e8a0c8", -0.2]].map(([x, y, z, s, c, ry], i) => (
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
