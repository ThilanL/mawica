import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { unzipSync, zipSync } from "three/addons/libs/fflate.module.js";
import { engravingLines } from "../stage/cards/globe/engraving";
import { engravingMask } from "../stage/cards/globe/textures";
import { easeOutCubic, seg } from "../timeline";
import { buildGlobeAR, type GlobeAR } from "./globe-ar";
import { PANEL_H, PANEL_W, WISH_IN } from "./model";
import { wishTexture } from "./scene";
import type { WishText } from "./wish";

/**
 * iPhone AR for the snow globe (AR Quick Look). Building and exporting the whole globe on a phone would take seconds and a lot of memory, so:
 * 1. Ahead of time (dev, `scripts/globe/export-ar.mjs`), the generic globe is exported once with a blank engraving and a blank wish card, plus a
 *    small manifest naming the two texture files inside it.
 * 2. On the recipient's phone, only those two pictures are drawn (their names, greeting and message) and swapped into the file. Nothing personal
 *    is uploaded or stored; the result is handed to Quick Look as an in-memory blob, as for the other cards.
 */
export const GLOBE_USDZ = { animated: "/ar/snow-globe.usdz", still: "/ar/snow-globe-still.usdz" } as const;
export type GlobeUsdzManifest = { engraving: string; wish: string; bytes: number; version: 1 };
const MAX_TEXTURE = 256; // generic textures: the globe is 22 cm, so 256 px is plenty; the personal pictures are written at full size
export const QL_NOTE = "Read the full message on your card";

/** The rising wish card (front and back), sized for the globe; returns the node and its pose over the clip. */
function wishNode(model: GlobeAR, texture: THREE.Texture) {
  const s = model.wish.scale ?? 1, plane = new THREE.PlaneGeometry(PANEL_W * s, PANEL_H * s);
  const front = new THREE.MeshStandardMaterial({ name: "wish_front", color: "#ffffff", map: texture, emissive: "#b8b0a8", emissiveMap: texture, roughness: 1, metalness: 0, alphaTest: 0.5 });
  const back = new THREE.MeshStandardMaterial({ name: "wish_back", color: "#f3e3cc", roughness: 0.9, metalness: 0 });
  const node = new THREE.Group(); node.name = "wish";
  const face = new THREE.Mesh(plane, front); face.name = "wish_front";
  const rear = new THREE.Mesh(plane, back); rear.name = "wish_back"; rear.rotation.y = Math.PI; rear.position.z = -0.001;
  node.add(face, rear);
  const { from, to, at } = model.wish;
  const pose = (time: number) => { const k = easeOutCubic(seg(time, at, at + WISH_IN)); node.position.lerpVectors(from, to, k); node.position.y += Math.sin(time * 1.2) * 0.004 * k; node.scale.setScalar(Math.max(0.001, k)); };
  return { node, pose, dispose() { plane.dispose(); front.dispose(); back.dispose(); } };
}

const fileOf = (t: THREE.Texture) => `textures/Texture_${t.source.id}_${t.flipY}.png`;

/** Dev only: the generic (non-personal) USDZ and its manifest. `reduced`: the finished scene without animation. */
export async function exportGenericGlobeUSDZ({ reduced = false, assets }: { reduced?: boolean; assets?: string } = {}) {
  const model = await buildGlobeAR({ assets });
  const blankWish = (() => { const c = document.createElement("canvas"); c.width = 768; c.height = Math.round((768 * PANEL_H) / PANEL_W); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const w = wishNode(model, blankWish);
  try {
    const root = new THREE.Group(); root.name = "mawica_snow_globe"; root.add(model.scene, w.node);
    const exporter = new USDZExporter(), opts = { quickLookCompatible: true, maxTextureSize: MAX_TEXTURE };
    let bytes: Uint8Array;
    if (reduced) { model.pose(0); w.pose(model.length); root.updateMatrixWorld(true); bytes = await exporter.parseAsync(root, opts); }
    else { const clip = model.clip({ nodes: [w.node], pose: w.pose }); model.pose(0); w.pose(0); root.updateMatrixWorld(true); bytes = await exporter.parseAsync(root, { ...opts, animations: [clip], animationFrameRate: model.fps }); }
    const engTex = (model.engraving.material as THREE.MeshStandardMaterial).alphaMap!;
    const manifest: GlobeUsdzManifest = { engraving: fileOf(engTex), wish: fileOf(blankWish), bytes: bytes.byteLength, version: 1 };
    const names = Object.keys(unzipSync(bytes));
    if (!names.includes(manifest.engraving) || !names.includes(manifest.wish)) throw new Error("personal textures not found in the export");
    return { bytes, manifest };
  } finally { w.dispose(); blankWish.dispose(); model.dispose(); }
}

/** A picture as PNG bytes, stored the way the exporter stores textures (flipped vertically when the texture is). */
async function png(image: HTMLCanvasElement, flipY: boolean) {
  const c = document.createElement("canvas"); c.width = image.width; c.height = image.height; const x = c.getContext("2d")!;
  if (flipY) { x.translate(0, c.height); x.scale(1, -1); }
  x.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("png"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Replaces files inside a USDZ and writes it back as Quick Look requires: stored (no compression), the model file first, every file's data
 * aligned to 64 bytes (the same rule USDZExporter follows).
 */
export function replaceInUsdz(usdz: Uint8Array, replace: Record<string, Uint8Array>) {
  const files = unzipSync(usdz) as Record<string, Uint8Array>;
  for (const [name, data] of Object.entries(replace)) { if (!(name in files)) throw new Error(`no ${name} in file`); files[name] = data; }
  const out: Record<string, Uint8Array | [Uint8Array, { extra: Record<number, Uint8Array> }]> = {};
  let offset = 0;
  for (const name of Object.keys(files)) {
    const file = files[name], header = 34 + name.length;
    offset += header;
    const mod = offset & 63;
    if (mod !== 4) { const pad = new Uint8Array(64 - mod); out[name] = [file, { extra: { 12345: pad } }]; } else out[name] = file;
    offset = file.length;
  }
  return zipSync(out as Parameters<typeof zipSync>[0], { level: 0, mtime: new Date() });
}

/** On the phone: the generic globe with this card's engraving and wish swapped in. */
export async function exportGlobeUSDZ(wish: WishText, { reduced = false } = {}): Promise<{ blob: Blob; ms: number; bytes: number; clipped: boolean }> {
  const started = performance.now(), url = reduced ? GLOBE_USDZ.still : GLOBE_USDZ.animated;
  const [file, manifest] = await Promise.all([
    fetch(url).then((r) => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.arrayBuffer(); }),
    fetch(`${url}.json`).then((r) => { if (!r.ok) throw new Error("manifest"); return r.json() as Promise<GlobeUsdzManifest>; }),
  ]);
  const eng = engravingMask(engravingLines(wish.name, wish.sender));
  const { texture: wt, clipped } = wishTexture(wish, { note: QL_NOTE });
  try {
    const bytes = replaceInUsdz(new Uint8Array(file), {
      [manifest.engraving]: await png(eng.image as HTMLCanvasElement, eng.flipY),
      [manifest.wish]: await png(wt.image as HTMLCanvasElement, wt.flipY),
    });
    const blob = new Blob([bytes as BlobPart], { type: "model/vnd.usdz+zip" });
    return { blob, ms: Math.round(performance.now() - started), bytes: blob.size, clipped };
  } finally { eng.dispose(); wt.dispose(); }
}
