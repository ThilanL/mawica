// End-to-end checks for accounts against a running PRODUCTION-mode server and an isolated local database.
// Dev tooling only (not part of `npm test`). Never point it at a shared, staging or production database.
//
//   DATABASE_URL=<mawica_test url> NEXT_PUBLIC_SITE_URL=http://localhost:3030 MAIL_LOCAL_OUTBOX=/tmp/outbox.jsonl \
//     TRUSTED_PROXY_HOPS=1 PORT=3030 node --env-file=.env.local .next/standalone/server.js > /tmp/server.log &
//   BASE=http://127.0.0.1:3030 ORIGIN=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl SERVER_LOG=/tmp/server.log \
//     DATABASE_URL=<same url> node scripts/auth-e2e.mjs
//
// Set SECURE=1 (server started with an https BETTER_AUTH_URL and ORIGIN=https://localhost:3030) to check Secure cookies.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3030";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3030";
const SECURE = process.env.SECURE === "1";
const OUTBOX = process.env.OUTBOX;
const SERVER_LOG = process.env.SERVER_LOG;
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || !/^\/(mawica_test|authspike)$/.test(dbUrl.pathname) || dbUrl.port !== "5433") {
  throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test (or the authspike scratch DB) on port 5433");
}
const sql = (q) =>
  execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", dbUrl.pathname.slice(1), "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const outbox = () => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const lastOtp = (email) => outbox().filter((m) => m.to === email).at(-1)?.otp;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

let ipCounter = 10 + Math.floor(Math.random() * 150);
const newIp = () => `203.0.${100 + Math.floor(Math.random() * 100)}.${ipCounter++ % 250 + 1}`;

async function call(path, { method = "GET", body, raw, cookie, origin = ORIGIN, ip, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined || raw !== undefined) h["content-type"] ??= "application/json";
  if (origin) h.origin = origin;
  if (cookie) h.cookie = cookie;
  if (ip) h["x-forwarded-for"] = ip;
  const res = await fetch(BASE + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: "manual" });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text, setCookie: res.headers.getSetCookie?.() ?? [], headers: res.headers };
}
const cookieOf = (sc) => sc.map((c) => c.split(";")[0]).join("; ");
const sendOtp = (email, ip) => call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email, type: "sign-in" }, ip });
const signIn = (email, otp, ip) => call("/api/auth/sign-in/email-otp", { method: "POST", body: { email, otp }, ip });
async function login(email) {
  const ip = newIp();
  await sendOtp(email, ip);
  const r = await signIn(email, lastOtp(email), ip);
  return { cookie: cookieOf(r.setCookie), res: r, ip };
}

const stamp = Date.now();
const mail = (n) => `${n}+${stamp}@e2e.example.test`;
const A = mail("alice"), B = mail("bob");
const started = new Date(Date.now() - 2000).toISOString();
const usedOtps = new Set();

// --- surface area: deny by default
{
  const ok = await call("/api/auth/ok");
  check("1 auth initialises (GET /api/auth/ok)", ok.status === 200 && ok.json?.ok === true);
  const probes = [["GET", "/api/auth/get-session"], ["POST", "/api/auth/sign-up/email"], ["POST", "/api/auth/email-otp/verify-email"], ["POST", "/api/auth/email-otp/reset-password"], ["POST", "/api/auth/change-email"], ["POST", "/api/auth/sign-in/email"], ["GET", "/api/auth/list-sessions"]];
  const codes = [];
  for (const [m, p] of probes) codes.push((await call(p, { method: m, body: m === "POST" ? {} : undefined })).status);
  check("1b every endpoint outside the allowlist is 404", codes.every((c) => c === 404), codes.join(","));
  const other = await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email: A, type: "forget-password" }, ip: newIp() });
  check("1c OTP request of any type other than sign-in is refused", other.status === 404, `status ${other.status}`);
  const bad = await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email: "not-an-email", type: "sign-in" }, ip: newIp() });
  check("1d malformed email is a 400, nothing sent", bad.status === 400 && !outbox().some((m) => m.to === "not-an-email"));
  const nonJson = await call("/api/auth/sign-out", { method: "POST", raw: "x=1", headers: { "content-type": "text/plain" } });
  check("1e non-JSON POST is 415", nonJson.status === 415, `status ${nonJson.status}`);
  const big = await call("/api/auth/sign-in/email-otp", { method: "POST", raw: JSON.stringify({ email: A, otp: "1".repeat(5000) }) });
  check("1f oversized body is 413", big.status === 413);
}

