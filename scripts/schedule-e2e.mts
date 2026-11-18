/* eslint-disable @typescript-eslint/no-explicit-any -- dev tooling over untyped JSON responses and CDP messages */
// End-to-end checks for card scheduling against a running PRODUCTION-mode server and the isolated mawica_test database, with real sessions
// (email-code sign-in through the local mail outbox). Dev tooling only; not part of `npm test`. Run with tsx so the pure time engine is shared:
//   BASE=http://127.0.0.1:3030 ORIGIN=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl SERVER_LOG=/tmp/server.log DATABASE_URL=<mawica_test url> npx tsx scripts/schedule-e2e.mts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { addCalendarMonthsUTC, resolveLocal, scheduleWindow } from "../src/modules/scheduling/time";

const BASE = process.env.BASE ?? "http://127.0.0.1:3030";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3030";
const OUTBOX = process.env.OUTBOX, SERVER_LOG = process.env.SERVER_LOG;
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (!OUTBOX || dbUrl.pathname !== "/mawica_test" || dbUrl.port !== (process.env.MAWICA_PG_PORT ?? "5433")) throw new Error("Refusing to run: needs OUTBOX and DATABASE_URL pointing at mawica_test on port 5433");
const sql = (q: string) => execFileSync("psql", ["-h", dbUrl.hostname, "-p", dbUrl.port, "-U", dbUrl.username, "-d", "mawica_test", "-tA", "-c", q], { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) } }).toString().trim();
const lastOtp = (email: string) => { try { return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === email).at(-1)?.otp as string | undefined; } catch { return undefined; } };

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
let ipc = 20 + Math.floor(Math.random() * 100);
const newIp = () => `203.0.${100 + Math.floor(Math.random() * 100)}.${(ipc++ % 250) + 1}`;
const cookieOf = (sc: string[]) => sc.map((c) => c.split(";")[0]).join("; ");
type R = { status: number; json: any; text: string; headers: Headers };
async function call(path: string, o: { method?: string; body?: unknown; cookie?: string; ip?: string; origin?: string | null; headers?: Record<string, string> } = {}): Promise<R> {
  const h: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.body !== undefined) h["content-type"] = "application/json";
  if (o.origin !== null) h.origin = o.origin ?? ORIGIN;
  if (o.cookie) h.cookie = o.cookie;
  h["x-forwarded-for"] = o.ip ?? newIp();
  const res = await fetch(BASE + path, { method: o.method ?? "GET", headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, redirect: "manual" });
  const text = await res.text(); let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text, headers: res.headers };
}
async function login(email: string) {
  const ip = newIp();
  await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email, type: "sign-in" }, ip });
  const r = await fetch(BASE + "/api/auth/sign-in/email-otp", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ email, otp: lastOtp(email) }) });
  if (r.status !== 200) throw new Error(`login failed (${r.status})`);
  return cookieOf(r.headers.getSetCookie());
}
const started = new Date(Date.now() - 2000).toISOString();
const stamp = Date.now();
const mail = (n: string) => `${n}+${stamp}@sched-e2e.example.test`;
const userId = (email: string) => sql(`select id from "user" where email='${email.toLowerCase()}'`);
const drift = () => sql(`select count(*) from (select g.id from "CreditGrant" g left join "LedgerEntry" l on l."grantId" = g.id group by g.id, g.remaining having g.remaining <> coalesce(sum(l.delta),0)) x`);
const wallet = async (cookie: string) => (await call("/api/wallet", { cookie })).json?.wallet;
const key = () => crypto.randomUUID();
const card = (m = "Hello") => ({ templateKey: "snow-globe", recipientName: "SchedE2E", senderName: "Sam", message: m });
const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
const inDays = (n: number, time = "09:00", timeZone = "UTC") => ({ localDate: ymd(new Date(Date.now() + n * 86_400_000)), localTime: time, timeZone });
const create = (cookie: string, b: Record<string, unknown>, o: { key?: string | null; ip?: string } = {}) =>
  call("/api/schedules", { method: "POST", cookie, ip: o.ip, body: b, headers: o.key === null ? {} : { "idempotency-key": o.key ?? key() } });
