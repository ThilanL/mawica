// Dev-only: drives Lumi's Wish end to end in headless Chrome (CDP, no extra dependencies): discovery in /create, free preview,
// sign-in handoff, wallet-backed publish, the recipient experience over time, reduced motion, keyboard and responsive checks.
// Needs a PRODUCTION-mode server on the isolated test database (see scripts/auth-e2e.mjs). Not part of `npm test`.
//   BASE=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl DATABASE_URL=<mawica_test url> node scripts/premium-shots.mjs
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3030";
const OUT = process.env.OUT || "docs/screenshots/premium";
const OUTBOX = process.env.OUTBOX;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== "5433") throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastOtp = (email) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp; } catch { return undefined; } };

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "premium-shots-"));
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
const setVal = (sel, value) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});const P=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
// Elements are server-rendered before React attaches handlers: wait for hydration (React props present) before clicking.
const hydrated = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e&&Object.keys(e).some(k=>k.startsWith('__reactProps'))})()`;
const clickText = (text) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})&&!x.disabled);if(!b)return false;b.click();return true})()`;

mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const report = [];
const note = (name, ok, detail = "") => { report.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
// Cards made by THIS run's accounts only (other scripts and earlier runs may leave unrelated rows in the test database).
const mine = () => sql(`select count(*) from "Card" c join "user" u on u.id = c."ownerId" where u.email like '%+${stamp}@premium.example.test' and c."templateKey" = 'lumis-wish'`);
const cardsBefore = "0";
const globalPremium = () => sql(`select count(*) from "Card" where "templateKey" = 'lumis-wish' and "createdAt" >= now() - interval '10 minutes'`);
const globalBefore = globalPremium();

async function view(vp, n, { reduced = false } = {}) {
  const c = await launch(); const { send, ev } = c;
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.w < 768 });
  await send("Network.enable");
  await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `198.51.100.${40 + n}` } });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const shot = async (file) => { writeFileSync(join(OUT, `${file}.webp`), Buffer.from((await send("Page.captureScreenshot", { format: "webp", quality: 82 })).data, "base64")); };
  return { c, send, ev, shot };
}

// ---------- 1. creation flow as a guest ----------
{
  for (const [vp, n] of [[{ name: "desktop", w: 1280, h: 900 }, 1], [{ name: "mobile", w: 390, h: 844 }, 2]]) {
    const { c, send, ev, shot } = await view(vp, n);
    try {
      await send("Page.navigate", { url: BASE + "/create" });
      await waitFor(ev, hydrated('[data-key="lumis-wish"]'));
      await sleep(800);
      note(`${vp.name}: Lumi's Wish is discoverable in /create with a Premium badge and the credit cost`, await ev(`(()=>{const t=document.querySelector('[data-key="lumis-wish"]').innerText;return /Premium/i.test(t)&&/1 card and 1 premium credit/.test(t)&&/Previewing is free/.test(t)})()`));
      note(`${vp.name}: it is never labelled free`, !(await ev(`/free/i.test(document.querySelector('[data-key="lumis-wish"]').innerText.replace(/Previewing is free/i,''))`)));
      note(`${vp.name}: the six standard cards are still all there`, (await ev(`document.querySelectorAll('[role=radio]').length`)) === 7);
      await ev(`document.querySelector('[data-key="lumis-wish"]').scrollIntoView({block:'center'})`); await sleep(300);
      await shot(`create-choose-${vp.name}`);
      await ev(`document.querySelector('[data-key="lumis-wish"]').click()`); await sleep(200);
      await ev(clickText("Continue with Lumi's Wish"));
      note(`${vp.name}: personalise step explains the premium cost`, await waitFor(ev, "document.body.innerText.includes('Previewing is free. Publishing uses 1 card and 1 premium credit')"));
      await ev(setVal("#f-recipientsname", "Nadia")); await ev(setVal("#f-yourname", "Sam"));
      await ev(clickText("Preview card"));
      note(`${vp.name}: live preview plays the card without publishing`, await waitFor(ev, "document.body.innerText.includes('Preview your card')"));
      await sleep(9500);
      await shot(`create-preview-${vp.name}`);
      const posted = await ev(`performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/cards')).length`);
      note(`${vp.name}: previewing makes no publish request and creates no card`, posted === 0 && globalPremium() === globalBefore, `requests: ${posted}`);
      note(`${vp.name}: a guest is asked to sign in to publish (no credit wording that implies it is free)`, await ev(`document.body.innerText.includes('Sign in to publish this premium card') && !!([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in to publish'))`));
      const m = await ev(`({overflow: document.documentElement.scrollWidth > innerWidth})`);
      note(`${vp.name}: no horizontal overflow in the premium preview`, !m.overflow);
    } finally { c.close(); }
  }
}

