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
const LEVEL = 2.2;
const CLINK = 4.9;
const CONFETTI = 64;
const RIM_Y = 2.62, RIM_R = 0.255, TOUCH_TILT = 0.2;
/** Half the distance between the two feet at which the rims just touch for a given tilt (each flute pivots on its foot). */
const touchGap = (tilt: number) => RIM_R * Math.cos(tilt) + RIM_Y * Math.sin(tilt);

export const def: StageSceneDef = {
  duration: DURATION, heroT: 4.95,
  lift: (a) => (a < 0.9 ? 0.2 : 0.13),
  fog: ["#241238", 14, 50],
  camera(t, aspect) {
    const base = fitDistance(3.3, aspect < 0.9 ? 5.9 : 3.9, aspect, 1.0);
    const dist = base * lerp(0.82, 1, easeOutCubic(seg(t, 0, DURATION)));
    const a = 0.16 - 0.2 * easeInOutSine(seg(t, 0, DURATION));
    return { pos: { x: Math.sin(a) * dist, y: 1.9, z: Math.cos(a) * dist }, look: { x: 0, y: 1.5, z: 0 } };
  },
};

/** A tall tulip flute turned on a lathe: thin foot, long slender stem, a bowl that swells and then narrows to the rim. */
function fluteProfile(): THREE.Vector2[] {
  const pts: [number, number][] = [[0, 0.012], [0.3, 0.012], [0.345, 0.004], [0.35, 0.016], [0.3, 0.034], [0.12, 0.062], [0.05, 0.1], [0.036, 0.18], [0.031, 0.5], [0.031, 0.86], [0.038, 0.98], [0.07, 1.06], [0.15, 1.16], [0.225, 1.34], [0.275, 1.6], [0.292, 1.88], [0.286, 2.16], [0.27, 2.42], [RIM_R, RIM_Y]];
  return new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(72);
}
/** Champagne filling the bowl to about four fifths, a hair inside the glass. */
function liquidProfile(level: number): THREE.Vector2[] {
  const pts = fluteProfile().filter((p) => p.y >= 1.08 && p.y <= level).map((p) => new THREE.Vector2(Math.max(0, p.x - 0.014), p.y));
  return [new THREE.Vector2(0, 1.085), ...pts, new THREE.Vector2(0, level)];
}
/** Glass that is nearly invisible face-on and brightens towards its silhouette (Fresnel), and never loses its highlights to transparency. */
function crystal() {
  const m = new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 1, roughness: 0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.6, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", `
      float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.6);
      float spec = dot(totalSpecular, vec3(0.3, 0.5, 0.2));
      diffuseColor.a = clamp(mix(0.075, 0.46, fres) + spec * 0.6, 0.0, 1.0);
      outgoingLight = totalSpecular * 1.2 + vec3(0.9, 0.78, 0.98) * fres * 0.24 + vec3(0.5, 0.45, 0.62) * 0.05;
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "mawica-crystal";
  return m;
}

