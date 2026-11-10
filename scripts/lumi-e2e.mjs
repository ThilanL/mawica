// Dev-only browser checks for the Lumi experience, driven over the Chrome DevTools Protocol (no extra dependencies).
// Needs Google Chrome and a running server. Not part of `npm test`.
//
//   node scripts/lumi-e2e.mjs flow  <tag> <width> <height> [reduced] [nowebgl] [touch] [keyboard] [contextloss]
//   node scripts/lumi-e2e.mjs perf  <width> <height>          (use a production server: next build && next start -p 3100)
//   node scripts/lumi-e2e.mjs cleanup                         (dev server: /lab/lumi unmount / remount, context loss, listener and rAF counts)
//   node scripts/lumi-e2e.mjs still <out.png>                 (transparent render of /lab/lumi?still=1, dev server only; STILL_QS="still=1&awake=0" renders the sleeping pose)
//
// BASE   server origin (default http://localhost:3010)
// OUT    screenshot folder for `flow` (default docs/screenshots/meet-lumi)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [mode, ...rest] = process.argv.slice(2);
const BASE = process.env.BASE || "http://localhost:3010";
const OUT = process.env.OUT || "docs/screenshots/meet-lumi";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ nowebgl = false } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "lumi-e2e-"));
  const gl = nowebgl ? ["--disable-3d-apis", "--disable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  const chrome = spawn(CHROME, ["--headless=new", ...gl, "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
    if (!page) await sleep(250);
  }
  if (!page) { chrome.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { if (d.error) console.error("CDP error:", JSON.stringify(d.error)); pending.get(d.id)(d.result); }
    else if (d.method) listeners.forEach((l) => l(d));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const close = () => { try { ws.close(); } catch { /* ignore */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } };
  return { send, ev, close, on: (l) => listeners.push(l) };
}

const waitFor = async (ev, expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(200); } return false; };

