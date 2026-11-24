import * as THREE from "three";
import { easeOutCubic, seg } from "../timeline";
import { PANEL_H, PANEL_W, WISH_IN, type ArModel } from "./model";
import { layoutWish, type WishText } from "./wish";

export { PANEL_H, PANEL_W, WISH_IN };

/**
 * The live AR scene for Android (WebXR), also used by the non-XR lab preview: a card's AR model (model.ts) plus what only a live renderer can do
 * (a real light, such as the glow inside the gift or the star's light, and the personal wish panel drawn on the phone). Everything personal is built here in memory and never
 * leaves the page.
 */
const TEX_W = 768, TEX_H = Math.round((TEX_W * PANEL_H) / PANEL_W);

function fonts() {
  const css = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const sans = css?.getPropertyValue("--font-jakarta").trim() || "system-ui", serif = css?.getPropertyValue("--font-fraunces").trim() || "Georgia";
  return { sans: `${sans}, system-ui, sans-serif`, serif: `${serif}, Georgia, serif` };
}

/** Draws the wish card: ivory paper, gold edge, "For name", greeting, message excerpt, "With love, sender" and the Mawica wordmark. */
/** `note`: a line shown under a shortened message where no overlay can show the rest (iPhone Quick Look). */
export function wishTexture(w: WishText, opts: { note?: string } = {}) {
  const c = document.createElement("canvas"); c.width = TEX_W; c.height = TEX_H;
  const x = c.getContext("2d")!, f = fonts(), pad = 56, width = TEX_W - pad * 2;
  const font = { small: `600 34px ${f.sans}`, title: `600 64px ${f.serif}`, body: `400 42px ${f.sans}` };
  const measureWith = (spec: string) => (s: string) => { x.font = spec; return x.measureText(s).width; };
  const l = layoutWish(w, width, { small: measureWith(font.small), title: measureWith(font.title), body: measureWith(font.body) });
  // paper with a soft gold border and rounded corners
  const r = 40; x.beginPath(); x.roundRect(6, 6, TEX_W - 12, TEX_H - 12, r);
  const bg = x.createLinearGradient(0, 0, 0, TEX_H); bg.addColorStop(0, "#fffaf0"); bg.addColorStop(1, "#f8ead6"); x.fillStyle = bg; x.fill();
  x.lineWidth = 6; x.strokeStyle = "#d9a64e"; x.stroke();
  x.textAlign = "center"; x.textBaseline = "alphabetic"; x.direction = "ltr";
  let y = pad + 44;
  x.font = font.small; x.fillStyle = "#a0742c"; x.fillText(l.for.toUpperCase(), TEX_W / 2, y); y += 84;
  x.font = font.title; x.fillStyle = "#3a2148"; for (const line of l.greeting) { x.fillText(line, TEX_W / 2, y); y += 72; }
  y += 6; x.fillStyle = "#d9a64e"; x.fillRect(TEX_W / 2 - 50, y - 24, 100, 4); y += 40;
  x.font = font.body; x.fillStyle = "#3d2f45"; x.direction = l.rtl ? "rtl" : "ltr"; for (const line of l.message) { x.fillText(line, TEX_W / 2, y); y += 56; }
  x.direction = "ltr"; // only the message follows its own script direction; labels and the wordmark stay left-to-right
  if (l.clipped && opts.note) { x.font = `500 26px ${f.sans}`; x.fillStyle = "#9a7a5a"; x.fillText(opts.note, TEX_W / 2, y + 6); y += 40; }
  y = Math.max(y + 24, TEX_H - pad - 104);
  x.font = `italic ${font.small}`; x.fillStyle = "#6a4a7a"; x.fillText(l.from, TEX_W / 2, y);
  x.font = `700 40px ${f.serif}`; x.fillStyle = "#8a5fa0"; x.fillText("mawica.", TEX_W / 2, TEX_H - pad + 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { texture: t, clipped: l.clipped };
}

export type ArScene = {
  /** The placed object: put it at the hit-test pose. Its origin is the model's base. */
  root: THREE.Group;
  /** Advances to `time` seconds after placing; turns the wish panel towards `camera`. */
  update(time: number, camera: THREE.Camera, bufferHeight?: number): void;
  /** Whether the panel shows only part of the message (the overlay then offers the full text). */
  clipped: boolean;
  /** The wish card mesh (for tap detection), and whether it has risen enough to be tapped. */
  panel: THREE.Mesh;
  panelShown(): boolean;
  /** Seconds after placing when the wish card is fully in place. */
  wishDone: number;
  dispose(): void;
};

export function createArScene(model: ArModel, wish: WishText, { reduced = false } = {}): ArScene {
  const root = new THREE.Group(); root.name = "mawica_ar_root";
  root.add(model.scene);
  // a real light, which file formats can't carry
  const light = model.light ? new THREE.PointLight(model.light.color, 0, model.light.range, 1.6) : null;
  if (light && model.light) { light.position.copy(model.light.pos); root.add(light); }
  const { texture, clipped } = wishTexture(wish);
  const panelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false });
  const ps = model.wish.scale ?? 1, panelGeo = new THREE.PlaneGeometry(PANEL_W * ps, PANEL_H * ps);
  const panel = new THREE.Mesh(panelGeo, panelMat); panel.name = "wish_panel"; panel.renderOrder = 3;
  const pivot = new THREE.Group(); pivot.add(panel); root.add(pivot);
  const { from: start, to: top, at: rise } = model.wish;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  function update(time: number, camera: THREE.Camera, bufferHeight = 1600) {
    const t = reduced ? model.length + WISH_IN : time;
    model.pose(Math.min(t, 600));
    model.live?.(t, camera, bufferHeight); // what only a live renderer can do (the snow globe's falling snow, smoke and storm)
    if (light && model.light) light.intensity = model.light.level(t) * 1.2;
    const k = easeOutCubic(seg(t, rise, rise + WISH_IN));
    pivot.position.lerpVectors(start, top, k);
    pivot.position.y += Math.sin(t * 1.2) * 0.006 * k;
    pivot.scale.setScalar(0.15 + 0.85 * k);
    panelMat.opacity = Math.min(1, k * 1.4);
    pivot.visible = k > 0;
    // turn the card towards the viewer (yaw only, so it stays upright)
    camera.getWorldPosition(camPos); root.worldToLocal(look.copy(camPos));
    pivot.rotation.y = Math.atan2(look.x - pivot.position.x, look.z - pivot.position.z);
  }
  update(0, new THREE.PerspectiveCamera());
  return { root, update, clipped, panel, wishDone: rise + WISH_IN, panelShown: () => pivot.visible && panelMat.opacity > 0.6, dispose() { model.dispose(); texture.dispose(); panelMat.dispose(); panelGeo.dispose(); } };
}