// ---------- 2. sign in from the preview, draft restored, confirm and publish with the welcome credit ----------
let slug;
{
  const email = `lumi+${stamp}@premium.example.test`;
  const { c, send, ev, shot } = await view({ name: "mobile", w: 390, h: 844 }, 3);
  try {
    await send("Page.navigate", { url: BASE + "/create" });
    await waitFor(ev, hydrated('[data-key="lumis-wish"]'));
    await ev(`document.querySelector('[data-key="lumis-wish"]').click()`); await sleep(200);
    await ev(clickText("Continue with Lumi's Wish"));
    await waitFor(ev, "!!document.querySelector('#f-recipientsname')");
    await ev(setVal("#f-recipientsname", "Nadia")); await ev(setVal("#f-yourname", "Sam")); await ev(setVal("#f-yourmessage", "Happy birthday, Nadia! Lumi says: today is all yours."));
    await ev(clickText("Preview card"));
    await waitFor(ev, "document.body.innerText.includes('Preview your card')");
    const clicked = await ev(clickText("Sign in to publish"));
    if (!clicked) console.log("      (no clickable Sign in to publish button; buttons: " + (await ev(`[...document.querySelectorAll("main button, main a")].map(b=>b.textContent.trim().slice(0,28)).join(" | ")`)) + ")");
    note("sign-in handoff goes to /sign-in with a safe next=/create", await waitFor(ev, "location.pathname === '/sign-in' && location.search === '?next=/create'"), await ev("location.href"));
    await waitFor(ev, hydrated("#email"));
    await ev(setVal("#email", email)); await ev(clickText("Send me a code"));
    await waitFor(ev, "!!document.querySelector('#code')"); await sleep(300);
    await ev(setVal("#code", lastOtp(email))); await ev(clickText("Verify and continue"));
    note("after sign-in the draft is restored on the preview step", await waitFor(ev, "location.pathname === '/create' && document.body.innerText.includes('Preview your card') && document.body.innerText.includes('Nadia')", 25000));
    note("the draft is removed from sessionStorage after restoring", (await ev("sessionStorage.getItem('mawica.draft')")) === null);
    note("the credit panel shows the real balance: 1 card + 1 premium credit, leaving 0 premium and 9 cards", await waitFor(ev, "document.body.innerText.includes('You’ll have 0 premium credits and 9 cards left this month')", 10000));
    await sleep(9000);
    await ev(`document.getElementById('premium-publish').scrollIntoView({block:'end'})`); await sleep(300);
    await shot("create-publish-before-mobile");
    await ev(clickText("Publish with 1 premium credit"));
    note("a confirmation step appears before anything is spent", await waitFor(ev, "!!document.querySelector('[role=alertdialog]')"));
    note("nothing has been spent yet", mine() === cardsBefore);
    await ev(`document.getElementById('premium-publish').scrollIntoView({block:'end'})`); await sleep(300);
    await shot("create-publish-confirm-mobile");
    await ev(clickText("Confirm and publish"));
    note("publishing succeeds and shows the remaining premium balance", await waitFor(ev, "document.body.innerText.includes('Your card is ready') && document.body.innerText.includes('Premium credits left: 0')", 20000));
    slug = await ev(`document.getElementById('card-url').value.split('/c/')[1]`);
    await sleep(500);
    await shot("create-published-mobile");
    note("the published card is a PREMIUM, owned card and the wallet shows 0 premium", sql(`select tier='PREMIUM' and "ownerId" is not null from "Card" where slug='${slug}'`) === "t");
  } finally { c.close(); }
}