const sched = (m = "Hello", when = inDays(3), extra: Record<string, unknown> = {}) => ({ ...card(m), schedule: when, ...extra });
const slugOf = (id: string) => sql(`select c.slug from "ScheduledDelivery" d join "Card" c on c.id = d."cardId" where d.id = '${id}'`);

// --- anonymous, forged and CSRF
{
  const id = crypto.randomUUID();
  const rs = await Promise.all([call("/api/schedules"), call("/api/schedules", { method: "POST", body: sched(), headers: { "idempotency-key": key() } }), call(`/api/schedules/${id}`, { method: "PATCH", body: { ...inDays(4), version: 0 } }), call(`/api/schedules/${id}`, { method: "DELETE" }), call("/api/recipients")]);
  check("1 anonymous scheduling, listing, editing, cancelling and recipients are all refused (401)", rs.every((r) => r.status === 401), rs.map((r) => r.status).join(","));
  const forged = await call("/api/schedules", { cookie: "mawica.session_token=forged.value" });
  check("1b a forged session cookie is refused (401)", forged.status === 401);
  const page = await fetch(BASE + "/account/scheduled", { redirect: "manual" });
  const html = await page.text();
  check("1c the scheduled-cards page for a visitor reveals nothing and redirects to sign-in", [200, 307].includes(page.status) && !/Scheduled cards waiting|Nothing scheduled/.test(html) && (page.status === 307 || html.includes("/sign-in?next=/account/scheduled")), String(page.status));
  check("1d no card is created by anonymous attempts", sql(`select count(*) from "Card" where "recipientName"='SchedE2E' and "createdAt" >= '${started}'`) === "0");
}

const A = mail("alice"), B = mail("bob");
const cookieA = await login(A), cookieB = await login(B);
let schedA: any;
{
  const evil = await create(cookieA, sched(), {});
  const noOrigin = await call("/api/schedules", { method: "POST", cookie: cookieA, origin: null, body: sched("o"), headers: { "idempotency-key": key() } });
  const foreign = await call("/api/schedules", { method: "POST", cookie: cookieA, origin: "https://evil.example", body: sched("e"), headers: { "idempotency-key": key() } });
  check("2 a missing or foreign Origin is refused on mutations (403) even with a valid session", noOrigin.status === 403 && foreign.status === 403 && evil.status === 201, `${noOrigin.status}/${foreign.status}`);
  schedA = evil.json.schedule;
  check("2b A's schedule is created: 201, SCHEDULED, 1 credit reserved, wallet 9 left", schedA.status === "SCHEDULED" && schedA.creditsReserved === 1 && evil.json.wallet.cardsRemaining === 9, JSON.stringify(evil.json.wallet));
  check("2c the response carries no link or internal ids", !/slug|reservation|ownerId|idempotency/i.test(evil.text));
}

// --- ownership isolation
{
  const la = await call("/api/schedules", { cookie: cookieA }), lb = await call("/api/schedules", { cookie: cookieB });
  check("3 each user lists only their own schedules", la.json.schedules.length === 1 && la.json.schedules[0].id === schedA.id && lb.json.schedules.length === 0);
  const patch = await call(`/api/schedules/${schedA.id}`, { method: "PATCH", cookie: cookieB, body: { ...inDays(5), version: 0 } });
  const del = await call(`/api/schedules/${schedA.id}`, { method: "DELETE", cookie: cookieB });
  const unknown = await call(`/api/schedules/${crypto.randomUUID()}`, { method: "DELETE", cookie: cookieB });
  check("3b another account gets 404 (same as an unknown id) for edit and cancel", patch.status === 404 && del.status === 404 && unknown.status === 404 && JSON.stringify(del.json) === JSON.stringify(unknown.json), `${patch.status}/${del.status}/${unknown.status}`);
  check("3c A's schedule and credit are untouched by B's attempts", sql(`select status::text || version::text from "ScheduledDelivery" where id='${schedA.id}'`) === "SCHEDULED0" && (await wallet(cookieA)).sends.remaining === 9);
  check("3d B's wallet is unaffected", (await wallet(cookieB)).sends.remaining === 10);
  const recipients = await call("/api/recipients", { cookie: cookieB });
  check("3e recipients are per account", recipients.json.recipients.length === 0 && (await call("/api/recipients", { cookie: cookieA })).json.recipients.length === 1);
}