function Glasses({ shared, mobile, mode }: StageSceneProps) {
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null), flash = useRef<THREE.Sprite>(null), confetti = useRef<THREE.InstancedMesh>(null), sparks = useRef<THREE.Points>(null);
  const r = useMemo(() => {
    const seg = mobile ? 40 : 64, rnd = rng(21);
    // fine beads rising in a few threads from the bottom of the bowl, as they do in a real flute
    const NB = 54, bp = new Float32Array(NB * 3), bph = new Float32Array(NB);
    for (let i = 0; i < NB; i++) { const th = (i % 4) * 1.7 + 0.4, rr = 0.03 + (i % 4) * 0.022; bp[i * 3] = Math.cos(th) * rr; bp[i * 3 + 1] = 1.14 + rnd() * (LEVEL - 1.16); bp[i * 3 + 2] = Math.sin(th) * rr; bph[i] = rnd() * 6.28; }
    const bubbleGeo = new THREE.BufferGeometry(); bubbleGeo.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    const NS = 18;
    const conf = Array.from({ length: mobile ? 40 : CONFETTI }, () => ({ x: (rnd() - 0.5) * 9, y: rnd() * 9, z: -0.6 - rnd() * 4.2 + (rnd() > 0.8 ? 3.4 : 0), sp: 0.3 + rnd() * 0.4, ph: rnd() * 6.28, rs: 0.6 + rnd() * 1.6, c: new THREE.Color(["#f4c371", "#ffd98a", "#e9b356", "#fff1c9", "#f4c371", "#e8a9c4"][(rnd() * 6) | 0]), s: 0.035 + rnd() * 0.03 }));
    return {
      glassGeo: new THREE.LatheGeometry(fluteProfile(), seg), liquidGeo: new THREE.LatheGeometry(liquidProfile(LEVEL), seg), rimGeo: new THREE.TorusGeometry(RIM_R, 0.0075, 8, seg), bph,
      rim: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.02, metalness: 0.2, clearcoat: 1, envMapIntensity: 3, transparent: true, opacity: 0.85 }),
      glass: crystal(), liquid: new THREE.MeshPhysicalMaterial({ color: "#ffb53a", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, emissive: "#ff9d1c", emissiveIntensity: 1.05, transparent: true, opacity: 0.68, envMapIntensity: 1.6, depthWrite: false }),
            glowTex: glowTexture(), poolTex: poolTexture("rgba(255,205,120,0.5)", "rgba(110,60,150,0.22)"), conf, bubbleGeo, bubbleCount: NB,
      confGeo: new THREE.PlaneGeometry(1, 1.6), confMat: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide, envMapIntensity: 1.5 }),
      sp: { pos: new Float32Array(NS * 3), col: new Float32Array(NS * 3), vel: new Float32Array(NS * 3), life: new Float32Array(NS), NS }, fired: false,
    };
  }, [mobile]);
  useEffect(() => () => { dispose(r.bubbleGeo, r.glassGeo, r.liquidGeo, r.rimGeo, r.rim, r.glass, r.liquid, r.glowTex, r.poolTex, r.confGeo, r.confMat); }, [r]);
  useEffect(() => { const im = confetti.current; if (!im) return; r.conf.forEach((c, i) => im.setColorAt(i, c.c)); if (im.instanceColor) im.instanceColor.needsUpdate = true; }, [r]);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05), t = mode === "static" ? DURATION : shared.current.t;
    // the glasses rise, tilt toward each other, meet, recoil a touch, then hover
    const rise = easeOutCubic(seg(t, 0.2, 2.6)), meet = easeInOutCubic(seg(t, 2.8, CLINK)), recoil = Math.sin(Math.min(1, seg(t, CLINK, CLINK + 0.7)) * Math.PI) * 0.1;
    const settle = easeInOutSine(seg(t, CLINK + 0.4, CLINK + 1.6));
    const tilt = lerp(0.06, TOUCH_TILT, meet) * (1 - settle * 0.35);
    const gap = lerp(1.5, touchGap(TOUCH_TILT), meet) + (touchGap(tilt) - touchGap(TOUCH_TILT)) * settle + recoil * 0.6 + settle * 0.1; // the rims meet exactly at the clink, then part a little
    const bob = Math.sin(t * 1.4) * 0.05 * seg(t, 3, 5);
    const y = lerp(-3.4, 0.0, rise) + bob;
    if (left.current) { left.current.position.set(-gap, y, 0); left.current.rotation.set(0, 0.2, -tilt); }
    if (right.current) { right.current.position.set(gap, y, 0); right.current.rotation.set(0, -0.2, tilt); }
    // the clink: a flash and a burst of sparkles at the rims
    const fl = Math.max(0, 1 - Math.abs(t - CLINK - 0.04) * 4);
    const cy = y + RIM_Y * Math.cos(TOUCH_TILT) - RIM_R * Math.sin(TOUCH_TILT);
    if (flash.current) { (flash.current.material as THREE.SpriteMaterial).opacity = fl * 0.85; flash.current.scale.setScalar(0.35 + fl * 0.9); flash.current.position.set(0, cy, 0.3); }
    const sp = r.sp, pts = sparks.current;
    if (pts && mode === "play" && t > CLINK && !r.fired) {
      r.fired = true;
      const rn = rng(77); for (let i = 0; i < sp.NS; i++) { const a = rn() * Math.PI * 2, e = Math.acos(2 * rn() - 1), v = 0.25 + rn() * 0.9; sp.pos[i * 3] = (rn() - 0.5) * 0.06; sp.pos[i * 3 + 1] = cy + (rn() - 0.5) * 0.06; sp.pos[i * 3 + 2] = 0.2; sp.vel[i * 3] = Math.sin(e) * Math.cos(a) * v; sp.vel[i * 3 + 1] = Math.abs(Math.cos(e)) * v + 0.4; sp.vel[i * 3 + 2] = Math.sin(e) * Math.sin(a) * v * 0.5; sp.life[i] = 0.45 + rn() * 0.6; }
    }
    if (pts && t < CLINK - 0.1) r.fired = false;
    if (pts) { for (let i = 0; i < sp.NS; i++) { if (sp.life[i] > 0) { sp.life[i] -= dt; sp.vel[i * 3 + 1] -= 1.8 * dt; sp.pos[i * 3] += sp.vel[i * 3] * dt; sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt; sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt; const f = Math.max(0, Math.min(1, sp.life[i])); sp.col[i * 3] = f; sp.col[i * 3 + 1] = 0.85 * f; sp.col[i * 3 + 2] = 0.5 * f * f; } else { sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; } } (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (pts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
    // bubbles rise inside the liquid (positions are local to each glass)
    { const a = r.bubbleGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < r.bubbleCount; i++) { let yy = a.getY(i) + (0.2 + (i % 5) * 0.035) * dt; if (yy > LEVEL - 0.02) yy = 1.14; const th = (i % 4) * 1.7 + 0.4, rr = 0.03 + (i % 4) * 0.022 + (yy - 1.14) * 0.05; a.setXYZ(i, Math.cos(th) * rr + Math.sin(t * 2 + r.bph[i]) * 0.008, yy, Math.sin(th) * rr); } a.needsUpdate = true; }
    // gold confetti flutters down from the moment of the clink
    const im = confetti.current;
    if (im) {
      const k = seg(t, CLINK - 0.1, CLINK + 0.8);
      r.conf.forEach((c, i) => {
        const fall = Math.max(0, t - (CLINK - 0.1)) * c.sp;
        const yy = 9.5 - ((fall + c.y) % 12);
        tmp.o.position.set(c.x + Math.sin(t * 0.9 + c.ph) * 0.5, yy - 1.5, c.z);
        tmp.o.rotation.set(t * c.rs + c.ph, t * c.rs * 0.7, t * 0.5 + c.ph);
        tmp.o.scale.setScalar(k > 0 ? c.s * 1.5 * Math.min(1, k * 2) : 0.0001);
        tmp.o.updateMatrix(); im.setMatrixAt(i, tmp.o.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });

  const body = (ref: React.RefObject<THREE.Group | null>, withBubbles: boolean) => (
    <group ref={ref}>
      <mesh geometry={r.liquidGeo} material={r.liquid} renderOrder={1} />
      <points geometry={r.bubbleGeo} frustumCulled={false} renderOrder={2}><pointsMaterial map={r.glowTex} size={0.04} sizeAttenuation color="#fff8e2" transparent opacity={0.95} depthWrite={false} depthTest={false} {...ADD_LIGHT} /></points>
      <mesh geometry={r.glassGeo} material={r.glass} renderOrder={3} />
      <mesh geometry={r.rimGeo} material={r.rim} position={[0, RIM_Y, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={4} />
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
        <pointsMaterial map={r.glowTex} size={0.12} sizeAttenuation vertexColors transparent depthWrite={false} {...ADD_LIGHT} />
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
