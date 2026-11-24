// Dev-only: renders the snow globe card's 2D fallback still (no WebGL, lost context, slow devices) from the real 3D model, with a transparent
// background, so the fallback looks like the 3D card instead of the older hero artwork. Writes public/art/cards/snow-globe-3d.webp (+ -sm) and
// prints the size and glass circle for SnowGlobeScene. Needs the dev server.
//   BASE=http://localhost:3010 node scripts/globe/render-fallback.mjs
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3010";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9800 + Math.floor(Math.random() * 20), dir = mkdtempSync(join(tmpdir(), "globe-fb-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }))?.result?.value;
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important} html,body{background:transparent!important}'; document.head.appendChild(s); });" });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 1150, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: `${BASE}/lab/globe?view=front&t=14&q=mobile&transparent&bare=1` }); // the phone glass: truly transparent (refraction needs a backdrop)
  for (let i = 0; i < 120; i++) { if (await ev("document.querySelector('[data-ready=\"1\"]') ? 1 : 0")) break; await sleep(500); }
  await sleep(4000);
  // where the glass is on screen (CSS px): every vertex of the glass mesh projected with the lab camera
  const glass = JSON.parse(await ev(`(() => { const sc = window.__globeScene, cam = window.__globeCamera, g = sc.getObjectByName("glass"); g.updateMatrixWorld(true);
    const p = g.geometry.attributes.position, v = new g.position.constructor(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(g.matrixWorld).project(cam); const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return JSON.stringify({ x0, x1, y0, y1 }); })()`));
  const dsf = 2;
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const trimmed = await sharp(Buffer.from(shot.data, "base64")).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const { width: W, height: H, trimOffsetLeft = 0, trimOffsetTop = 0 } = trimmed.info;
  for (const [name, w] of [["snow-globe-3d", 1154], ["snow-globe-3d-sm", 577]]) {
    const file = `public/art/cards/${name}.webp`;
    const out = await sharp(trimmed.data).resize({ width: w }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(file);
    console.log(`${file} ${out.width}x${out.height} ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
  // the glass circle in the trimmed image, for the 2D snow overlay (CSS circle() percentages are of sqrt((w² + h²) / 2))
  const cx = ((glass.x0 + glass.x1) / 2) * dsf + trimOffsetLeft, cyPx = ((glass.y0 + glass.y1) / 2) * dsf + trimOffsetTop, r = ((glass.x1 - glass.x0) / 2) * dsf;
  const ref = Math.sqrt((W * W + H * H) / 2);
  console.log(JSON.stringify({ width: W, height: H, snowClip: `circle(${((r * 0.9) / ref * 100).toFixed(1)}% at ${(cx / W * 100).toFixed(1)}% ${(cyPx / H * 100).toFixed(1)}%)` }));
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
