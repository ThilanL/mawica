"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clamp01, easeOutBack } from "./timeline";
import type { Shared } from "./rig";
import type { CardMedia } from "../types";

/** Largest photo size inside the frame (scene units). The photo keeps its own aspect ratio. */
export const FRAME_MAX = { w: 1.1, h: 1.05 };

export function fitAspect(w: number, h: number, maxW = FRAME_MAX.w, maxH = FRAME_MAX.h) {
  const a = w / Math.max(1, h);
  return a >= maxW / maxH ? { w: maxW, h: maxW / a } : { w: maxH * a, h: maxH };
}

/** A floating gold frame holding the sender's photo, with a little parallax: the frame tilts toward the pointer while the photo shifts inside it. */
export function MediaFrame({ media, shared, position, mobile }: { media: CardMedia; shared: { current: Shared }; position: [number, number, number]; mobile: boolean }) {
  const group = useRef<THREE.Group>(null);
  const photo = useRef<THREE.Mesh>(null);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [dims, setDims] = useState(() => fitAspect(media.width, media.height));
  const st = useRef({ rx: 0, ry: 0, t: 0 });

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      media.src,
      (t) => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = mobile ? 2 : 4;
        loaded = t;
        const img = t.image as { width: number; height: number };
        setDims(fitAspect(img.width, img.height));
        setTex(t);
      },
      undefined,
      () => { /* a failed photo simply leaves the frame out: the animation carries on */ },
    );
    return () => { alive = false; loaded?.dispose(); };
  }, [media.src, mobile]);

  const mats = useMemo(() => ({
    gold: new THREE.MeshPhysicalMaterial({ color: "#f4c371", metalness: 1, roughness: 0.3, envMapIntensity: 1.3 }),
    mat: new THREE.MeshStandardMaterial({ color: "#fbf3e6", roughness: 0.9 }),
  }), []);
  useEffect(() => () => { mats.gold.dispose(); mats.mat.dispose(); }, [mats]);

  const { w, h } = dims;
  const border = 0.07;
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = group.current;
    if (!g || !tex) return;
    const s = st.current; s.t += dt;
    const pop = easeOutBack(clamp01((shared.current.lumi - 0.35) / 0.65), 1.7);
    g.visible = pop > 0.001;
    g.scale.setScalar(Math.max(0.0001, pop));
    const recent = performance.now() / 1000 - shared.current.lastInput < 3;
    // pointer parallax; without input a slow sway keeps it alive on touch screens
    const tx = recent ? shared.current.px * 0.3 : Math.sin(s.t * 0.55) * 0.12;
    const ty = recent ? -shared.current.py * 0.2 : Math.sin(s.t * 0.4 + 1) * 0.05;
    s.ry += (tx - s.ry) * Math.min(1, dt * 4);
    s.rx += (ty - s.rx) * Math.min(1, dt * 4);
    g.rotation.set(s.rx, s.ry, Math.sin(s.t * 0.5) * 0.015 - 0.03);
    g.position.y = position[1] + Math.sin(s.t * 1.2) * 0.04;
    if (photo.current) photo.current.position.set(s.ry * 0.05, -s.rx * 0.05, 0.04); // parallax: the photo drifts inside its frame
  });

  if (!tex) return null;
  return (
    <group ref={group} position={position} visible={false}>
      <mesh material={mats.gold}><boxGeometry args={[w + border * 2, h + border * 2, 0.05]} /></mesh>
      <mesh material={mats.mat} position={[0, 0, 0.027]}><boxGeometry args={[w + 0.02, h + 0.02, 0.008]} /></mesh>
      <mesh ref={photo} position={[0, 0, 0.04]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}