async function flow(tag, w, h, flags) {
  const has = (f) => flags.includes(f);
  const W = +w, H = +h;
  mkdirSync(OUT, { recursive: true });
  const c = await launch({ nowebgl: has("nowebgl") });
  const { send, ev } = c;
  const log = { tag, width: W, height: H, flags };
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: W < 768 });
    if (has("touch")) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    if (has("reduced")) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await send("Page.navigate", { url: BASE + "/" });
    await waitFor(ev, `!!document.querySelector('#meet-lumi button')`, 90000);
    await sleep(2500);
    await ev(`(()=>{const s=document.createElement('style');s.textContent='nextjs-portal,[data-nextjs-toast]{display:none!important}';document.head.appendChild(s);0})()`);
    const rectOf = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,w:r.width,h:r.height,vy:scrollY}})()`);
    // Screenshots resize the viewport to fit the clip (so WebGL canvases are not cleared by a beyond-viewport capture),
    // wait for the canvas to redraw, then restore the original size.
    const shot = async (name, sel = "#meet-lumi") => {
      const r = await rectOf(sel);
      const needH = Math.ceil(r.h + 40);
      if (needH > H) { await send("Emulation.setDeviceMetricsOverride", { width: W, height: needH, deviceScaleFactor: 2, mobile: W < 768 }); await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'start'});0`); await sleep(500); }
      const r2 = await rectOf(sel);
      const s = await send("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, r2.x), y: r2.y, width: Math.min(r2.w, W), height: r2.h, scale: 1 } });
      writeFileSync(`${OUT}/${tag}-${name}.png`, Buffer.from(s.data, "base64"));
      if (needH > H) { await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: W < 768 }); await sleep(350); }
    };
    const key = async (k, code, vk, text) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); };
    const tap = async (x, y) => {
      if (has("touch")) { await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      else { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); }
    };
    const jsCount = () => ev(`performance.getEntriesByType('resource').filter(r=>/\\.js/.test(r.name)).length`);
    if (has("blockchunk")) { await send("Network.enable"); await send("Network.setBlockedURLs", { urls: ["*LumiStage*", "*LumiCanvas*", "*lumi*", "*three*"] }); }
    log.jsBefore = await jsCount();
    log.overflowBefore = await ev(`document.documentElement.scrollWidth + '/' + innerWidth`);
    await ev(`document.querySelector('#meet-lumi').scrollIntoView({block:'start'});0`);
    await sleep(1500);
    log.jsAfterScroll = await jsCount();
    await shot("1-idle");
    log.mainButton = await ev(`(()=>{const b=[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Meet Lumi'));const r=b.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
    // bring the button into view like a user scrolling, then re-measure its position
    await ev(`[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Meet Lumi')).scrollIntoView({block:'center'});0`);
    await sleep(500);
    log.mainButton = await ev(`(()=>{const b=[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Meet Lumi'));const r=b.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
    const t0 = Date.now();
    if (has("keyboard")) { await ev(`[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Meet Lumi')).focus();0`); await key("Enter", "Enter", 13, "\r"); }
    else await tap(log.mainButton.cx, log.mainButton.cy);
    await sleep(250);
    log.statusAfterActivate = await ev(`document.querySelector('#meet-lumi [role=status]')?.textContent || null`);
    await shot("2-waking");
    log.askShown = await waitFor(ev, `!!document.querySelector('#lumi-name')`, 40000);
    log.activationToAskMs = Date.now() - t0;
    log.jsAfterActivate = await jsCount();
    await sleep(1500);
    await shot("3-ask");
    log.focusOnInput = await ev(`document.activeElement && document.activeElement.id`);
    log.canvasCount = await ev(`document.querySelectorAll('#lumi-stage canvas').length`);
    log.mode = await ev(`document.querySelector('#lumi-stage .sr-only')?.textContent`);
    log.stageBox = await rectOf("#lumi-stage");
    if (has("contextloss")) {
      await ev(`(()=>{const c=document.querySelector('#lumi-stage canvas');const g=c.getContext('webgl2')||c.getContext('webgl');g.getExtension('WEBGL_lose_context').loseContext();0})()`);
      await sleep(1500);
      log.afterContextLoss = { canvasCount: await ev(`document.querySelectorAll('#lumi-stage canvas').length`), staticImage: await ev(`!!document.querySelector('#lumi-stage img')`), mode: await ev(`document.querySelector('#lumi-stage .sr-only')?.textContent`), inputStillUsable: await ev(`!!document.querySelector('#lumi-name')`) };
    }
    if (!has("touch")) {
      const sr = await rectOf("#lumi-stage");
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 8, y: sr.y - sr.vy + 40 }); await sleep(1600); await shot("4-track-left", "#lumi-stage");
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: W - 8, y: sr.y - sr.vy + sr.h - 40 }); await sleep(1600); await shot("5-track-right", "#lumi-stage");
    }
    // name entry (Unicode, with markup to prove it renders as text)
    await ev(`document.querySelector('#lumi-name').focus();0`);
    await send("Input.insertText", { text: has("keyboard") ? "<b>Zoë</b>" : "Ava" });
    await sleep(300);
    await shot("6-name-entry");
    log.inputValue = await ev(`document.querySelector('#lumi-name').value`);
    const reqBefore = await ev(`performance.getEntriesByType('resource').length`);
    await key("Enter", "Enter", 13, "\r");
    await sleep(500); await shot("7-celebrate-a");
    await sleep(500); await shot("7-celebrate-b");
    log.revealShown = await waitFor(ev, `!!document.querySelector('#meet-lumi [tabindex="-1"]')`, 10000);
    await sleep(900);
    await shot("8-greeting");
    log.greeting = await ev(`document.querySelector('#meet-lumi [tabindex="-1"]')?.innerText`);
    log.htmlInjected = await ev(`!!document.querySelector('#meet-lumi [tabindex="-1"] b')`);
    log.focusAfterReveal = await ev(`document.activeElement?.getAttribute('tabindex')`);
    log.createLink = await ev(`(()=>{const a=[...document.querySelectorAll('#meet-lumi a')].find(a=>a.textContent.includes('Create Your Card'));const r=a.getBoundingClientRect();return {href:a.getAttribute('href'),w:Math.round(r.width),h:Math.round(r.height)}})()`);
    log.urlHasName = /Ava|Zo/.test(await ev(`location.href`));
    log.requestsMentioningName = await ev(`performance.getEntriesByType('resource').slice(${reqBefore}).map(r=>r.name).filter(n=>/ava|zo%C3%AB|zoë/i.test(n))`);
    log.storage = await ev(`Object.keys(localStorage).concat(Object.keys(sessionStorage)).join(',')`);
    await key("Tab", "Tab", 9);
    log.tabAfterReveal = await ev(`document.activeElement?.textContent?.trim()`);
    await key("Tab", "Tab", 9);
    log.tabAfterReveal2 = await ev(`document.activeElement?.textContent?.trim()`);
    // tap Lumi itself
    await ev(`document.querySelector('#lumi-stage').scrollIntoView({block:'center'});0`);
    await sleep(600);
    const s2 = await rectOf("#lumi-stage");
    await tap(s2.x + s2.w / 2, s2.y - s2.vy + s2.h * 0.52);
    await sleep(550); await shot("9-tap-lumi", "#lumi-stage");
    // try another name resets cleanly
    await ev(`[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Try Another Name')).click();0`);
    await sleep(600);
    log.resetState = { inputEmpty: (await ev(`document.querySelector('#lumi-name')?.value`)) === "", focusOnInput: (await ev(`document.activeElement?.id`)) === "lumi-name", greetingGone: !(await ev(`document.querySelector('#meet-lumi [tabindex="-1"]')`)) };
    // skip path
    await ev(`[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Skip Name')).click();0`);
    await waitFor(ev, `!!document.querySelector('#meet-lumi [tabindex="-1"]')`, 10000);
    log.skipGreeting = await ev(`document.querySelector('#meet-lumi [tabindex="-1"] p:nth-of-type(1)')?.textContent`);
    log.overflowAfter = await ev(`document.documentElement.scrollWidth + '/' + innerWidth`);
    log.stats = await ev(`window.__lumi || null`);
    console.log(JSON.stringify(log, null, 1));
  } finally { c.close(); }
}

