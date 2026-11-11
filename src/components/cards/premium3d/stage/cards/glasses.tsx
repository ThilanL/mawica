"use client";

/* eslint-disable react-hooks/immutability -- frame loop: Three.js objects are mutated imperatively by design */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ADD_LIGHT, Particles } from "../../Particles";
import { glowTexture } from "../../textures";
import { easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, fitDistance, lerp, seg } from "../../timeline";
import { dispose, poolTexture, rng } from "../gfx";
import { GOLD_DUST } from "../presets";
import type { StageSceneDef, StageSceneModule, StageSceneProps } from "../types";

const DURATION = 11;
const CLINK = 4.9;
const CONFETTI = 150;

export const def: StageSceneDef = {
  duration: DURATION, heroT: 6.2,
  lift: (a) => (a < 0.9 ? 0.2 : 0.13),
  fog: ["#241238", 14, 50],
  camera(t, aspect) {
    const base = fitDistance(4.6, 4.6 * (aspect < 0.9 ? 2.0 : 1.55), aspect, 1.0);
    const dist = base * lerp(0.82, 1, easeOutCubic(seg(t, 0, DURATION)));
    const a = 0.16 - 0.2 * easeInOutSine(seg(t, 0, DURATION));
    return { pos: { x: Math.sin(a) * dist, y: 1.7, z: Math.cos(a) * dist }, look: { x: 0, y: 1.35, z: 0 } };
  },
};

/** A champagne flute turned on a lathe: bowl, stem and foot. `inset` shrinks it for the liquid inside. */
function fluteProfile(inset = 0, top = 2.35): THREE.Vector2[] {
  const pts: [number, number][] = [[0.0, 0.0], [0.44, 0.0], [0.46, 0.04], [0.4, 0.09], [0.1, 0.2], [0.05, 0.3], [0.045, 0.7], [0.07, 0.86], [0.2, 1.02], [0.34, 1.32], [0.4, 1.7], [0.41, 2.05], [0.4, top]];
  return pts.map(([x, y]) => new THREE.Vector2(inset && y > 0.9 ? Math.max(0, x - inset) : x, y));
}

