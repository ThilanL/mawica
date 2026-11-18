// Dev-only: exports each card's generic (non-personal) AR model from the /lab/ar page of the DEV server into public/ar/.
//   BASE=http://localhost:3010 node scripts/ar-export.mjs [card-key]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "public/ar";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const port = 9750 + Math.floor(Math.random() * 100), dir = mkdtempSync(join(tmpdir(), "arexp-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  await send("Page.enable");
  for (const key of process.argv[2] ? [process.argv[2]] : ["special-gift", "christmas-tree"]) {
  await send("Page.navigate", { url: `${BASE}/lab/ar?key=${key}` });
  let files; for (let i = 0; i < 40 && !files; i++) { await sleep(1000); const r = await send("Runtime.evaluate", { expression: "window.__arExport ? window.__arExport().then((x) => JSON.stringify({ x, report: window.__arReport })) : null", awaitPromise: true, returnByValue: true }); files = r?.result?.value ? JSON.parse(r.result.value) : null; }
  if (!files) throw new Error("export did not finish");
  const names = { glb: `${key}.glb`, usdz: `${key}.usdz`, glbStatic: `${key}-still.glb`, usdzStatic: `${key}-still.usdz` };
  for (const [k, f] of Object.entries(names)) writeFileSync(join(OUT, f), Buffer.from(files.x[k], "base64"));
  console.log(key, JSON.stringify(files.report));
  }
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
