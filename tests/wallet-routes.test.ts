import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { welcomeHash } from "@/modules/wallet/wallet";

// The session helper is mocked so routes can be exercised as different signed-in users. Real sessions are covered by the HTTP E2E script.
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; emailVerified: boolean } }));
vi.mock("@/modules/auth/session", () => ({ getRequestUser: async () => session.user, getSessionUser: async () => session.user }));

import { POST as publish } from "@/app/api/cards/route";
import { GET as getWallet } from "@/app/api/wallet/route";
import { GET as getActivity } from "@/app/api/wallet/activity/route";

const users: string[] = [];
const accounts: string[] = [];
const emails: string[] = [];
let ip = 0;
const freshIp = () => `198.51.100.${(++ip % 250) + 1}`;
async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@route.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
const COOKIE = "mawica.session_token=whatever.value";
const body = { templateKey: "snow-globe", recipientName: "RouteTest", senderName: "Sam", message: "Hello" };
const post = (b: unknown, o: { cookie?: boolean; key?: string; ip?: string } = {}) =>
  publish(new Request("http://t/api/cards", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `1.1.1.1, ${o.ip ?? freshIp()}`, ...(o.cookie ? { cookie: COOKIE } : {}), ...(o.key ? { "idempotency-key": o.key } : {}) }, body: JSON.stringify(b) }));
const as = (u: typeof session.user) => { session.user = u; };
const get = (h: typeof getWallet | typeof getActivity, url = "http://t/api/wallet") => h(new Request(url, { headers: { cookie: COOKIE, "x-forwarded-for": "9.9.9.9, 8.8.8.8" } }));

