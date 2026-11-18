// Dev-only: short real-time playback recordings of the standard cards (not frame-stepped): headless Chrome plays each card from the start and
// frames are captured as it runs, then joined into an animated WebP. GPU=1 uses the machine's GPU (recommended; software WebGL drops frames).
//   GPU=1 BASE=http://localhost:3010 OUT=docs/screenshots/catalogue/recordings node scripts/cards-record.mjs [key]
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
const BASE = process.env.BASE || "http://localhost:3010", OUT = process.env.OUT || "docs/screenshots/catalogue/recordings";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const KEYS = ["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"].filter((k) => !process.argv[2] || k === process.argv[2]);
const SECONDS = Number(process.env.SECONDS || 15), FPS = Number(process.env.FPS || 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const port = 9700 + Math.floor(Math.random() * 100), dir = mkdtempSync(join(tmpdir(), "crec-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", ...(process.env.GPU ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(s); });" });
  for (const [vpName, vp] of [["desktop", { width: 960, height: 600, mobile: false }], ["mobile", { width: 390, height: 844, mobile: true }]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
    for (const key of KEYS) {
      await send("Page.navigate", { url: `${BASE}/lab/card?key=${key}&noperfguard=1` });
      await send("Runtime.evaluate", { expression: "new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-cinema] canvas, [data-stage], .cc-fade')) { clearInterval(t); r(1); } }, 50); setTimeout(() => { clearInterval(t); r(0); }, 15000); })", awaitPromise: true });
      const frames = [], delays = [], t0 = Date.now(); let last = t0;
      while (Date.now() - t0 < SECONDS * 1000) {
        const due = t0 + frames.length * (1000 / FPS); if (Date.now() < due) await sleep(due - Date.now());
        const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
        if (r?.data) { const now = Date.now(); if (frames.length) delays.push(now - last); last = now; frames.push(Buffer.from(r.data, "base64")); }
      }
      delays.push(1500);
      const w = vpName === "desktop" ? 520 : 260;
      const resized = await Promise.all(frames.map((f) => sharp(f).resize({ width: w }).png().toBuffer()));
      await sharp(resized, { join: { animated: true } }).webp({ quality: 50, effort: 4, delay: delays, loop: 0 }).toFile(join(OUT, `${key}-${vpName}.webp`));
      console.log(key, vpName, `${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s, slowest gap ${Math.max(...delays.slice(0, -1))} ms`);
    }
  }
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