function Glasses({ shared, mobile, mode }: StageSceneProps) {
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null), flash = useRef<THREE.Sprite>(null), confetti = useRef<THREE.InstancedMesh>(null), sparks = useRef<THREE.Points>(null);
  const r = useMemo(() => {
    const seg = mobile ? 40 : 64, rnd = rng(21);
    const NB = 30, bp = new Float32Array(NB * 3);
    for (let i = 0; i < NB; i++) { const rr = Math.sqrt(rnd()) * 0.26, th = rnd() * 6.28; bp[i * 3] = Math.cos(th) * rr; bp[i * 3 + 1] = 1.1 + rnd() * 0.75; bp[i * 3 + 2] = Math.sin(th) * rr; }
    const bubbleGeo = new THREE.BufferGeometry(); bubbleGeo.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    const NS = 60;
    const conf = Array.from({ length: mobile ? 90 : CONFETTI }, () => ({ x: (rnd() - 0.5) * 9, y: rnd() * 9, z: (rnd() - 0.5) * 5, sp: 0.5 + rnd() * 0.8, ph: rnd() * 6.28, rs: 1 + rnd() * 3, c: new THREE.Color(["#f4c371", "#ffd98a", "#d9699f", "#9c7edb", "#fff1c9"][(rnd() * 5) | 0]), s: 0.05 + rnd() * 0.05 }));
    return {
      glassGeo: new THREE.LatheGeometry(fluteProfile(), seg), liquidGeo: new THREE.LatheGeometry([[0, 1.06], [0.13, 1.08], [0.25, 1.2], [0.32, 1.42], [0.355, 1.75], [0.36, 1.92]].map(([x, y]) => new THREE.Vector2(x, y)), seg),
      glass: new THREE.MeshPhysicalMaterial({ color: "#f4efff", transparent: true, opacity: 0.22, roughness: 0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 3.6, side: THREE.DoubleSide, depthWrite: false, specularIntensity: 1, emissive: "#b9a4ee", emissiveIntensity: 0.04 }), liquid: new THREE.MeshPhysicalMaterial({ color: "#f3cf7a", roughness: 0.12, clearcoat: 0.6, emissive: "#d99b3a", emissiveIntensity: 0.28, transparent: true, opacity: 0.92 }),
            glowTex: glowTexture(), poolTex: poolTexture("rgba(255,205,120,0.5)", "rgba(110,60,150,0.22)"), conf, bubbleGeo, bubbleCount: NB,
      confGeo: new THREE.PlaneGeometry(1, 1.6), confMat: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide, envMapIntensity: 1.5 }),
      sp: { pos: new Float32Array(NS * 3), col: new Float32Array(NS * 3), vel: new Float32Array(NS * 3), life: new Float32Array(NS), NS }, fired: false,
    };
  }, [mobile]);
  useEffect(() => () => { dispose(r.bubbleGeo, r.glassGeo, r.liquidGeo, r.glass, r.liquid, r.glowTex, r.poolTex, r.confGeo, r.confMat); }, [r]);
  useEffect(() => { const im = confetti.current; if (!im) return; r.conf.forEach((c, i) => im.setColorAt(i, c.c)); if (im.instanceColor) im.instanceColor.needsUpdate = true; }, [r]);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05), t = mode === "static" ? DURATION : shared.current.t;
    // the glasses rise, tilt toward each other, meet, recoil a touch, then hover
    const rise = easeOutCubic(seg(t, 0.2, 2.6)), meet = easeInOutCubic(seg(t, 2.8, CLINK)), recoil = Math.sin(Math.min(1, seg(t, CLINK, CLINK + 0.7)) * Math.PI) * 0.1;
    const settle = easeInOutSine(seg(t, CLINK + 0.4, CLINK + 1.6));
    const gap = lerp(2.0, 1.2, meet) + recoil + settle * 0.16; // rims touch when each flute has tilted about 0.34 rad (rim x offset = 2.35 * sin(tilt))
    const tilt = lerp(0.12, 0.34, meet) * (1 - settle * 0.4);
    const bob = Math.sin(t * 1.4) * 0.05 * seg(t, 3, 5);
    const y = lerp(-3.4, 0.0, rise) + bob;
    if (left.current) { left.current.position.set(-gap, y, 0); left.current.rotation.set(0, 0.25, -tilt); }
    if (right.current) { right.current.position.set(gap, y, 0.1); right.current.rotation.set(0, -0.25, tilt); }
    // the clink: a flash and a burst of sparkles at the rims
    const fl = Math.max(0, 1 - Math.abs(t - CLINK - 0.05) * 3.2);
    if (flash.current) { (flash.current.material as THREE.SpriteMaterial).opacity = fl; flash.current.scale.setScalar(1.2 + fl * 3.2); flash.current.position.set(0, 2.3, 0.2); }
    const sp = r.sp, pts = sparks.current;
    if (pts && mode === "play" && t > CLINK && !r.fired) {
      r.fired = true;
      const rn = rng(77); for (let i = 0; i < sp.NS; i++) { const a = rn() * Math.PI * 2, e = Math.acos(2 * rn() - 1), v = 0.6 + rn() * 2.4; sp.pos[i * 3] = (rn() - 0.5) * 0.3; sp.pos[i * 3 + 1] = 2.3 + (rn() - 0.5) * 0.2; sp.pos[i * 3 + 2] = 0.1; sp.vel[i * 3] = Math.sin(e) * Math.cos(a) * v; sp.vel[i * 3 + 1] = Math.abs(Math.cos(e)) * v + 0.4; sp.vel[i * 3 + 2] = Math.sin(e) * Math.sin(a) * v * 0.5; sp.life[i] = 0.7 + rn() * 0.9; }
    }
    if (pts && t < CLINK - 0.1) r.fired = false;
    if (pts) { for (let i = 0; i < sp.NS; i++) { if (sp.life[i] > 0) { sp.life[i] -= dt; sp.vel[i * 3 + 1] -= 1.8 * dt; sp.pos[i * 3] += sp.vel[i * 3] * dt; sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt; sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt; const f = Math.max(0, Math.min(1, sp.life[i])); sp.col[i * 3] = f; sp.col[i * 3 + 1] = 0.85 * f; sp.col[i * 3 + 2] = 0.5 * f * f; } else { sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; } } (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (pts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
    // bubbles rise inside the liquid (positions are local to each glass)
    { const a = r.bubbleGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < r.bubbleCount; i++) { let yy = a.getY(i) + (0.3 + (i % 5) * 0.07) * dt; if (yy > 1.86) yy = 1.1; a.setY(i, yy); } a.needsUpdate = true; }
    // gold confetti flutters down from the moment of the clink
    const im = confetti.current;
    if (im) {
      const k = seg(t, CLINK - 0.1, CLINK + 0.8);
      r.conf.forEach((c, i) => {
        const fall = Math.max(0, t - (CLINK - 0.1)) * c.sp * 1.1;
        const yy = 9.5 - ((fall + c.y) % 12);
        tmp.o.position.set(c.x + Math.sin(t * 0.9 + c.ph) * 0.5, yy - 1.5, c.z);
        tmp.o.rotation.set(t * c.rs + c.ph, t * c.rs * 0.7, t * 0.5 + c.ph);
        tmp.o.scale.setScalar(k > 0 ? c.s * 1.6 * Math.min(1, k * 2) : 0.0001);
        tmp.o.updateMatrix(); im.setMatrixAt(i, tmp.o.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });

  const body = (ref: React.RefObject<THREE.Group | null>, withBubbles: boolean) => (
    <group ref={ref}>
      <mesh geometry={r.liquidGeo} material={r.liquid} />
      <mesh geometry={r.glassGeo} material={r.glass} />
      <points geometry={r.bubbleGeo} frustumCulled={false}><pointsMaterial map={r.glowTex} size={0.07} sizeAttenuation color="#fff4d0" transparent opacity={0.85} depthWrite={false} {...ADD_LIGHT} /></points>
      {withBubbles && null}
    </group>
  );
  return (
    <>
      <hemisphereLight args={["#b79cf2", "#2a1640", 0.45]} />
      <directionalLight position={[4, 5, 6]} intensity={1.4} color="#fff2dc" />
      <directionalLight position={[-5, 2, -4]} intensity={1.2} color="#ffb347" />
      <directionalLight position={[5, 1, -3]} intensity={0.9} color="#d9699f" />
      <pointLight position={[0, 2.2, 2]} color="#ffd9a0" intensity={1.4} distance={8} decay={1.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}><planeGeometry args={[14, 8]} /><meshBasicMaterial map={r.poolTex} transparent opacity={0.8} depthWrite={false} /></mesh>
      {body(left, true)}
      {body(right, false)}
      <sprite ref={flash} position={[0, 2.2, 0.2]} scale={1}><spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} /></sprite>
      <points ref={sparks} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[r.sp.pos, 3]} /><bufferAttribute attach="attributes-color" args={[r.sp.col, 3]} /></bufferGeometry>
        <pointsMaterial map={r.glowTex} size={0.34} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
      </points>
      <instancedMesh ref={confetti} args={[r.confGeo, r.confMat, r.conf.length]} frustumCulled={false} />
      {mode === "play" && <Particles preset={GOLD_DUST} mobile={mobile} shared={shared} />}
    </>
  );
}

void easeOutBack;
const mod: StageSceneModule = { def, Scene: Glasses };
export default mod;
export const Scene = Glasses;