async function perf(w, h) {
  const W = +w, H = +h;
  const c = await launch();
  const { send, ev } = c;
  const out = { width: W, height: H };
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 768 });
    await send("Network.enable"); await send("Performance.enable"); await send("Page.enable");
    const reqs = new Map(); let phase = "initial"; const byPhase = {};
    c.on((d) => {
      if (d.method === "Network.requestWillBeSent" && /\.js(\?|$)/.test(d.params.request.url)) reqs.set(d.params.requestId, { url: d.params.request.url, phase });
      if (d.method === "Network.loadingFinished" && reqs.has(d.params.requestId)) { const r = reqs.get(d.params.requestId); r.bytes = d.params.encodedDataLength; (byPhase[r.phase] ||= []).push(r); }
    });
    await send("Page.navigate", { url: BASE + "/" });
    await waitFor(ev, `!!document.querySelector('#meet-lumi button')`, 90000);
    await sleep(4000);
    const sum = (a = []) => ({ requests: a.length, transferKB: Math.round(a.reduce((s, r) => s + (r.bytes || 0), 0) / 1024) });
    out.initialJs = sum(byPhase.initial);
    out.decodedInitialKB = await ev(`Math.round(performance.getEntriesByType('resource').filter(r=>/\\.js/.test(r.name)).reduce((s,r)=>s+r.decodedBodySize,0)/1024)`);
    phase = "scroll";
    await ev(`document.querySelector('#meet-lumi').scrollIntoView({block:'center'});0`);
    await sleep(4000);
    out.afterScrollNewJs = sum(byPhase.scroll);
    const metric = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    await send("HeapProfiler.enable"); await send("HeapProfiler.collectGarbage");
    const heap0 = (await send("Runtime.getHeapUsage")).usedSize; const dom0 = await send("Memory.getDOMCounters");
    const m0 = await metric();
    phase = "activate";
    const t0 = Date.now();
    await ev(`[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Meet Lumi')).click();0`);
    out.activation = { toAskMs: 0 };
    await waitFor(ev, `!!document.querySelector('#lumi-name')`, 60000);
    out.activation.toAskMs = Date.now() - t0;
    out.activation.toFirstFrameMs = (await waitFor(ev, `!!window.__lumi`, 20000)) ? Date.now() - t0 : null;
    out.lazyJs = sum(byPhase.activate);
    out.lazyChunks = (byPhase.activate || []).map((r) => ({ file: r.url.split("/").pop(), KB: Math.round(r.bytes / 1024) }));
    const m1 = await metric();
    out.activationMainThread = { taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000) };
    // steady state: idle for 6s
    const m2 = await metric(); await sleep(6000); const m3 = await metric();
    out.idleMainThread = { busyPercent: +(((m3.TaskDuration - m2.TaskDuration) / 6) * 100).toFixed(1), scriptPercent: +(((m3.ScriptDuration - m2.ScriptDuration) / 6) * 100).toFixed(1) };
    out.idleStats = await ev(`window.__lumi`);
    // active (celebrating): trigger and measure
    await ev(`document.querySelector('#lumi-name').value='';[...document.querySelectorAll('#meet-lumi button')].find(b=>b.textContent.includes('Skip Name')).click();0`);
    const m4 = await metric(); await sleep(2500); const m5 = await metric();
    out.celebrationMainThread = { busyPercent: +(((m5.TaskDuration - m4.TaskDuration) / 2.5) * 100).toFixed(1), scriptPercent: +(((m5.ScriptDuration - m4.ScriptDuration) / 2.5) * 100).toFixed(1) };
    out.activeStats = await ev(`window.__lumi`);
    // pause when scrolled away: no new stats objects while off-screen
    await ev(`window.__ticks=0;(()=>{let v=window.__lumi;Object.defineProperty(window,'__lumi',{get(){return v},set(x){window.__ticks++;v=x},configurable:true})})();const s=document.createElement('div');s.id='spacer';s.style.height='5000px';document.body.appendChild(s);window.scrollTo(0,4500);0`);
    await sleep(1500); await ev(`window.__ticks=0`); await sleep(3500);
    out.offscreenStatsUpdatesIn3_5s = await ev(`window.__ticks`);
    await ev(`document.getElementById('spacer').remove();document.querySelector('#lumi-stage').scrollIntoView({block:'center'});0`); await sleep(500); await ev(`window.__ticks=0`); await sleep(3500);
    out.onscreenStatsUpdatesIn3_5s = await ev(`window.__ticks`);
    // cleanup: client-side navigation away unmounts the stage
    await ev(`document.querySelector('a[href="/create"]').click();0`);
    await waitFor(ev, `location.pathname==='/create'`, 15000);
    await sleep(2500);
    await ev(`window.__ticks=0`); await sleep(3500);
    out.afterNavigate = { canvases: await ev(`document.querySelectorAll('canvas').length`), statsUpdatesIn3_5s: await ev(`window.__ticks`) };
    await send("HeapProfiler.collectGarbage"); await sleep(500); await send("HeapProfiler.collectGarbage");
    const heap1 = (await send("Runtime.getHeapUsage")).usedSize; const dom1 = await send("Memory.getDOMCounters");
    out.memory = { heapBeforeActivationMB: +(heap0 / 1048576).toFixed(1), heapAfterUnmountMB: +(heap1 / 1048576).toFixed(1), jsEventListenersBefore: dom0.jsEventListeners, jsEventListenersAfter: dom1.jsEventListeners, nodesBefore: dom0.nodes, nodesAfter: dom1.nodes };
    console.log(JSON.stringify(out, null, 1));
  } finally { c.close(); }
}

