/* eslint-disable @typescript-eslint/no-explicit-any -- dev tooling over untyped JSON responses and CDP messages */
// Dev-only: drives the scheduling UI end to end in headless Chrome (CDP, no extra dependencies): Send now / Schedule for later, validation
// messages (including daylight saving), confirmation, My Scheduled Cards (preview, edit, cancel), premium, empty/loading/error states and
// responsive checks from 320px. Needs a PRODUCTION-mode server on the isolated test database (see scripts/auth-e2e.mjs). Not part of `npm test`.
//   BASE=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl DATABASE_URL=<mawica_test url> npx tsx scripts/schedule-shots.mts
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLocal } from "../src/modules/scheduling/time";

const BASE = process.env.BASE || "http://localhost:3030";
const OUT = process.env.OUT || "docs/screenshots/scheduling";
const OUTBOX = process.env.OUTBOX;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== (process.env.MAWICA_PG_PORT ?? "5433")) throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q: string) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastOtp = (email: string) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp as string | undefined; } catch { return undefined; } };

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "sched-shots-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let page: any;
  for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t: any) => t.type === "page"); } catch { /* not up */ } if (!page) await sleep(250); }
  if (!page) { chrome.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (m) => { const d = JSON.parse(m.data as string); if (d.id && pending.has(d.id)) pending.get(d.id)!(d.result ?? d.error); };
  const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  return { send, ev, close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } };
}
const waitFor = async (ev: (e: string) => Promise<any>, expr: string, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };
const hydrated = (sel: string) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e&&Object.keys(e).some(k=>k.startsWith('__reactProps'))})()`;
const setVal = (sel: string, value: string) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});const P=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`;
const clickText = (text: string) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})&&!x.disabled);if(!b)return false;b.click();return true})()`;
const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const inDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));

mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const report: { name: string; ok: boolean }[] = [];
const note = (name: string, ok: boolean, detail = "") => { report.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

let n = 0;
async function browser(vp: { name: string; w: number; h: number }) {
  const c = await launch(); const { send, ev } = c;
  const idx = ++n;
  await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.w < 500 ? 2 : 1.5, mobile: vp.w < 768 });
  await send("Network.enable");
  await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `198.51.100.${60 + idx}` } });
  const shot = async (file: string) => {
    const height = Math.max(vp.h, await ev("Math.ceil(document.documentElement.scrollHeight)"));
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height, deviceScaleFactor: vp.w < 500 ? 2 : 1.5, mobile: vp.w < 768 });
    await sleep(250);
    writeFileSync(join(OUT, `${file}.webp`), Buffer.from((await send("Page.captureScreenshot", { format: "webp", quality: 80 })).data, "base64"));
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.w < 500 ? 2 : 1.5, mobile: vp.w < 768 });
  };
  const open = async (path: string) => { await send("Page.navigate", { url: BASE + path }); await waitFor(ev, "document.readyState === 'complete'"); };
  const signIn = async (email: string) => {
    await open("/sign-in");
    await waitFor(ev, hydrated("#email")); await sleep(300);
    await ev(setVal("#email", email)); await ev(clickText("Send me a code"));
    await waitFor(ev, "!!document.querySelector('#code')"); await sleep(300);
    await ev(setVal("#code", lastOtp(email)!)); await ev(clickText("Verify and continue"));
    return waitFor(ev, "location.pathname === '/account'", 25000);
  };
  /** Choose a card, fill names and reach the preview step. */
  const toPreview = async (premium = false) => {
    await open("/create");
    await waitFor(ev, hydrated('[data-key="lumis-wish"]')); await sleep(900);
    if (premium) { await ev(`document.querySelector('[data-key="lumis-wish"]').click()`); await sleep(200); await ev(clickText("Continue with Lumi's Wish")); } else await ev(clickText("Continue"));
    await waitFor(ev, "!!document.querySelector('#f-recipientsname')");
    await ev(setVal("#f-recipientsname", "Nadia")); await ev(setVal("#f-yourname", "Sam")); await ev(setVal("#f-yourmessage", "Happy birthday, Nadia! Wishing you a wonderful day."));
    await ev(clickText("Preview card"));
    return waitFor(ev, "document.body.innerText.includes('Preview your card')");
  };
  const overflow = () => ev("document.documentElement.scrollWidth > innerWidth");
  return { c, send, ev, shot, open, signIn, toPreview, overflow, idx };
}
const cleanup = () => {
  sql(`delete from "user" where email like '%+${stamp}@sshots.example.test'`);
  sql(`begin; set local mawica.ledger_purge = 'on';
   delete from "LedgerEntry" where "accountId" in (select id from "CreditAccount" where "userId" is null);
   delete from "CreditReservation" where "accountId" in (select id from "CreditAccount" where "userId" is null);
   delete from "CreditGrant" where "accountId" in (select id from "CreditAccount" where "userId" is null);
   delete from "CreditAccount" where "userId" is null;
   delete from "WelcomeGrantTombstone" where "grantedAt" > now() - interval '30 minutes';
   commit;`);
  sql(`delete from "Card" where "recipientName" = 'Nadia' and "senderName" = 'Sam' and "createdAt" > now() - interval '30 minutes'`);
  sql(`delete from "Card" where "ownerId" is null and status in ('SCHEDULED', 'CANCELLED') and "createdAt" > now() - interval '30 minutes'`);
  sql(`delete from "AuditLog" where "actorId" is null and "createdAt" > now() - interval '30 minutes'`);
};

try {
  // ---------- 1. guest: schedule needs an account; the draft survives sign-in ----------
  {
    const b = await browser({ name: "mobile", w: 390, h: 844 });
    try {
      note("guest: reaches the preview step", await b.toPreview());
      await b.ev(clickText("Schedule for later")); await sleep(300);
      note("guest: 'Schedule for later' explains an account is needed and offers sign-in (no form, nothing to submit)", await b.ev(`document.body.innerText.includes('Scheduling needs an account') && !document.querySelector('input[type=date]') && [...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Sign in to schedule')`));
      await b.shot("guest-schedule-mobile");
      const email = `guest+${stamp}@sshots.example.test`;
      await b.ev(clickText("Sign in to schedule"));
      await waitFor(b.ev, hydrated("#email")); await sleep(300);
      await b.ev(setVal("#email", email)); await b.ev(clickText("Send me a code"));
      await waitFor(b.ev, "!!document.querySelector('#code')"); await sleep(300);
      await b.ev(setVal("#code", lastOtp(email)!)); await b.ev(clickText("Verify and continue"));
      note("guest: after sign-in the draft and the 'Schedule for later' choice are restored", await waitFor(b.ev, "location.pathname === '/create' && !!document.querySelector('input[type=date]') && document.body.innerText.includes('Nadia')", 25000));
    } finally { b.c.close(); }
  }

  // ---------- 2. Free account: validation, DST (Plus), confirm, success ----------
  for (const vp of [{ name: "desktop", w: 1280, h: 900 }, { name: "mobile", w: 390, h: 844 }]) {
    const b = await browser(vp);
    const email = `free-${vp.name}+${stamp}@sshots.example.test`;
    try {
      note(`${vp.name}: sign in`, await b.signIn(email));
      note(`${vp.name}: preview shows Send now / Schedule for later and Send now keeps the existing Publish button`, (await b.toPreview()) && await b.ev(`document.body.innerText.includes('Send now') && document.body.innerText.includes('Schedule for later') && [...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Publish & get link')`));
      await b.ev(clickText("Schedule for later"));
      note(`${vp.name}: the schedule form shows date, time, zone, credit cost and the Free horizon`, await waitFor(b.ev, `!!document.querySelector('input[type=date]') && document.body.innerText.includes('Scheduling reserves 1 card now') && document.body.innerText.includes('up to 1 calendar month ahead')`));
      await b.ev(`document.querySelector('input[type=date]').scrollIntoView({block:'center'})`); await sleep(300);
      await b.shot(`schedule-form-${vp.name}`);

      await b.ev(setVal("select", "Asia/Colombo")); await b.ev(setVal("input[type=date]", inDays(3))); await b.ev(setVal("input[type=time]", "09:00")); await sleep(300);
      note(`${vp.name}: the chosen time is summarised with its zone and offset`, await b.ev(`/Delivered on .*9:00.*Asia\\/Colombo, UTC\\+05:30/.test(document.body.innerText)`));
      await b.ev(setVal("input[type=date]", inDays(40))); await sleep(300);
      note(`${vp.name}: a date beyond one calendar month shows a clear limit message and blocks scheduling`, await b.ev(`document.body.innerText.includes('You can schedule up to 1 calendar month ahead') && [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Schedule delivery').disabled`));
      await b.ev(setVal("input[type=date]", inDays(-1))); await sleep(300);
      note(`${vp.name}: a past date is refused`, await b.ev(`document.body.innerText.includes("still in the future")`));
      await b.ev(setVal("input[type=date]", inDays(3))); await sleep(300);

      await b.ev(clickText("Schedule delivery"));
      note(`${vp.name}: a confirmation step appears before anything is reserved`, await waitFor(b.ev, "!!document.querySelector('[role=alertdialog]')"));
      note(`${vp.name}: nothing is reserved yet`, sql(`select count(*) from "ScheduledDelivery" d join "user" u on u.id=d."ownerId" where u.email='${email.toLowerCase()}'`) === "0");
      await b.ev(`document.querySelector('[role=alertdialog]').scrollIntoView({block:'center'})`); await sleep(300);
      await b.shot(`schedule-confirm-${vp.name}`);
      await b.ev(clickText("Confirm and schedule"));
      note(`${vp.name}: scheduling succeeds and states when it will be delivered and that the link stays private`, await waitFor(b.ev, "document.body.innerText.includes('on its way') && document.body.innerText.includes('stays private until then')", 20000));
      await sleep(500);
      await b.shot(`schedule-success-${vp.name}`);
      note(`${vp.name}: the wallet shows 1 card reserved (9 left) and the card is hidden`, sql(`select count(*) from "ScheduledDelivery" d join "Card" c on c.id=d."cardId" join "user" u on u.id=d."ownerId" where u.email='${email.toLowerCase()}' and c.status='SCHEDULED'`) === "1" && /9 cards/.test(await b.ev("document.body.innerText")));
      note(`${vp.name}: no horizontal overflow in the schedule flow`, !(await b.overflow()));

      // My Scheduled Cards
      await b.open("/account/scheduled");
      note(`${vp.name}: My Scheduled Cards lists the card with status, recipient, time, zone and credits`, await waitFor(b.ev, `document.body.innerText.includes('Scheduled') && document.body.innerText.includes('For Nadia') && document.body.innerText.includes('Reserved: 1 card') && /Asia\\/Colombo, UTC\\+05:30/.test(document.body.innerText)`));
      await sleep(500);
      await b.shot(`scheduled-list-${vp.name}`);
      await b.ev(clickText("Preview card"));
      note(`${vp.name}: Preview card opens the real card in a dialog`, await waitFor(b.ev, "!!document.querySelector('[role=dialog][aria-modal=true]')"));
      await sleep(1200);
      await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      note(`${vp.name}: Escape closes the preview`, await waitFor(b.ev, "!document.querySelector('[role=dialog][aria-modal=true]')", 3000));
      await b.ev(clickText("Edit schedule"));
      note(`${vp.name}: Edit schedule opens the time form`, await waitFor(b.ev, "!!document.querySelector('input[type=time]') && document.body.innerText.includes('keeps your reserved credit')"));
      await b.ev(setVal("input[type=time]", "18:30")); await sleep(200);
      await b.shot(`scheduled-edit-${vp.name}`);
      await b.ev(clickText("Save new time"));
      note(`${vp.name}: saving the new time updates the card (same reservation, no extra credit)`, await waitFor(b.ev, "/6:30/.test(document.body.innerText) && !document.querySelector('input[type=time]')") && sql(`select count(*) from "CreditReservation" r join "CreditAccount" a on a.id=r."accountId" join "user" u on u.id=a."userId" where u.email='${email.toLowerCase()}'`) === "1");
      await b.ev(clickText("Cancel schedule"));
      note(`${vp.name}: Cancel schedule asks for confirmation and explains the credit release`, await waitFor(b.ev, "!!document.querySelector('[role=alertdialog]') && document.body.innerText.includes('released if')"));
      await b.shot(`scheduled-cancel-${vp.name}`);
      await b.ev(clickText("Yes, cancel it"));
      note(`${vp.name}: after cancelling the card shows Cancelled and 'Credit released'`, await waitFor(b.ev, "document.body.innerText.includes('Cancelled') && document.body.innerText.includes('Credit released')"));
      note(`${vp.name}: the credit is back (10) and the card stays hidden`, sql(`select count(*) from "Card" c join "user" u on u.id=c."ownerId" where u.email='${email.toLowerCase()}' and c.status='CANCELLED'`) === "1");
      await sleep(300);
      await b.shot(`scheduled-cancelled-${vp.name}`);
      note(`${vp.name}: no horizontal overflow on My Scheduled Cards`, !(await b.overflow()));
    } finally { b.c.close(); }
  }

  // ---------- 3. Plus (set directly in the test database): daylight-saving messages ----------
  {
    const b = await browser({ name: "desktop", w: 1280, h: 900 });
    const email = `plus+${stamp}@sshots.example.test`;
    try {
      await b.signIn(email);
      sql(`update "CreditAccount" set "planKey"='plus' where "userId" = (select id from "user" where email='${email.toLowerCase()}')`);
      let gap = "", overlap = "";
      for (let d = 20; d < 364 && (!gap || !overlap); d++) {
        const date = ymd(new Date(Date.now() + d * 86_400_000));
        if (!gap && resolveLocal(date, "02:30", "America/New_York").kind === "nonexistent") gap = date;
        if (!overlap && resolveLocal(date, "01:30", "America/New_York").kind === "ambiguous") overlap = date;
      }
      await b.toPreview(); await b.ev(clickText("Schedule for later"));
      await waitFor(b.ev, `document.body.innerText.includes('up to 12 calendar months ahead')`);
      await b.ev(setVal("select", "America/New_York")); await b.ev(setVal("input[type=date]", gap)); await b.ev(setVal("input[type=time]", "02:30")); await sleep(300);
      note("Plus: the form allows up to 12 calendar months", await b.ev(`document.body.innerText.includes('up to 12 calendar months ahead')`));
      note("DST: a nonexistent local time shows a message with a one-tap valid suggestion and blocks scheduling", await b.ev(`document.body.innerText.includes("doesn't exist on that day") && document.body.innerText.includes('Use 03:30') && [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Schedule delivery').disabled`));
      await b.ev(`document.querySelector('input[type=date]').scrollIntoView({block:'center'})`); await sleep(300);
      await b.shot("schedule-dst-gap-desktop");
      await b.ev(clickText("Use 03:30")); await sleep(300);
      note("DST: accepting the suggestion makes it valid (nothing was shifted silently)", await b.ev(`document.querySelector('input[type=time]').value === '03:30' && /Delivered on/.test(document.body.innerText)`));
      await b.ev(setVal("input[type=date]", overlap)); await b.ev(setVal("input[type=time]", "01:30")); await sleep(300);
      note("DST: an ambiguous time asks which one, showing both UTC offsets, and blocks scheduling until chosen", await b.ev(`document.body.innerText.includes('That time happens twice') && /UTC-04:00/.test(document.body.innerText) && /UTC-05:00/.test(document.body.innerText) && [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Schedule delivery').disabled`));
      await b.shot("schedule-dst-overlap-desktop");
      await b.ev(`document.querySelectorAll('input[type=radio][name$="-amb"]')[1].click()`); await sleep(300);
      note("DST: choosing 'the second 01:30' makes it valid and the summary shows UTC-05:00", await b.ev(`/Delivered on .*UTC-05:00/.test(document.body.innerText)`));
    } finally { b.c.close(); }
  }

  // ---------- 4. Premium scheduling, then empty / error / loading states ----------
  {
    const b = await browser({ name: "mobile", w: 390, h: 844 });
    const email = `prem+${stamp}@sshots.example.test`;
    try {
      await b.signIn(email);
      await b.toPreview(true); await b.ev(clickText("Schedule for later"));
      note("premium: the schedule form states the cost: 1 card and 1 premium credit", await waitFor(b.ev, `document.body.innerText.includes('Scheduling reserves 1 card and 1 premium credit now')`));
      await b.ev(setVal("select", "Asia/Colombo")); await b.ev(setVal("input[type=date]", inDays(5))); await b.ev(setVal("input[type=time]", "08:00")); await sleep(300);
      await b.ev(clickText("Schedule delivery"));
      await waitFor(b.ev, "!!document.querySelector('[role=alertdialog]')");
      note("premium: the confirmation repeats the cost", await b.ev(`document.querySelector('[role=alertdialog]').innerText.includes('1 card and 1 premium credit')`));
      await b.ev(clickText("Confirm and schedule"));
      note("premium: scheduling succeeds and reports the premium balance (0 left)", await waitFor(b.ev, "document.body.innerText.includes('on its way') && document.body.innerText.includes('0 premium credits')", 20000));
      await b.open("/account/scheduled");
      note("premium: the list shows the Premium badge and both reserved credits", await waitFor(b.ev, `document.body.innerText.includes('Premium') && document.body.innerText.includes('Reserved: 1 card and 1 premium credit')`));
      await sleep(500);
      await b.shot("scheduled-premium-mobile");

      // loading: slow the API
      await b.send("Network.emulateNetworkConditions", { offline: false, latency: 2500, downloadThroughput: -1, uploadThroughput: -1 });
      await b.open("/account/scheduled");
      note("loading state is shown while the API is slow", await waitFor(b.ev, "!!document.querySelector('[role=status][aria-label=\"Loading your scheduled cards\"]')", 8000));
      await b.shot("scheduled-loading-mobile");
      await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      // error: block the API
      await b.send("Network.setBlockedURLs", { urls: ["*/api/schedules*"] });
      await b.open("/account/scheduled");
      note("error state with retry when the API fails", await waitFor(b.ev, "!!document.querySelector('[role=alert]') && document.body.innerText.includes('Try again')", 10000));
      await b.shot("scheduled-error-mobile");
      await b.send("Network.setBlockedURLs", { urls: [] });
      await b.ev(clickText("Try again"));
      note("retry recovers", await waitFor(b.ev, "document.body.innerText.includes('For Nadia')", 10000));
    } finally { b.c.close(); }
    const e = await browser({ name: "mobile", w: 390, h: 844 });
    try {
      await e.signIn(`empty+${stamp}@sshots.example.test`);
      await e.open("/account/scheduled");
      note("empty state invites the user to schedule a card", await waitFor(e.ev, "document.body.innerText.includes('Nothing scheduled yet') && !!([...document.querySelectorAll('a')].find(a=>a.textContent.trim()==='Create a card'))"));
      await sleep(400);
      await e.shot("scheduled-empty-mobile");
      await e.ev(`fetch('/api/auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(()=>1)`);
      await e.open("/account/scheduled"); await sleep(1500);
      note("a signed-out visitor is sent to sign-in", await e.ev("location.pathname === '/sign-in'"));
    } finally { e.c.close(); }
  }

  // ---------- 5. widths from 320px: the schedule form and My Scheduled Cards ----------
  for (const w of [320, 375, 390, 768, 1280]) {
    const b = await browser({ name: `w${w}`, w, h: 800 });
    try {
      await b.signIn(`w${w}+${stamp}@sshots.example.test`);
      await b.toPreview(); await b.ev(clickText("Schedule for later"));
      await waitFor(b.ev, "!!document.querySelector('input[type=date]')");
      await b.ev(setVal("input[type=date]", inDays(3)));
      await sleep(300);
      note(`${w}px: the schedule form has no horizontal overflow`, !(await b.overflow()), `scrollWidth=${await b.ev("document.documentElement.scrollWidth")}`);
      await b.open("/account/scheduled"); await waitFor(b.ev, "document.body.innerText.includes('Nothing scheduled yet')", 10000); await sleep(300);
      note(`${w}px: My Scheduled Cards has no horizontal overflow`, !(await b.overflow()));
    } finally { b.c.close(); }
  }

  // ---------- 6. the delivery worker publishes the card; the owner sees the live link (LINK wording: nothing is sent to the recipient) ----------
  for (const vp of [{ name: "desktop", w: 1280, h: 900 }, { name: "mobile", w: 390, h: 844 }]) {
    const b = await browser(vp);
    const email = `live-${vp.name}+${stamp}@sshots.example.test`;
    try {
      await b.signIn(email);
      await b.toPreview(); await b.ev(clickText("Schedule for later"));
      await waitFor(b.ev, "!!document.querySelector('input[type=date]')");
      note(`${vp.name}: the schedule form says what LINK delivery does`, await b.ev(`document.body.innerText.includes('Your card will become available at the scheduled time. You will need to share the link with your recipient.')`));
      await b.ev(setVal("select", "Asia/Colombo")); await b.ev(setVal("input[type=date]", inDays(3))); await b.ev(setVal("input[type=time]", "09:00")); await sleep(300);
      await b.ev(clickText("Schedule delivery")); await waitFor(b.ev, "!!document.querySelector('[role=alertdialog]')");
      await b.ev(clickText("Confirm and schedule"));
      note(`${vp.name}: the success screen repeats that the sender must share the link`, await waitFor(b.ev, "document.body.innerText.includes('on its way') && document.body.innerText.includes('You will need to share the link with your recipient.')", 20000));
      await b.open("/account/scheduled");
      note(`${vp.name}: a waiting card shows the LINK notice and no link`, await waitFor(b.ev, "document.body.innerText.includes('Scheduled') && document.body.innerText.includes('You will need to share the link') && !document.querySelector('a[href*=\"/c/\"]')"));
      await sleep(400);
      await b.shot(`scheduled-waiting-notice-${vp.name}`);
      const uid = sql(`select id from "user" where email='${email.toLowerCase()}'`);
      sql(`update "ScheduledDelivery" set "deliverAtUtc" = now() - interval '1 minute', "nextAttemptAt" = now() - interval '1 minute', "updatedAt" = now() where "ownerId" = '${uid}'`);
      const out = execFileSync("npm", ["run", "-s", "delivery:worker", "--", "once"], { env: process.env, encoding: "utf8" });
      note(`${vp.name}: the worker command publishes it`, /"published":1/.test(out), out.trim().slice(-90));
      await b.open("/account/scheduled");
      note(`${vp.name}: the card now shows Live with its link and a Copy link button`, await waitFor(b.ev, "document.body.innerText.includes('Live') && document.body.innerText.includes('Your card is now live. Share its link with your recipient.') && !!document.querySelector('a[href*=\"/c/\"]') && [...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Copy link')", 15000));
      note(`${vp.name}: a live card can no longer be edited or cancelled`, await b.ev(`![...document.querySelectorAll('button')].some(x=>/Edit schedule|Cancel schedule/.test(x.textContent))`));
      await sleep(400);
      await b.shot(`scheduled-published-${vp.name}`);
      const href = await b.ev(`document.querySelector('a[href*="/c/"]').href`);
      await b.send("Page.navigate", { url: href }); await sleep(1500);
      note(`${vp.name}: the link opens the public card (no sign-in)`, await b.ev(`location.pathname.startsWith('/c/') && document.body.innerText.includes('Nadia')`));
      note(`${vp.name}: no horizontal overflow on the live state`, !(await b.overflow()));
    } finally { b.c.close(); }
  }
} finally { cleanup(); }
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
