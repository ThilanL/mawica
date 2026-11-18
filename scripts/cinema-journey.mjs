// Dev-only: the whole cinematic-card journey in headless Chrome (CDP, no extra dependencies), against a PRODUCTION-mode server on the isolated
// test database: sign in, choose the cinematic card, add a photo (real upload with a real EXIF-carrying file), preview, publish with the premium
// credit, then view the public card as a recipient with no cookies. Also checks photo privacy over real HTTP and the reduced-motion and
// no-WebGL fallbacks. Needs OUTBOX/DATABASE_URL like scripts/premium-shots.mjs. Not part of `npm test`.
//   BASE=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl DATABASE_URL=<mawica_test url> node scripts/cinema-journey.mjs
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3030";
const OUT = process.env.OUT || "docs/screenshots/cinema";
const OUTBOX = process.env.OUTBOX;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== (process.env.MAWICA_PG_PORT ?? "5433")) throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastOtp = (email) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp; } catch { return undefined; } };

async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "cin-journey-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
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
const hydrated = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e&&Object.keys(e).some(k=>k.startsWith('__reactProps'))})()`;
const clickText = (text) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})&&!x.disabled);if(!b)return false;b.click();return true})()`;

mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const report = [];
const note = (name, ok, detail = "") => { report.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const shot = async (send, file) => writeFileSync(join(OUT, `${file}.webp`), Buffer.from((await send("Page.captureScreenshot", { format: "webp", quality: 82 })).data, "base64"));

// A real photo carrying private metadata, so the journey proves it does not survive.
const photoPath = join(mkdtempSync(join(tmpdir(), "cin-photo-")), "holiday.jpg");
writeFileSync(photoPath, await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 240, g: 150, b: 120 } } }).withExif({ IFD0: { ImageDescription: "PRIVATE-HOME-ADDRESS-12345" } }).jpeg().toBuffer());