async function cleanup() {
  const c = await launch();
  const { send, ev } = c;
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.enable");
    // instrument canvases/contexts and requestAnimationFrame before any page script runs
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{window.__ctx=[];const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){const c=g.call(this,t,...a);if(c&&/webgl/.test(t)&&!window.__ctx.includes(c))window.__ctx.push(c);return c};window.__raf=0;const r=window.requestAnimationFrame;window.requestAnimationFrame=function(cb){window.__raf++;return r.call(window,cb)}})()` });
    await send("Page.navigate", { url: BASE + "/lab/lumi" });
    await waitFor(ev, `!!window.__lumi`, 90000);
    await sleep(2500);
    const out = {};
    const rafRate = async (ms = 3000) => { await ev(`window.__raf=0`); await sleep(ms); return Math.round(((await ev(`window.__raf`)) / ms) * 1000); };
    const listeners = async () => (await send("Memory.getDOMCounters")).jsEventListeners;
    out.mounted = { contexts: await ev(`window.__ctx.length`), lost: await ev(`window.__ctx.map(c=>c.isContextLost())`), rafPerSecIdleWebGL: await rafRate(), listeners: await listeners() };
    await send("HeapProfiler.enable"); await send("HeapProfiler.collectGarbage");
    out.heapMountedMB = +(((await send("Runtime.getHeapUsage")).usedSize) / 1048576).toFixed(1);
    // unmount the canvas (switch to the static fallback)
    await ev(`document.querySelector('input[type=checkbox]').click();0`);
    await sleep(1500);
    await send("HeapProfiler.collectGarbage"); await sleep(300); await send("HeapProfiler.collectGarbage");
    out.afterUnmount = { canvases: await ev(`document.querySelectorAll('canvas').length`), contextLost: await ev(`window.__ctx.map(c=>c.isContextLost())`), rafPerSec: await rafRate(), listeners: await listeners(), heapMB: +(((await send("Runtime.getHeapUsage")).usedSize) / 1048576).toFixed(1) };
    // remount and make sure there is exactly one loop again (no duplicate initialisation)
    await ev(`document.querySelector('input[type=checkbox]').click();0`);
    await waitFor(ev, `window.__ctx.length>=2 && !window.__ctx[window.__ctx.length-1].isContextLost()`, 20000);
    await sleep(2500);
    out.afterRemount = { contexts: await ev(`window.__ctx.length`), lost: await ev(`window.__ctx.map(c=>c.isContextLost())`), canvases: await ev(`document.querySelectorAll('canvas').length`), rafPerSec: await rafRate(), listeners: await listeners() };
    // repeat 5 mount/unmount cycles: contexts must all be released except the live one, listeners must not climb
    for (let i = 0; i < 5; i++) { await ev(`document.querySelector('input[type=checkbox]').click();0`); await sleep(700); await ev(`document.querySelector('input[type=checkbox]').click();0`); await sleep(1200); }
    await send("HeapProfiler.collectGarbage"); await sleep(300); await send("HeapProfiler.collectGarbage");
    out.after5Cycles = { contexts: await ev(`window.__ctx.length`), liveContexts: await ev(`window.__ctx.filter(c=>!c.isContextLost()).length`), canvases: await ev(`document.querySelectorAll('canvas').length`), rafPerSec: await rafRate(), listeners: await listeners(), heapMB: +(((await send("Runtime.getHeapUsage")).usedSize) / 1048576).toFixed(1) };
    console.log(JSON.stringify(out, null, 1));
  } finally { c.close(); }
}

async function still(outFile) {
  const c = await launch();
  const { send, ev } = c;
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 1100, deviceScaleFactor: 3, mobile: false });
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await send("Page.navigate", { url: BASE + "/lab/lumi?" + (process.env.STILL_QS || "still=1") });
    await waitFor(ev, `[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Close-up'))`, 90000);
    await sleep(1500);
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Close-up')).click()`);
    await sleep(2000);
    await ev(`(()=>{const s=document.createElement('style');s.textContent='html,body,body *{background:transparent !important;box-shadow:none !important} header,dl,label,p,[role=group],button{visibility:hidden !important}';document.head.appendChild(s);0})()`);
    await sleep(600);
    const r = await ev(`(()=>{const c=document.querySelector('canvas').getBoundingClientRect();return {x:c.x,y:c.y+scrollY,w:c.width,h:c.height}})()`);
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    writeFileSync(outFile, Buffer.from(shot.data, "base64"));
    console.log("ok", outFile);
  } finally { c.close(); }
}

if (mode === "flow") await flow(rest[0], rest[1], rest[2], rest.slice(3));
else if (mode === "perf") await perf(rest[0], rest[1]);
else if (mode === "cleanup") await cleanup();
else if (mode === "still") await still(rest[0]);
else { console.error("usage: see header of scripts/lumi-e2e.mjs"); process.exit(1); }
process.exit(0);
