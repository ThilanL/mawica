import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Session helper mocked so the routes can be exercised as different signed-in users. Real sessions: scripts/schedule-e2e.mjs.
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; emailVerified: boolean } }));
vi.mock("@/modules/auth/session", () => ({ getRequestUser: async () => session.user, getSessionUser: async () => session.user }));

import { GET as listRoute, POST as createRoute } from "@/app/api/schedules/route";
import { DELETE as cancelRoute, PATCH as patchRoute } from "@/app/api/schedules/[id]/route";
import { GET as recipientsGet, POST as recipientsPost } from "@/app/api/recipients/route";
import { assignPlan, ensureWallet, welcomeHash } from "@/modules/wallet/wallet";
import { getPublishedCard } from "@/modules/cards/service";

const ORIGIN = "http://localhost:3000";
const users: string[] = [];
const emails: string[] = [];
const as = (u: typeof session.user) => { session.user = u; };
async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@srv.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
const key = () => crypto.randomUUID();
const card = { templateKey: "snow-globe", recipientName: "RouteSched", senderName: "Sam", message: "Hello" };
const when = (localDate: string, localTime = "09:00", timeZone = "UTC", ambiguity?: string) => ({ localDate, localTime, timeZone, ...(ambiguity ? { ambiguity } : {}) });
const body = (over: Record<string, unknown> = {}) => ({ ...card, schedule: when("2026-11-20"), ...over });

type Opt = { origin?: string | null; key?: string | null; raw?: string; ct?: string };
function req(method: string, url: string, b?: unknown, o: Opt = {}) {
  const h: Record<string, string> = { "x-forwarded-for": "1.1.1.1, 198.51.100.50", cookie: "mawica.session_token=x.y" };
  if (o.origin !== null) h.origin = o.origin ?? ORIGIN;
  if (b !== undefined || o.raw !== undefined) h["content-type"] = o.ct ?? "application/json";
  if (o.key !== null && method === "POST" && url.endsWith("/api/schedules")) h["idempotency-key"] = o.key ?? key();
  return new Request(url, { method, headers: h, body: o.raw ?? (b === undefined ? undefined : JSON.stringify(b)) });
}
const create = (b: unknown = body(), o: Opt = {}) => createRoute(req("POST", "http://t/api/schedules", b, o));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, b: unknown, o: Opt = {}) => patchRoute(req("PATCH", `http://t/api/schedules/${id}`, b, o), ctx(id));
const cancel = (id: string, o: Opt = {}) => cancelRoute(req("DELETE", `http://t/api/schedules/${id}`, undefined, o), ctx(id));
const list = () => listRoute(req("GET", "http://t/api/schedules"));

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T00:00:00.000Z")); });
beforeEach(async () => { await db.rateLimit.deleteMany(); as(null); });
afterAll(async () => {
  vi.useRealTimers();
  const accs = (await db.creditAccount.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((a) => a.id);
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.card.deleteMany({ where: { recipientName: "RouteSched" } });
  await db.rateLimit.deleteMany();
  await db.$disconnect();
});

describe("authentication and CSRF", () => {
  it("anonymous or invalid sessions are refused on every schedule and recipient route (401)", async () => {
    as(null);
    const id = crypto.randomUUID();
    const rs = await Promise.all([list(), create(), patch(id, { ...when("2026-11-21"), version: 0 }), cancel(id), recipientsGet(req("GET", "http://t/api/recipients")), recipientsPost(req("POST", "http://t/api/recipients", { name: "A" }))]);
    expect(rs.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect((await rs[1].json()).code).toBe("SIGN_IN_REQUIRED");
    expect(await db.card.count({ where: { recipientName: "RouteSched" } })).toBe(0);
  });
  it("mutations with a foreign or missing Origin are refused (403) even for a signed-in user, and change nothing", async () => {
    const u = await mkUser(); as(u);
    for (const origin of ["https://evil.example", "http://localhost:3000.evil.example", null]) {
      expect((await create(body(), { origin })).status).toBe(403);
    }
    const ok = await (await create()).json();
    expect((await patch(ok.schedule.id, { ...when("2026-11-22"), version: 0 }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await cancel(ok.schedule.id, { origin: null })).status).toBe(403);
    const row = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: ok.schedule.id } });
    expect(row).toMatchObject({ status: "SCHEDULED", version: 0 });
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(1);
  });
});

