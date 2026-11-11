import * as THREE from "three";

/** Small procedural canvas textures: no image downloads, a few hundred KB of GPU memory in total. */
const make = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
};

const SERIF = 'ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif';

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.5) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = "600", style = "italic") {
  let size = start;
  for (; size > 18; size -= 2) { ctx.font = `${style} ${weight} ${size}px ${SERIF}`; if (ctx.measureText(text).width <= maxW) break; }
  return size;
}

/** The card cover: plum, gold foil star, the recipient's name set in 3D paper. */
export function coverTexture(recipient: string, sender: string) {
  return make(1024, 840, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.5, w * 0.8);
    g.addColorStop(0, "#4a2f6e"); g.addColorStop(0.55, "#33204d"); g.addColorStop(1, "#22142f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // faint stars
    for (let i = 0; i < 46; i++) { const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * w, y = (Math.sin(i * 47.3 + 2) * 0.5 + 0.5) * h; ctx.fillStyle = `rgba(255,236,200,${0.12 + (i % 5) * 0.05})`; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, 7); ctx.fill(); }
    // gold foil border
    const gold = ctx.createLinearGradient(0, 0, w, h);
    gold.addColorStop(0, "#c98f3a"); gold.addColorStop(0.35, "#ffe3a8"); gold.addColorStop(0.65, "#e0a850"); gold.addColorStop(1, "#ffefc2");
    ctx.strokeStyle = gold; ctx.lineWidth = 6; ctx.strokeRect(34, 34, w - 68, h - 68);
    ctx.lineWidth = 2; ctx.strokeRect(50, 50, w - 100, h - 100);
    // star
    ctx.save(); ctx.shadowColor = "rgba(255,200,110,0.65)"; ctx.shadowBlur = 36; ctx.fillStyle = gold; star(ctx, w / 2, h * 0.37, 118, 0.52); ctx.fill(); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.25)"; star(ctx, w / 2 - 14, h * 0.37 - 16, 62, 0.52); ctx.fill();
    // names
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f6dca0"; ctx.font = `600 22px ${SERIF}`; (ctx as unknown as { letterSpacing: string }).letterSpacing = "6px";
    ctx.fillText("A WISH FOR", w / 2, h * 0.66); (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
    const size = fitText(ctx, recipient, w - 220, 84);
    ctx.fillStyle = gold; ctx.font = `italic 600 ${size}px ${SERIF}`; ctx.fillText(recipient, w / 2, h * 0.66 + size * 0.95);
    ctx.fillStyle = "rgba(246,220,160,0.8)"; ctx.font = `italic 400 26px ${SERIF}`; ctx.fillText(`from ${sender}`, w / 2, h * 0.9);
  });
}

/** The inside page where the message is set: warm paper with a gold keyline. Text itself is real DOM laid over it. */
export function pageTexture() {
  return make(768, 630, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#fbf3e6"); g.addColorStop(1, "#f1e3cf");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(120,90,60,${Math.random() * 0.035})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } // paper grain
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(90,60,40,0.16)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(201,143,58,0.8)"; ctx.lineWidth = 3; ctx.strokeRect(26, 26, w - 52, h - 52);
    ctx.strokeStyle = "rgba(201,143,58,0.45)"; ctx.lineWidth = 1.2; ctx.strokeRect(36, 36, w - 72, h - 72);
    ctx.fillStyle = "rgba(201,143,58,0.7)"; star(ctx, w / 2, 58, 12, 0.5); ctx.fill();
  });
}

/** The cover's inside face (the upper panel of the opened card): a small night sky Lumi and the photo float in front of. */
export function skyTexture() {
  return make(768, 630, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1f1330"); g.addColorStop(0.6, "#33204d"); g.addColorStop(1, "#4b2f6c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, w * 0.55);
    glow.addColorStop(0, "rgba(244,195,113,0.40)"); glow.addColorStop(1, "rgba(244,195,113,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    const rose = ctx.createRadialGradient(w * 0.12, h * 0.25, 10, w * 0.12, h * 0.25, w * 0.4);
    rose.addColorStop(0, "rgba(217,105,163,0.28)"); rose.addColorStop(1, "rgba(217,105,163,0)");
    ctx.fillStyle = rose; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = (Math.sin(i * 63.1 + 1) * 0.5 + 0.5) * w, y = (Math.sin(i * 29.7) * 0.5 + 0.5) * h; ctx.fillStyle = `rgba(255,240,210,${0.18 + (i % 4) * 0.12})`; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * 0.8, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "rgba(244,195,113,0.7)"; ctx.lineWidth = 3; ctx.strokeRect(26, 26, w - 52, h - 52);
  });
}

/** Soft paper grain used as a bump map on the envelope. */
export function grainTexture() {
  return make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) { const v = 100 + Math.random() * 56; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, false);
}

/** Radial glow sprite. */
export function glowTexture() {
  return make(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,246,222,1)"); g.addColorStop(0.25, "rgba(255,205,120,0.6)"); g.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

/** Vertical light shaft (bright at the bottom, fading up and to the sides). */
export function shaftTexture() {
  return make(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "rgba(255,226,160,0.95)"); g.addColorStop(0.5, "rgba(255,210,130,0.35)"); g.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const m = ctx.createLinearGradient(0, 0, w, 0);
    m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.5, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = m; ctx.fillRect(0, 0, w, h);
  });
}