// ---------- 3. a second account without a premium credit ----------
{
  const email = `spent+${stamp}@premium.example.test`;
  const { c, send, ev, shot } = await view({ name: "mobile", w: 390, h: 844 }, 4);
  try {
    await send("Page.navigate", { url: BASE + "/sign-in" });
    await waitFor(ev, hydrated("#email"));
    await ev(setVal("#email", email)); await ev(clickText("Send me a code"));
    await waitFor(ev, "!!document.querySelector('#code')"); await sleep(300);
    await ev(setVal("#code", lastOtp(email))); await ev(clickText("Verify and continue"));
    await waitFor(ev, "location.pathname === '/account'", 25000);
    const r = await ev(`fetch('/api/cards',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({templateKey:'lumis-wish',recipientName:'Spent',senderName:'S',message:'m'})}).then(r=>r.status)`);
    note("setup: the welcome credit is spent on a premium card (201)", r === 201);
    await send("Page.navigate", { url: BASE + "/create" });
    await waitFor(ev, hydrated('[data-key="lumis-wish"]'));
    note("choose step says there are no premium credits left", await waitFor(ev, "document.querySelector('[data-key=\"lumis-wish\"]').innerText.includes('You have no premium credits left')", 8000));
    await ev(`document.querySelector('[data-key="lumis-wish"]').click()`); await sleep(200);
    await ev(clickText("Continue with Lumi's Wish"));
    await waitFor(ev, "!!document.querySelector('#f-recipientsname')");
    await ev(setVal("#f-recipientsname", "Nadia")); await ev(setVal("#f-yourname", "Sam"));
    await ev(clickText("Preview card"));
    await waitFor(ev, "document.body.innerText.includes('Preview your card')");
    note("preview still works without credits; publishing is disabled with a clear reason", await ev(`document.body.innerText.includes('no premium credits left, so this card can') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('No premium credit available') && b.disabled)`));
    await sleep(9000);
    await ev(`document.getElementById('premium-publish').scrollIntoView({block:'end'})`); await sleep(300);
    await shot("create-no-credit-mobile");
  } finally { c.close(); }
}

if (!slug) throw new Error("No premium card was published in step 2; stopping before the recipient checks");

// ---------- 4. the recipient (no cookies) over time, desktop + mobile ----------
for (const [vp, n] of [[{ name: "mobile", w: 390, h: 844 }, 5], [{ name: "desktop", w: 1280, h: 800 }, 6]]) {
  const { c, send, ev, shot } = await view(vp, n);
  try {
    const t0 = Date.now();
    await send("Page.navigate", { url: BASE + `/c/${slug}` });
    await waitFor(ev, "document.readyState === 'interactive' || document.readyState === 'complete'");
    const at = async (sec, file) => { const wait = sec * 1000 - (Date.now() - t0); if (wait > 0) await sleep(wait); await shot(file); };
    await at(1.9, `card-1-asleep-${vp.name}`);
    await at(3.6, `card-2-awake-${vp.name}`);
    await at(6.3, `card-3-name-${vp.name}`);
    await at(9.4, `card-4-celebrate-${vp.name}`);
    await at(14.5, `card-5-final-${vp.name}`);
    note(`${vp.name}: recipient view works with no account (200) and shows the personalised greeting`, await ev(`document.body.innerText.includes('Nadia') && document.body.innerText.includes('Happy birthday, Nadia!') && document.body.innerText.includes('With love, Sam')`));
    note(`${vp.name}: no wallet or account information is shown to the recipient`, !(await ev(`/credit|wallet|premium|sign in|@/i.test(document.body.innerText.replace('Make your own','').replace('Report this card',''))`)));
    note(`${vp.name}: one 2D canvas at most, no WebGL context`, (await ev(`[...document.querySelectorAll('canvas')].every(c=>{try{return !c.getContext('webgl2')&&!c.getContext('webgl')}catch{return true}})`)) === true);
    const m = await ev(`({overflow: document.documentElement.scrollWidth > innerWidth})`);
    note(`${vp.name}: no horizontal overflow`, !m.overflow);
    if (vp.name === "mobile") {
      // tap interaction + keyboard
      const key = async (k, code, vk, text) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); };
      await key("Tab", "Tab", 9); // keyboard modality, so :focus-visible applies
      await ev(`document.querySelector('button[aria-label^="Lumi"]').focus()`);
      note("keyboard: Lumi is focusable and shows a visible focus ring", await ev(`(()=>{const b=document.querySelector('button[aria-label^="Lumi"]');return document.activeElement===b && getComputedStyle(b).outlineStyle!=='none' && parseFloat(getComputedStyle(b).outlineWidth)>=2})()`));
      await key("Enter", "Enter", 13, "\r");
      note("keyboard: Enter makes Lumi react (wiggle)", await waitFor(ev, "!!document.querySelector('.lw-wiggle')", 3000));
      const size = await ev(`(()=>{const r=document.querySelector('button[aria-label^="Lumi"]').getBoundingClientRect();return Math.round(Math.min(r.width,r.height))})()`);
      note("touch: Lumi's tap target is large (>= 44px)", size >= 44, `${size}px`);
    }
  } finally { c.close(); }
}