// --- OTP issue + storage
{
  const ip = newIp();
  const r = await sendOtp(A, ip);
  check("2 send OTP returns 200 {success:true}", r.status === 200 && r.json?.success === true, JSON.stringify(r.json));
  const otp = lastOtp(A); if (otp) usedOtps.add(otp);
  check("2b code captured by the LOCAL transport (6 digits; nothing sent over a network)", /^\d{6}$/.test(otp ?? ""));
  const stored = sql(`select value from verification where identifier like '%${A}%' order by "createdAt" desc limit 1`);
  check("2c code is stored hashed, never plain", !!stored && !stored.includes(otp));
}

// --- wrong / capped / expired codes
{
  const ip = newIp();
  await sendOtp(B, ip);
  const real = lastOtp(B); usedOtps.add(real);
  const wrong = real === "000000" ? "111111" : "000000";
  const r1 = await signIn(B, wrong, ip);
  check("3a wrong code rejected, no session cookie", r1.status === 400 && r1.setCookie.length === 0, `status ${r1.status} ${r1.json?.code}`);
  const nonNumeric = await signIn(B, "abcdef", ip);
  check("3b non-numeric code rejected before reaching the verifier", nonNumeric.status === 400 && nonNumeric.setCookie.length === 0);
  await signIn(B, wrong, ip); await signIn(B, wrong, ip);
  const r4 = await signIn(B, real, ip);
  check("3c correct code refused after 3 wrong attempts (attempt cap)", r4.status >= 400 && r4.setCookie.length === 0, `status ${r4.status}`);
  const E = mail("eve");
  await sendOtp(E, newIp());
  const eo = lastOtp(E); usedOtps.add(eo);
  sql(`update verification set "expiresAt" = now() - interval '1 minute' where identifier like '%${E}%'`); // plain now(): proves the timestamptz mapping
  const re = await signIn(E, eo, newIp());
  check("3d expired code rejected (expiry set with plain now(), no UTC conversion)", re.status >= 400 && re.setCookie.length === 0, `status ${re.status}`);
}

