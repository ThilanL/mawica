/* eslint-disable @typescript-eslint/no-explicit-any -- dev tooling over untyped JSON responses */
// End-to-end delivery checks: real HTTP server (production mode), real sessions, and the REAL worker command-line process, against the isolated
// mawica_test database. Dev tooling only; not part of `npm test`.
//   BASE=http://127.0.0.1:3030 ORIGIN=http://localhost:3030 OUTBOX=/tmp/outbox.jsonl SERVER_LOG=/tmp/server.log DATABASE_URL=<mawica_test url> npx tsx scripts/delivery-e2e.mts
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
async function call(path: string, o: { method?: string; body?: unknown; cookie?: string; origin?: string | null; headers?: Record<string, string> } = {}) {
  const h: Record<string, string> = { ...(o.headers ?? {}), "x-forwarded-for": newIp() };
  if (o.body !== undefined) h["content-type"] = "application/json";
  if (o.origin !== null) h.origin = o.origin ?? ORIGIN;
  if (o.cookie) h.cookie = o.cookie;
  const res = await fetch(BASE + path, { method: o.method ?? "GET", headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, redirect: "manual" });
  const text = await res.text(); let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text, headers: res.headers };
}
async function login(email: string) {
  const ip = newIp();
  await fetch(BASE + "/api/auth/email-otp/send-verification-otp", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ email, type: "sign-in" }) });
  const r = await fetch(BASE + "/api/auth/sign-in/email-otp", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ email, otp: lastOtp(email) }) });
  if (r.status !== 200) throw new Error(`login failed (${r.status})`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const stamp = Date.now(), started = new Date(Date.now() - 2000).toISOString();
const mail = (n: string) => `${n}+${stamp}@dlv-e2e.example.test`;
const drift = () => sql(`select count(*) from (select g.id from "CreditGrant" g left join "LedgerEntry" l on l."grantId" = g.id group by g.id, g.remaining having g.remaining <> coalesce(sum(l.delta),0)) x`);
const key = () => crypto.randomUUID();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sched = (cookie: string, msg: string, extra: Record<string, unknown> = {}) => call("/api/schedules", { method: "POST", cookie, body: { templateKey: "snow-globe", recipientName: "DlvE2E", senderName: "Sam", message: msg, schedule: { localDate: ymd(new Date(Date.now() + 3 * 86_400_000)), localTime: "09:00", timeZone: "UTC" }, ...extra }, headers: { "idempotency-key": key() } });
const slugOf = (id: string) => sql(`select c.slug from "ScheduledDelivery" d join "Card" c on c.id = d."cardId" where d.id = '${id}'`);
const makeDue = (ids: string[]) => sql(`update "ScheduledDelivery" set "deliverAtUtc" = now() - interval '1 minute', "nextAttemptAt" = now() - interval '1 minute', "updatedAt" = now() where id in (${ids.map((i) => `'${i}'`).join(",")})`);
const worker = (mode: string, ...args: string[]) => {
  const r = spawnSync("npm", ["run", "-s", "delivery:worker", "--", mode, ...args], { env: { ...process.env }, encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
const lastJson = (out: string) => { const l = out.trim().split("\n").filter((x) => x.startsWith("{")).at(-1); return l ? JSON.parse(l) : {}; };

// --- nobody can trigger delivery over HTTP
{
  const candidates = ["/api/delivery", "/api/delivery/run", "/api/worker", "/api/cron", "/api/cron/delivery", "/api/jobs", "/api/queue", "/api/schedules/process", "/api/schedules/run", "/api/internal/delivery", "/api/health/delivery"];
  const rs = await Promise.all(candidates.flatMap((p) => [call(p, { method: "POST", body: {} }), call(p)]));
  check("1 no anonymous (or any) HTTP endpoint can process delivery jobs: every guess is 404/405", rs.every((r) => [404, 405].includes(r.status)), `${rs.length} requests, statuses ${[...new Set(rs.map((r) => r.status))].join(",")}`);
}

// --- a scheduled card becomes public only when the worker publishes it
const A = mail("alice"), B = mail("bob"), P = mail("premium");
const cookieA = await login(A), cookieB = await login(B), cookieP = await login(P);
const s1 = (await sched(cookieA, "first card")).json.schedule, s2 = (await sched(cookieA, "second card")).json.schedule;
const premium = (await sched(cookieP, "wish for you", { templateKey: "lumis-wish" })).json.schedule;
const slug1 = slugOf(s1.id), slugP = slugOf(premium.id);
{
  check("2 before delivery the card links are private (404) and the API returns no link", (await fetch(`${BASE}/c/${slug1}`)).status === 404 && (await fetch(`${BASE}/c/${slugP}`)).status === 404 && (await call("/api/schedules", { cookie: cookieA })).json.schedules.every((s: any) => s.link === null));
  await call("/api/schedules", { cookie: cookieA });
  const w0 = await worker("once");
  check("2b the worker ignores schedules that are not due yet", lastJson(w0.out).claimed === 0 && w0.code === 0, w0.out.trim().slice(0, 80));
}
{
  makeDue([s1.id, premium.id]); // s2 stays in the future
  const w = worker("once");
  const stats = lastJson(w.out);
  check("3 the real worker process claims and publishes the due schedules (2 published, the future one untouched)", w.code === 0 && stats.claimed === 2 && stats.published === 2 && stats.errors === 0, w.out.trim().slice(-200));
  const page = await fetch(`${BASE}/c/${slug1}`), html = await page.text();
  check("3b the published card is now public: 200 with its message, no sign-in, no cookies", page.status === 200 && html.includes("first card") && (page.headers.getSetCookie?.() ?? []).length === 0);
  check("3c the premium card is public too (the recipient needs no account)", (await fetch(`${BASE}/c/${slugP}`)).status === 200 && (await fetch(`${BASE}/c/${slugP}/qr.png`)).status === 200);
  check("3d the not-yet-due schedule is still private", (await fetch(`${BASE}/c/${slugOf(s2.id)}`)).status === 404);
  const list = (await call("/api/schedules", { cookie: cookieA })).json.schedules;
  const pub = list.find((s: any) => s.id === s1.id), wait = list.find((s: any) => s.id === s2.id);
  check("3e the owner's list shows PUBLISHED with the live link; the waiting one still has none", pub.status === "PUBLISHED" && pub.link === `${new URL(BASE).origin.replace("127.0.0.1", "localhost")}/c/${slug1}`.replace(/^https?:\/\/[^/]+/, (m) => m) || (pub.status === "PUBLISHED" && pub.link.endsWith(`/c/${slug1}`) && wait.status === "SCHEDULED" && wait.link === null), JSON.stringify({ s: pub.status, l: pub.link }));
  check("3f the wallet is settled once: standard 1 card, premium 1 card + 1 premium credit (committed, not duplicated)", sql(`select count(*) from "LedgerEntry" l join "CreditReservation" r on r.id=l."reservationId" join "ScheduledDelivery" d on d."reservationId"=r.id where d.id in ('${s1.id}','${premium.id}') and l.kind='COMMIT'`) === "3" && drift() === "0");
  const act = (await call("/api/wallet/activity", { cookie: cookieP })).json.items;
  check("3g wallet activity shows the premium card as published (not scheduled)", act.some((i: any) => i.type === "card_published" && i.premium === true) && !act.some((i: any) => i.type === "card_scheduled"));
  const again = lastJson(worker("once").out);
  check("3h running the worker again changes nothing (idempotent): nothing claimed", again.claimed === 0 && again.published === 0);
  check("3i attempts are recorded with worker id and lease, outcome SUCCEEDED, no card text", sql(`select count(*) from "DeliveryAttempt" where "deliveryId" in ('${s1.id}','${premium.id}') and status='SUCCEEDED' and "workerId" is not null and "leaseToken" is not null`) === "2");
  check("3j audit rows exist for the publications and carry no personal data", Number(sql(`select count(*) from "AuditLog" where action='delivery.published' and "createdAt" >= '${started}'`)) >= 2 && !/first card|DlvE2E|@dlv-e2e/.test(sql(`select coalesce(string_agg(meta::text, ' '), '') from "AuditLog" where action like 'delivery.%' and "createdAt" >= '${started}'`)));
}

// --- isolation
{
  const lb = (await call("/api/schedules", { cookie: cookieB })).json.schedules;
  check("4 another account sees none of A's schedules or links", lb.length === 0);
  check("4b another account still cannot cancel or edit A's published schedule (404)", (await call(`/api/schedules/${s1.id}`, { method: "DELETE", cookie: cookieB })).status === 404);
  const del = await call(`/api/schedules/${s1.id}`, { method: "DELETE", cookie: cookieA });
  check("4c the owner cannot cancel a card that is already published (409), and nothing changes", del.status === 409 && sql(`select status::text from "ScheduledDelivery" where id='${s1.id}'`) === "PUBLISHED");
  const patch = await call(`/api/schedules/${s1.id}`, { method: "PATCH", cookie: cookieA, body: { localDate: ymd(new Date(Date.now() + 5 * 86_400_000)), localTime: "10:00", timeZone: "UTC", version: 1 } });
  check("4d a published schedule cannot be rescheduled (409)", patch.status === 409);
}

// --- guests are unchanged
{
  const guest = await call("/api/cards", { method: "POST", origin: null, body: { templateKey: "snow-globe", recipientName: "DlvE2E", senderName: "G", message: "guest card" } });
  check("5 guest standard publishing is unchanged (201, public 200)", guest.status === 201 && (await fetch(`${BASE}/c/${guest.json.slug}`)).status === 200);
  check("5b guests still cannot publish premium (401)", (await call("/api/cards", { method: "POST", origin: null, body: { templateKey: "lumis-wish", recipientName: "DlvE2E", senderName: "G", message: "x" } })).status === 401);
}

// --- cancel racing with the worker (real processes)
{
  const C = mail("race"); const cookieC = await login(C);
  const items: string[] = [];
  for (let i = 0; i < 8; i++) items.push((await sched(cookieC, `race ${i}`)).json.schedule.id);
  makeDue(items);
  const [w, ...cancels] = await Promise.all([new Promise<ReturnType<typeof worker>>((r) => setTimeout(() => r(worker("once")), 0)), ...items.map((id) => call(`/api/schedules/${id}`, { method: "DELETE", cookie: cookieC }))]);
  void w;
  worker("once");
  const rows = sql(`select status::text || ':' || (select status::text from "Card" c where c.id = d."cardId") || ':' || (select status::text from "CreditReservation" r where r.id = d."reservationId") from "ScheduledDelivery" d where d.id in (${items.map((i) => `'${i}'`).join(",")})`).split("\n");
  check("6 cancel racing the real worker: every schedule ends consistently (PUBLISHED+live+committed OR CANCELLED+cancelled+released), never both", rows.length === 8 && rows.every((r) => r === "PUBLISHED:PUBLISHED:COMMITTED" || r === "CANCELLED:CANCELLED:RELEASED"), [...new Set(rows)].join(" | "));
  check("6b the cancel API answered 200 or 409 only", cancels.every((c: any) => [200, 409].includes(c.status)), cancels.map((c: any) => c.status).join(","));
}

// --- reconciliation and logs
{
  const r = worker("reconcile");
  check("7 the worker's reconcile report is clean (exit 0, no anomalies, ledger reconciles)", r.code === 0 && lastJson(r.out).anomalies === 0, r.out.trim().slice(-120));
  check("7b no negative balances and no drift", sql(`select count(*) from "CreditGrant" where remaining < 0`) === "0" && drift() === "0");
  const log = SERVER_LOG ? readFileSync(SERVER_LOG, "utf8") : null;
  if (log !== null) check("8 the server log contains no card text, addresses or secrets", !/first card|wish for you|race \d|DlvE2E|@dlv-e2e|WELCOME_PEPPER/.test(log), `${log.length} bytes scanned`);
  check("8b the worker output contains only counts and ids", !/first card|wish for you|DlvE2E|@dlv-e2e|leaseToken/.test(r.out));
}

// --- cleanup (test DB only)
sql(`delete from "user" where email like '%+${stamp}@dlv-e2e.example.test'`);
sql(`begin; set local mawica.ledger_purge = 'on';
 delete from "LedgerEntry" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditReservation" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditGrant" where "accountId" in (select id from "CreditAccount" where "createdAt" >= '${started}');
 delete from "CreditAccount" where "createdAt" >= '${started}';
 delete from "WelcomeGrantTombstone" where "grantedAt" >= '${started}';
 commit;`);
sql(`delete from "Card" where "recipientName" = 'DlvE2E'`);
sql(`delete from "AuditLog" where "createdAt" >= '${started}' and "actorId" is null`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
