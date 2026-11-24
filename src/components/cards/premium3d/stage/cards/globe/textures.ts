import * as THREE from "three";
import { rng } from "../../gfx";

/**
 * Textures the snow globe draws for itself (no download): fir needle cards, a knitted wool normal map, the snow path and footprints, and the
 * engraved text on the back of the base. All deterministic (seeded), so every render and thumbnail is identical.
 */
const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return { c, x: c.getContext("2d")! }; };
const finish = (c: HTMLCanvasElement, srgb: boolean, wrap = false) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/**
 * A fir bough seen from above: a woody twig with side twigs, each covered in short, slightly curved needles, dark near the stem and fresh green
 * at the tips. Drawn with alpha so the card's outline is the needles themselves (alpha-tested, never a visible rectangle).
 * `snow`: lumps of snow resting along the twigs (for the outer pines and the tops of the boughs).
 */
export function needleTexture(snow: boolean, size = 512) {
  const { c, x } = canvas(size, size), rnd = rng(snow ? 77 : 41), W = size, H = size;
  x.clearRect(0, 0, W, H);
  x.lineCap = "round";
  const needle = (px: number, py: number, ang: number, len: number, shade: number) => {
    const g = Math.round(46 + 70 * shade), r = Math.round(18 + 30 * shade), b = Math.round(26 + 34 * shade);
    x.strokeStyle = `rgb(${r},${g},${b})`; x.lineWidth = W * 0.0065;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(ang) * len * 0.5 + Math.cos(ang + 1.57) * len * 0.08, py + Math.sin(ang) * len * 0.5 + Math.sin(ang + 1.57) * len * 0.08, px + Math.cos(ang) * len, py + Math.sin(ang) * len);
    x.stroke();
  };
  const twig = (x0: number, y0: number, x1: number, y1: number, nlen: number, depth: number) => {
    const ang = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), n = Math.round(L / (W * 0.006));
    for (let i = 0; i < n; i++) {
      const u = i / n, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u, taper = 1 - 0.55 * u ** 1.5;
      for (const side of [-1, 1]) {
        const a = ang + side * (0.75 + rnd() * 0.35) - 0.25 * side * u, len = nlen * taper * (0.8 + rnd() * 0.4);
        needle(px, py, a, len, 0.25 + 0.75 * u * (0.7 + rnd() * 0.3));
      }
      if (rnd() < 0.5) needle(px, py, ang + (rnd() - 0.5) * 0.6, nlen * 0.7 * taper, 0.5 + 0.5 * u); // needles lying along the twig
    }
    x.strokeStyle = "#4a3022"; x.lineWidth = W * 0.008 * (depth ? 0.6 : 1); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  };
  // main twig from the bottom (where it joins the trunk) to the tip, with side twigs that get shorter towards the tip
  const nlen = W * 0.07;
  for (let i = 0; i < 9; i++) {
    const u = 0.12 + i * 0.09, py = H * (1 - u), side = i % 2 ? 1 : -1, len = W * (0.36 - 0.27 * u);
    twig(W / 2, py, W / 2 + side * len, py - len * 0.55, nlen * (1 - 0.35 * u), 1);
  }
  twig(W / 2, H * 0.98, W / 2, H * 0.04, nlen, 0);
  if (snow) {
    for (let i = 0; i < 70; i++) {
      const px = W * (0.2 + rnd() * 0.6), py = H * (0.1 + rnd() * 0.8), r = W * (0.012 + rnd() * 0.026);
      const g = x.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(232,238,250,0.95)"); g.addColorStop(1, "rgba(210,220,240,0)");
      x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r * 1.4, r, rnd() * 3, 0, Math.PI * 2); x.fill();
    }
  }
  return finish(c, true);
}

/** Knitted wool (stocking stitch) as a normal map: rows of little V-shaped loops. Tiles. */
export function knitNormal(size = 128) {
  const { c, x } = canvas(size, size), cols = 16, rows = 22, cw = size / cols, rh = size / rows;
  const img = x.createImageData(size, size);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = (px % cw) / cw, v = (py % rh) / rh, side = u < 0.5 ? -1 : 1, lu = u < 0.5 ? u * 2 : (u - 0.5) * 2;
    // each half of the V is a slanted, rounded strand
    const d = (lu - 0.5) + side * (v - 0.5) * 0.6, h = Math.cos(Math.min(1, Math.abs(d) * 2.2) * Math.PI / 2);
    const nx = -Math.sign(d) * (1 - h) * 0.9 * side, ny = (v - 0.5) * 0.6;
    const i = (py * size + px) * 4;
    img.data[i] = 128 + nx * 110; img.data[i + 1] = 128 - ny * 110; img.data[i + 2] = 200 + h * 55; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return finish(c, false, true);
}

/**
 * The ground's detail map, laid over the whole snow disc (UV = position on the disc): a trodden path with footprints in pairs (normal map) and
 * a matching AO map that darkens the prints and the edges of the path a little.
 */