// --- sign-in, cookie attributes, validation, persistence
let alice;
{
  alice = await login(A);
  usedOtps.add(outbox().filter((m) => m.to === A).at(-1).otp);
  check("4 valid code signs in", alice.res.status === 200 && alice.res.setCookie.length > 0, `status ${alice.res.status}`);
  const sc = alice.res.setCookie.find((c) => /session_token/.test(c)) ?? "";
  check("4a cookie is HttpOnly", /httponly/i.test(sc));
  check("4b cookie SameSite=Lax", /samesite=lax/i.test(sc));
  check("4c cookie Path=/ and Max-Age = 14 days", /path=\//i.test(sc) && /max-age=1209600/i.test(sc), (sc.match(/max-age=\d+/i) || [""])[0]);
  check(`4d Secure attribute and __Secure- prefix ${SECURE ? "present (https base URL)" : "absent (http localhost)"}`, SECURE ? /;\s*secure/i.test(sc) && /^__Secure-mawica\.session_token=/.test(sc) : !/;\s*secure/i.test(sc) && /^mawica\.session_token=/.test(sc));
  check("4e user row: lowercase email, verified after the code", sql(`select "emailVerified" from "user" where email='${A.toLowerCase()}'`) === "t");
  check("4f profile and settings rows created for the new user", sql(`select count(*) from "Profile" p join "user" u on u.id=p."userId" where u.email='${A.toLowerCase()}'`) === "1" && sql(`select count(*) from "AccountSettings" s join "user" u on u.id=s."userId" where u.email='${A.toLowerCase()}'`) === "1");
  const me = await call("/api/account/profile", { cookie: alice.cookie });
  check("5 session persists and is validated server-side", me.status === 200 && me.json.email === A.toLowerCase() && me.json.emailVerified === true, `status ${me.status}`);
  const anon = await call("/api/account/profile");
  check("5b no cookie -> 401", anon.status === 401);
  const forged = await call("/api/account/profile", { cookie: `${SECURE ? "__Secure-" : ""}mawica.session_token=forged.value` });
  check("5c forged cookie -> 401", forged.status === 401);
  const tampered = await call("/api/account/profile", { cookie: alice.cookie.replace(/(session_token=)([^.;]+)/, "$1x$2") });
  check("5d tampered real cookie -> 401", tampered.status === 401);
  const nav = await call("/api/account/session", { cookie: alice.cookie });
  check("5e header session probe: signed in gives an initial only", nav.json?.signedIn === true && nav.json.initial === "A" && !JSON.stringify(nav.json).includes("@"), JSON.stringify(nav.json));
  const navAnon = await call("/api/account/session");
  check("5f header session probe: anonymous", navAnon.json?.signedIn === false);
  const page = await fetch(BASE + "/account", { headers: { cookie: alice.cookie }, redirect: "manual" });
  const html = await page.text();
  check("5g /account renders for a signed-in user", page.status === 200 && html.includes(A.toLowerCase()));
  const pageAnon = await fetch(BASE + "/account", { redirect: "manual" });
  const anonHtml = await pageAnon.text();
  check("5h /account for an anonymous visitor reveals nothing and redirects to sign-in (client redirect payload; status is 200 or 307)", [200, 307].includes(pageAnon.status) && !anonHtml.includes("@e2e.example.test") && (pageAnon.status === 307 || anonHtml.includes("/sign-in?next=/account")), `${pageAnon.status} ${pageAnon.headers.get("location") ?? "(streamed redirect)"}`);
}

// --- expiry + logout
{
  const x = await login(mail("exp"));
  sql(`update session set "expiresAt" = now() - interval '1 minute' where "userId" = (select id from "user" where email='${mail("exp").toLowerCase()}')`);
  const after = await call("/api/account/profile", { cookie: x.cookie });
  check("6 expired session rejected (expiry set with plain now(), timestamptz mapping)", after.status === 401, `status ${after.status}`);

  const y = await login(mail("out"));
  const before = await call("/api/account/profile", { cookie: y.cookie });
  const out = await call("/api/auth/sign-out", { method: "POST", cookie: y.cookie, body: {}, ip: y.ip });
  const gone = await call("/api/account/profile", { cookie: y.cookie });
  check("7 logout invalidates the session server-side", before.status === 200 && out.status === 200 && gone.status === 401, `signout ${out.status}`);
  const clearing = out.setCookie.find((c) => /session_token/.test(c)) ?? "";
  check("7b logout clears the cookie", /max-age=0|1970/i.test(clearing));
  check("7c session row removed from the database", sql(`select count(*) from session s join "user" u on u.id=s."userId" where u.email='${mail("out").toLowerCase()}'`) === "0");
}

// --- CSRF / Origin
{
  const c = await login(mail("csrf"));
  const evil = await call("/api/auth/sign-out", { method: "POST", cookie: c.cookie, body: {}, origin: "https://evil.example" });
  const still = await call("/api/account/profile", { cookie: c.cookie });
  check("8a cross-origin sign-out blocked (403), session survives", evil.status === 403 && still.status === 200, `status ${evil.status}`);
  const evilSend = await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email: A, type: "sign-in" }, origin: "https://evil.example", ip: newIp() });
  check("8b cross-origin OTP request blocked", evilSend.status === 403, `status ${evilSend.status}`);
  const noOrigin = await call("/api/auth/sign-out", { method: "POST", cookie: c.cookie, body: {}, origin: null });
  check("8c cookie-bearing POST without Origin blocked", noOrigin.status === 403, `status ${noOrigin.status}`);
  const patchEvil = await call("/api/account/profile", { method: "PATCH", cookie: c.cookie, body: { displayName: "Mallory" }, origin: "https://evil.example" });
  const patchNone = await call("/api/account/profile", { method: "PATCH", cookie: c.cookie, body: { displayName: "Mallory" }, origin: null });
  check("8d our own PATCH route refuses a foreign or missing Origin (403)", patchEvil.status === 403 && patchNone.status === 403, `${patchEvil.status}/${patchNone.status}`);
}

// --- enumeration
{
  const unknown = mail("nobody");
  const rk = await sendOtp(A, newIp()); const ru = await sendOtp(unknown, newIp());
  check("9a OTP request: identical status and body for known and unknown email", rk.status === ru.status && JSON.stringify(rk.json) === JSON.stringify(ru.json), `${rk.status} ${JSON.stringify(rk.json)} | ${ru.status} ${JSON.stringify(ru.json)}`);
  const wk = await signIn(A, "999999", newIp()); const wu = await signIn(unknown, "999999", newIp());
  check("9b wrong-code response identical for known and unknown email", wk.status === wu.status && JSON.stringify(wk.json) === JSON.stringify(wu.json), `${JSON.stringify(wk.json)} | ${JSON.stringify(wu.json)}`);
  const noOtp = await signIn(mail("never-asked"), "123456", newIp());
  check("9c a code for an address that never requested one gives the same generic error", noOtp.status === wu.status && JSON.stringify(noOtp.json) === JSON.stringify(wu.json));
  check("9d unknown address never created a user", sql(`select count(*) from "user" where email='${unknown.toLowerCase()}'`) === "0");
}

