import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { starGeometry } from "../stage/gfx";
import { BASE_Y, HEIGHT, PRESENTS, TOP_Y, TREE_DENSITY, fairyLit, frondGeometry, ornamentLit, radiusAt, starOn, treeLayout } from "../stage/cards/tree-model";
import { PANEL_H, sampleClip, twoSided, type ArModel, type ClipExtra } from "./model";

/**
 * "Magical Christmas Tree" as an AR model: the same layout and lighting order as the 3D card (tree-model.ts), adapted to glTF and USDZ.
 *
 * What changes for AR, and why:
 * - About 1.07 m tall from the floor to the tip of the star, standing where the person places it.
 * - A lighter tree: fewer, simpler boughs (TREE_DENSITY.ar), merged into one mesh with real back faces (USDZ has no double-sided flag).
 * - Colours: Quick Look ignores per-vertex colours, so each bough's green and its dark-to-bright shading come from a small baked palette texture.
 * - Transforms only: ornaments can't "light up" (no colour animation), so they pop onto the boughs bottom to top; the garland lights appear along
 *   the spiral and twinkle by pulsing in size; the star grows and turns. No glow sprites, snow or gold dust (no particles or blending).
 */
export const TREE_SCALE = 0.13; // 8.3 units to the top of the star -> ~1.07 m
export const TREE_FROM = 0.6, TREE_DONE = 7.6, TREE_HOLD = 9;
export const TREE_LENGTH = TREE_DONE - TREE_FROM + TREE_HOLD; // 16 s
/** 12 keyframes a second: enough for the pops and the slow twinkle, and it keeps ~100 animated nodes inside the USDZ budget. */
export const TREE_FPS = 12;

/** Bakes each bough's colour × shade into a palette texture and gives the boughs matching UVs (rows: colours, columns: shade). */
function frondPalette(colors: THREE.Color[]) {
  const key = (c: THREE.Color) => [c.r, c.g, c.b].map((v) => Math.round(v * 20)).join(",");
  const rows = new Map<string, number>(), list: THREE.Color[] = [];
  const rowOf = colors.map((c) => { const k = key(c); if (!rows.has(k)) { rows.set(k, list.length); list.push(c); } return rows.get(k)!; });
  const W = 32, RH = 4, H = list.length * RH;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d")!;
  list.forEach((c, r) => { for (let i = 0; i < W; i++) { x.fillStyle = c.clone().multiplyScalar(0.15 + (0.85 * i) / (W - 1)).getStyle(); x.fillRect(i, r * RH, 1, RH); } });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const uv = (row: number, shade: number) => [(Math.round(Math.min(1, Math.max(0, (shade - 0.15) / 0.85)) * (W - 1)) + 0.5) / W, 1 - (row * RH + RH / 2) / H];
  return { tex, rowOf, uv };
}

