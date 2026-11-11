"use client";

/* eslint-disable react-hooks/immutability -- the rig holds Three.js object handles that the frame loop mutates imperatively by design */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { DIM } from "./timeline";
import { coverTexture, pageTexture, skyTexture } from "./textures";
import type { Rig } from "./rig";

const { cardW: W, cardH: H, cardD: D } = DIM;

/**
 * The greeting card: a top-fold card with real thickness. The page stays put; the cover is hinged on the page's top edge and flips forward and
 * up. The cover's outside carries the recipient's name; inside it is a small night sky (where Lumi and the photo float); the message is set on the page.
 * `children` render in the card's local space (Lumi, the photo frame).
 */
export function CardModel({ rig, recipient, sender, children }: { rig: { current: Rig }; recipient: string; sender: string; children?: React.ReactNode }) {
  const r = useMemo(() => {
    const cover = coverTexture(recipient, sender);
    const page = pageTexture();
    const sky = skyTexture();
    sky.center.set(0.5, 0.5); sky.rotation = Math.PI; // the cover's inside face is seen upside-down after the flip
    const paper = (map: THREE.Texture | null, color = "#fff", lift = 0) => new THREE.MeshPhysicalMaterial({ map, color, roughness: 0.78, sheen: 0.35, sheenColor: new THREE.Color("#ffe9cf"), clearcoat: 0.04, emissive: new THREE.Color("#fff3dd"), emissiveMap: map, emissiveIntensity: lift });
    const edgePaper = new THREE.MeshStandardMaterial({ color: "#efe0c9", roughness: 0.9 });
    const edgePlum = new THREE.MeshStandardMaterial({ color: "#2c1b43", roughness: 0.7 });
    const back = new THREE.MeshStandardMaterial({ color: "#e9d9c0", roughness: 0.9 });
    const coverFront = new THREE.MeshPhysicalMaterial({ map: cover, roughness: 0.42, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.28 });
    const geoBox = new THREE.BoxGeometry(W, H, D);
    return {
      cover, page, sky, geoBox,
      pageMats: [edgePaper, edgePaper, edgePaper, edgePaper, paper(page, "#fff", 0.5), back],
      coverMats: [edgePlum, edgePlum, edgePlum, edgePlum, coverFront, paper(sky, "#fff", 0.35)],
      all: [edgePaper, edgePlum, back, coverFront],
    };
  }, [recipient, sender]);

  useEffect(() => () => {
    r.cover.dispose(); r.page.dispose(); r.sky.dispose(); r.geoBox.dispose();
    [...r.pageMats, ...r.coverMats, ...r.all].forEach((m) => m.dispose());
  }, [r]);

  return (
    <group ref={(o) => { rig.current.card = o; }}>
      <mesh geometry={r.geoBox} material={r.pageMats} />
      <group ref={(o) => { rig.current.cover = o; }} position={[0, H / 2, D]}>
        <mesh geometry={r.geoBox} material={r.coverMats} position={[0, -H / 2, 0]} />
      </group>
      {children}
    </group>
  );
}