const email = `cin+${stamp}@cinema.example.test`;
let slug, mediaId;
{
  const c = await launch(); const { send, ev } = c;
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send("Network.enable"); await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": "198.51.100.61" } });
    await send("DOM.enable"); await send("Page.enable");

    // guest: the photo field asks to sign in, and the cinematic card is discoverable
    await send("Page.navigate", { url: BASE + "/create" });
    await waitFor(ev, hydrated('[data-key="lumis-wish-cinema"]'));
    note("the cinematic card is offered in /create next to the 2D Lumi's Wish and the six standard cards", (await ev(`document.querySelectorAll('[role=radio]').length`)) === 8 && (await ev(`!!document.querySelector('[data-key="lumis-wish"]') && !!document.querySelector('[data-key="lumis-wish-cinema"]')`)));
    await ev(`document.querySelector('[data-key="lumis-wish-cinema"]').click()`); await sleep(200);
    await ev(clickText("Continue with Lumi's Wish: Cinematic"));
    await waitFor(ev, "!!document.querySelector('#f-recipientsname')");
    note("as a guest the photo field asks to sign in (no upload possible)", await ev(`document.body.innerText.includes('Sign in to add a photo') && !document.querySelector('#photo-input')`));

    // sign in
    await send("Page.navigate", { url: BASE + "/sign-in?next=/create" });
    await waitFor(ev, hydrated("#email"));
    await ev(setVal("#email", email)); await ev(clickText("Send me a code"));
    await waitFor(ev, "!!document.querySelector('#code')"); await sleep(300);
    await ev(setVal("#code", lastOtp(email))); await ev(clickText("Verify and continue"));
    note("signed in and returned to /create", await waitFor(ev, "location.pathname === '/create'", 25000));
    await waitFor(ev, hydrated('[data-key="lumis-wish-cinema"]'));
    await sleep(1500);
    await ev(`document.querySelector('[data-key="lumis-wish-cinema"]').click()`); await sleep(200);
    await ev(clickText("Continue with Lumi's Wish: Cinematic"));
    await waitFor(ev, "!!document.querySelector('#f-recipientsname')");
    await ev(setVal("#f-recipientsname", "Nadia")); await ev(setVal("#f-yourname", "Sam")); await ev(setVal("#f-yourmessage", "Happy birthday, Nadia! Lumi says: today is all yours."));

    // upload a real file through the real input
    await waitFor(ev, "!!document.querySelector('#photo-input')", 10000);
    const doc = await send("DOM.getDocument", {});
    const input = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#photo-input" });
    await send("DOM.setFileInputFiles", { files: [photoPath], nodeId: input.nodeId });
    note("the chosen photo is uploaded and confirmed to the owner", await waitFor(ev, "document.body.innerText.includes('Photo added.')", 30000));
    mediaId = sql(`select m.id from "CardMedia" m join "user" u on u.id = m."ownerId" where u.email = '${email}' order by m."createdAt" desc limit 1`);
    note("a private, unattached photo row exists for this account", !!mediaId && sql(`select "cardId" is null from "CardMedia" where id = '${mediaId}'`) === "t");
    const stored = sql(`select "byteSize" from "CardMedia" where id = '${mediaId}'`);
    note("the stored photo is a small WebP re-encode of the 1800x1200 original", Number(stored) > 0 && Number(stored) <= 512000, `${stored} bytes, ${sql(`select width||'x'||height from "CardMedia" where id = '${mediaId}'`)}`);
    note("the stored bytes contain none of the original's private metadata", sql(`select position('PRIVATE-HOME-ADDRESS'::bytea in data) = 0 from "CardMediaBlob" where "mediaId" = '${mediaId}'`) === "t");
    await shot(send, "journey-1-photo-chosen-mobile");

    // owner-only before publication, over real HTTP with the real session
    const pre = await ev(`fetch('/api/media/${mediaId}').then(r=>({s:r.status,t:r.headers.get('content-type'),cc:r.headers.get('cache-control')}))`);
    note("the owner can view the unpublished photo (private, not cached)", pre.s === 200 && pre.t === "image/webp" && pre.cc === "private, no-store");
    const anon = await fetch(`${BASE}/api/media/${mediaId}`);
    note("anyone else gets 404 for it", anon.status === 404);

    // preview shows the 3D card with the photo
    await ev(clickText("Preview card"));
    note("the preview opens", await waitFor(ev, "document.body.innerText.includes('Preview your card')"));
    note("the preview uses the 3D renderer", await waitFor(ev, "document.querySelector('[data-cinema]')?.dataset.renderer === 'webgl'", 20000));
    await sleep(500);
    await ev(clickText("Skip intro")); await sleep(4000);
    await shot(send, "journey-2-preview-mobile");
    note("previewing made no card and spent nothing", sql(`select count(*) from "Card" c join "user" u on u.id = c."ownerId" where u.email = '${email}'`) === "0");

    // publish with the welcome premium credit
    await sleep(9000);
    await ev(`document.getElementById('premium-publish').scrollIntoView({block:'end'})`); await sleep(300);
    await ev(clickText("Publish with 1 premium credit"));
    await waitFor(ev, "!!document.querySelector('[role=alertdialog]')");
    await ev(clickText("Confirm and publish"));
    note("publishing succeeds", await waitFor(ev, "document.body.innerText.includes('Your card is ready')", 25000));
    slug = await ev(`document.getElementById('card-url').value.split('/c/')[1]`);
    note("the card is PREMIUM, owned, and the photo is now attached to it", sql(`select c.tier='PREMIUM' and c."ownerId" is not null and m."cardId" = c.id from "Card" c join "CardMedia" m on m."cardId" = c.id where c.slug='${slug}'`) === "t");
  } finally { c.close(); }
}
if (!slug) throw new Error("No card was published; stopping before the recipient checks");

