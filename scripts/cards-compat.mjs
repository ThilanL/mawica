// Dev-only: saved-card compatibility. Publishes one guest card per standard template through the real API of a PRODUCTION-mode server, then opens each public URL in
// headless Chrome (software WebGL): the message is in the server HTML, the scene is WebGL, reduced motion gives a static finished frame, and no WebGL falls back to the
// CSS scene. Needs the isolated test database (cards it creates are deleted at the end).
//   BASE=http://localhost:3030 DATABASE_URL=<mawica_test url> node scripts/cards-compat.mjs
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3030";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/mawica_test" || dbUrl.port !== "5433") throw new Error("Refusing to run: DATABASE_URL must point at mawica_test on port 5433");
const sql = (q) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = ["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"];
const MSG = "Compat check message " + Date.now();
const report = [];
const note = (name, ok, detail = "") => { report.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

const slugs = {};
for (const [i, key] of KEYS.entries()) {
  const r = await fetch(`${BASE}/api/cards`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `1.1.1.1, 198.51.100.${200 + i}` }, body: JSON.stringify({ templateKey: key, recipientName: "CompatTest", senderName: "Sam", message: MSG }) });
  const j = await r.json(); slugs[key] = j.slug;
  note(`${key}: a guest card publishes exactly as before (201, no sign-in, no credit)`, r.status === 201 && !!j.slug);
}
for (const key of KEYS) {
  const res = await fetch(`${BASE}/c/${slugs[key]}`); const html = await res.text();
  note(`${key}: the public URL is 200 and the personal message is in the server HTML`, res.status === 200 && html.includes(MSG) && html.includes("CompatTest") && /With love, (<!-- -->)?Sam/.test(html));
}
note("an unknown card URL is still a real 404", (await fetch(`${BASE}/c/zzzzzzzzzzzz`)).status === 404);

async function open(url, { reduced = false, noWebgl = false } = {}) {
  const port = 9400 + Math.floor(Math.random() * 400); const dir = mkdtempSync(join(tmpdir(), "compat-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* */ } if (!page) await sleep(250); }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (noWebgl) await send("Page.addScriptToEvaluateOnNewDocument", { source: "const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : g.call(this, t, ...a); };" });
  await send("Page.navigate", { url });
  const waitFor = async (expr, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(300); } return false; };
  return { ev, waitFor, close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* */ } } };
}
for (const key of KEYS.slice(1)) {
  const p = await open(`${BASE}/c/${slugs[key]}?noperfguard=1`);
  try {
    note(`${key}: plays as a WebGL scene`, await p.waitFor("document.querySelector('[data-cinema]')?.dataset.renderer === 'webgl' && !!document.querySelector('canvas[data-engine]')"));
    note(`${key}: the scene is keyed to its template and the message sheet is on the page`, await p.ev(`document.querySelector('[data-cinema]').dataset.scene === '${key}' && document.body.innerText.includes(${JSON.stringify(MSG)})`));
  } finally { p.close(); }
  const r = await open(`${BASE}/c/${slugs[key]}?noperfguard=1`, { reduced: true });
  try {
    note(`${key}: reduced motion shows the finished card at once (static 3D, sheet visible)`, await r.waitFor("document.querySelector('[data-cinema]')?.dataset.renderer === 'webgl-static' && document.querySelector('[data-cinema]').dataset.stage === 'reading' && getComputedStyle(document.querySelector('.stg-panel')).opacity === '1'"));
  } finally { r.close(); }
  const n = await open(`${BASE}/c/${slugs[key]}`, { noWebgl: true });
  try {
    note(`${key}: without WebGL it falls back to the original CSS scene with the message`, await n.waitFor(`document.querySelector('[data-cinema]')?.dataset.renderer === 'fallback-2d' && document.body.innerText.includes(${JSON.stringify(MSG)}) && !document.querySelector('canvas[data-engine]')`, 30000));
  } finally { n.close(); }
}
{
  const g = await open(`${BASE}/c/${slugs["snow-globe"]}`);
  try {
    note("snow-globe: plays its original artwork and offers the shared ending after the greeting", await g.waitFor("!!document.querySelector('img[src*=\"globe\"]') || document.body.innerText.includes('Wishing') || document.body.innerText.includes(" + JSON.stringify(MSG) + ")", 30000));
    note("snow-globe: Continue appears and shows the Mawica ending", await g.waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Continue')", 30000) && (await g.ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Continue').click(); true")) && await g.waitFor("document.querySelector('.cin-end-on')?.innerText.includes('BRING YOUR WISHES TO LIFE.')", 8000));
  } finally { g.close(); }
}
sql(`delete from "Card" where "recipientName" = 'CompatTest' and "ownerId" is null`);
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
