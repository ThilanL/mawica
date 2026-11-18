import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { easeOutCubic, seg } from "../timeline";
import { AR_FPS, AR_LENGTH, AR_SCALE, buildGiftAR } from "./gift-ar";
import { PANEL_H, PANEL_W, WISH_IN, WISH_RISE, wishTexture } from "./scene";
import type { WishText } from "./wish";

/**
 * iPhone AR (AR Quick Look). Loaded only when the recipient taps "View in AR". Quick Look plays a USDZ file and nothing else (no scripts, no HTML),
 * so the personal wish is baked into a file built **on this phone** from the text already on the card page, handed to Quick Look as an in-memory
 * `blob:` URL, and never uploaded or stored. Quick Look animates transforms only: the wish card rises and grows; it cannot fade or turn to face the
 * viewer, so it faces the front of the gift (Quick Look places the model facing the camera).
 */
export const QL_NOTE = "Read the full message on your card";

/** Builds the personalised USDZ. `reduced`: no animation, the gift already open with the wish in place. */
export async function exportGiftUSDZ(wish: WishText, { reduced = false } = {}): Promise<{ blob: Blob; ms: number; bytes: number; clipped: boolean }> {
  const started = performance.now();
  const gift = buildGiftAR();
  const { texture, clipped } = wishTexture(wish, { note: QL_NOTE });
  const front = new THREE.MeshStandardMaterial({ color: "#ffffff", map: texture, emissive: "#b8b0a8", emissiveMap: texture, roughness: 1, metalness: 0, alphaTest: 0.5 });
  const back = new THREE.MeshStandardMaterial({ color: "#f3e3cc", roughness: 0.9, metalness: 0 });
  const plane = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  try {
    const root = new THREE.Group(); root.name = "mawica_gift";
    root.add(gift.scene);
    const wishNode = new THREE.Group(); wishNode.name = "wish";
    const face = new THREE.Mesh(plane, front); face.name = "wish_front";
    const rear = new THREE.Mesh(plane, back); rear.name = "wish_back"; rear.rotation.y = Math.PI; rear.position.z = -0.001; // the back of the card, so walking round it never shows a hole
    wishNode.add(face, rear); root.add(wishNode);
    const top = gift.anchor.position.clone().multiplyScalar(AR_SCALE).add(new THREE.Vector3(0, PANEL_H / 2 + 0.05, 0.1));
    const start = new THREE.Vector3(0, 0.22, 0);
    const poseWish = (time: number) => {
      const k = easeOutCubic(seg(time, WISH_RISE, WISH_RISE + WISH_IN));
      wishNode.position.lerpVectors(start, top, k);
      wishNode.position.y += Math.sin(time * 1.2) * 0.006 * k;
      wishNode.scale.setScalar(Math.max(0.001, k)); // hidden inside the box until it rises (Quick Look cannot fade)
    };
    const exporter = new USDZExporter();
    let bytes: Uint8Array;
    if (reduced) {
      gift.pose(AR_LENGTH); poseWish(AR_LENGTH);
      root.updateMatrixWorld(true); // USDZExporter writes each node's stored matrix; refresh them after posing
      bytes = await exporter.parseAsync(root, { quickLookCompatible: true });
    } else {
      const clip = gift.clip({ nodes: [wishNode], pose: poseWish });
      gift.pose(0); poseWish(0);
      root.updateMatrixWorld(true);
      bytes = await exporter.parseAsync(root, { quickLookCompatible: true, animations: [clip], animationFrameRate: AR_FPS });
    }
    const blob = new Blob([bytes as BlobPart], { type: "model/vnd.usdz+zip" });
    return { blob, ms: Math.round(performance.now() - started), bytes: blob.size, clipped };
  } finally { gift.dispose(); texture.dispose(); front.dispose(); back.dispose(); plane.dispose(); }
}

/**
 * Opens a USDZ in AR Quick Look. Safari only does this for a link with rel="ar" that contains an image. The banner shows the Mawica ending; tapping
 * its button sends a message event to the returned link (the caller listens, then removes the link). The banner text is fixed and holds no personal data.
 */
export function openQuickLook(url: string) {
  const a = document.createElement("a");
  a.rel = "ar";
  a.href = `${url}#${new URLSearchParams({ checkoutTitle: "mawica.", checkoutSubtitle: "Send your feelings to others", callToAction: "Read your card" }).toString().replace(/\+/g, "%20")}`;
  a.appendChild(document.createElement("img"));
  a.style.display = "none"; document.body.appendChild(a); // stays in the page: Quick Look reports its banner button tap to this element
  a.click();
  return a;
}

/** The message Quick Look posts to the link when its banner button is tapped. */
export const QL_BANNER_TAPPED = "_apple_ar_quicklook_button_tapped";