// ---------- recipient: no cookies ----------
async function recipient(name, vp, { reduced = false, noWebgl = false } = {}) {
  const c = await launch(); const { send, ev } = c;
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
    await send("Network.enable"); await send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `198.51.100.${70 + Math.floor(Math.random() * 100)}` } });
    if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await send("Page.enable");
    if (noWebgl) await send("Page.addScriptToEvaluateOnNewDocument", { source: "const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : g.call(this, t, ...a); };" });
    await send("Page.navigate", { url: `${BASE}/c/${slug}?noperfguard=1` }); // software WebGL is slow: do not let the low-performance fallback end the 3D scene during the test
    return { c, send, ev };
  } catch (e) { c.close(); throw e; }
}

{
  const r = await recipient("desktop", { w: 1280, h: 800, mobile: false });
  try {
    note("public card page: the greeting is in the server HTML (works before JavaScript)", (await (await fetch(`${BASE}/c/${slug}`)).text()).includes("Happy birthday, Nadia!"));
    note("the 3D scene loads for the recipient", await waitFor(r.ev, "document.querySelector('[data-cinema]')?.dataset.renderer === 'webgl' && !!document.querySelector('canvas')", 30000));
    await sleep(2500); await shot(r.send, "recipient-1-arrival-desktop");
    note("the message is hidden while the envelope plays, then the recipient is not rushed", await r.ev(`document.querySelector('[data-cinema]').dataset.stage === 'intro'`));
    await sleep(7000); await shot(r.send, "recipient-2-opening-desktop");
    const reached = await waitFor(r.ev, "document.querySelector('[data-cinema]').dataset.stage === 'reading'", 240000);
    note("the animation reaches the reading stage on its own and waits (no ending yet)", reached, reached ? "" : await r.ev("JSON.stringify({ stage: document.querySelector('[data-cinema]').dataset.stage, stats: window.__cinema })"));
    await sleep(3000); await shot(r.send, "recipient-3-reading-desktop");
    const photoLoaded = await r.ev(`performance.getEntriesByType('resource').some(x => x.name.includes('/api/media/${mediaId}'))`);
    note("the published photo is fetched from the private media route", photoLoaded);
    note("the recipient can continue to the Mawica ending, which has the exact copy and no automatic redirect", await (async () => { await r.ev(clickText("Continue")); await waitFor(r.ev, "document.querySelector('[data-cinema]').dataset.stage === 'ending'", 5000); await sleep(1500); await shot(r.send, "recipient-4-ending-desktop"); return r.ev(`(()=>{const t=document.querySelector('.cin-end').innerText;return t.includes('mawica.')&&t.includes('www.mawica.com')&&t.includes('Send your feelings to others.')&&t.includes('BRING YOUR WISHES TO LIFE.')&&t.includes('Create your own card')&&location.pathname === '/c/${slug}'})()`); })());
    await sleep(6000);
    note("it stays on the card (no redirect)", await r.ev(`location.pathname === '/c/${slug}'`));
  } finally { r.c.close(); }
}
{
  const r = await recipient("mobile", { w: 390, h: 844, mobile: true });
  try {
    await waitFor(r.ev, "document.querySelector('[data-cinema]')?.dataset.renderer === 'webgl' && !!document.querySelector('canvas')", 30000);
    await sleep(2500); await shot(r.send, "recipient-1-arrival-mobile");
    await sleep(6500); await shot(r.send, "recipient-2-opening-mobile");
    await waitFor(r.ev, "document.querySelector('[data-cinema]').dataset.stage === 'reading'", 120000);
    await sleep(3500); await shot(r.send, "recipient-3-reading-mobile");
    const m = await r.ev(`(()=>{const p=document.querySelector('.cin-page');const t=document.querySelector('.cin-message');const fs=parseFloat(getComputedStyle(t).fontSize);const b=p.getBoundingClientRect();return {overflow: document.documentElement.scrollWidth > innerWidth, fs, w: Math.round(b.width), inside: b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight}})()`);
    note("mobile: no horizontal overflow and the page sits fully inside the screen", !m.overflow && m.inside, JSON.stringify(m));
    note("mobile: message text is at least 15 px", m.fs >= 15, `${m.fs}px`);
    const tap = await r.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');const r=b.getBoundingClientRect();return r.height>=44&&r.bottom<=innerHeight})()`);
    note("mobile: the Continue button is a 44 px tap target inside the screen", tap);
    await r.ev(clickText("Continue")); await sleep(2000); await shot(r.send, "recipient-4-ending-mobile");
    const cta = await r.ev(`(()=>{const a=document.querySelector('.cin-end a[href="/create"]').getBoundingClientRect();const pg=document.querySelector('.cin-page');return {fits: a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight, pageHidden: getComputedStyle(pg).opacity === '0'}})()`);
    note("mobile: the ending's Create button fits and the message is hidden behind it (never overlapped)", cta.fits && cta.pageHidden, JSON.stringify(cta));
  } finally { r.c.close(); }
}
{
  const r = await recipient("reduced", { w: 390, h: 844, mobile: true }, { reduced: true });
  try {
    note("reduced motion: the finished card is shown straight away (reading stage, static 3D)", await waitFor(r.ev, "document.querySelector('[data-cinema]')?.dataset.renderer === 'webgl-static' && document.querySelector('[data-cinema]').dataset.stage === 'reading'", 25000));
    await sleep(2500); await shot(r.send, "recipient-reduced-motion-mobile");
    note("reduced motion: the message is visible immediately and no Skip button is needed", await r.ev(`getComputedStyle(document.querySelector('.cin-page')).opacity === '1' && !document.body.innerText.includes('Skip intro')`));
  } finally { r.c.close(); }
}
{
  const r = await recipient("nowebgl", { w: 390, h: 844, mobile: true }, { noWebgl: true });
  try {
    const okFallback = await waitFor(r.ev, "document.querySelector('[data-cinema]')?.dataset.renderer === 'fallback-2d' && document.body.innerText.includes('Happy birthday, Nadia!')", 20000);
    note("no WebGL: falls back to the 2D Lumi's Wish with the personalised greeting", okFallback, okFallback ? "" : await r.ev("JSON.stringify({r: document.querySelector('[data-cinema]')?.dataset.renderer, gl: !!document.createElement('canvas').getContext('webgl2')})"));
    await sleep(3000); await shot(r.send, "recipient-no-webgl-fallback-mobile");
    note("no WebGL: no 3D canvas is created (the 2D scene's own particle canvas is not WebGL)", await r.ev(`!document.querySelector('canvas[data-engine]')`));
  } finally { r.c.close(); }
}

// ---------- the photo after publication, over real HTTP without cookies ----------
{
  const pub = await fetch(`${BASE}/api/media/${mediaId}`);
  const bytes = Buffer.from(await pub.arrayBuffer());
  note("after publication the photo is public with safe headers", pub.status === 200 && pub.headers.get("content-type") === "image/webp" && pub.headers.get("x-content-type-options") === "nosniff" && (pub.headers.get("content-security-policy") ?? "").includes("sandbox"));
  note("the served bytes are a WebP with no EXIF and no private text", bytes.subarray(0, 4).toString() === "RIFF" && !bytes.includes("PRIVATE-HOME-ADDRESS"));
  const etag = pub.headers.get("etag");
  note("repeat views revalidate with an ETag (so a removed card disappears at once)", (await fetch(`${BASE}/api/media/${mediaId}`, { headers: { "if-none-match": etag } })).status === 304);
  sql(`update "Card" set status = 'REMOVED', "removedAt" = now() where slug = '${slug}'`);
  note("a moderated (removed) card's photo is gone for everyone", (await fetch(`${BASE}/api/media/${mediaId}`)).status === 404);
}

// cleanup of this run's rows
sql(`delete from "Card" where slug = '${slug}'`);
sql(`delete from "user" where email like '%+${stamp}@cinema.example.test'`);
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