export function pathMaps(path: readonly (readonly [number, number])[], discR: number, size = 1024) {
  const toPx = (v: number) => ((v / discR) * 0.5 + 0.5) * size;
  const height = canvas(size, size);
  const hx = height.x;
  hx.fillStyle = "#808080"; hx.fillRect(0, 0, size, size);
  // the path: a soft trough
  hx.lineCap = "round"; hx.lineJoin = "round";
  for (const [w, col] of [[0.026, "#787878"], [0.016, "#707070"]] as const) {
    hx.strokeStyle = col; hx.lineWidth = (w / (discR * 2)) * size; hx.filter = `blur(${size * 0.006}px)`;
    hx.beginPath(); path.forEach(([px, pz], i) => (i ? hx.lineTo(toPx(px), toPx(pz)) : hx.moveTo(toPx(px), toPx(pz)))); hx.stroke();
  }
  hx.filter = "none";
  // footprints: pairs of small ovals along the path, alternating left and right
  const rnd = rng(9);
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], len = Math.hypot(bx - ax, bz - az), steps = Math.round(len / 0.0042), ang = Math.atan2(bz - az, bx - ax);
    for (let s = 0; s < steps; s++) {
      const u = s / steps, side = s % 2 ? 1 : -1, off = 0.0016 * side;
      const fx = ax + (bx - ax) * u - Math.sin(ang) * off, fz = az + (bz - az) * u + Math.cos(ang) * off;
      hx.save(); hx.translate(toPx(fx), toPx(fz)); hx.rotate(ang + (rnd() - 0.5) * 0.2);
      const g = hx.createRadialGradient(0, 0, 0, 0, 0, size * 0.006); g.addColorStop(0, "#4a4a4a"); g.addColorStop(1, "rgba(112,112,112,0)");
      hx.fillStyle = g; hx.beginPath(); hx.ellipse(0, 0, size * 0.0062, size * 0.0034, 0, 0, Math.PI * 2); hx.fill(); hx.restore();
    }
  }
  // height -> normal (Sobel), and height -> AO
  const src = hx.getImageData(0, 0, size, size).data, nrm = canvas(size, size), ao = canvas(size, size);
  const ni = nrm.x.createImageData(size, size), ai = ao.x.createImageData(size, size);
  const at = (px: number, py: number) => src[(((py + size) % size) * size + ((px + size) % size)) * 4] / 255;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const dx = (at(px + 1, py) - at(px - 1, py)) * 6, dy = (at(px, py + 1) - at(px, py - 1)) * 6, i = (py * size + px) * 4;
    const l = Math.hypot(dx, dy, 1);
    ni.data[i] = 128 - (dx / l) * 127; ni.data[i + 1] = 128 + (dy / l) * 127; ni.data[i + 2] = 128 + (1 / l) * 127; ni.data[i + 3] = 255;
    const a = Math.min(1, 0.55 + at(px, py) * 0.9); ai.data[i] = ai.data[i + 1] = ai.data[i + 2] = a * 255; ai.data[i + 3] = 255;
  }
  nrm.x.putImageData(ni, 0, 0); ao.x.putImageData(ai, 0, 0);
  return { normal: finish(nrm.c, false), ao: finish(ao.c, false) };
}

/**
 * Engraving on the back of the base: personal text set in the display serif, white on black, used as the alpha mask of a gold decal.
 * Up to three short lines; the caller passes text already clamped (ar/wish.ts capText).
 */
export function engravingMask(lines: string[], w = 1024, h = 256) {
  const { c, x } = canvas(w, h);
  x.fillStyle = "#000"; x.fillRect(0, 0, w, h);
  const css = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const serif = `${css?.getPropertyValue("--font-fraunces").trim() || "Georgia"}, Georgia, serif`;
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.direction = "ltr"; // the phrase is English; the browser's bidi places a right-to-left name correctly within it
  const n = Math.max(1, Math.min(3, lines.length)), lh = h / (n + 0.6);
  lines.slice(0, 3).forEach((line, i) => {
    let size = i === 0 && n > 1 ? lh * 0.62 : lh * 0.5;
    const style = i === 0 && n > 1 ? "italic 600" : "500";
    for (; size > 12; size -= 2) { x.font = `${style} ${size}px ${serif}`; if (x.measureText(line).width < w * 0.9) break; }
    x.fillText(line, w / 2, lh * (i + 0.8));
  });
  return finish(c, false);
}

/** An image's alpha channel as a white-on-black mask (the standard way an alphaMap is read on the web, in glTF and in USDZ). */
export function alphaAsMask(t: THREE.Texture) {
  const img = t.image as { width: number; height: number } & CanvasImageSource, { c, x } = canvas(img.width, img.height);
  x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, img.height);
  for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i + 3]; d.data[i] = d.data[i + 1] = d.data[i + 2] = a; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); t.dispose();
  return finish(c, false);
}

/** Loads an image file into a texture (the Mawica wordmark used as the gold logo's mask). */
export function loadTexture(url: string, srgb = false) {
  return new Promise<THREE.Texture>((resolve, reject) => new THREE.TextureLoader().load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; resolve(t); }, undefined, reject));
}