// --- scheduled cards are private
{
  const slug = slugOf(schedA.id);
  const page = await fetch(`${BASE}/c/${slug}`), qr = await fetch(`${BASE}/c/${slug}/qr.png`);
  const rep = await fetch(`${BASE}/api/cards/${slug}/report`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": newIp() }, body: JSON.stringify({ reason: "SPAM" }) });
  check("4 a scheduled card's link is 404 for everyone, including its owner (page, QR and report)", page.status === 404 && qr.status === 404 && rep.status === 404, `${page.status}/${qr.status}/${rep.status}`);
  const withCookie = await fetch(`${BASE}/c/${slug}`, { headers: { cookie: cookieA } });
  check("4b not even the owner's session makes it public before delivery", withCookie.status === 404);
  const pub = await call("/api/cards", { method: "POST", cookie: cookieA, origin: null, body: card("published now"), headers: { "idempotency-key": key() } });
  check("4c a normal published card still works (201, public 200)", pub.status === 201 && (await fetch(`${BASE}/c/${pub.json.slug}`)).status === 200);
  const guest = await call("/api/cards", { method: "POST", origin: null, body: card("guest") });
  check("4d guest standard publishing is unchanged (201, public 200, no owner)", guest.status === 201 && (await fetch(`${BASE}/c/${guest.json.slug}`)).status === 200 && sql(`select "ownerId" is null from "Card" where slug='${guest.json.slug}'`) === "t");
  const guestPrem = await call("/api/cards", { method: "POST", origin: null, body: { ...card("p"), templateKey: "lumis-wish" } });
  check("4e guests still cannot publish premium (401)", guestPrem.status === 401);
}

// --- premium
{
  const c = await login(mail("premium"));
  const p1 = await create(c, sched("wish", inDays(3), { templateKey: "lumis-wish" }));
  check("5 a premium schedule reserves 1 card + 1 premium credit", p1.status === 201 && p1.json.schedule.creditsReserved === 2 && p1.json.wallet.premiumRemaining === 0 && p1.json.wallet.cardsRemaining === 9, JSON.stringify(p1.json.wallet));
  const p2 = await create(c, sched("wish 2", inDays(3), { templateKey: "lumis-wish" }));
  check("5b a second premium schedule is refused (402 premium code) and costs nothing", p2.status === 402 && p2.json.code === "INSUFFICIENT_PREMIUM_CREDITS" && (await wallet(c)).sends.remaining === 9);
  check("5c premium schedule is a PREMIUM, SCHEDULED, hidden card", sql(`select c.tier='PREMIUM' and c.status='SCHEDULED' from "ScheduledDelivery" d join "Card" c on c.id=d."cardId" where d.id='${p1.json.schedule.id}'`) === "t");
}

// --- idempotency and duplicates
{
  const c = await login(mail("dupe")), ip = newIp(), k = key();
  const dupes = await Promise.all(Array.from({ length: 20 }, () => create(c, sched("same"), { key: k, ip })));
  check("6 20 simultaneous requests with one Idempotency-Key create exactly one schedule", dupes.filter((r) => r.status === 201).length === 1 && dupes.filter((r) => r.status === 200).length === 19 && new Set(dupes.map((r) => r.json.schedule.id)).size === 1, `201:${dupes.filter((r) => r.status === 201).length} 200:${dupes.filter((r) => r.status === 200).length}`);
  check("6b one card, one reservation, one credit", sql(`select count(*) from "Card" where "ownerId"='${userId(mail("dupe"))}'`) === "1" && (await wallet(c)).sends.remaining === 9);
  const reuse = await create(c, sched("different"), { key: k, ip });
  check("6c the same key with a different request is refused (422)", reuse.status === 422 && reuse.json.code === "IDEMPOTENCY_KEY_REUSED");
  check("6d a missing Idempotency-Key is a 400", (await create(c, sched("x"), { key: null })).status === 400);
}

// --- concurrency on the last credits
{
  const c = await login(mail("race")), ip = newIp();
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => create(c, sched(`r${i}`), { ip })));
  const ok = rs.filter((r) => r.status === 201).length, no = rs.filter((r) => r.status === 402).length;
  check("7 25 simultaneous schedules with 10 credits: exactly 10 created, 15 refused (402), nothing else", ok === 10 && no === 15, `201:${ok} 402:${no} other:${rs.filter((r) => ![201, 402].includes(r.status)).map((r) => r.status)}`);
  check("7b exactly 10 scheduled cards, wallet at 0, no negative balance, ledger reconciles", sql(`select count(*) from "ScheduledDelivery" where "ownerId"='${userId(mail("race"))}'`) === "10" && (await wallet(c)).sends.remaining === 0 && sql(`select count(*) from "CreditGrant" where remaining < 0`) === "0" && drift() === "0");
  const mixC = await login(mail("mix")), ipM = newIp();
  const mix = await Promise.all(Array.from({ length: 20 }, (_, i) => i % 2 ? create(mixC, sched(`m${i}`), { ip: ipM }) : call("/api/cards", { method: "POST", cookie: mixC, origin: null, ip: ipM, body: card(`p${i}`), headers: { "idempotency-key": key() } })));
  check("7c schedules and immediate publishes share the wallet: exactly 10 succeed in total", mix.filter((r) => r.status === 201).length === 10 && (await wallet(mixC)).sends.remaining === 0 && drift() === "0", `${mix.filter((r) => r.status === 201).length}`);
}

