// Dev-only: drives the real UI (headless Chrome over CDP, no extra dependencies), takes wallet screenshots and responsive
// checks. Needs a PRODUCTION-mode server on the isolated test database (see scripts/auth-e2e.mjs). Not part of `npm test`.
//   BASE=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl DATABASE_URL=<mawica_test url> node scripts/wallet-shots.mjs
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3030";
const OUT = process.env.OUT || "docs/screenshots/wallet";
const OUTBOX = process.env.OUTBOX;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== (process.env.MAWICA_PG_PORT ?? "5433")) throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastOtp = (email) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp; } catch { return undefined; } };

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "wallet-shots-"));
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
const setInput = (sel, value) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
const clickText = (text) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`;

mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const report = [];
const note = (name, ok, detail = "") => { report.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function session(vp, n) {
  const c = await launch(); const { send, ev } = c;
  const email = `wshots${n}+${stamp}@wshots.example.test`;
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.w < 768 });
  await send("Network.enable");
  await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `198.51.100.${120 + n}` } });
  const shot = async (file) => {
    const height = Math.max(vp.h, await ev("Math.ceil(document.documentElement.scrollHeight)"));
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height, deviceScaleFactor: 2, mobile: vp.w < 768 });
    await sleep(250);
    writeFileSync(join(OUT, `${file}.webp`), Buffer.from((await send("Page.captureScreenshot", { format: "webp", quality: 80 })).data, "base64"));
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.w < 768 });
  };
  const open = async (path) => { await send("Page.navigate", { url: BASE + path }); await waitFor(c.ev, "document.readyState === 'complete'"); };
  const signIn = async () => {
    await open("/sign-in");
    await waitFor(ev, "!!document.querySelector('#email')");
    await ev(setInput("#email", email)); await ev(clickText("Send me a code"));
    await waitFor(ev, "!!document.querySelector('#code')"); await sleep(300);
    await ev(setInput("#code", lastOtp(email))); await ev(clickText("Verify and continue"));
    return waitFor(ev, "location.pathname === '/account'", 25000);
  };
  try {
    note(`${vp.name}: sign in through the UI`, await signIn());

    // loading state: slow the wallet API so the skeleton is visible
    await send("Network.emulateNetworkConditions", { offline: false, latency: 2500, downloadThroughput: -1, uploadThroughput: -1 });
    await open("/account/wallet");
    note(`${vp.name}: loading skeleton is shown while the API is slow`, await waitFor(ev, "!!document.querySelector('[role=status][aria-label=\"Loading your wallet\"]')", 8000));
    await shot(`wallet-loading-${vp.name}`);
    await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    // empty state: a brand new wallet with no cards
    await open("/account/wallet");
    note(`${vp.name}: wallet shows 10 cards left, empty activity`, await waitFor(ev, "document.body.innerText.includes('cards left this month') && document.body.innerText.includes('No cards yet')"));
    note(`${vp.name}: welcome gift shown as a real premium credit`, await ev("document.body.innerText.includes('Your welcome gift')"));
    await sleep(500);
    await shot(`wallet-empty-${vp.name}`);

    // publish two cards through the real API as this signed-in browser, then reload
    const made = await ev(`(async()=>{const out=[];for(let i=0;i<2;i++){const r=await fetch('/api/cards',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({templateKey:i?'christmas-tree':'snow-globe',recipientName:'WalletShot',senderName:'Sam',message:'Hello'})});out.push(r.status)}return out.join(',')})()`);
    note(`${vp.name}: two signed-in cards published (201,201)`, made === "201,201", made);
    await open("/account/wallet");
    note(`${vp.name}: wallet now shows 8 left and two published cards`, await waitFor(ev, "document.body.innerText.includes('2 of 10 used') && document.body.innerText.includes('Published: Christmas Snow Globe') && document.body.innerText.includes('Published: Magical Christmas Tree')"));
    await sleep(500);
    await shot(`wallet-${vp.name}`);
    const m = await ev(`(()=>({overflow: document.documentElement.scrollWidth > innerWidth, small:[...document.querySelectorAll('main button, main a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<44&&!e.closest('[hidden]')}).map(e=>e.textContent.trim().slice(0,24)+':'+Math.round(e.getBoundingClientRect().height))}))()`);
    note(`${vp.name}: wallet has no horizontal overflow`, !m.overflow);
    if (m.small.length) console.log(`      smaller than 44px (informational): ${m.small.join(", ")}`);

    // error state: block the API
    await send("Network.setBlockedURLs", { urls: ["*/api/wallet*"] });
    await open("/account/wallet");
    note(`${vp.name}: error state with retry when the API fails`, await waitFor(ev, "!!document.querySelector('[role=alert]') && document.body.innerText.includes('Try again')", 10000));
    await shot(`wallet-error-${vp.name}`);
    await send("Network.setBlockedURLs", { urls: [] });
    await ev(clickText("Try again"));
    note(`${vp.name}: retry recovers`, await waitFor(ev, "document.body.innerText.includes('cards left this month')", 10000));

    // signed-out visitor
    await ev(`fetch('/api/auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(()=>1)`);
    await open("/account/wallet"); await sleep(1500);
    note(`${vp.name}: signed-out visitor is sent to sign-in`, await ev("location.pathname === '/sign-in'"));
  } finally { c.close(); }
}
await session({ name: "desktop", w: 1280, h: 800 }, 1);
await session({ name: "mobile", w: 390, h: 844 }, 2);

{ // width sweep for the wallet page itself needs a session: reuse one at 320 and 768
  for (const [w, n] of [[320, 3], [768, 4]]) {
    const c = await launch(); const { send, ev } = c;
    const email = `wsweep${n}+${stamp}@wshots.example.test`;
    try {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 768 });
      await send("Network.enable");
      await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `198.51.100.${150 + n}` } });
      await send("Page.navigate", { url: BASE + "/sign-in" });
      await waitFor(ev, "!!document.querySelector('#email')");
      await ev(setInput("#email", email)); await ev(clickText("Send me a code"));
      await waitFor(ev, "!!document.querySelector('#code')"); await sleep(300);
      await ev(setInput("#code", lastOtp(email))); await ev(clickText("Verify and continue"));
      await waitFor(ev, "location.pathname === '/account'", 25000);
      await send("Page.navigate", { url: BASE + "/account/wallet" });
      await waitFor(ev, "document.body.innerText.includes('cards left this month')", 15000); await sleep(400);
      note(`wallet at ${w}px: no horizontal overflow`, !(await ev("document.documentElement.scrollWidth > innerWidth")), `scrollWidth=${await ev("document.documentElement.scrollWidth")}`);
    } finally { c.close(); }
  }
}

sql(`begin; set local mawica.ledger_purge = 'on';
 delete from "LedgerEntry" where "accountId" in (select id from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@wshots.example.test'));
 delete from "CreditReservation" where "accountId" in (select id from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@wshots.example.test'));
 delete from "CreditGrant" where "accountId" in (select id from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@wshots.example.test'));
 delete from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@wshots.example.test');
 delete from "WelcomeGrantTombstone" where "grantedAt" > now() - interval '15 minutes';
 commit;`);
sql(`delete from "Card" where "recipientName" = 'WalletShot'`);
sql(`delete from "user" where email like '%+${stamp}@wshots.example.test'`);
sql(`delete from "AuditLog" where "actorId" is null and "createdAt" > now() - interval '15 minutes'`);
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
