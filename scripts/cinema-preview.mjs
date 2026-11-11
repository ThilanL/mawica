// Dev-only: builds a short animated preview of the cinematic card from the DEV server (the seek hook only exists outside production).
// It steps the choreography frame by frame (window.__cinemaSeek) and screenshots each step, then assembles an animated WebP. This is a
// frame-stepped render, NOT a real-time capture: it shows the motion path and composition, not the real frame rate.
//   BASE=http://localhost:3010 OUT=docs/screenshots/cinema node scripts/cinema-preview.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "docs/screenshots/cinema";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 12, END = 17.5, W = 270, H = 585;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const port = 9700 + Math.floor(Math.random() * 200);
const dir = mkdtempSync(join(tmpdir(), "cin-prev-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page;
for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: `${BASE}/lab/cinema?photo=1&cinemaT=0` });
  for (let i = 0; i < 200 && !(await ev("typeof window.__cinemaSeek === 'function' && !!document.querySelector('canvas[data-engine]')")); i++) await sleep(150);
  await sleep(3000);
  const frames = [];
  const n = Math.round(END * FPS);
  for (let f = 0; f <= n; f++) {
    const t = f / FPS;
    await ev(`window.__cinemaSeek(${t}); document.querySelector('[data-cinema]').dispatchEvent(new Event('x'))`);
    // The stage flips to "reading" at the end of the intro; the seek hook keeps the choreography frozen at t, a frame is drawn on the next tick.
    await sleep(t < 0.1 ? 900 : 380);
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    frames.push(await sharp(Buffer.from(shot.data, "base64")).resize(W, H).removeAlpha().raw().toBuffer());
    if (f % 30 === 0) console.log(`frame ${f}/${n} (t=${t.toFixed(2)}s)`);
  }
  const all = Buffer.concat(frames);
  const out = await sharp(all, { raw: { width: W, height: H * frames.length, channels: 3, pageHeight: H } }).webp({ quality: 62, effort: 4, loop: 0, delay: new Array(frames.length).fill(Math.round(1000 / FPS)) }).toBuffer();
  writeFileSync(join(OUT, "preview-animation.webp"), out);
  console.log(`wrote preview-animation.webp: ${frames.length} frames, ${(out.length / 1024).toFixed(0)} KB`);
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp profile still in use: harmless */ } }
