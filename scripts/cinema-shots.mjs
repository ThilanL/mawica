// Dev-only: drives headless Chrome (CDP, no extra dependencies) over the cinematic card lab page and saves screenshots at chosen moments of the
// choreography, in desktop and phone sizes. Needs the dev server (lab route + ?cinemaT seek only exist outside production):
//   BASE=http://localhost:3010 OUT=docs/screenshots/cinema node scripts/cinema-shots.mjs [only-name-substring]
// Chrome needs software WebGL in headless mode; the flags below enable SwiftShader. Frame rates measured this way say nothing about real GPUs.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "docs/screenshots/cinema";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

async function launch() {
  const port = 9600 + Math.floor(Math.random() * 300);
  const dir = mkdtempSync(join(tmpdir(), "cin-shots-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up */ } if (!page) await sleep(250); }
  if (!page) { chrome.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" ")); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  await send("Runtime.enable"); await send("Page.enable");
  return { send, ev, errors, close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } };
}

const VIEWPORTS = { desktop: { w: 1280, h: 800, mobile: false }, mobile: { w: 390, h: 844, mobile: true } };
export const SHOTS = [
  // name, query, wait ms after load
  ["01-envelope-arrival", "cinemaT=2.4", 2500],
  ["02-snowstorm", "cinemaT=3.6", 2500],
  ["03-envelope-opening", "cinemaT=8.6", 2500],
  ["04-card-emerging", "cinemaT=10.1", 2500],
  ["05-card-turning", "cinemaT=12.0", 2500],
  ["06-card-opening", "cinemaT=13.4", 2500],
  ["07-greeting-lumi", "cinemaT=17", 3000],
  ["08-photo-reveal", "cinemaT=17&photo=1", 3500],
  ["08b-photo-tall", "cinemaT=17&photo=tall", 3500],
  ["10-mawica-ending", "cinemaT=17&photo=1&stage=ending", 3500],
  ["09-long-message", "cinemaT=17&photo=wide&msg=" + encodeURIComponent("Happy birthday, Nadia! I hope this year brings you everything you have been quietly wishing for: long mornings, loud laughter, small adventures that turn into stories, and people who remember to call. Thank you for being the kind of friend who makes ordinary days feel like occasions. I am so proud of you, and I can't wait to celebrate properly when we are together again. Until then, Lumi is here to carry my love across the distance, wrapped in a little golden light. Keep shining. You always do. With all my heart, always and forever, no matter how far apart we are."), 3500],
];

const vpNames = process.env.VP ? process.env.VP.split(",") : ["desktop", "mobile"];
const report = [];
for (const vpName of vpNames) {
  const vp = VIEWPORTS[vpName];
  const c = await launch();
  try {
    await c.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
    for (const [name, q, wait] of SHOTS) {
      if (only && !name.includes(only)) continue;
      await c.send("Page.navigate", { url: `${BASE}/lab/cinema?${q}&perf=1` });
      await sleep(wait);
      const state = await c.ev("(() => { const r = document.querySelector('[data-cinema]'); return r ? { renderer: r.dataset.renderer, stage: r.dataset.stage, overflow: document.documentElement.scrollWidth > innerWidth } : null; })()");
      const r = await c.send("Page.captureScreenshot", { format: "webp", quality: 82 });
      writeFileSync(join(OUT, `${name}-${vpName}.webp`), Buffer.from(r.data, "base64"));
      report.push({ name, vpName, state });
      console.log(`${name} ${vpName}`, JSON.stringify(state));
    }
    if (c.errors.length) console.log("console errors:", c.errors.slice(0, 5));
  } finally { c.close(); }
}