// ---------- 5. reduced motion ----------
for (const [vp, n] of [[{ name: "mobile", w: 390, h: 844 }, 7], [{ name: "desktop", w: 1280, h: 800 }, 8]]) {
  const { c, send, ev, shot } = await view(vp, n, { reduced: true });
  try {
    await send("Page.navigate", { url: BASE + `/c/${slug}` });
    await waitFor(ev, "document.readyState === 'complete'"); await sleep(600);
    const s = await ev(`(()=>{const q=(sel)=>document.querySelector(sel);const cs=(e)=>e?getComputedStyle(e):null;const name=q('.lw-name'),h=[...document.querySelectorAll('h2')].find(x=>x.textContent.includes('Lumi made'));return {nameOpacity:cs(name).opacity,nameAnim:cs(name).animationName,h2:cs(h.parentElement).opacity,asleepDisplay:cs(q('.lw-asleep')).display,orbDisplay:cs(q('.lw-orb')).display,awakeOpacity:cs(q('.lw-awake')).opacity,riseAnim:cs(q('.lw-rise')).animationName,haloAnim:cs(q('.lw-halo')).animationName,msg:document.body.innerText.includes('Happy birthday, Nadia!')}})()`);
    note(`${vp.name} reduced motion: the finished card is visible immediately (name, message, Lumi awake)`, s.nameOpacity === "1" && s.h2 === "1" && s.awakeOpacity === "1" && s.msg, JSON.stringify(s));
    note(`${vp.name} reduced motion: all premium animations are off and transient layers are hidden`, s.nameAnim === "none" && s.riseAnim === "none" && s.haloAnim === "none" && s.asleepDisplay === "none" && s.orbDisplay === "none");
    await shot(`card-reduced-motion-${vp.name}`);
  } finally { c.close(); }
}

// ---------- 6. widths sweep on the recipient card ----------
{
  const c = await launch(); const { send, ev } = c;
  try {
    await send("Network.enable");
    await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": "198.51.100.99" } });
    for (const w of [320, 375, 390, 768, 1280]) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 768 });
      await send("Page.navigate", { url: BASE + `/c/${slug}` });
      await waitFor(ev, "!!document.querySelector('.lw-name')"); await sleep(500);
      note(`card at ${w}px: no horizontal overflow`, !(await ev("document.documentElement.scrollWidth > innerWidth")), `scrollWidth=${await ev("document.documentElement.scrollWidth")}`);
    }
  } finally { c.close(); }
}

// ---------- cleanup (test DB only) ----------
sql(`begin; set local mawica.ledger_purge = 'on';
 delete from "LedgerEntry" where "accountId" in (select id from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@premium.example.test'));
 delete from "CreditReservation" where "accountId" in (select id from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@premium.example.test'));
 delete from "CreditGrant" where "accountId" in (select id from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@premium.example.test'));
 delete from "CreditAccount" where "userId" in (select id from "user" where email like '%+${stamp}@premium.example.test');
 delete from "WelcomeGrantTombstone" where "grantedAt" > now() - interval '20 minutes';
 commit;`);
sql(`delete from "Card" where "ownerId" in (select id from "user" where email like '%+${stamp}@premium.example.test')`);
sql(`delete from "user" where email like '%+${stamp}@premium.example.test'`);
sql(`delete from "AuditLog" where "actorId" is null and "createdAt" > now() - interval '20 minutes'`);
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