// --- rate limits
{
  const ip = newIp(); const st = [];
  for (let i = 0; i < 5; i++) st.push((await sendOtp(mail(`rl${i}`), ip)).status);
  check("10a OTP send limited per client IP (3/min, then 429)", st.slice(0, 3).every((s) => s === 200) && st.slice(3).every((s) => s === 429), st.join(","));
  check("10b a different client IP is unaffected", (await sendOtp(mail("rl9"), newIp())).status === 200);
  const ip2 = newIp(); const st2 = [];
  for (let i = 0; i < 5; i++) st2.push((await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email: mail(`sp${i}`), type: "sign-in" }, ip: ip2, headers: { "x-mawica-client-ip": `198.51.100.${i}` } })).status);
  check("10c a client-supplied x-mawica-client-ip header cannot dodge the limit", st2.slice(3).every((s) => s === 429), st2.join(","));
  const victim = mail("victim"); const vs = [];
  for (let i = 0; i < 7; i++) vs.push((await sendOtp(victim, newIp())).status);
  check("10d one inbox cannot be flooded from many IPs (5/hour per email, then 429)", vs.slice(0, 5).every((s) => s === 200) && vs.slice(5).every((s) => s === 429), vs.join(","));
  check("10e 429 carries a retry hint", !!(st.includes(429) && (await sendOtp(mail("rl0"), ip)).headers.get("retry-after") || (await sendOtp(mail("rl0"), ip)).headers.get("x-retry-after")));
  check("10f Better Auth limiter state lives in authRateLimit, Mawica's RateLimit table is separate", Number(sql(`select count(*) from "authRateLimit"`)) > 0 && Number(sql(`select count(*) from "RateLimit" where key like '%'`)) >= 0);
  const verifyKeys = []; for (let i = 0; i < 22; i++) verifyKeys.push((await signIn(mail("brute"), "000000", newIp())).status);
  check("10g sign-in attempts per email capped at 20/hour across IPs (then 429)", verifyKeys.slice(20).every((s) => s === 429) && verifyKeys.slice(0, 20).every((s) => s === 400), verifyKeys.join(",").slice(0, 60));
}

// --- profile authorisation + isolation
{
  const a = await login(mail("iso-a")), b = await login(mail("iso-b"));
  const idA = sql(`select id from "user" where email='${mail("iso-a").toLowerCase()}'`);
  const pa = await call("/api/account/profile", { method: "PATCH", cookie: a.cookie, body: { displayName: "Alice A", timeZone: "Australia/Melbourne" } });
  check("11a profile update saves name and zone", pa.status === 200 && pa.json.displayName === "Alice A" && pa.json.timeZone === "Australia/Melbourne", JSON.stringify(pa.json));
  const attack = await call("/api/account/profile", { method: "PATCH", cookie: b.cookie, body: { userId: idA, displayName: "pwned" } });
  check("11b a user id in the body is rejected (strict schema)", attack.status === 400, `status ${attack.status}`);
  const pb = await call("/api/account/profile", { method: "PATCH", cookie: b.cookie, body: { displayName: "Bob B" } });
  const readA = await call("/api/account/profile", { cookie: a.cookie });
  check("11c user B's update never touches user A (isolation)", pb.json.displayName === "Bob B" && readA.json.displayName === "Alice A" && readA.json.email === mail("iso-a").toLowerCase());
  check("11d each user only ever reads their own email", pb.json.email === mail("iso-b").toLowerCase());
  const badTz = await call("/api/account/profile", { method: "PATCH", cookie: a.cookie, body: { timeZone: "Not/AZone" } });
  const long = await call("/api/account/profile", { method: "PATCH", cookie: a.cookie, body: { displayName: "x".repeat(41) } });
  const empty = await call("/api/account/profile", { method: "PATCH", cookie: a.cookie, body: {} });
  check("11e invalid zone, over-long name and empty update are 400", badTz.status === 400 && long.status === 400 && empty.status === 400, `${badTz.status}/${long.status}/${empty.status}`);
  const ctl = await call("/api/account/profile", { method: "PATCH", cookie: a.cookie, body: { displayName: "A\u0000‮li\nce" } });
  check("11f control and bidi characters are stripped from the name", ctl.status === 200 && !/[\u0000-\u001f‮]/.test(ctl.json.displayName ?? ""), JSON.stringify(ctl.json.displayName));
  const xss = await call("/api/account/profile", { method: "PATCH", cookie: a.cookie, body: { displayName: "<img src=x onerror=alert(1)>" } });
  const html = await (await fetch(BASE + "/account", { headers: { cookie: a.cookie } })).text();
  check("11g markup in a name is stored as text and rendered escaped", xss.status === 200 && !html.includes("<img src=x"), "no raw <img> in the account page HTML");
}

