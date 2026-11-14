// Dev-only: seeked screenshots of the standard cards' 3D scenes from the DEV server (the ?cinemaT / ?stage seek switches do not exist in production).
//   BASE=http://localhost:3010 OUT=docs/screenshots/catalogue/after node scripts/cards-shots.mjs [key] [name-substring]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "docs/screenshots/catalogue/after";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [onlyKey, onlyName] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
// [key]: { opening, main, duration } in timeline seconds
export const CARDS = {
  "christmas-tree": { opening: 1.6, main: 6.2, duration: 11 },
  "special-gift": { opening: 1.8, main: 6.4, duration: 11 },
  "warm-wishes": { opening: 1.8, main: 6.0, duration: 11 },
  "new-year-2027": { opening: 2.4, main: 7.4, duration: 12.5 },
  "new-year-celebration": { opening: 1.6, main: 5.2, duration: 11 },
};
const port = 9850 + Math.floor(Math.random() * 100);
const dir = mkdtempSync(join(tmpdir(), "cshots-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", ...(process.env.GPU ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const shot = async (name) => { for (let i = 0; i < 4; i++) { const r = await send("Page.captureScreenshot", { format: "webp", quality: 85 }); if (r?.data) { writeFileSync(join(OUT, `${name}.webp`), Buffer.from(r.data, "base64")); return; } await sleep(1500); } console.log("no screenshot", name); };
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(s); });" }); // hide the dev-server badge
  for (const [vpName, vp] of [["desktop", { width: 1280, height: 800, mobile: false, dsf: 1 }], ["mobile", { width: 390, height: 844, mobile: true, dsf: 2 }]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
    for (const [key, c] of Object.entries(CARDS)) {
      if (onlyKey && key !== onlyKey) continue;
      const shots = [["1-opening", `cinemaT=${c.opening}`], ["2-main", `cinemaT=${c.main}`], ["3-greeting", `cinemaT=${c.duration + 2}`], ["4-final", `cinemaT=${c.duration + 2}&stage=ending`]];
      for (const [name, q] of shots) {
        if (onlyName && !name.includes(onlyName)) continue;
        await send("Page.navigate", { url: `${BASE}/lab/card?key=${key}&${q}&noperfguard=1` });
        await sleep(Number(process.env.WAIT || (name === "1-opening" ? 4500 : 3800)));
        await shot(`${key}-${name}-${vpName}`);
      }
      console.log(key, vpName);
    }
  }
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
