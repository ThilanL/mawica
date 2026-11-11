"use client";

/* eslint-disable react-hooks/immutability -- the rig holds Three.js object handles that the frame loop mutates imperatively by design */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ADD_LIGHT } from "./Particles";
import { DIM } from "./timeline";
import { glowTexture, grainTexture, shaftTexture } from "./textures";
import type { Rig } from "./rig";

const { envW: W, envH: H } = DIM;
const FLAP_H = H * 0.58;

function polygon(points: [number, number][], depth: number, bevel = 0.005) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
}

function flapShape() {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(W / 2, 0);
  s.lineTo(0.2, -FLAP_H + 0.17);
  s.quadraticCurveTo(0, -FLAP_H - 0.03, -0.2, -FLAP_H + 0.17);
  s.closePath();
  return s;
}

function starGeometry(r: number, depth: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.5;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
}

/** The envelope: midnight plum with a lavender lining, rose wax seal and gold trim. Real thickness: layered, bevelled panels over a back panel. */
export function Envelope({ rig }: { rig: { current: Rig } }) {
  const r = useMemo(() => {
    const grain = grainTexture();
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(3, 2);
    const plum = (hex: string) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.52, metalness: 0.04, sheen: 0.35, sheenColor: new THREE.Color("#d9699f"), sheenRoughness: 0.6, clearcoat: 0.45, clearcoatRoughness: 0.35, bumpMap: grain, bumpScale: 1.1 });
    const mats = {
      plumA: plum("#321852"), plumB: plum("#29133f"), plumC: plum("#200e35"), flap: plum("#3a1c5b"),
      lining: new THREE.MeshPhysicalMaterial({ color: "#7a62ac", roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color("#f0a9cf"), side: THREE.DoubleSide }),
      gold: new THREE.MeshPhysicalMaterial({ color: "#e9b356", metalness: 1, roughness: 0.34, envMapIntensity: 0.9 }),
      rose: new THREE.MeshPhysicalMaterial({ color: "#d9699f", roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color("#ffc1dd") }),
    };
    const geo = {
      back: new THREE.BoxGeometry(W, H, 0.03),
      left: polygon([[-W / 2, -H / 2], [-W / 2, H / 2], [0, -0.05]], 0.012),
      right: polygon([[W / 2, -H / 2], [W / 2, H / 2], [0, -0.05]], 0.012),
      bottom: polygon([[-W / 2, -H / 2], [W / 2, -H / 2], [0, -0.05]], 0.012),
      flap: new THREE.ExtrudeGeometry(flapShape(), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 12 }),
      flapLining: new THREE.ShapeGeometry(flapShape(), 12),
      seal: new THREE.CylinderGeometry(0.19, 0.2, 0.036, 40),
      ring: new THREE.TorusGeometry(0.185, 0.011, 10, 48),
      star: starGeometry(0.105, 0.012),
      glow: new THREE.PlaneGeometry(1, 1),
      shaft: new THREE.PlaneGeometry(1.8, 2.4),
      trim: new THREE.BoxGeometry(Math.hypot(W / 2 - 0.2, FLAP_H - 0.17), 0.014, 0.016),
    };
    const sideLen = Math.hypot(W / 2 - 0.2, FLAP_H - 0.17);
    const sideAngle = Math.atan2(FLAP_H - 0.17, W / 2 - 0.2);
    return { grain, mats, geo, glowTex: glowTexture(), shaftTex: shaftTexture(), sideLen, sideAngle };
  }, []);

  useEffect(() => () => {
    r.grain.dispose(); r.glowTex.dispose(); r.shaftTex.dispose();
    Object.values(r.mats).forEach((m) => m.dispose());
    Object.values(r.geo).forEach((g) => g.dispose());
  }, [r]);

  const { mats, geo } = r;
  const trimY = (side: 1 | -1) => ({ x: (side * (W / 2 + 0.2)) / 2, y: -(FLAP_H - 0.17) / 2 });
  return (
    <group ref={(o) => { rig.current.envelope = o; }}>
      {/* back panel and its lavender lining */}
      <mesh geometry={geo.back} material={mats.plumC} position={[0, 0, -0.015]} />
      <mesh position={[0, 0, 0.001]} material={mats.lining}><planeGeometry args={[W - 0.02, H - 0.02]} /></mesh>
      {/* three folded panels of the pocket, each a little proud of the last */}
      <mesh geometry={geo.left} material={mats.plumA} position={[0, 0, 0.07]} rotation={[0, 0.035, 0]} />
      <mesh geometry={geo.right} material={mats.plumB} position={[0, 0, 0.074]} rotation={[0, -0.035, 0]} />
      <mesh geometry={geo.bottom} material={mats.plumC} position={[0, 0, 0.088]} rotation={[-0.012, 0, 0]} />
      {/* the flap, hinged on the envelope's top edge */}
      <group ref={(o) => { rig.current.flap = o; }} position={[0, H / 2, 0.1]}>
        <mesh geometry={geo.flap} material={mats.flap} />
        <mesh geometry={geo.flapLining} material={mats.lining} position={[0, 0, -0.006]} />
        {([-1, 1] as const).map((s) => (
          <mesh key={s} geometry={geo.trim} material={mats.gold} position={[trimY(s).x, trimY(s).y, 0.021]} rotation={[0, 0, s * r.sideAngle]} />
        ))}
        {/* wax seal with a gold star */}
        <group position={[0, -FLAP_H + 0.26, 0.035]}>
          <mesh geometry={geo.seal} material={mats.rose} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={geo.ring} material={mats.gold} position={[0, 0, 0.012]} />
          <mesh geometry={geo.star} material={mats.gold} position={[0, 0, 0.015]} />
        </group>
      </group>

      {/* golden light spilling from the opening */}
      <mesh ref={(o) => { rig.current.glowShaft = o; }} geometry={geo.shaft} position={[0, H / 2 + 0.55, 0.12]} renderOrder={4}>
        <meshBasicMaterial map={r.shaftTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} />
      </mesh>
      <sprite ref={(o) => { rig.current.glowSprite = o; }} position={[0, H / 2 - 0.3, 0.13]} scale={[4.6, 2.6, 1]} renderOrder={5}>
        <spriteMaterial map={r.glowTex} transparent opacity={0} depthWrite={false} {...ADD_LIGHT} />
      </sprite>
      <pointLight ref={(o) => { rig.current.glowLight = o; }} position={[0, H / 2 - 0.45, 0.05]} color="#ffcf7a" intensity={0} distance={5} decay={1.4} />
    </group>
  );
}