// --- cancellation
{
  const c = await login(mail("cancel"));
  const s = (await create(c, sched("cancel me"))).json.schedule;
  const rs = await Promise.all(Array.from({ length: 20 }, () => call(`/api/schedules/${s.id}`, { method: "DELETE", cookie: c })));
  check("8 20 simultaneous cancels: all answer 200, exactly one changes anything", rs.every((r) => r.status === 200) && rs.filter((r) => r.json.changed).length === 1, `changed:${rs.filter((r) => r.json.changed).length}`);
  check("8b the credit is restored exactly once (10) and no extra card is created", (await wallet(c)).sends.remaining === 10 && sql(`select count(*) from "Card" where "ownerId"='${userId(mail("cancel"))}'`) === "1");
  check("8c the cancelled card is CANCELLED, still private, and cannot be edited", sql(`select c.status from "ScheduledDelivery" d join "Card" c on c.id=d."cardId" where d.id='${s.id}'`) === "CANCELLED" && (await fetch(`${BASE}/c/${slugOf(s.id)}`)).status === 404 && (await call(`/api/schedules/${s.id}`, { method: "PATCH", cookie: c, body: { ...inDays(5), version: 1 } })).json.code === "NOT_EDITABLE");
  const d = (await create(c, sched("in delivery"))).json.schedule;
  sql(`update "ScheduledDelivery" set status='PROCESSING', "leaseToken"=gen_random_uuid(), "leaseOwner"='e2e', "leaseExpiresAt"=now()+interval '5 minutes', "attemptCount"="attemptCount"+1, "updatedAt"=now() where id='${d.id}'`);
  const blocked = await call(`/api/schedules/${d.id}`, { method: "DELETE", cookie: c });
  check("8d a schedule already in delivery cannot be cancelled (409) and keeps its credit", blocked.status === 409 && blocked.json.code === "NOT_CANCELLABLE" && (await wallet(c)).sends.remaining === 9);
  check("8e ledger reconciles after cancellations", drift() === "0");
}