export function buildTreeAR(): ArModel {
  const { fronds, orn, fl } = treeLayout(TREE_DENSITY.ar);
  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };

  // boughs: one merged, two-sided mesh coloured from the palette
  const pal = frondPalette(fronds.map((f) => f.c)); keep(pal.tex);
  const base = frondGeometry(5);
  const parts = fronds.map((f, i) => {
    const g = base.clone(); g.applyMatrix4(f.m);
    const shade = g.attributes.color as THREE.BufferAttribute, uv = new Float32Array(shade.count * 2);
    for (let v = 0; v < shade.count; v++) uv.set(pal.uv(pal.rowOf[i], shade.getX(v)), v * 2);
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.deleteAttribute("color");
    return g;
  });
  const merged = mergeGeometries(parts)!; parts.forEach((g) => g.dispose()); base.dispose();
  const boughs = keep(twoSided(merged, 0.004)); merged.dispose();
  const boughMat = keep(new THREE.MeshStandardMaterial({ map: pal.tex, roughness: 0.85, metalness: 0 }));

  const root = new THREE.Group(); root.name = "tree";
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => { const o = new THREE.Mesh(g, m); o.name = name; return o; };
  const boughMesh = mesh(boughs, boughMat, "boughs"); root.add(boughMesh);
  const trunk = mesh(keep(new THREE.CylinderGeometry(0.2, 0.3, BASE_Y + 0.5, 12)), keep(new THREE.MeshStandardMaterial({ color: "#4f3323", roughness: 0.92 })), "trunk"); trunk.position.y = BASE_Y / 2 + 0.1; root.add(trunk);
  // the dark core: what shows between the boughs is shadow, not the room behind
  const core = mesh(keep(new THREE.ConeGeometry(radiusAt(0) * 0.62, HEIGHT * 0.94, 12, 1, false)), keep(new THREE.MeshStandardMaterial({ color: "#0b241b", roughness: 1 })), "core"); core.position.y = BASE_Y + HEIGHT * 0.47; root.add(core);

  // ornaments: metallic baubles with gold caps, one node each so they can pop on in order
  const gold = keep(new THREE.MeshStandardMaterial({ color: "#e9b356", metalness: 1, roughness: 0.3 }));
  const ballGeo = keep(new THREE.SphereGeometry(1, 10, 7)), capGeo = keep(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 8));
  const ballMats = new Map<string, THREE.Material>();
  const ornNodes = orn.map((o, i) => {
    const hex = o.c.getHexString(); if (!ballMats.has(hex)) ballMats.set(hex, keep(new THREE.MeshStandardMaterial({ color: o.c, metalness: 0.75, roughness: 0.18 })));
    const g = new THREE.Group(); g.name = `ornament_${i}`; g.position.copy(o.p);
    const ball = mesh(ballGeo, ballMats.get(hex)!, `ornament_${i}_ball`); ball.scale.setScalar(o.s);
    const cap = mesh(capGeo, gold, `ornament_${i}_cap`); cap.position.y = o.s * 1.02; cap.scale.setScalar(o.s);
    g.add(ball, cap); root.add(g); return g;
  });

  // garland lights: small glowing beads along the spiral, warm white, gold and pink like the card
  const beadGeo = keep(new THREE.OctahedronGeometry(0.08, 0));
  const beadMats = [["#ffb3c8", "#ff8cb0"], ["#ffd88a", "#ffc25a"], ["#fff3d6", "#ffe9b8"]].map(([c, e]) => keep(new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 1.6, roughness: 0.4 })));
  const lightNodes = fl.map((p, i) => { const b = mesh(beadGeo, beadMats[i % 3], `light_${i}`); b.position.copy(p); root.add(b); return b; });

  // the star
  const starNode = new THREE.Group(); starNode.name = "star"; starNode.position.set(0, TOP_Y + 0.42, 0);
  starNode.add(mesh(keep(starGeometry(0.5, 0.21, 0.16, 0.035)), keep(new THREE.MeshStandardMaterial({ color: "#f8cf6a", metalness: 0.9, roughness: 0.22, emissive: "#f2a52e", emissiveIntensity: 1.1 })), "star_shape"));
  root.add(starNode);

  // presents under the tree
  const box = keep(new RoundedBoxGeometry(1, 1, 1, 2, 0.07));
  PRESENTS.forEach(([x, y, z, s, c, ry], i) => {
    const g = new THREE.Group(); g.name = `present_${i}`; g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s);
    const bandA = mesh(box, gold, `present_${i}_band_a`); bandA.scale.set(0.16, 1.02, 1.02);
    const bandB = mesh(box, gold, `present_${i}_band_b`); bandB.scale.set(1.02, 1.02, 0.16);
    g.add(mesh(box, keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 })), `present_${i}_box`), bandA, bandB); root.add(g);
  });

  const scene = new THREE.Group(); scene.name = "mawica_christmas_tree"; scene.scale.setScalar(TREE_SCALE); scene.add(root);

  function pose(time: number) {
    const t = TREE_FROM + time;
    ornNodes.forEach((g, i) => { const k = ornamentLit(t, i, ornNodes.length); g.scale.setScalar(Math.max(0.001, k + 0.18 * Math.sin(Math.PI * k))); }); // a small bounce as each one lands
    lightNodes.forEach((b, i) => { const k = fairyLit(t, i, lightNodes.length); b.scale.setScalar(Math.max(0.001, k * (0.8 + 0.25 * Math.sin(t * 4 + i * 2.3)))); });
    const s = starOn(t); starNode.scale.setScalar(Math.max(0.001, s * (1 + 0.04 * Math.sin(t * 2.2)))); starNode.rotation.y = t * 0.6;
  }
  function clip(extra?: ClipExtra) {
    const nodes = [...ornNodes.map((o) => ({ o, props: ["scale"] as const })), ...lightNodes.map((o) => ({ o, props: ["scale"] as const })), { o: starNode, props: ["quaternion", "scale"] as const }, ...(extra?.nodes ?? []).map((o) => ({ o, props: ["position", "quaternion", "scale"] as const }))];
    return sampleClip(nodes, (time) => { pose(time); extra?.pose(time); }, TREE_LENGTH, "light-up", TREE_FPS);
  }

  pose(0);
  scene.updateMatrixWorld(true);
  root.position.y = -new THREE.Box3().setFromObject(root).min.y / TREE_SCALE; // stand exactly on the floor
  const front = (radiusAt(0.35) + 1.2) * TREE_SCALE;
  return {
    scene, pose, clip, length: TREE_LENGTH, fps: TREE_FPS,
    // the wish rises from among the presents to hang in front of the tree once the star is on
    wish: { from: new THREE.Vector3(0, 0.06, 2.4 * TREE_SCALE), to: new THREE.Vector3(0, 0.3 + PANEL_H / 2, front), at: TREE_DONE - TREE_FROM },
    light: { pos: new THREE.Vector3(0, (TOP_Y - 0.6) * TREE_SCALE, 0.22), color: "#ffd98a", range: 1.4, level: (time: number) => 0.6 * starOn(TREE_FROM + time) }, // warm light from the star onto the upper boughs
    dispose() { owned.forEach((o) => o.dispose()); },
  };
}
