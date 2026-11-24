// Dev-only: renders the catalogue thumbnails of the standard cards. Each is a still of the card's own 3D scene (real geometry, lights and
// materials) rendered by headless Chrome (software WebGL, or the GPU with GPU=1) from the DEV server, then encoded to WebP at two sizes per
// aspect ratio. Since Stage F the snow globe is rendered from its own 3D model too (it used to compose the hero artwork).
//   BASE=http://localhost:3010 node scripts/render-catalogue.mjs [key]
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3010";
const OUT = "public/art/catalogue";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
// aspect keys match CardArt's `ratio` prop; width x height are the CSS size of the render viewport; outputs are the delivered widths
const RATIOS = { "16x10": { w: 1280, h: 800, out: [640, 1280] }, "4x5": { w: 960, h: 1200, out: [480, 960] }, "9x17": { w: 720, h: 1360, out: [360, 720] } };
const HERO = { "snow-globe": 10.5, "christmas-tree": 8.6, "special-gift": 7.6, "warm-wishes": 8.6, "new-year-2027": 9.3, "new-year-celebration": 4.95 };
// camera zoom per card and aspect (the fitted camera frames the whole card with room for the message sheet; thumbnails want the subject larger)
const ZOOM = { "snow-globe": { "16x10": 1.12, "4x5": 1.06, "9x17": 0.92 }, "christmas-tree": { "16x10": 1.0, "4x5": 0.95, "9x17": 0.95 }, "special-gift": { "16x10": 0.94, "4x5": 0.86, "9x17": 0.93 }, "warm-wishes": { "16x10": 0.97, "4x5": 0.92, "9x17": 0.84 }, "new-year-2027": { "16x10": 1.08, "4x5": 0.98, "9x17": 0.92 }, "new-year-celebration": { "16x10": 0.9, "4x5": 0.9, "9x17": 0.94 } };

const save = async (img, key, ratio) => {
  for (const w of RATIOS[ratio].out) {
    const file = join(OUT, `${key}-${ratio}-${w}.webp`);
    await sharp(img).resize({ width: w }).webp({ quality: 80, effort: 5 }).toFile(file);
    console.log(`${file} ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
};

// ---- the six 3D scenes ----
const port = 9960 + Math.floor(Math.random() * 30);
const dir = mkdtempSync(join(tmpdir(), "render-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", ...(process.env.GPU ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(s); });" });
  for (const [key, t] of Object.entries(HERO)) {
    if (only && key !== only) continue;
    for (const [ratio, r] of Object.entries(RATIOS)) {
      await send("Emulation.setDeviceMetricsOverride", { width: r.w, height: r.h, deviceScaleFactor: Number(process.env.DSF || 1.5), mobile: false });
      await send("Page.navigate", { url: `${BASE}/lab/card?key=${key}&bare=1&zoom=${ZOOM[key][ratio]}&cinemaT=${t}&noperfguard=1` });
      await sleep(Number(process.env.WAIT || 12000));
      let shot; for (let i = 0; i < 4 && !shot?.data; i++) { shot = await send("Page.captureScreenshot", { format: "png" }); if (!shot?.data) await sleep(2000); }
      await save(Buffer.from(shot.data, "base64"), key, ratio);
    }
  }
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