describe("POST /api/schedules", () => {
  it("creates a private scheduled card: 201, wallet numbers, no link or internal ids in the response", async () => {
    const u = await mkUser(); as(u);
    const res = await create();
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.schedule).toMatchObject({ status: "SCHEDULED", deliverAtUtc: "2026-11-20T09:00:00.000Z", creditsReserved: 1, version: 0 });
    expect(j.wallet).toEqual({ cardsRemaining: 9, premiumRemaining: 1 });
    expect(JSON.stringify(j)).not.toMatch(/slug|reservation|ownerId|idempotency|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}.*cardId/i);
    const card = await db.card.findFirstOrThrow({ where: { ownerId: u.id } });
    expect(card.status).toBe("SCHEDULED");
    expect(await getPublishedCard(card.slug)).toBeNull();
  });
  it("needs an Idempotency-Key and a valid body; unknown or smuggled fields are refused", async () => {
    const u = await mkUser(); as(u);
    expect((await create(body(), { key: null })).status).toBe(400);
    expect((await create(body(), { key: "short" })).status).toBe(400);
    expect((await create(body({ tier: "STANDARD" }))).status).toBe(400);
    expect((await create(body({ ownerId: crypto.randomUUID() }))).status).toBe(400);
    expect((await create(body({ status: "PUBLISHED" }))).status).toBe(400);
    expect((await create(body({ message: "" }))).status).toBe(400);
    expect((await create(undefined, { raw: "{" })).status).toBe(400);
    expect((await create(undefined, { raw: "x".repeat(9000), ct: "application/json" })).status).toBe(413);
    expect((await create(body(), { ct: "text/plain" })).status).toBe(415);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(0);
  });
  it("replays an Idempotency-Key (200, same schedule) and refuses its reuse for a different request (422)", async () => {
    const u = await mkUser(); as(u);
    const k = key();
    const a = await create(body(), { key: k }), b = await create(body(), { key: k });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect((await a.json()).schedule.id).toBe((await b.json()).schedule.id);
    const c = await create(body({ message: "other" }), { key: k });
    expect(c.status).toBe(422);
    expect((await c.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("Free horizon: one calendar month is accepted, a minute beyond is a 422 TOO_FAR with the real limit", async () => {
    const u = await mkUser(); as(u);
    expect((await create(body({ schedule: when("2026-12-11", "00:00") }))).status).toBe(201);
    const r = await create(body({ schedule: when("2026-12-11", "00:01") }));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ code: "TOO_FAR", details: { latest: "2026-12-11T00:00:00.000Z", monthsAhead: 1 } });
  });
  it("invalid and past dates are 422 with specific codes", async () => {
    const u = await mkUser(); as(u);
    const code = async (s: unknown) => (await (await create(body({ schedule: s }))).json()).code;
    expect(await code(when("2026-02-30"))).toBe("INVALID_DATE");
    expect(await code(when("2026-11-20", "09:00", "Nope/Zone"))).toBe("INVALID_ZONE");
    expect(await code(when("2026-11-10"))).toBe("IN_THE_PAST");
    expect(await code(when("2026-11-11", "00:03"))).toBe("IN_THE_PAST");
  });
  it("daylight saving over HTTP: gap refused with a suggestion; ambiguous time lists both offsets and needs a choice", async () => {
    const u = await mkUser(); as(u);
    await db.$transaction(async (tx) => { const a = await ensureWallet(tx, u, new Date()); await assignPlan(tx, a.id, "plus", new Date()); });
    const gap = await create(body({ schedule: when("2027-03-14", "02:30", "America/New_York") }));
    expect(gap.status).toBe(422);
    expect(await gap.json()).toMatchObject({ code: "NONEXISTENT_LOCAL_TIME", details: { gapMinutes: 60, suggestion: { localDate: "2027-03-14", localTime: "03:30" } } });
    const amb = await create(body({ schedule: when("2027-11-07", "01:30", "America/New_York") }));
    expect(amb.status).toBe(422);
    const aj = await amb.json();
    expect(aj.code).toBe("AMBIGUOUS_LOCAL_TIME");
    expect(aj.details.options.map((o: { choice: string; offset: string }) => [o.choice, o.offset])).toEqual([["earlier", "-04:00"], ["later", "-05:00"]]);
    const later = await create(body({ schedule: when("2027-11-07", "01:30", "America/New_York", "later"), message: "later" }));
    expect(later.status).toBe(201);
    expect((await later.json()).schedule).toMatchObject({ deliverAtUtc: "2027-11-07T06:30:00.000Z", utcOffsetMinutes: -300, localTime: "01:30" });
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("credits: 402 with distinct codes, nothing created", async () => {
    const u = await mkUser(); as(u);
    expect((await create(body({ templateKey: "lumis-wish" }))).status).toBe(201); // welcome premium credit
    const p = await create(body({ templateKey: "lumis-wish", message: "again" }));
    expect(p.status).toBe(402);
    expect((await p.json()).code).toBe("INSUFFICIENT_PREMIUM_CREDITS");
    for (let i = 0; i < 9; i++) expect((await create(body({ message: `m${i}` }))).status).toBe(201);
    const s = await create(body({ message: "last" }));
    expect(s.status).toBe(402);
    expect((await s.json()).code).toBe("INSUFFICIENT_CREDITS");
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(10);
  });
  it("EMAIL channel is refused (422) until delivery exists", async () => {
    as(await mkUser());
    const r = await create(body({ channel: "EMAIL" }));
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("CHANNEL_UNAVAILABLE");
  });
});

describe("GET/PATCH/DELETE and cross-account access", () => {
  it("lists only the caller's own schedules", async () => {
    const a = await mkUser(), b = await mkUser();
    as(a); const ja = await (await create()).json();
    as(b); const jb = await (await create(body({ message: "b" }))).json();
    const lb = await (await list()).json();
    expect(lb.schedules.map((s: { id: string }) => s.id)).toEqual([jb.schedule.id]);
    expect(JSON.stringify(lb)).not.toContain(ja.schedule.id);
    as(a);
    expect((await (await list()).json()).schedules.map((s: { id: string }) => s.id)).toEqual([ja.schedule.id]);
  });
  it("another account gets 404 for someone else's id, exactly like an unknown id, and nothing changes", async () => {
    const a = await mkUser(), b = await mkUser();
    as(a); const ja = await (await create()).json();
    as(b);
    const other = [await patch(ja.schedule.id, { ...when("2026-11-25"), version: 0 }), await cancel(ja.schedule.id)];
    const unknown = [await patch(crypto.randomUUID(), { ...when("2026-11-25"), version: 0 }), await cancel(crypto.randomUUID()), await cancel("not-a-uuid")];
    expect(other.map((r) => r.status)).toEqual([404, 404]);
    expect(unknown.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(await other[0].json()).toEqual(await unknown[0].json());
    expect(await db.scheduledDelivery.findUniqueOrThrow({ where: { id: ja.schedule.id } })).toMatchObject({ status: "SCHEDULED", version: 0 });
  });
  it("reschedules (200, version+1, no new credit) and answers stale versions with 409", async () => {
    const u = await mkUser(); as(u);
    const j = await (await create()).json();
    const r = await patch(j.schedule.id, { ...when("2026-11-25", "18:00", "Asia/Colombo"), version: 0 });
    expect(r.status).toBe(200);
    expect((await r.json()).schedule).toMatchObject({ version: 1, deliverAtUtc: "2026-11-25T12:30:00.000Z", localTime: "18:00" });
    expect((await (await listRoute(req("GET", "http://t/api/schedules"))).json()).schedules).toHaveLength(1);
    const stale = await patch(j.schedule.id, { ...when("2026-11-26"), version: 0 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("STALE_VERSION");
    const bad = await patch(j.schedule.id, { ...when("2027-06-01"), version: 1 });
    expect(bad.status).toBe(422);
    expect(await db.creditReservation.count({ where: { account: { userId: u.id } } })).toBe(1);
  });
  it("cancel is idempotent (200 twice), releases the credit once, and hides the card", async () => {
    const u = await mkUser(); as(u);
    const j = await (await create(body({ templateKey: "lumis-wish" }))).json();
    expect(j.wallet).toEqual({ cardsRemaining: 9, premiumRemaining: 0 });
    const c1 = await cancel(j.schedule.id), c2 = await cancel(j.schedule.id);
    expect([c1.status, c2.status]).toEqual([200, 200]);
    expect([(await c1.json()).changed, (await c2.json()).changed]).toEqual([true, false]);
    const again = await (await create(body({ templateKey: "lumis-wish", message: "again" }))).json();
    expect(again.wallet).toEqual({ cardsRemaining: 9, premiumRemaining: 0 }); // credits were restored once, so a new premium schedule works
    const row = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: j.schedule.id }, include: { card: true } });
    expect(row.card.status).toBe("CANCELLED");
    const edit = await patch(j.schedule.id, { ...when("2026-11-25"), version: 1 });
    expect(edit.status).toBe(409);
    expect((await edit.json()).code).toBe("NOT_EDITABLE");
  });
  it("a schedule in delivery cannot be cancelled: 409", async () => {
    const u = await mkUser(); as(u);
    const j = await (await create()).json();
    await db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'PROCESSING', "updatedAt" = now() WHERE id = ${j.schedule.id}::uuid`;
    const r = await cancel(j.schedule.id);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("NOT_CANCELLABLE");
  });
  it("rate limits mutations per user (429 with Retry-After)", async () => {
    const u = await mkUser(); as(u);
    let last = 0; let ra: string | null = null;
    for (let i = 0; i < 125; i++) { const r = await cancel(crypto.randomUUID()); last = r.status; ra = r.headers.get("retry-after"); }
    expect(last).toBe(429);
    expect(Number(ra)).toBeGreaterThan(0);
  }, 60000);
});

describe("recipients API", () => {
  it("lists and creates only the caller's recipients (name + time zone), with validation", async () => {
    const a = await mkUser(), b = await mkUser();
    as(a);
    const r = await recipientsPost(req("POST", "http://t/api/recipients", { name: "  Ava  ", timeZone: "Asia/Colombo" }));
    expect(r.status).toBe(201);
    const ra = (await r.json()).recipient;
    expect(ra).toMatchObject({ name: "Ava", timeZone: "Asia/Colombo", hasEmail: false });
    as(b);
    expect((await (await recipientsGet(req("GET", "http://t/api/recipients"))).json()).recipients).toEqual([]);
    as(a);
    expect((await (await recipientsGet(req("GET", "http://t/api/recipients"))).json()).recipients.map((x: { id: string }) => x.id)).toEqual([ra.id]);
    expect((await recipientsPost(req("POST", "http://t/api/recipients", { name: "" }))).status).toBe(400);
    expect((await recipientsPost(req("POST", "http://t/api/recipients", { name: "X", email: "x@example.com" }))).status).toBe(400); // needs the sender's attestation
    expect((await recipientsPost(req("POST", "http://t/api/recipients", { name: "X", timeZone: "No/Zone" }))).status).toBe(422);
    expect((await recipientsPost(req("POST", "http://t/api/recipients", { name: "X", ownerId: b.id }))).status).toBe(400);
    expect((await recipientsPost(req("POST", "http://t/api/recipients", { name: "X" }, { origin: "https://evil.example" }))).status).toBe(403);
  });
});
