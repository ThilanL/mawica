// Dev-only: drives the real sign-in UI in headless Chrome (CDP, no extra dependencies), saves screenshots and runs
// responsive checks. Needs a PRODUCTION-mode server started like scripts/auth-e2e.mjs describes (isolated test database,
// local mail outbox). Not part of `npm test`.
//
//   BASE=http://127.0.0.1:3030 OUTBOX=/tmp/outbox.jsonl DATABASE_URL=<mawica_test url> node scripts/account-shots.mjs
// OUT = screenshot folder (default docs/screenshots/accounts)
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:3030";
const OUT = process.env.OUT || "docs/screenshots/accounts";
const OUTBOX = process.env.OUTBOX;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== "5433") throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastOtp = (email) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp; } catch { return undefined; } };

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "acct-shots-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up */ } if (!page) await sleep(250); }
  if (!page) { chrome.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  return { send, ev, close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } };
}
const waitFor = async (ev, expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };

const setInput = (sel, value) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
const clickText = (text) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`;

mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const report = [];
const note = (name, ok, detail = "") => { report.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function journey(vp, n) {
  const { name, w, h } = vp;
  const c = await launch(); const { send, ev } = c;
  const email = `shots${n}+${stamp}@screens.example.test`;
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: w < 768 });
    await send("Network.enable");
    await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `198.51.100.${20 + n}` } });
    const shot = async (file, full = true) => {
      let height = h;
      if (full) height = Math.max(h, (await ev("Math.ceil(document.documentElement.scrollHeight)")));
      await send("Emulation.setDeviceMetricsOverride", { width: w, height, deviceScaleFactor: 2, mobile: w < 768 });
      await sleep(250);
      const r = await send("Page.captureScreenshot", { format: "webp", quality: 80 });
      writeFileSync(join(OUT, `${file}.webp`), Buffer.from(r.data, "base64"));
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: w < 768 });
    };
    await send("Page.navigate", { url: BASE + "/sign-in" });
    if (!(await waitFor(ev, "!!document.querySelector('#email')"))) throw new Error("sign-in form did not render");
    await sleep(600);
    await shot(`signin-email-${name}`);
    note(`${name}: email step renders`, true);

    await ev(setInput("#email", email)); await sleep(100);
    await ev(clickText("Send me a code"));
    note(`${name}: code step appears after requesting a code`, await waitFor(ev, "!!document.querySelector('#code')"));
    await sleep(400);
    note(`${name}: code field is focused`, await ev("document.activeElement && document.activeElement.id === 'code'"));
    await shot(`signin-code-${name}`);

    await ev(setInput("#code", "000000")); await sleep(100);
    await ev(clickText("Verify and continue"));
    note(`${name}: wrong code shows an accessible error`, await waitFor(ev, "!!document.querySelector('[role=alert]')"));
    await sleep(300);
    await shot(`signin-error-${name}`);

    const otp = lastOtp(email);
    await ev(setInput("#code", otp)); await sleep(100);
    await ev(clickText("Verify and continue"));
    note(`${name}: correct code lands on /account`, await waitFor(ev, "location.pathname === '/account' && !!document.querySelector('#displayName')", 25000));
    await sleep(800);
    await shot(`account-${name}`);

    await ev(setInput("#displayName", "Nadia")); await sleep(100);
    await ev(clickText("Save changes"));
    note(`${name}: profile saves`, await waitFor(ev, "document.body.innerText.includes('Saved.')"));

    await send("Page.navigate", { url: BASE + "/" });
    await waitFor(ev, "!!document.querySelector('header')");
    note(`${name}: header becomes session-aware (initial shown, Sign In gone)`, await waitFor(ev, "!!document.querySelector('header a[aria-label=\"Your account\"]') || [...document.querySelectorAll('#mobile-menu a')].some(a=>a.textContent.includes('Your account'))", 8000));
    await shot(`home-signedin-${name}`, false);

    // responsive + tap-target checks on both pages
    for (const path of ["/sign-in", "/account"]) {
      await send("Page.navigate", { url: BASE + path });
      await waitFor(ev, "document.readyState === 'complete'"); await sleep(700);
      const m = await ev(`(()=>{const small=[...document.querySelectorAll('main button, main input, main select, main a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<44&&!e.closest('[hidden]')}).map(e=>(e.textContent||e.id||e.tagName).trim().slice(0,24)+':'+Math.round(e.getBoundingClientRect().height));return {overflow: document.documentElement.scrollWidth > innerWidth, small}})()`);
      note(`${name}: ${path} has no horizontal overflow`, !m.overflow);
      if (m.small.length) console.log(`      smaller than 44px (informational): ${m.small.join(", ")}`);
    }
    // sign out through the UI
    await send("Page.navigate", { url: BASE + "/account" });
    await waitFor(ev, "!!document.querySelector('#displayName')");
    await ev(clickText("Sign out"));
    note(`${name}: sign out returns to the homepage, signed out`, await waitFor(ev, "location.pathname === '/'", 10000));
    await send("Page.navigate", { url: BASE + "/account" });
    await sleep(1500);
    note(`${name}: /account is closed again after sign out`, await ev("location.pathname === '/sign-in'"));
  } finally { c.close(); }
}

await journey({ name: "desktop", w: 1280, h: 800 }, 1);
await journey({ name: "mobile", w: 390, h: 844 }, 2);

// widths sweep on the static sign-in page (no session needed)
{
  const c = await launch(); const { send, ev } = c;
  try {
    await send("Network.enable");
    await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": "198.51.100.77" } });
    for (const w of [320, 375, 390, 768, 1280]) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 768 });
      await send("Page.navigate", { url: BASE + "/sign-in" });
      await waitFor(ev, "!!document.querySelector('#email')"); await sleep(400);
      note(`sign-in at ${w}px: no horizontal overflow`, !(await ev("document.documentElement.scrollWidth > innerWidth")), `scrollWidth=${await ev("document.documentElement.scrollWidth")}`);
    }
  } finally { c.close(); }
}

sql(`delete from "user" where email like '%+${stamp}@screens.example.test'`);
sql(`delete from "AuditLog" where "actorId" is null and "createdAt" > now() - interval '10 minutes'`);
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