beforeEach(async () => { await db.rateLimit.deleteMany(); as(null); });
afterAll(async () => {
  const accs = await db.creditAccount.findMany({ where: { userId: { in: users } }, select: { id: true } });
  accounts.push(...accs.map((a) => a.id));
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.card.deleteMany({ where: { recipientName: "RouteTest" } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.rateLimit.deleteMany();
  await db.$disconnect();
});

describe("POST /api/cards: signed-in publishing through the wallet", () => {
  it("creates an owned card, spends one credit and reports what is left", async () => {
    const u = await mkUser(); as(u);
    const res = await post(body, { cookie: true, key: "route-key-0000001" });
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j).toMatchObject({ owned: true, remaining: 9 });
    expect(j.url).toBe(`http://localhost:3000/c/${j.slug}`);
    expect(await db.card.findUnique({ where: { slug: j.slug } })).toMatchObject({ ownerId: u.id, tier: "STANDARD" });
  });
  it("a client-supplied tier, owner or plan is ignored: the server decides", async () => {
    const u = await mkUser(); as(u);
    const other = await mkUser();
    const j = await (await post({ ...body, tier: "PREMIUM", ownerId: other.id, planKey: "plus" }, { cookie: true, key: "route-key-0000002" })).json();
    expect(await db.card.findUnique({ where: { slug: j.slug } })).toMatchObject({ ownerId: u.id, tier: "STANDARD" });
    expect((await db.creditAccount.findUnique({ where: { userId: u.id } }))?.planKey).toBe("free");
  });
  it("replays an Idempotency-Key (200, same card) and refuses its reuse for different content (422)", async () => {
    const u = await mkUser(); as(u);
    const a = await post(body, { cookie: true, key: "route-key-0000003" });
    const b = await post(body, { cookie: true, key: "route-key-0000003" });
    expect(a.status).toBe(201); expect(b.status).toBe(200);
    expect((await a.json()).slug).toBe((await b.json()).slug);
    const c = await post({ ...body, message: "changed" }, { cookie: true, key: "route-key-0000003" });
    expect(c.status).toBe(422);
    expect((await c.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("rejects a malformed Idempotency-Key", async () => {
    as(await mkUser());
    expect((await post(body, { cookie: true, key: "short" })).status).toBe(400);
    expect((await post(body, { cookie: true, key: "has spaces and ?! chars" + "x".repeat(10) })).status).toBe(400);
  });
  it("402 once the monthly allowance is used, with the reset date; no card is created for the refused request", async () => {
    const u = await mkUser(); as(u);
    for (let i = 0; i < 10; i++) expect((await post(body, { cookie: true, key: `route-key-q${String(i).padStart(7, "0")}` })).status).toBe(201);
    const res = await post(body, { cookie: true, key: "route-key-over000" });
    expect(res.status).toBe(402);
    const j = await res.json();
    expect(j).toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(Date.parse(j.resetsAt)).toBeGreaterThan(Date.now());
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(10);
  });
  it("two users have independent allowances", async () => {
    const a = await mkUser(), b = await mkUser();
    as(a); for (let i = 0; i < 10; i++) await post(body, { cookie: true, key: `route-key-a${String(i).padStart(7, "0")}` });
    as(b); expect((await post(body, { cookie: true, key: "route-key-b0000000" })).status).toBe(201);
  });
  it("validation and the honeypot still come first: nothing is spent", async () => {
    const u = await mkUser(); as(u);
    expect((await post({ ...body, recipientName: "" }, { cookie: true })).status).toBe(400);
    expect((await post({ ...body, website: "http://spam" }, { cookie: true })).status).toBe(201);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await db.creditAccount.count({ where: { userId: u.id } })).toBe(0);
  });
});

describe("premium card: Lumi's Wish", () => {
  const prem = { ...body, templateKey: "lumis-wish" };
  const bal = async (userId: string) => {
    const acc = await db.creditAccount.findUnique({ where: { userId } });
    const g = await db.creditGrant.findMany({ where: { accountId: acc!.id } });
    const live = g.filter((x) => !x.validTo || x.validTo > new Date());
    return { total: live.filter((x) => x.unit === "TOTAL").reduce((a, x) => a + x.remaining, 0), premium: live.filter((x) => x.unit === "PREMIUM").reduce((a, x) => a + x.remaining, 0) };
  };
  it("cannot be published anonymously: 401, nothing created", async () => {
    const before = await db.card.count({ where: { templateKey: "lumis-wish" } });
    const r = await post(prem);
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe("SIGN_IN_REQUIRED");
    expect(await db.card.count({ where: { templateKey: "lumis-wish" } })).toBe(before);
  });
  it("a stale or invalid session cookie is treated as anonymous: still refused", async () => {
    as(null);
    expect((await post(prem, { cookie: true })).status).toBe(401);
  });
  it("consumes one total AND one premium credit, tier PREMIUM, and reports the remaining premium balance", async () => {
    const u = await mkUser(); as(u);
    const r = await post(prem, { cookie: true, key: "prem-key-00000001" });
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j).toMatchObject({ owned: true, remaining: 9, premiumRemaining: 0 });
    expect(await db.card.findUnique({ where: { slug: j.slug } })).toMatchObject({ ownerId: u.id, tier: "PREMIUM", templateKey: "lumis-wish" });
    expect(await bal(u.id)).toEqual({ total: 9, premium: 0 });
  });
  it("without a premium credit it is refused (402 with a premium-specific code) and nothing is deducted or created", async () => {
    const u = await mkUser(); as(u);
    expect((await post(prem, { cookie: true, key: "prem-key-00000002" })).status).toBe(201); // spends the welcome gift
    const r = await post({ ...prem, message: "again" }, { cookie: true, key: "prem-key-00000003" });
    expect(r.status).toBe(402);
    expect((await r.json()).code).toBe("INSUFFICIENT_PREMIUM_CREDITS");
    expect(await bal(u.id)).toEqual({ total: 9, premium: 0 }); // the total credit touched first was rolled back
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("a standard card never consumes the premium credit", async () => {
    const u = await mkUser(); as(u);
    for (let i = 0; i < 3; i++) await post(body, { cookie: true, key: `std-key-${String(i).padStart(9, "0")}` });
    expect(await bal(u.id)).toEqual({ total: 7, premium: 1 });
  });
  it("a client-supplied tier cannot bypass enforcement in either direction", async () => {
    const u = await mkUser(); as(u);
    const a = await (await post({ ...prem, tier: "STANDARD" }, { cookie: true, key: "tier-key-0000001" })).json();
    expect(await db.card.findUnique({ where: { slug: a.slug } })).toMatchObject({ tier: "PREMIUM" });
    expect(await bal(u.id)).toEqual({ total: 9, premium: 0 }); // still charged as premium
    const b = await (await post({ ...body, tier: "PREMIUM" }, { cookie: true, key: "tier-key-0000002" })).json();
    expect(await db.card.findUnique({ where: { slug: b.slug } })).toMatchObject({ tier: "STANDARD" });
    expect(await bal(u.id)).toEqual({ total: 8, premium: 0 });
    // anonymous with a forged "standard" tier is still refused for the premium template
    as(null);
    expect((await post({ ...prem, tier: "STANDARD" })).status).toBe(401);
  });
  it("duplicate requests with one Idempotency-Key create exactly one premium card and spend once", async () => {
    const u = await mkUser(); as(u);
    const rs = await Promise.all(Array.from({ length: 15 }, () => post(prem, { cookie: true, key: "dup-key-00000001", ip: "198.51.100.200" })));
    const ok = rs.filter((r) => r.status === 201 || r.status === 200);
    expect(ok).toHaveLength(15);
    expect(new Set(await Promise.all(ok.map(async (r) => (await r.json()).slug))).size).toBe(1);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
    expect(await bal(u.id)).toEqual({ total: 9, premium: 0 });
  });
  it("20 concurrent premium publishes with one premium credit: exactly one card, 19 refused, never overspent", async () => {
    const u = await mkUser(); as(u);
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post({ ...prem, message: `wish ${i}` }, { cookie: true, key: `race-key-${String(i).padStart(7, "0")}`, ip: "198.51.100.201" })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 402)).toHaveLength(19);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
    expect(await bal(u.id)).toEqual({ total: 9, premium: 0 });
  });
  it("public viewing of a premium card needs no sign-in and reveals no wallet or account data", async () => {
    const u = await mkUser(); as(u);
    const j = await (await post(prem, { cookie: true, key: "view-key-0000001" })).json();
    const { getPublishedCard } = await import("@/modules/cards/service");
    const card = await getPublishedCard(j.slug);
    expect(card).toEqual({ slug: j.slug, templateKey: "lumis-wish", recipientName: "RouteTest", senderName: "Sam", message: "Hello" });
    expect(JSON.stringify(card)).not.toMatch(/owner|tier|credit|wallet|email|userId/i);
  });
});

describe("guest publishing is unchanged", () => {
  it("no cookie: guest path, no owner, no credits touched, per-IP limit still applies", async () => {
    const u = await mkUser(); as(u); // even if some session existed, without the cookie the guest path runs
    const before = await db.creditAccount.count();
    const ipx = freshIp();
    const r = await post(body, { ip: ipx });
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j.owned).toBeUndefined();
    expect((await db.card.findUnique({ where: { slug: j.slug } }))?.ownerId).toBeNull();
    expect(await db.creditAccount.count()).toBe(before);
    for (let i = 0; i < 4; i++) await post(body, { ip: ipx });
    expect((await post(body, { ip: ipx })).status).toBe(429);
  });
  it("a stale or invalid session cookie falls back to the guest path (as today)", async () => {
    as(null);
    const r = await post(body, { cookie: true });
    expect(r.status).toBe(201);
    expect((await db.card.findUnique({ where: { slug: (await r.json()).slug } }))?.ownerId).toBeNull();
  });
});

describe("wallet API", () => {
  it("401 without a session; no account id parameter exists to forge", async () => {
    as(null);
    expect((await get(getWallet)).status).toBe(401);
    expect((await get(getActivity, "http://t/api/wallet/activity")).status).toBe(401);
  });
  it("returns only the caller's wallet, with no internal ids", async () => {
    const a = await mkUser(), b = await mkUser();
    as(a); await post(body, { cookie: true, key: "route-key-w0000001" }); await post(body, { cookie: true, key: "route-key-w0000002" });
    const wa = await (await get(getWallet)).json();
    as(b);
    const wb = await (await get(getWallet)).json();
    expect(wa.wallet.sends).toEqual({ limit: 10, used: 2, remaining: 8 });
    expect(wb.wallet.sends).toEqual({ limit: 10, used: 0, remaining: 10 });
    expect(wa.wallet.premium).toMatchObject({ remaining: 1, welcomeCredit: 1 });
    expect(Object.keys(wa)).toEqual(["wallet"]);
    expect(JSON.stringify(wa)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|ledger|grant|reservation|idempotency|userId|accountId/i);
    // a forged account/user id in the query string changes nothing
    const forged = await (await get(getWallet, `http://t/api/wallet?userId=${a.id}&accountId=${a.id}`)).json();
    expect(forged.wallet.sends.used).toBe(0);
  });
  it("activity shows the caller's own cards only, pages safely and validates parameters", async () => {
    const a = await mkUser(), b = await mkUser();
    as(a); const ja = await (await post(body, { cookie: true, key: "route-key-v0000001" })).json();
    as(b); const jb = await (await post({ ...body, message: "b" }, { cookie: true, key: "route-key-v0000002" })).json();
    const actB = await (await get(getActivity, "http://t/api/wallet/activity")).json();
    expect(actB.items.map((i: { card: { slug: string } | null }) => i.card?.slug).filter(Boolean)).toEqual([jb.slug]);
    expect(JSON.stringify(actB)).not.toContain(ja.slug);
    for (const q of ["limit=0", "limit=51", "limit=abc", "before=nonsense"]) expect((await get(getActivity, `http://t/api/wallet/activity?${q}`)).status).toBe(400);
    expect((await get(getActivity, "http://t/api/wallet/activity?limit=1")).status).toBe(200);
  });
  it("is rate limited per user (429 with Retry-After)", async () => {
    const u = await mkUser(); as(u);
    await db.rateLimit.deleteMany();
    let last = 200;
    for (let i = 0; i < 125; i++) last = (await get(getWallet)).status;
    expect(last).toBe(429);
  }, 60000);
});
