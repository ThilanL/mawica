// Dev-only: renders the snow globe approval gallery from the real 3D model (/lab/globe), in headless Chrome on the GPU, then composes the
// side-by-side comparison with the hero reference. Needs the dev server.
//   BASE=http://localhost:3010 node scripts/globe/render-gallery.mjs [view ...]
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "docs/screenshots/snow-globe";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// file name, lab query, viewport (CSS px), device scale
const SHOTS = [
  ["01-front-hero", "view=front", 1200, 1350, 2],
  ["02-front-three-quarter", "view=three-quarter", 1200, 1350, 2],
  ["03-left", "view=left", 1200, 1350, 2],
  ["04-right", "view=right", 1200, 1350, 2],
  ["05-rear", "view=rear&eng=For%20Nadia|With%20love%2C%20Sam%20%C2%B7%20Christmas%202026", 1200, 1350, 2],
  ["06-elevated", "view=elevated", 1200, 1350, 2],
  ["07-closeup-cottage-tree", "view=cottage", 1600, 1200, 2],
  ["08-closeup-base", "view=base", 1600, 1000, 2],
  ["09-mobile-quality", "view=front&q=mobile", 390, 520, 3],
  // Stage C: the intro and a snowstorm, frame by frame (OUT=docs/screenshots/snow-globe/stage-c)
  ["c01-intro-0.5s", "view=three-quarter&t=0.5", 900, 1000, 2],
  ["c02-intro-2.2s-windows", "view=three-quarter&t=2.2", 900, 1000, 2],
  ["c03-intro-4.0s-garland", "view=three-quarter&t=4.0", 900, 1000, 2],
  ["c04-intro-6.0s-star", "view=three-quarter&t=6.0", 900, 1000, 2],
  ["c05-storm-0.6s", "view=front&t=14&storm=0.6", 900, 1000, 2],
  ["c06-storm-3s", "view=front&t=14&storm=3", 900, 1000, 2],
  ["c07-storm-8s-settling", "view=front&t=14&storm=8", 900, 1000, 2],
  ["c08-calm-snowfall-smoke", "view=cottage&t=21", 1200, 1000, 2],
  ["c09-reduced-motion", "view=front&still", 900, 1000, 2],
  ["c10-no-bloom-compare", "view=front&t=14&nobloom", 900, 1000, 2],
  ["c11-mobile-storm", "view=front&q=mobile&t=14&storm=1.5", 390, 520, 3],
];
const only = process.argv.slice(2);

const port = 9960 + Math.floor(Math.random() * 30);
const dir = mkdtempSync(join(tmpdir(), "globe-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", ...(process.env.SOFTWARE ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu"]), "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;

const stats = {};
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(s); });" });
  for (const [name, query, w, h, dsf] of SHOTS) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dsf, mobile: dsf > 2 });
    await send("Page.navigate", { url: `${BASE}/lab/globe?${query}${/[?&]t=|^t=/.test(query) ? "" : "&t=14"}&bare=1` }); // review stills hold the finished scene unless a shot sets its own time
    for (let i = 0; i < 120; i++) { if (await evaluate("document.querySelector('[data-ready=\"1\"]') ? 1 : 0")) break; await sleep(500); }
    await sleep(Number(process.env.WAIT || 3500)); // textures decode, shadows and the transmission pass settle
    stats[name] = await evaluate("JSON.stringify(window.__globeStats || null)");
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = join(OUT, `${name}.png`);
    await sharp(Buffer.from(shot.data, "base64")).png({ compressionLevel: 9 }).toFile(file);
    console.log(`${file} ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
writeFileSync(join(OUT, "stats.json"), JSON.stringify(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v ? JSON.parse(v) : null])), null, 1));

// 10. side by side: the hero reference (globe cropped from the poster) next to the front render
if (!only.length || only.includes("compare")) {
  const H = 1200;
  const ref = await sharp("public/art/hero/videos/christmas-poster.webp").extract({ left: 770, top: 95, width: 620, height: 700 }).resize({ height: H }).toBuffer();
  const ours = await sharp(join(OUT, "01-front-hero.png")).trim({ threshold: 4 }).resize({ height: H, fit: "inside" }).toBuffer().catch(async () => sharp(join(OUT, "01-front-hero.png")).resize({ height: H }).toBuffer());
  const [a, b] = await Promise.all([sharp(ref).metadata(), sharp(ours).metadata()]);
  const label = (t, w) => Buffer.from(`<svg width="${w}" height="70"><rect width="100%" height="100%" fill="#140b16"/><text x="24" y="46" font-family="Helvetica" font-size="30" fill="#f4c371">${t}</text></svg>`);
  const W = a.width + b.width + 40;
  await sharp({ create: { width: W, height: H + 70, channels: 3, background: "#140b16" } })
    .composite([{ input: label("Hero reference (video poster)", a.width), left: 0, top: 0 }, { input: ref, left: 0, top: 70 }, { input: label("3D model render (this build)", b.width), left: a.width + 40, top: 0 }, { input: ours, left: a.width + 40, top: 70 }])
    .png({ compressionLevel: 9 }).toFile(join(OUT, "10-comparison.png"));
  console.log(join(OUT, "10-comparison.png"));
}