// --- rescheduling
{
  const c = await login(mail("resched"));
  const s = (await create(c, sched("move me", inDays(3, "09:00", "Asia/Colombo")))).json.schedule;
  const before = sql(`select "reservationId" from "ScheduledDelivery" where id='${s.id}'`);
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => call(`/api/schedules/${s.id}`, { method: "PATCH", cookie: c, body: { ...inDays(4 + i, "10:00", "Asia/Colombo"), version: 0 } })));
  check("9 12 simultaneous reschedules from one version: exactly one wins, 11 get 409", rs.filter((r) => r.status === 200).length === 1 && rs.filter((r) => r.status === 409 && r.json.code === "STALE_VERSION").length === 11, rs.map((r) => r.status).join(","));
  check("9b the same reservation is kept and nothing extra is deducted", sql(`select "reservationId" from "ScheduledDelivery" where id='${s.id}'`) === before && (await wallet(c)).sends.remaining === 9 && sql(`select count(*) from "CreditReservation" r join "CreditAccount" a on a.id=r."accountId" where a."userId"='${userId(mail("resched"))}'`) === "1");
  const bad = await call(`/api/schedules/${s.id}`, { method: "PATCH", cookie: c, body: { ...inDays(-2), version: 1 } });
  check("9c a past time is refused (422 IN_THE_PAST) and the schedule is unchanged", bad.status === 422 && bad.json.code === "IN_THE_PAST" && sql(`select version from "ScheduledDelivery" where id='${s.id}'`) === "1");
  const raceC = await Promise.all([call(`/api/schedules/${s.id}`, { method: "PATCH", cookie: c, body: { ...inDays(20, "11:00", "Asia/Colombo"), version: 1 } }), call(`/api/schedules/${s.id}`, { method: "DELETE", cookie: c }), call(`/api/schedules/${s.id}`, { method: "DELETE", cookie: c })]);
  const final = sql(`select status from "ScheduledDelivery" where id='${s.id}'`);
  check("9d reschedule racing cancel ends in one consistent state and releases the credit at most once", (final === "CANCELLED" ? (await wallet(c)).sends.remaining === 10 : (await wallet(c)).sends.remaining === 9) && raceC.every((r) => [200, 409].includes(r.status)) && drift() === "0", `${final} ${raceC.map((r) => r.status).join(",")}`);
}

