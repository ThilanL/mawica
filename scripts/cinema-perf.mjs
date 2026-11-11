// Dev-only: measures the cinematic card in a PRODUCTION build with headless Chrome (CDP, no extra dependencies): JS and asset transfer,
// time to first visual, frame rate during each phase, memory, and whether rendering really stops after the animation.
// Needs a production server with ENABLE_LAB=1 (the lab route is 404 otherwise):
//   BASE=http://localhost:3030 node scripts/cinema-perf.mjs
// Headless Chrome renders WebGL in software (SwiftShader) on the CPU: frame rates here are a floor on a loaded laptop, NOT what a phone GPU does.
import { mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3030";
const PAGE = process.env.PAGE || "/lab/cinema?perf=1"; // any lab route that publishes window.__cinema, e.g. "/lab/card?key=christmas-tree&perf=1&noperfguard=1"
const VP = process.env.VP || "both";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const port = 9900 + Math.floor(Math.random() * 90);
  const dir = mkdtempSync(join(tmpdir(), "cin-perf-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up */ } if (!page) await sleep(250); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); else events.push(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  return { send, ev, events, close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } };
}

async function run(name, vp, cpu) {
  const c = await launch();
  try {
    await c.send("Page.enable"); await c.send("Network.enable"); await c.send("Performance.enable");
    await c.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
    if (cpu > 1) await c.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await c.send("Network.setCacheDisabled", { cacheDisabled: true });
    const t0 = Date.now();
    await c.send("Page.navigate", { url: `${BASE}${PAGE}` });
    // first meaningful visual: the canvas exists and the first frame statistics were published
    let firstVisual = null;
    for (let i = 0; i < 200 && firstVisual === null; i++) { await sleep(100); if (await c.ev("!!document.querySelector('canvas') && !!window.__cinema")) firstVisual = Date.now() - t0; }
    const samples = [];
    const at = async (label, atMs) => { await sleep(Math.max(0, atMs - (Date.now() - t0))); const s = await c.ev("window.__cinema ? JSON.stringify(window.__cinema) : null"); const heap = await c.ev("performance.memory ? performance.memory.usedJSHeapSize : null"); samples.push({ label, t: Math.round((Date.now() - t0) / 100) / 10, ...(s ? JSON.parse(s) : {}), heapMB: heap ? Math.round(heap / 1048576) : null }); };
    const T = process.env.TIMES ? JSON.parse(process.env.TIMES) : [4000, 11000, 14500, 19000]; await at("early", T[0]); await at("middle", T[1]); await at("late", T[2]); await at("reading", T[3]);
    // after the animation, rendering should wind down: compare the frame stamp over two windows far apart
    await at("rest", Number(process.env.REST || 48000));
    const stamp1 = samples.at(-1).at;
    await sleep(6000);
    const s2 = JSON.parse((await c.ev("JSON.stringify(window.__cinema)")) ?? "{}");
    const stopped = s2.at === stamp1;
    const res = await c.ev(`JSON.stringify(performance.getEntriesByType('resource').map(r => ({ n: r.name.replace(location.origin, ''), t: r.initiatorType, enc: r.encodedBodySize, tr: r.transferSize, dec: r.decodedBodySize })))`);
    const list = JSON.parse(res);
    const sum = (f) => Math.round(list.filter(f).reduce((n, r) => n + r.enc, 0) / 102.4) / 10;
    const js = list.filter((r) => r.n.endsWith(".js") || r.n.includes(".js?"));
    const fcp = await c.ev("(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime");
    console.log(`\n=== ${name} (${vp.w}x${vp.h} @${vp.dpr}x, CPU x${cpu}, software WebGL) ===`);
    console.log(`first-contentful-paint ${Math.round(fcp)} ms; canvas + first frame ${firstVisual} ms`);
    console.log(`JS transferred (encoded): ${sum((r) => r.n.includes(".js"))} KB across ${js.length} files; images ${sum((r) => /\\.(webp|png|jpg|svg)/.test(r.n))} KB; total ${sum(() => true)} KB`);
    const big = js.sort((a, b) => b.enc - a.enc).slice(0, 4).map((r) => `${r.n.split("/").pop().slice(0, 40)} ${Math.round(r.enc / 102.4) / 10}KB`);
    console.log("largest JS:", big.join(" | "));
    for (const s of samples) console.log(`  ${s.label.padEnd(13)} t=${s.t}s fps=${s.fps ?? "-"} draw calls=${s.calls ?? "-"} tris=${s.triangles ?? "-"} geometries=${s.geometries ?? "-"} textures=${s.textures ?? "-"} dpr=${s.dpr ?? "-"} particles=${s.particles ?? "-"} heap=${s.heapMB}MB`);
    console.log(`rendering stopped after the animation rests (frame stamp unchanged for 6 s): ${stopped}`);
    return { name, firstVisual, samples, stopped, js: sum((r) => r.n.includes(".js")) };
  } finally { c.close(); }
}

if (VP !== "mobile") await run("desktop", { w: 1280, h: 800, dpr: 1, mobile: false }, 1);
if (VP !== "desktop") await run("mobile (4x CPU slowdown)", { w: 390, h: 844, dpr: 2, mobile: true }, 4);