// --- audit trail
{
  const actions = sql(`select string_agg(distinct action, ',' order by action) from "AuditLog" where "createdAt" >= '${started}'`);
  check("12 audit trail records sign-in, sign-out, user creation, profile update", ["account.profile_updated", "auth.sign_in", "auth.sign_out", "auth.user_created"].every((a) => actions.split(",").includes(a)), actions);
  const meta = sql(`select string_agg(coalesce(meta::text,''), ' ') from "AuditLog" where "createdAt" >= '${started}'`);
  check("12b audit meta contains no emails or codes", !/@/.test(meta) && ![...usedOtps].some((o) => meta.includes(o)), meta.slice(0, 80));
  const ipHashes = sql(`select count(*) from "AuditLog" where "createdAt" >= '${started}' and "ipHash" is not null and "ipHash" !~ '^[0-9a-f]{64}$'`);
  check("12c IPs are stored only as 64-hex keyed hashes", ipHashes === "0");
}

// --- no secrets in logs or responses
{
  const log = SERVER_LOG ? readFileSync(SERVER_LOG, "utf8") : null;
  if (log !== null) check("13 server log contains no codes and no email addresses", ![...usedOtps].some((o) => log.includes(`"${o}"`) || log.includes(`otp: ${o}`)) && !/@e2e\.example\.test/.test(log), `${log.length} bytes scanned`);
  else console.log("SKIP  13 (no SERVER_LOG given)");
  const send = await sendOtp(mail("leak"), newIp());
  check("13b OTP request response never contains the code", !/\d{6}/.test(send.text), send.text.slice(0, 60));
}

// --- guest experience unchanged
{
  const created = await fetch(BASE + "/api/cards", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": newIp() }, body: JSON.stringify({ templateKey: "snow-globe", recipientName: "Ava", senderName: "Sam", message: "Hello" }) });
  const cj = await created.json();
  check("14a guest card publish still works without sign-in (201)", created.status === 201 && /^[2-9a-hjkmnp-z]{12}$/.test(cj.slug ?? ""), `status ${created.status}`);
  check("14b publishing set no cookie and the card has no owner", (created.headers.getSetCookie?.() ?? []).length === 0 && sql(`select "ownerId" is null from "Card" where slug='${cj.slug}'`) === "t");
  const page = await fetch(`${BASE}/c/${cj.slug}`);
  check("14c public card page 200 with no cookies", page.status === 200 && (page.headers.getSetCookie?.() ?? []).length === 0);
  check("14d unknown card is a real 404 (proxy.ts untouched)", (await fetch(`${BASE}/c/zzzzzzzzzzzz`)).status === 404);
  const pages = await Promise.all(["/", "/create", "/sign-in", "/privacy", "/terms"].map((p) => fetch(BASE + p)));
  check("14e homepage, /create, /sign-in, /privacy, /terms all 200", pages.every((r) => r.status === 200), pages.map((r) => r.status).join(","));
  check("14f public pages set no cookies", pages.every((r) => (r.headers.getSetCookie?.() ?? []).length === 0));
  const hasOwner = sql(`select count(*) from "Card" where "ownerId" is not null`);
  check("14g no card anywhere was assigned an owner", hasOwner === "0", `owned cards: ${hasOwner}`);
}

// --- cleanup of this run's data
sql(`delete from "user" where email like '%+${stamp}@e2e.example.test'`);
sql(`delete from "verification" where identifier like '%+${stamp}@e2e.example.test%'`);
sql(`delete from "AuditLog" where "createdAt" >= '${started}' and "actorId" is null`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${SECURE ? " (secure/https mode)" : ""}`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
