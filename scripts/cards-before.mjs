// Dev-only: screenshots every standard card (catalogue + scene moments) in real time over CDP. Used for BEFORE and AFTER captures.
//   BASE=http://localhost:3010 OUT=docs/screenshots/catalogue/before node scripts/cards-before.mjs [key]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "docs/screenshots/catalogue/before";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const KEYS = ["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"];
// moments after load (seconds): opening, main animation, greeting
const MOMENTS = JSON.parse(process.env.MOMENTS || (process.env.FINAL ? '{"1-opening":2.0,"2-main":5.5,"3-greeting":13}' : '{"1-opening":2.0,"2-main":5.5,"3-greeting":11,"4-final":16}'));
const port = 9800 + Math.floor(Math.random() * 100);
const dir = mkdtempSync(join(tmpdir(), "cards-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", ...(process.env.GPU ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const shot = async (name) => { for (let i = 0; i < 4; i++) { const r = await send("Page.captureScreenshot", { format: "webp", quality: 85 }); if (r?.data) { writeFileSync(join(OUT, `${name}.webp`), Buffer.from(r.data, "base64")); return; } await sleep(1500); } console.log("no screenshot for", name); };
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(s); });" }); // hide the dev-server badge
  for (const [vpName, vp] of [["desktop", { width: 1280, height: 800, mobile: false, dsf: 1 }], ["mobile", { width: 390, height: 844, mobile: true, dsf: 2 }]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
    if (!only || process.env.CATALOGUE) {
      await send("Page.navigate", { url: `${BASE}/create` }); await sleep(3500);
      await send("Runtime.evaluate", { expression: "document.querySelector('[role=radiogroup]').scrollIntoView({block:'start'})" }); await sleep(800);
      await shot(`catalogue-${vpName}`);
      await send("Page.navigate", { url: `${BASE}/` }); await sleep(3000);
      await send("Runtime.evaluate", { expression: "(document.querySelector('#cards')||[...document.querySelectorAll('h2')].find(h=>/card/i.test(h.textContent))||document.body).scrollIntoView({block:'start'})" }); await sleep(1500);
      await shot(`homepage-gallery-${vpName}`);
    }
    for (const key of KEYS) {
      if (only && key !== only) continue;
      await send("Page.navigate", { url: `${BASE}/lab/card?key=${key}&noperfguard=1` });
      const t0 = Date.now();
      for (const [name, sec] of Object.entries(MOMENTS)) { const w = sec * 1000 - (Date.now() - t0); if (w > 0) await sleep(w); await shot(`${key}-${name}-${vpName}`); }
      if (process.env.FINAL === "click") { // AFTER captures: press Continue to show the Mawica ending
        await send("Runtime.evaluate", { expression: "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Continue')?.click()" }); await sleep(2800); await shot(`${key}-4-final-${vpName}`);
      }
      console.log(key, vpName);
    }
  }
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