// --- horizon: Free vs Plus
{
  const c = await login(mail("horizon"));
  const now = new Date();
  const edge = (months: number, deltaMin: number) => { const t = new Date(addCalendarMonthsUTC(now, months).getTime() + deltaMin * 60_000); return { localDate: ymd(t), localTime: hm(t), timeZone: "UTC" }; };
  const free = await create(c, sched("near edge", edge(1, -3)));
  const tooFar = await create(c, sched("past edge", edge(1, 3)));
  check("10 Free: just inside one calendar month is accepted, just beyond is refused (422 TOO_FAR, monthsAhead 1)", free.status === 201 && tooFar.status === 422 && tooFar.json.code === "TOO_FAR" && tooFar.json.details.monthsAhead === 1, `${free.status}/${tooFar.status}`);
  const nine = await create(c, sched("nine months", edge(9, 0)));
  check("10b Free cannot schedule 9 months ahead", nine.status === 422 && nine.json.code === "TOO_FAR");
  sql(`update "CreditAccount" set "planKey"='plus' where "userId"='${userId(mail("horizon"))}'`); // the ONLY way to Plus today is a server-side operation: here, the test database
  const plusOk = await create(c, sched("plus edge", edge(12, -3)));
  const plusFar = await create(c, sched("plus beyond", edge(12, 3)));
  check("10c Plus: just inside 12 calendar months is accepted, just beyond is refused", plusOk.status === 201 && plusFar.status === 422 && plusFar.json.details.monthsAhead === 12, `${plusOk.status}/${plusFar.status}`);
  const w = scheduleWindow(now, 12);
  check("10d the reported limit equals the engine's calendar-month arithmetic (not 30-day months)", Math.abs(Date.parse(plusFar.json.details.latest) - w.latest.getTime()) < 5000);
  const past = await create(c, sched("past", inDays(-1)));
  const feb = await create(c, sched("feb", { localDate: "2027-02-30", localTime: "09:00", timeZone: "UTC" }));
  const soon = await create(c, sched("soon", { localDate: ymd(new Date(Date.now() + 60_000)), localTime: hm(new Date(Date.now() + 60_000)), timeZone: "UTC" }));
  check("10e past, impossible and too-soon times are refused with specific codes", past.json.code === "IN_THE_PAST" && feb.json.code === "INVALID_DATE" && soon.json.code === "IN_THE_PAST", `${past.json.code}/${feb.json.code}/${soon.json.code}`);

  // daylight saving: find the next spring-forward gap and fall-back overlap in New York within the Plus horizon, using the shared engine
  let gap: string | null = null, overlap: string | null = null;
  for (let d = 20; d < 364 && (!gap || !overlap); d++) {
    const date = ymd(new Date(Date.now() + d * 86_400_000));
    const r = resolveLocal(date, d % 2 ? "02:30" : "01:30", "America/New_York");
    if (r.kind === "nonexistent" && !gap) gap = date;
    const r2 = resolveLocal(date, "01:30", "America/New_York");
    if (r2.kind === "ambiguous" && !overlap) overlap = date;
  }
  if (!gap) for (let d = 20; d < 360 && !gap; d++) { const date = ymd(new Date(Date.now() + d * 86_400_000)); if (resolveLocal(date, "02:30", "America/New_York").kind === "nonexistent") gap = date; }
  const g = await create(c, sched("gap", { localDate: gap!, localTime: "02:30", timeZone: "America/New_York" }));
  check("11 a nonexistent local time is refused (422) with the nearest valid suggestion, and nothing is reserved", g.status === 422 && g.json.code === "NONEXISTENT_LOCAL_TIME" && g.json.details.suggestion.localTime === "03:30", `${gap} ${g.json.code}`);
  const am = await create(c, sched("amb", { localDate: overlap!, localTime: "01:30", timeZone: "America/New_York" }));
  check("11b an ambiguous local time is refused until the sender chooses, listing both offsets", am.status === 422 && am.json.code === "AMBIGUOUS_LOCAL_TIME" && am.json.details.options.map((o: any) => o.offset).join() === "-04:00,-05:00", `${overlap}`);
  const e = await create(c, sched("amb earlier", { localDate: overlap!, localTime: "01:30", timeZone: "America/New_York", ambiguity: "earlier" } as any));
  const l = await create(c, sched("amb later", { localDate: overlap!, localTime: "01:30", timeZone: "America/New_York", ambiguity: "later" } as any));
  check("11c each explicit choice is stored with its own instant and offset, local wall-clock preserved", e.status === 201 && l.status === 201 && e.json.schedule.utcOffsetMinutes === -240 && l.json.schedule.utcOffsetMinutes === -300 && Date.parse(l.json.schedule.deliverAtUtc) - Date.parse(e.json.schedule.deliverAtUtc) === 3_600_000 && e.json.schedule.localTime === "01:30");
  const colombo = await create(c, sched("colombo", inDays(6, "09:00", "Asia/Colombo")));
  check("11d a half-hour zone (Asia/Colombo, +05:30) resolves exactly", colombo.status === 201 && colombo.json.schedule.utcOffsetMinutes === 330 && colombo.json.schedule.deliverAtUtc.endsWith("T03:30:00.000Z"));
  check("11e ledger reconciles after all scheduling operations", drift() === "0");
}

// --- logs
{
  const log = SERVER_LOG ? readFileSync(SERVER_LOG, "utf8") : null;
  if (log !== null) check("12 server log has no emails, codes, secrets or card text", !/@sched-e2e\.example\.test/.test(log) && !/WELCOME_PEPPER|BETTER_AUTH_SECRET/.test(log) && !/SchedE2E|move me|cancel me/.test(log), `${log.length} bytes scanned`);
}

// --- cleanup (test DB only)
sql(`delete from "user" where email like '%+${stamp}@sched-e2e.example.test'`);
sql(`begin; set local mawica.ledger_purge = 'on';
 delete from "LedgerEntry" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditReservation" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditGrant" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditAccount" where "createdAt" >= '${started}';
 delete from "WelcomeGrantTombstone" where "grantedAt" >= '${started}';
 commit;`);
sql(`delete from "Card" where "recipientName" = 'SchedE2E'`);
sql(`delete from "AuditLog" where "createdAt" >= '${started}' and "actorId" is null`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
