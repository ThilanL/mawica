// Dev-only: exports the snow globe's generic AR files from the real model, in headless Chrome (GPU), via /lab/ar:
//   public/ar/snow-globe.usdz (+ .json manifest), snow-globe-still.usdz (+ .json), snow-globe.glb, snow-globe-still.glb
// The iPhone swaps the recipient's engraving and wish into the USDZ (src/components/cards/premium3d/ar/globe-usdz.ts). Needs the dev server.
//   BASE=http://localhost:3010 node scripts/globe/export-ar.mjs
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "../../node_modules/three/examples/jsm/libs/fflate.module.js";

// USDZExporter writes every number with 7 decimals. In metres that is a ten-thousandth of a millimetre; 5 decimals (0.01 mm) look identical and
// make the text a quarter smaller. Re-zipped exactly as the exporter does it: stored, model file first, data aligned to 64 bytes.
function compactUsdz(bytes) {
  const files = unzipSync(bytes), out = {};
  let offset = 0;
  for (const name of Object.keys(files)) {
    let data = files[name];
    if (name.endsWith(".usda")) data = strToU8(strFromU8(data).replace(/(-?\d+\.\d{5})\d+/g, "$1"));
    offset += 34 + name.length;
    const mod = offset & 63;
    out[name] = mod !== 4 ? [data, { extra: { 12345: new Uint8Array(64 - mod) } }] : data;
    offset = data.length;
  }
  return zipSync(out, { level: 0, mtime: new Date() });
}

const BASE = process.env.BASE || "http://localhost:3010";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9860 + Math.floor(Math.random() * 20), dir = mkdtempSync(join(tmpdir(), "globe-ar-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ } if (!page) await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 1 << 30 }); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed"); return r?.result?.value; };
const write = (file, buf) => { writeFileSync(file, buf); console.log(`${file} ${(statSync(file).size / 1024).toFixed(0)} KB`); };
try {
  await send("Page.navigate", { url: `${BASE}/lab/ar?key=snow-globe` });
  for (let i = 0; i < 240; i++) { if (await ev("window.__arReport ? 1 : 0")) break; await sleep(500); }
  const report = await ev("JSON.stringify(window.__arReport)");
  console.log("generic model:", report);
  for (const [name, reduced] of [["snow-globe", false], ["snow-globe-still", true]]) {
    const r = await ev(`window.__globeArExport(${reduced})`);
    const usdz = compactUsdz(new Uint8Array(Buffer.from(r.b64, "base64")));
    write(`public/ar/${name}.usdz`, usdz);
    writeFileSync(`public/ar/${name}.usdz.json`, JSON.stringify({ ...r.manifest, bytes: usdz.length }, null, 1) + "\n");
  }
  const glb = await ev("window.__arExport()");
  write("public/ar/snow-globe.glb", Buffer.from(glb.glb, "base64"));
  write("public/ar/snow-globe-still.glb", Buffer.from(glb.glbStatic, "base64"));
} finally { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } }
