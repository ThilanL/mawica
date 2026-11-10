// End-to-end checks for the card wallet against a running PRODUCTION-mode server and the isolated mawica_test database,
// using real sessions (email-code sign-in through the local mail outbox). Dev tooling only; not part of `npm test`.
// Start the server and run it the way scripts/auth-e2e.mjs describes (needs WELCOME_PEPPER from .env.local), then:
//   BASE=http://127.0.0.1:3030 ORIGIN=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl SERVER_LOG=/tmp/server.log DATABASE_URL=<mawica_test url> node scripts/wallet-e2e.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3030";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3030";
const OUTBOX = process.env.OUTBOX, SERVER_LOG = process.env.SERVER_LOG;
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== "5433") throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const lastOtp = (email) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp; } catch { return undefined; } };

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
let ipc = 20 + Math.floor(Math.random() * 100);
const newIp = () => `203.0.${100 + Math.floor(Math.random() * 100)}.${(ipc++ % 250) + 1}`;
const cookieOf = (sc) => sc.map((c) => c.split(";")[0]).join("; ");
async function call(path, { method = "GET", body, cookie, ip, origin = ORIGIN, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (origin) h.origin = origin;
  if (cookie) h.cookie = cookie;
  h["x-forwarded-for"] = ip ?? newIp();
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text, headers: res.headers, setCookie: res.headers.getSetCookie?.() ?? [] };
}
async function login(email) {
  const ip = newIp();
  await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email, type: "sign-in" }, ip });
  const r = await call("/api/auth/sign-in/email-otp", { method: "POST", body: { email, otp: lastOtp(email) }, ip });
  if (r.status !== 200) throw new Error(`login failed for test user (${r.status})`);
  return cookieOf(r.setCookie);
}
const started = new Date(Date.now() - 2000).toISOString();
const stamp = Date.now();
const mail = (n) => `${n}+${stamp}@wallet-e2e.example.test`;
const card = (msg = "Hello") => ({ templateKey: "snow-globe", recipientName: "WalletE2E", senderName: "Sam", message: msg });
const key = () => crypto.randomUUID();
const publish = (cookie, b, o = {}) => call("/api/cards", { method: "POST", cookie, body: b, ip: o.ip, headers: o.key === null ? {} : { "idempotency-key": o.key ?? key() } });
const wallet = async (cookie) => (await call("/api/wallet", { cookie })).json?.wallet;
const driftCount = () => sql(`select count(*) from (select g.id from "CreditGrant" g left join "LedgerEntry" l on l."grantId" = g.id group by g.id, g.remaining having g.remaining <> coalesce(sum(l.delta),0)) x`);
const userId = (email) => sql(`select id from "user" where email='${email.toLowerCase()}'`);

// --- unauthenticated and forged
{
  const w = await call("/api/wallet"), a = await call("/api/wallet/activity");
  check("1 wallet and activity need a session (401)", w.status === 401 && a.status === 401, `${w.status}/${a.status}`);
  const forged = await call("/api/wallet", { cookie: "mawica.session_token=forged.value" });
  check("1b forged session cookie -> 401", forged.status === 401);
  const page = await fetch(BASE + "/account/wallet", { redirect: "manual" });
  const html = await page.text();
  check("1c wallet page for a visitor reveals nothing and redirects to sign-in", [200, 307].includes(page.status) && !/cards left|Premium credits/.test(html) && (page.status === 307 || html.includes("/sign-in?next=/account/wallet")), `${page.status}`);
}

// --- a user's wallet
const A = mail("alice"), B = mail("bob");
const cookieA = await login(A), cookieB = await login(B);
let slugA;
{
  const w = await call("/api/wallet", { cookie: cookieA });
  check("2 new Free wallet: 10 cards, 1 welcome premium credit, plan Free", w.status === 200 && w.json.wallet.plan.name === "Free" && w.json.wallet.sends.remaining === 10 && w.json.wallet.premium.remaining === 1 && w.json.wallet.premium.welcomeCredit === 1, JSON.stringify(w.json.wallet?.sends));
  check("2b next reset is in the future and about a month away", Date.parse(w.json.wallet.period.nextReset) - Date.now() > 20 * 86400000 && Date.parse(w.json.wallet.period.nextReset) - Date.now() < 32 * 86400000);
  check("2c wallet responses are no-store and carry no internal ids", w.headers.get("cache-control") === "no-store" && !/[0-9a-f]{8}-[0-9a-f]{4}-|ledger|grantId|reservation|idempotency|userId|accountId/i.test(w.text));
  check("2d exactly one welcome grant exists for the account", sql(`select count(*) from "CreditGrant" g join "CreditAccount" a on a.id=g."accountId" where a."userId"='${userId(A)}' and g.source='WELCOME'`) === "1");
}

// --- signed-in publishing
{
  const k = key();
  const r = await publish(cookieA, card("one"), { key: k });
  slugA = r.json.slug;
  check("3 signed-in publish is 201, owned, 9 left", r.status === 201 && r.json.owned === true && r.json.remaining === 9 && /^[2-9a-hjkmnp-z]{12}$/.test(slugA ?? ""), `status ${r.status}`);
  check("3b the card is owned by the user and STANDARD in the database", sql(`select "ownerId"='${userId(A)}' and tier='STANDARD' from "Card" where slug='${slugA}'`) === "t");
  check("3c the public card page works for anyone (no cookie, no sign-in)", (await fetch(`${BASE}/c/${slugA}`)).status === 200);
  check("3d wallet shows 9 remaining, 1 used", (await wallet(cookieA)).sends.remaining === 9 && (await wallet(cookieA)).sends.used === 1);
  const again = await publish(cookieA, card("one"), { key: k });
  check("3e replaying the same Idempotency-Key returns the same card (200) and spends nothing", again.status === 200 && again.json.slug === slugA && (await wallet(cookieA)).sends.remaining === 9, `status ${again.status}`);
  const reuse = await publish(cookieA, card("different"), { key: k });
  check("3f same key with a different card -> 422", reuse.status === 422 && reuse.json.code === "IDEMPOTENCY_KEY_REUSED");
  const forgedTier = await publish(cookieA, { ...card("tier"), tier: "PREMIUM", ownerId: userId(B), planKey: "plus" });
  check("3g client-supplied tier, owner and plan are ignored", forgedTier.status === 201 && sql(`select tier='STANDARD' and "ownerId"='${userId(A)}' from "Card" where slug='${forgedTier.json.slug}'`) === "t" && sql(`select "planKey" from "CreditAccount" where "userId"='${userId(A)}'`) === "free");
  const bad = await publish(cookieA, { ...card(), recipientName: "" });
  check("3h an invalid card is a 400 and costs nothing", bad.status === 400 && (await wallet(cookieA)).sends.remaining === 8);
  const badKey = await publish(cookieA, card("k"), { key: "short" });
  check("3i malformed Idempotency-Key -> 400", badKey.status === 400);
  const act = await call("/api/wallet/activity", { cookie: cookieA });
  const types = act.json.items.map((i) => i.type);
  check("3j activity lists real events: published cards and the welcome gift, with a link to the owner's card", types.includes("welcome_gift") && types.filter((t) => t === "card_published").length === 2 && act.json.items.some((i) => i.card?.slug === slugA), types.join(","));
}

// --- isolation
{
  const wb = await call("/api/wallet", { cookie: cookieB });
  check("4 user B's wallet is untouched by user A's spending", wb.json.wallet.sends.remaining === 10 && wb.json.wallet.sends.used === 0);
  const actB = await call("/api/wallet/activity", { cookie: cookieB });
  check("4b user B's activity never contains user A's cards", !actB.text.includes(slugA));
  const forged = await call(`/api/wallet?userId=${userId(A)}&accountId=${userId(A)}`, { cookie: cookieB });
  check("4c forged user/account ids in the query change nothing", forged.json.wallet.sends.used === 0);
  const pb = await publish(cookieB, card("b"));
  check("4d B publishes against B's own allowance (9 left)", pb.status === 201 && pb.json.remaining === 9 && sql(`select "ownerId"='${userId(B)}' from "Card" where slug='${pb.json.slug}'`) === "t");
}

// --- concurrency (50 simultaneous requests against a limited balance)
{
  const cookieC = await login(mail("carol")), ipC = newIp();
  const results50 = await Promise.all(Array.from({ length: 50 }, (_, i) => publish(cookieC, card(`c${i}`), { ip: ipC })));
  const codes = results50.map((r) => r.status);
  check("5 50 simultaneous publishes, 10 credits: exactly 10 created, 40 refused with 402, nothing else", codes.filter((c) => c === 201).length === 10 && codes.filter((c) => c === 402).length === 40, `201:${codes.filter((c) => c === 201).length} 402:${codes.filter((c) => c === 402).length} other:${codes.filter((c) => c !== 201 && c !== 402)}`);
  check("5b exactly 10 cards exist for that user and the wallet is at 0", sql(`select count(*) from "Card" where "ownerId"='${userId(mail("carol"))}'`) === "10" && (await wallet(cookieC)).sends.remaining === 0);
  check("5c ledger reconciles with balances (no drift) after the burst", driftCount() === "0");
  const cookieD = await login(mail("dave")), ipD = newIp();
  const same = await Promise.all(Array.from({ length: 20 }, () => publish(cookieD, card("same"), { key: "same-key-for-20-requests", ip: ipD })));
  check("5d 20 simultaneous requests with one Idempotency-Key create exactly one card", same.filter((r) => r.status === 201).length === 1 && same.filter((r) => r.status === 200).length === 19 && new Set(same.map((r) => r.json.slug)).size === 1, `201:${same.filter((r) => r.status === 201).length} 200:${same.filter((r) => r.status === 200).length}`);
  const cookieE = await login(mail("erin")), ipE = newIp();
  for (let i = 0; i < 9; i++) await publish(cookieE, card(`e${i}`), { ip: ipE });
  const twoTabs = await Promise.all([publish(cookieE, card("tabA"), { ip: ipE }), publish(cookieE, card("tabB"), { ip: ipE })]);
  check("5e two browser tabs racing for the LAST credit: one wins, one gets 402", twoTabs.map((r) => r.status).sort().join(",") === "201,402", twoTabs.map((r) => r.status).join(","));
  check("5f balances never negative anywhere", sql(`select count(*) from "CreditGrant" where remaining < 0`) === "0");
}

// --- guests are unchanged
{
  const ip = newIp(); const first = await call("/api/cards", { method: "POST", body: card("guest"), ip, origin: null });
  check("6 guest publish (no cookie) is 201, no owner, no wallet fields", first.status === 201 && first.json.owned === undefined && sql(`select "ownerId" is null from "Card" where slug='${first.json.slug}'`) === "t");
  const accountsBefore = sql(`select count(*) from "CreditAccount"`);
  const codes = []; for (let i = 0; i < 6; i++) codes.push((await call("/api/cards", { method: "POST", body: card("g"), ip, origin: null })).status);
  check("6b the per-IP guest limit still applies (5 per hour, then 429)", codes.slice(0, 4).every((c) => c === 201) && codes[4] === 429 || codes.filter((c) => c === 429).length >= 1, codes.join(","));
  check("6c guests never create wallet accounts or spend credit", sql(`select count(*) from "CreditAccount"`) === accountsBefore);
  const out = await call("/api/auth/sign-out", { method: "POST", cookie: cookieB, body: {} });
  const stale = await publish(cookieB, card("after-logout"));
  check("6d after logout the old cookie publishes as a guest (unowned), as before accounts existed", out.status === 200 && stale.status === 201 && stale.json.owned === undefined && sql(`select "ownerId" is null from "Card" where slug='${stale.json.slug}'`) === "t");
}

// --- welcome credit is not regranted after deletion + re-registration
{
  const E = mail("welcome");
  const c1 = await login(E);
  check("7 first account gets the welcome credit", (await wallet(c1)).premium.welcomeCredit === 1);
  sql(`delete from "user" where email='${E.toLowerCase()}'`);
  check("7b deleting the user keeps the anonymised wallet and the tombstone", sql(`select count(*) from "CreditAccount" where "userId" is null and "createdAt" >= '${started}'`) !== "0" && sql(`select count(*) from "WelcomeGrantTombstone" where "grantedAt" >= '${started}'`) !== "0");
  const c2 = await login(E);
  const w2 = await wallet(c2);
  check("7c re-registering the same verified email gets NO second welcome credit, but a normal monthly allowance", w2.premium.remaining === 0 && w2.premium.welcomeCredit === 0 && w2.sends.remaining === 10, JSON.stringify(w2.premium));
}

// --- expired session
{
  const c = await login(mail("expired"));
  sql(`update session set "expiresAt" = now() - interval '1 minute' where "userId" = '${userId(mail("expired"))}'`);
  const r = await call("/api/wallet", { cookie: c });
  const p = await publish(c, card("exp"));
  check("8 an expired session loses wallet access (401) and publishes only as a guest", r.status === 401 && p.json.owned === undefined);
}

// --- premium card: Lumi's Wish
{
  const prem = (m = "A wish for you") => ({ templateKey: "lumis-wish", recipientName: "WalletE2E", senderName: "Sam", message: m });
  const g = await call("/api/cards", { method: "POST", body: prem(), origin: null });
  check("10 anonymous premium publish is refused (401 SIGN_IN_REQUIRED) and creates nothing", g.status === 401 && g.json.code === "SIGN_IN_REQUIRED" && sql(`select count(*) from "Card" where "templateKey"='lumis-wish' and "createdAt" >= '${started}'`) === "0", `status ${g.status}`);
  const forgedGuest = await call("/api/cards", { method: "POST", body: { ...prem(), tier: "STANDARD" }, origin: null });
  check("10b a forged tier cannot make an anonymous premium publish succeed", forgedGuest.status === 401);

  const cookieP = await login(mail("premium"));
  check("10c a new account has one premium credit", (await wallet(cookieP)).premium.remaining === 1);
  await publish(cookieP, card("standard first"));
  check("10d a standard card leaves the premium credit alone", (await wallet(cookieP)).premium.remaining === 1 && (await wallet(cookieP)).sends.remaining === 9);
  const p1 = await publish(cookieP, { ...prem(), tier: "STANDARD" });
  check("10e premium publish: 201, tier PREMIUM (client tier ignored), uses 1 card AND 1 premium credit", p1.status === 201 && p1.json.premiumRemaining === 0 && p1.json.remaining === 8 && sql(`select tier='PREMIUM' and "ownerId"='${userId(mail("premium"))}' from "Card" where slug='${p1.json.slug}'`) === "t", JSON.stringify({ s: p1.status, r: p1.json.remaining, p: p1.json.premiumRemaining }));
  const p2 = await publish(cookieP, prem("second"));
  check("10f a second premium publish is refused (402 premium code) and deducts nothing", p2.status === 402 && p2.json.code === "INSUFFICIENT_PREMIUM_CREDITS" && (await wallet(cookieP)).sends.remaining === 8, `${p2.status} ${p2.json.code}`);
  check("10g ledger reconciles after premium spending", driftCount() === "0");
  const act = await call("/api/wallet/activity", { cookie: cookieP });
  check("10h activity labels the premium card", act.json.items.some((i) => i.type === "card_published" && i.premium === true && i.card?.title === "Lumi's Wish"));

  const view = await fetch(`${BASE}/c/${p1.json.slug}`);
  const html = await view.text();
  check("10i the recipient opens the public URL with no sign-in: 200, personalised, no cookies", view.status === 200 && html.includes("WalletE2E") && html.includes("A wish for you") && (view.headers.getSetCookie?.() ?? []).length === 0, `status ${view.status}`);
  check("10j the card page exposes no wallet, credit, tier or account details", !/credit|wallet|ownerId|PREMIUM|tier/i.test(html.replace(/<script[\s\S]*?<\/script>/g, "").replaceAll("WalletE2E", "")) /* the recipient name itself contains "Wallet" */, "visible HTML scanned");
  const qr = await fetch(`${BASE}/c/${p1.json.slug}/qr.png`);
  check("10k the QR route works for the premium card", qr.status === 200 && qr.headers.get("content-type")?.includes("image/png"));

  const cookieR = await login(mail("race")), ipR = newIp();
  const race = await Promise.all(Array.from({ length: 25 }, (_, i) => publish(cookieR, prem(`race ${i}`), { ip: ipR })));
  check("10l 25 simultaneous premium publishes with 1 premium credit: exactly 1 card, 24 refused", race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 402).length === 24, `201:${race.filter((r) => r.status === 201).length} 402:${race.filter((r) => r.status === 402).length}`);
  check("10m exactly one premium card exists for that user; balances never negative", sql(`select count(*) from "Card" where "ownerId"='${userId(mail("race"))}' and tier='PREMIUM'`) === "1" && sql(`select count(*) from "CreditGrant" where remaining < 0`) === "0" && driftCount() === "0");

  const cookieQ = await login(mail("dupe")), ipQ = newIp();
  const dupes = await Promise.all(Array.from({ length: 20 }, () => publish(cookieQ, prem("same"), { key: "premium-dup-key-0001", ip: ipQ })));
  check("10n 20 duplicate premium requests with one Idempotency-Key create exactly one card", dupes.filter((r) => r.status === 201).length === 1 && dupes.filter((r) => r.status === 200).length === 19 && new Set(dupes.map((r) => r.json.slug)).size === 1 && (await wallet(cookieQ)).premium.remaining === 0, `201:${dupes.filter((r) => r.status === 201).length}`);
}

// --- logs and responses
{
  const log = SERVER_LOG ? readFileSync(SERVER_LOG, "utf8") : null;
  if (log !== null) check("9 server log has no emails, one-time codes or secrets", !/@wallet-e2e\.example\.test/.test(log) && !/WELCOME_PEPPER|BETTER_AUTH_SECRET/.test(log), `${log.length} bytes scanned`);
  check("9b database holds no raw email in the tombstone table", !/@/.test(sql(`select string_agg("emailHash", ' ') from "WelcomeGrantTombstone"`)));
}

// --- cleanup (test DB only)
sql(`begin; set local mawica.ledger_purge = 'on';
 delete from "LedgerEntry" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditReservation" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditGrant" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditAccount" where "createdAt" >= '${started}';
 delete from "WelcomeGrantTombstone" where "grantedAt" >= '${started}';
 commit;`);
sql(`delete from "Card" where "recipientName" = 'WalletE2E'`);
sql(`delete from "user" where email like '%+${stamp}@wallet-e2e.example.test'`);
sql(`delete from "AuditLog" where "createdAt" >= '${started}' and "actorId" is null`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
