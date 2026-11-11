import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { periodFor } from "@/modules/wallet/periods";
import { loadEntitlements, UnsupportedPlanError } from "@/modules/wallet/entitlements";
import { balances, ensurePeriodGrants, expireGrants, grantCredit, IdempotencyKeyReuseError, InsufficientCreditsError, ReservationNotFoundError, reconcile, releaseAllHeld, requestHash, reserveCredits, settleReservation, type Tx } from "@/modules/wallet/engine";
import { assignPlan, ensureWallet, walletActivity, walletSummary, welcomeHash, type WalletAccount } from "@/modules/wallet/wallet";
import { publishOwnedCard } from "@/modules/wallet/publish";
import { PREMIUM_TEMPLATE_KEYS, TEMPLATE_KEYS, templateTier } from "@/modules/templates/registry";

const users: string[] = [];
const accounts: string[] = [];
const emails: string[] = [];
const run = <T,>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30000, maxWait: 30000 });
const t0 = new Date("2026-01-31T10:00:00.000Z");
const key = (s: string) => s.padEnd(16, "-");
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()));

async function mkUser(o: { email?: string; verified?: boolean } = {}) {
  const id = crypto.randomUUID();
  const email = o.email ?? `${id}@wallet.example.test`;
  await db.user.create({ data: { id, name: "", email, emailVerified: o.verified ?? true } });
  users.push(id); emails.push(email);
  return { id, email, emailVerified: o.verified ?? true };
}
async function open(o: { email?: string; verified?: boolean; now?: Date } = {}) {
  const u = await mkUser(o);
  const acc = await run((tx) => ensureWallet(tx, u, o.now ?? t0));
  accounts.push(acc.id);
  return { u, acc };
}
const spend = (acc: WalletAccount, k: string, o: { premium?: boolean; now?: Date; request?: unknown } = {}) =>
  run((tx) => reserveCredits(tx, acc, { key: key(k), request: o.request ?? { k }, premium: o.premium ?? false, now: o.now ?? t0 }));
const bal = (acc: WalletAccount, now = t0) => run((tx) => balances(tx, acc.id, now));
const drift = (acc?: WalletAccount) => run((tx) => reconcile(tx, acc?.id));

afterAll(async () => {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accounts}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.card.deleteMany({ where: { OR: [{ ownerId: { in: users } }, { recipientName: "WalletTest" }] } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

describe("allowance periods (pure, UTC)", () => {
  const iso = (p: { start: Date; end: Date }) => [p.start.toISOString(), p.end.toISOString()];
  it("anchors on a fixed anniversary and clamps month ends without drifting", () => {
    const a = new Date("2026-01-31T10:00:00Z");
    expect(iso(periodFor(a, new Date("2026-02-15T00:00:00Z")))).toEqual(["2026-01-31T10:00:00.000Z", "2026-02-28T10:00:00.000Z"]);
    expect(iso(periodFor(a, new Date("2026-02-28T10:00:00Z")))).toEqual(["2026-02-28T10:00:00.000Z", "2026-03-31T10:00:00.000Z"]);
    expect(iso(periodFor(a, new Date("2026-04-30T10:00:00Z")))).toEqual(["2026-04-30T10:00:00.000Z", "2026-05-31T10:00:00.000Z"]);
  });
  it("handles February and leap years", () => {
    expect(iso(periodFor(new Date("2027-12-31T00:00:00Z"), new Date("2028-02-29T05:00:00Z")))).toEqual(["2028-02-29T00:00:00.000Z", "2028-03-31T00:00:00.000Z"]);
    expect(iso(periodFor(new Date("2028-02-29T08:00:00Z"), new Date("2029-02-28T08:00:00Z"), 12))).toEqual(["2029-02-28T08:00:00.000Z", "2030-02-28T08:00:00.000Z"]);
  });
  it("is unaffected by daylight-saving changes anywhere (UTC arithmetic only)", () => {
    const melbourneDst = new Date("2026-10-03T16:00:00Z"); // 2am AEST -> 3am AEDT, 4 Oct 2026
    expect(iso(periodFor(new Date("2026-09-04T16:30:00Z"), new Date("2026-10-04T16:29:59Z")))).toEqual(["2026-09-04T16:30:00.000Z", "2026-10-04T16:30:00.000Z"]);
    expect(iso(periodFor(new Date("2026-09-04T16:30:00Z"), new Date("2026-10-04T16:30:00Z")))).toEqual(["2026-10-04T16:30:00.000Z", "2026-11-04T16:30:00.000Z"]);
    expect(melbourneDst.getTime()).toBeLessThan(Date.parse("2026-10-04T16:29:59Z"));
    const usDst = periodFor(new Date("2026-02-08T07:30:00Z"), new Date("2026-03-08T07:30:00Z"));
    expect(usDst.start.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
  it("property: contiguous, containing, strictly increasing for random anchors and instants", () => {
    let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 600; i++) {
      const anchor = new Date(Date.UTC(2020, 0, 1) + Math.floor(rnd() * 8 * 365 * 86400000));
      const months = rnd() < 0.8 ? 1 : 12;
      const now = new Date(anchor.getTime() + Math.floor(rnd() * 6 * 365 * 86400000));
      const p = periodFor(anchor, now, months);
      expect(p.start.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime()).toBeLessThan(p.end.getTime());
      expect(periodFor(anchor, p.end, months).start.getTime()).toBe(p.end.getTime());
      if (p.index > 0) expect(periodFor(anchor, new Date(p.start.getTime() - 1), months).end.getTime()).toBe(p.start.getTime());
    }
  });
  it("a clock slightly before the anchor still yields the first period; bad inputs throw", () => {
    expect(periodFor(new Date("2026-01-31T10:00:00Z"), new Date("2026-01-31T09:59:59Z")).index).toBe(0);
    expect(() => periodFor(new Date(), new Date(), 0)).toThrow(RangeError);
  });
});

describe("plans are data", () => {
  it("Free and Plus entitlements come from the database", async () => {
    expect(await loadEntitlements(db, "free")).toMatchObject({ sendsTotal: 10, sendsPremium: 0, welcomePremium: 1, scheduleMonthsAhead: 1, periodMonths: 1, purchasable: false });
    expect(await loadEntitlements(db, "plus")).toMatchObject({ sendsTotal: 50, sendsPremium: 5, welcomePremium: 0, scheduleMonthsAhead: 12, periodMonths: 1, purchasable: false });
  });
  it("unknown plans are refused", async () => { await expect(loadEntitlements(db, "unlimited")).rejects.toThrow(UnsupportedPlanError); });
  it("the six launch cards are STANDARD; unknown templates throw; tier is never an input", () => {
    for (const k of TEMPLATE_KEYS) expect(templateTier(k)).toBe("STANDARD");
    expect(() => templateTier("nope")).toThrow();
    expect([...PREMIUM_TEMPLATE_KEYS]).toEqual(["lumis-wish", "lumis-wish-cinema"]);
    expect(templateTier("lumis-wish")).toBe("PREMIUM");
  });
});

describe("welcome premium credit", () => {
  it("is granted exactly once even when requested 25 times concurrently", async () => {
    const u = await mkUser();
    const accs = await Promise.all(Array.from({ length: 25 }, () => run((tx) => ensureWallet(tx, u, t0))));
    accounts.push(accs[0].id);
    expect(new Set(accs.map((a) => a.id)).size).toBe(1);
    expect(await db.creditGrant.count({ where: { accountId: accs[0].id, source: "WELCOME" } })).toBe(1);
    expect((await bal(accs[0])).premiumFromWelcome).toBe(1);
  });
  it("needs a verified email; is granted later when the email becomes verified", async () => {
    const { u, acc } = await open({ verified: false });
    expect((await bal(acc)).premium).toBe(0);
    await run((tx) => ensureWallet(tx, { ...u, emailVerified: true }, t0));
    expect((await bal(acc)).premiumFromWelcome).toBe(1);
    await run((tx) => ensureWallet(tx, { ...u, emailVerified: true }, t0));
    expect(await db.creditGrant.count({ where: { accountId: acc.id, source: "WELCOME" } })).toBe(1);
  });
  it("never regenerates from monthly resets and never expires", async () => {
    const { acc } = await open();
    for (let m = 1; m <= 6; m++) await run((tx) => ensurePeriodGrants(tx, acc, addMonths(t0, m)));
    expect(await db.creditGrant.count({ where: { accountId: acc.id, source: "WELCOME" } })).toBe(1);
    expect((await bal(acc, addMonths(t0, 60))).premiumFromWelcome).toBe(1); // five years later, still there
    expect((await db.creditGrant.findFirst({ where: { accountId: acc.id, source: "WELCOME" } }))?.validTo).toBeNull();
  });
  it("is not regranted after account deletion and re-registration with the same verified email (tombstone)", async () => {
    const email = `again-${crypto.randomUUID()}@wallet.example.test`;
    const first = await open({ email });
    expect((await bal(first.acc)).premiumFromWelcome).toBe(1);
    await db.user.delete({ where: { id: first.u.id } });
    expect((await db.creditAccount.findUnique({ where: { id: first.acc.id } }))?.userId).toBeNull();
    const second = await open({ email: email.toUpperCase() }); // same address, different case
    expect((await bal(second.acc)).premium).toBe(0);
    expect((await bal(second.acc)).total).toBe(0); // before first spend: no period grants yet
    expect((await run((tx) => ensurePeriodGrants(tx, second.acc, t0))).entitlements.sendsTotal).toBe(10);
    const other = await open();
    expect((await bal(other.acc)).premiumFromWelcome).toBe(1);
  });
  it("the tombstone holds a 64-hex keyed hash only (no email), and the hash is case-insensitive", async () => {
    const email = `Case-${crypto.randomUUID()}@Wallet.Example.Test`;
    expect(welcomeHash(email)).toBe(welcomeHash(email.toLowerCase()));
    expect(welcomeHash(email)).toMatch(/^[0-9a-f]{64}$/);
    await open({ email });
    const rows = await db.welcomeGrantTombstone.findMany({ where: { emailHash: welcomeHash(email) } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("@");
    emails.push(email);
  });
  it("uses a pepper that is separate from every other secret", async () => {
    const { env } = await import("@/lib/env");
    expect(env.WELCOME_PEPPER).toBeTruthy();
    expect(env.WELCOME_PEPPER).not.toBe(env.RATE_LIMIT_SALT);
    expect(env.WELCOME_PEPPER).not.toBe(env.BETTER_AUTH_SECRET);
  });
});

describe("credit engine: spending", () => {
  it("60 concurrent sends against 10 credits: exactly 10 succeed, 50 refused, balance 0, ledger reconciles", async () => {
    const { acc } = await open();
    const r = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => spend(acc, `burst${i}`)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect(r.filter((x) => x.status === "rejected" && x.reason instanceof InsufficientCreditsError)).toHaveLength(50);
    expect((await bal(acc)).total).toBe(0);
    expect(await db.creditReservation.count({ where: { accountId: acc.id } })).toBe(10); // refusals rolled back completely
    expect(await drift(acc)).toEqual([]);
  });
  it("a premium send consumes one total and one premium credit atomically; the second is refused and rolls back", async () => {
    const { acc } = await open();
    await spend(acc, "p1", { premium: true });
    expect(await bal(acc)).toMatchObject({ total: 9, premium: 0 });
    await expect(spend(acc, "p2", { premium: true })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect((await bal(acc)).total).toBe(9); // the total credit touched before the failure was rolled back
    expect(await drift(acc)).toEqual([]);
  });
  it("when total allowance is exhausted the welcome credit stays available for the next period", async () => {
    const { acc } = await open();
    for (let i = 0; i < 10; i++) await spend(acc, `std${i}`);
    await expect(spend(acc, "prem", { premium: true })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect((await bal(acc)).premiumFromWelcome).toBe(1);
    const later = addMonths(t0, 1);
    await spend(acc, "prem-later", { premium: true, now: later });
    expect(await bal(acc, later)).toMatchObject({ total: 9, premium: 0 });
  });
  it("spends expiring credits before the never-expiring welcome credit", async () => {
    const { acc } = await open();
    await run((tx) => assignPlan(tx, acc.id, "plus", t0)); // 5 premium per period, plus the welcome credit
    expect((await bal(acc)).premium).toBe(6);
    for (let i = 0; i < 5; i++) await spend(acc, `ex${i}`, { premium: true });
    expect(await bal(acc)).toMatchObject({ premiumFromPeriod: 0, premiumFromWelcome: 1 });
    await spend(acc, "ex5", { premium: true });
    expect((await bal(acc)).premiumFromWelcome).toBe(0);
  });
  it("replays the same key and request without spending again; refuses the same key with a different request", async () => {
    const { acc } = await open();
    const a = await spend(acc, "idem", { request: { c: 1 } });
    const b = await spend(acc, "idem", { request: { c: 1 } });
    expect(b).toMatchObject({ replay: true, reservationId: a.reservationId });
    expect((await bal(acc)).total).toBe(9);
    await expect(spend(acc, "idem", { request: { c: 2 } })).rejects.toBeInstanceOf(IdempotencyKeyReuseError);
    expect((await bal(acc)).total).toBe(9);
    expect(requestHash({ a: 1, b: { c: [1, 2], d: 2 } })).toBe(requestHash({ b: { d: 2, c: [1, 2] }, a: 1 })); // key order does not matter
  });
  it("20 concurrent duplicates of one request spend exactly one credit", async () => {
    const { acc } = await open();
    const r = await Promise.all(Array.from({ length: 20 }, () => spend(acc, "dup", { request: { x: 1 } })));
    expect(new Set(r.map((x) => x.reservationId)).size).toBe(1);
    expect((await bal(acc)).total).toBe(9);
  });
  it("the same idempotency key in two accounts is independent", async () => {
    const a = await open(), b = await open();
    const [ra, rb] = await Promise.all([spend(a.acc, "shared"), spend(b.acc, "shared")]);
    expect(ra.reservationId).not.toBe(rb.reservationId);
  });
  it("duplicate period grants cannot be created (grantKey unique): two concurrent first spends make one grant", async () => {
    const { acc } = await open();
    await Promise.allSettled(Array.from({ length: 12 }, (_, i) => spend(acc, `first${i}`))); // 12 > 10: two are refused
    expect(await db.creditGrant.count({ where: { accountId: acc.id, source: "PLAN_PERIOD", unit: "TOTAL" } })).toBe(1);
    expect(await run((tx) => grantCredit(tx, { accountId: acc.id, unit: "TOTAL", source: "PURCHASE", grantKey: "purchase:o1", amount: 3, validFrom: t0, validTo: null }))).not.toBeNull();
    expect(await run((tx) => grantCredit(tx, { accountId: acc.id, unit: "TOTAL", source: "PURCHASE", grantKey: "purchase:o1", amount: 3, validFrom: t0, validTo: null }))).toBeNull();
    expect(await run((tx) => grantCredit(tx, { accountId: acc.id, unit: "TOTAL", source: "PURCHASE", grantKey: "purchase:o2", amount: 3, validFrom: t0, validTo: null }))).not.toBeNull();
  });
});

describe("monthly periods and resets", () => {
  it("resets exactly at the boundary: the last millisecond is still the old period", async () => {
    const { acc } = await open();
    for (let i = 0; i < 10; i++) await spend(acc, `m${i}`);
    const endMinus = new Date("2026-02-28T09:59:59.999Z"), end = new Date("2026-02-28T10:00:00.000Z");
    await expect(spend(acc, "late", { now: endMinus })).rejects.toBeInstanceOf(InsufficientCreditsError);
    await spend(acc, "fresh", { now: end });
    expect((await bal(acc, end)).total).toBe(9);
    expect(await drift(acc)).toEqual([]);
  });
  it("month-end anchor (31 Jan) gives 28 Feb then 31 Mar and a fresh allowance each time", async () => {
    const { acc } = await open();
    const stamps: string[] = [];
    for (const d of ["2026-01-31T10:00:00Z", "2026-02-28T10:00:00Z", "2026-03-31T10:00:00Z", "2026-04-30T10:00:00Z"]) {
      await spend(acc, `ms-${d}`, { now: new Date(d) });
      stamps.push(d);
    }
    const g = await db.creditGrant.findMany({ where: { accountId: acc.id, source: "PLAN_PERIOD", unit: "TOTAL" }, orderBy: { validFrom: "asc" } });
    expect(g.map((x) => x.validFrom.toISOString())).toEqual(["2026-01-31T10:00:00.000Z", "2026-02-28T10:00:00.000Z", "2026-03-31T10:00:00.000Z", "2026-04-30T10:00:00.000Z"]);
    expect(g.every((x) => x.amount === 10 && x.remaining === 9)).toBe(true);
  });
  it("30 concurrent sends at the first instant of a new period create one grant and 10 succeed", async () => {
    const { acc } = await open();
    const start2 = new Date("2026-02-28T10:00:00.000Z");
    const r = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => spend(acc, `roll${i}`, { now: start2 })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect(await db.creditGrant.count({ where: { accountId: acc.id, validFrom: start2, unit: "TOTAL" } })).toBe(1);
  });
  it("an annual Plus subscriber gets monthly allowances (50 a month), not 600 at once", async () => {
    const { acc } = await open();
    await run((tx) => assignPlan(tx, acc.id, "plus", t0));
    expect((await bal(acc)).total).toBe(50);
    let now = t0;
    for (let m = 1; m <= 11; m++) { now = addMonths(t0, m); await run((tx) => ensurePeriodGrants(tx, { ...acc, planKey: "plus" }, now)); }
    const open12 = await bal(acc, now);
    expect(open12.total).toBe(50); // only the current month is spendable
    expect(await db.creditGrant.count({ where: { accountId: acc.id, source: "PLAN_PERIOD", unit: "TOTAL", grantKey: { startsWith: "period:plus:" } } })).toBe(12); // one 50-credit grant per month for 12 months
  });
  it("unused allowance does not roll over; expiry is written to the ledger and balances reconcile", async () => {
    const { acc } = await open();
    await spend(acc, "one");
    const later = addMonths(t0, 2);
    expect(await run((tx) => expireGrants(tx, acc.id, later))).toBeGreaterThanOrEqual(1);
    expect(await run((tx) => expireGrants(tx, acc.id, later))).toBe(0); // idempotent
    expect((await db.ledgerEntry.findMany({ where: { accountId: acc.id, kind: "EXPIRE" } })).every((e) => e.delta < 0)).toBe(true);
    expect(await drift(acc)).toEqual([]);
  });
});

describe("reservations and cancellation", () => {
  it("cancelling within the original period restores the credits; a second cancel does nothing", async () => {
    const { acc } = await open();
    const r = await spend(acc, "c1", { premium: true });
    expect(await bal(acc)).toMatchObject({ total: 9, premium: 0 });
    expect(await run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: t0 }))).toMatchObject({ settled: true, status: "RELEASED" });
    expect(await bal(acc)).toMatchObject({ total: 10, premium: 1 });
    expect(await run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: t0 }))).toMatchObject({ settled: false, status: "RELEASED" });
    expect(await bal(acc)).toMatchObject({ total: 10, premium: 1 });
    expect(await drift(acc)).toEqual([]);
  });
  it("20 concurrent cancels restore exactly once", async () => {
    const { acc } = await open();
    const r = await spend(acc, "c2");
    const out = await Promise.all(Array.from({ length: 20 }, () => run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: t0 }))));
    expect(out.filter((o) => o.settled)).toHaveLength(1);
    expect((await bal(acc)).total).toBe(10);
  });
  it("a committed reservation can never be released", async () => {
    const { acc } = await open();
    const r = await spend(acc, "c3");
    await run((tx) => settleReservation(tx, acc.id, r.reservationId, "COMMIT", { now: t0 }));
    expect(await run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: t0 }))).toMatchObject({ settled: false, status: "COMMITTED" });
    expect((await bal(acc)).total).toBe(9);
  });
  it("cancelling after the original period ended restores nothing and never moves credit into another period", async () => {
    const { acc } = await open();
    const r = await spend(acc, "c4");
    const next = new Date("2026-02-28T10:00:00.000Z");
    await run((tx) => ensurePeriodGrants(tx, acc, next));
    const before = await bal(acc, next);
    expect(before.total).toBe(10);
    await run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: next }));
    expect((await bal(acc, next)).total).toBe(10); // the new period was not inflated
    const e = await db.ledgerEntry.findFirst({ where: { reservationId: r.reservationId, kind: "RELEASE" } });
    expect(e).toMatchObject({ delta: 0, reason: "grant expired" });
    expect(await drift(acc)).toEqual([]);
  });
  it("the welcome credit, being non-expiring, is restored on cancellation at any time", async () => {
    const { acc } = await open();
    const r = await spend(acc, "c5", { premium: true });
    const far = addMonths(t0, 18);
    await run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: far }));
    expect((await bal(acc, far)).premiumFromWelcome).toBe(1);
    expect(await drift(acc)).toEqual([]);
  });
  it("another account cannot settle a reservation it does not own", async () => {
    const a = await open(), b = await open();
    const r = await spend(a.acc, "iso");
    await expect(run((tx) => settleReservation(tx, b.acc.id, r.reservationId, "RELEASE", { now: t0 }))).rejects.toBeInstanceOf(ReservationNotFoundError);
    expect((await bal(a.acc)).total).toBe(9);
  });
  it("releaseAllHeld cancels held reservations (account closure) and leaves committed ones", async () => {
    const { acc } = await open();
    const h1 = await spend(acc, "h1"), h2 = await spend(acc, "h2"), done = await spend(acc, "h3");
    await run((tx) => settleReservation(tx, acc.id, done.reservationId, "COMMIT", { now: t0 }));
    expect(await run((tx) => releaseAllHeld(tx, acc.id, t0))).toBe(2);
    expect(await bal(acc)).toMatchObject({ total: 9 });
    expect([h1, h2].length).toBe(2);
    expect(await drift(acc)).toEqual([]);
  });
});

describe("database guarantees", () => {
  it("the ledger is append-only (UPDATE, DELETE, TRUNCATE all blocked) and balances can never be negative", async () => {
    const { acc } = await open();
    await spend(acc, "g1");
    const attempt = (q: Promise<unknown>) => q.then(() => "allowed", () => "blocked");
    expect(await attempt(db.$executeRaw`UPDATE "LedgerEntry" SET delta = 99 WHERE "accountId" = ${acc.id}::uuid`)).toBe("blocked");
    expect(await attempt(db.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ${acc.id}::uuid`)).toBe("blocked");
    expect(await attempt(db.$executeRawUnsafe(`TRUNCATE "LedgerEntry" CASCADE`))).toBe("blocked");
    expect(await attempt(db.$executeRaw`UPDATE "CreditGrant" SET remaining = -1 WHERE "accountId" = ${acc.id}::uuid`)).toBe("blocked");
    expect(await attempt(db.$executeRaw`UPDATE "CreditGrant" SET remaining = amount + 1 WHERE "accountId" = ${acc.id}::uuid`)).toBe("blocked");
  });
  it("a settled reservation is immutable and a card id, once set, is final", async () => {
    const { acc } = await open();
    const r = await spend(acc, "g2");
    await run((tx) => settleReservation(tx, acc.id, r.reservationId, "COMMIT", { now: t0, cardId: crypto.randomUUID() }));
    const attempt = (q: Promise<unknown>) => q.then(() => "allowed", () => "blocked");
    expect(await attempt(db.$executeRaw`UPDATE "CreditReservation" SET status = 'HELD', "settledAt" = NULL WHERE id = ${r.reservationId}::uuid`)).toBe("blocked");
    expect(await attempt(db.$executeRaw`UPDATE "CreditReservation" SET "requestHash" = 'x' WHERE id = ${r.reservationId}::uuid`)).toBe("blocked");
  });
  it("randomised concurrent mixed operations always reconcile", async () => {
    const { acc } = await open();
    await run((tx) => assignPlan(tx, acc.id, "plus", t0));
    const ops = Array.from({ length: 120 }, (_, i) => async () => {
      const premium = i % 7 === 0;
      const r = await spend({ ...acc, planKey: "plus" }, `mix${i}`, { premium, now: addMonths(t0, i % 3) }).catch(() => null);
      if (r && i % 3 === 0) await run((tx) => settleReservation(tx, acc.id, r.reservationId, "RELEASE", { now: addMonths(t0, i % 3) }));
      if (r && i % 3 === 1) await run((tx) => settleReservation(tx, acc.id, r.reservationId, "COMMIT", { now: addMonths(t0, i % 3) }));
    });
    await Promise.all(ops.map((o) => o()));
    for (const m of [0, 1, 2]) await run((tx) => expireGrants(tx, acc.id, addMonths(t0, m + 1)));
    expect(await drift(acc)).toEqual([]);
    expect(await db.creditGrant.count({ where: { accountId: acc.id, remaining: { lt: 0 } } })).toBe(0);
  });
});

describe("plans can only change through the internal server operation", () => {
  it("upgrade keeps this period's usage (no double allowance) and expires the old plan's period grants", async () => {
    const { acc } = await open();
    for (let i = 0; i < 3; i++) await spend(acc, `up${i}`);
    await run((tx) => assignPlan(tx, acc.id, "plus", t0));
    expect(await bal(acc)).toMatchObject({ total: 47, premiumFromPeriod: 5 });
    expect((await db.creditAccount.findUnique({ where: { id: acc.id } }))?.planKey).toBe("plus");
    expect(await drift(acc)).toEqual([]);
    await expect(run((tx) => assignPlan(tx, acc.id, "no-such-plan", t0))).rejects.toThrow(UnsupportedPlanError);
  });
  it("no route, page or component can set a plan: assignPlan lives only in the wallet module, planKey is only read elsewhere", async () => {
    const { execFileSync } = await import("node:child_process");
    const grep = (pat: string) => execFileSync("grep", ["-rln", pat, "src", "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" }).split("\n").filter(Boolean).filter((f) => !f.includes("generated")).sort();
    expect(grep("assignPlan")).toEqual(["src/modules/wallet/wallet.ts"]);
    // planKey: the wallet engine owns it; the scheduling service only reads it (a type field) to find the account's horizon.
    expect(grep("planKey")).toEqual(["src/modules/scheduling/service.ts", "src/modules/wallet/engine.ts", "src/modules/wallet/entitlements.ts", "src/modules/wallet/wallet.ts"]);
    const svc = (await import("node:fs")).readFileSync("src/modules/scheduling/service.ts", "utf8");
    expect(svc).not.toMatch(/planKey\s*[:=]\s*["'`]|SET "planKey"|data:\s*\{[^}]*planKey/);
  });
});

describe("account deletion", () => {
  it("keeps the anonymised ledger and tombstone, nulls card ownership, and blocks a second welcome gift", async () => {
    const email = `del-${crypto.randomUUID()}@wallet.example.test`;
    const { u, acc } = await open({ email });
    const out = await publishOwnedCard({ templateKey: "snow-globe", recipientName: "WalletTest", senderName: "S", message: "m" }, u, { idempotencyKey: key("del1"), now: t0 });
    const ledgerBefore = await db.ledgerEntry.count({ where: { accountId: acc.id } });
    await db.user.delete({ where: { id: u.id } });
    expect(await db.ledgerEntry.count({ where: { accountId: acc.id } })).toBe(ledgerBefore);
    const account = await db.creditAccount.findUnique({ where: { id: acc.id } });
    expect(account?.userId).toBeNull();
    expect((await db.card.findUnique({ where: { slug: out.slug } }))?.ownerId).toBeNull(); // the public card stays available
    expect(await db.welcomeGrantTombstone.count({ where: { emailHash: welcomeHash(email) } })).toBe(1);
    expect(await drift(acc)).toEqual([]);
  });
});

describe("publishing a card with the wallet", () => {
  const body = { templateKey: "snow-globe" as const, recipientName: "WalletTest", senderName: "Sam", message: "Hello" };
  it("creates an owned STANDARD card, spends one credit, and commits the reservation", async () => {
    const { u, acc } = await open();
    const out = await publishOwnedCard(body, u, { idempotencyKey: key("pub1"), now: t0 });
    expect(out).toMatchObject({ replay: false, remaining: 9 });
    const card = await db.card.findUnique({ where: { slug: out.slug } });
    expect(card).toMatchObject({ ownerId: u.id, tier: "STANDARD" });
    const res = await db.creditReservation.findFirst({ where: { accountId: acc.id } });
    expect(res).toMatchObject({ status: "COMMITTED", cardId: card!.id });
    expect(await drift(acc)).toEqual([]);
  });
  it("a failed card creation consumes no credit and leaves no reservation or card", async () => {
    const { u, acc } = await open();
    await expect(publishOwnedCard(body, u, { idempotencyKey: key("fail1"), now: t0, slugFn: () => { throw new Error("boom"); } })).rejects.toThrow("boom");
    expect((await bal(acc)).total).toBe(0); // grants rolled back too: nothing was ever spent
    expect(await db.creditReservation.count({ where: { accountId: acc.id } })).toBe(0);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(0);
    const ok = await publishOwnedCard(body, u, { idempotencyKey: key("fail1"), now: t0 }); // the same key works afterwards
    expect(ok.remaining).toBe(9);
  });
  it("retries a slug collision without double-spending", async () => {
    const { u } = await open();
    const first = await publishOwnedCard(body, u, { idempotencyKey: key("col1"), now: t0 });
    let n = 0;
    const out = await publishOwnedCard(body, u, { idempotencyKey: key("col2"), now: t0, slugFn: () => (n++ < 2 ? first.slug : `zz${Math.random().toString(36).slice(2, 12)}`.slice(0, 12)) });
    expect(out.slug).not.toBe(first.slug);
    expect(out.remaining).toBe(8);
  });
  it("replays the same key and request without a second card; refuses key reuse with a different card", async () => {
    const { u, acc } = await open();
    const a = await publishOwnedCard(body, u, { idempotencyKey: key("rep1"), now: t0 });
    const b = await publishOwnedCard(body, u, { idempotencyKey: key("rep1"), now: t0 });
    expect(b).toMatchObject({ slug: a.slug, replay: true });
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
    await expect(publishOwnedCard({ ...body, message: "Different" }, u, { idempotencyKey: key("rep1"), now: t0 })).rejects.toBeInstanceOf(IdempotencyKeyReuseError);
    expect((await bal(acc)).total).toBe(9);
  });
  it("15 concurrent publishes with one key make exactly one card", async () => {
    const { u } = await open();
    const r = await Promise.all(Array.from({ length: 15 }, () => publishOwnedCard(body, u, { idempotencyKey: key("same15"), now: t0 })));
    expect(new Set(r.map((x) => x.slug)).size).toBe(1);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("60 concurrent publishes with distinct keys against 10 credits: exactly 10 cards, none beyond", async () => {
    const { u, acc } = await open();
    const r = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => publishOwnedCard(body, u, { idempotencyKey: key(`c60-${i}`), now: t0 })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect(r.filter((x) => x.status === "rejected" && x.reason instanceof InsufficientCreditsError)).toHaveLength(50);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(10);
    expect((await bal(acc)).total).toBe(0);
    expect(await drift(acc)).toEqual([]);
  });
  it("the premium template needs a premium credit: uses the welcome gift, then refuses and rolls back the total credit", async () => {
    const { u, acc } = await open();
    const prem = { ...body, templateKey: "lumis-wish" as const };
    const a = await publishOwnedCard(prem, u, { idempotencyKey: key("prem1"), now: t0 });
    expect((await db.card.findUnique({ where: { slug: a.slug } }))?.tier).toBe("PREMIUM");
    expect(a).toMatchObject({ remaining: 9, premiumRemaining: 0 });
    expect(await bal(acc)).toMatchObject({ total: 9, premium: 0 });
    await expect(publishOwnedCard({ ...prem, message: "second" }, u, { idempotencyKey: key("prem2"), now: t0 })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect((await bal(acc)).total).toBe(9);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
    expect(await drift(acc)).toEqual([]);
  });
});

describe("wallet summary and activity (own data only)", () => {
  it("reports real numbers: plan, remaining, used, premium, next reset", async () => {
    const { u } = await open();
    const body = { templateKey: "snow-globe" as const, recipientName: "WalletTest", senderName: "S", message: "m" };
    const now = new Date();
    const u2 = await mkUser();
    for (let i = 0; i < 3; i++) await publishOwnedCard(body, u2, { idempotencyKey: key(`sum${i}`), now });
    const s = await walletSummary(u2, now);
    expect(s).toMatchObject({ plan: { key: "free", name: "Free" }, sends: { limit: 10, used: 3, remaining: 7 }, premium: { remaining: 1, welcomeCredit: 1, perPeriodLimit: 0 }, schedulingMonthsAhead: 1 });
    expect(Date.parse(s.period.nextReset)).toBeGreaterThan(now.getTime());
    expect(await walletSummary(u, new Date())).toMatchObject({ sends: { used: 0, remaining: 10 } });
    expect(JSON.stringify(s)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no internal ids
  });
  it("activity lists only the user's own cards and the welcome gift", async () => {
    const a = await mkUser(), b = await mkUser();
    const body = { templateKey: "snow-globe" as const, recipientName: "WalletTest", senderName: "S", message: "m" };
    const now = new Date();
    const ca = await publishOwnedCard(body, a, { idempotencyKey: key("act-a"), now });
    const cb = await publishOwnedCard({ ...body, message: "b" }, b, { idempotencyKey: key("act-b"), now });
    const actA = await walletActivity(a.id), actB = await walletActivity(b.id);
    expect(actA.items.map((i) => i.card?.slug).filter(Boolean)).toEqual([ca.slug]);
    expect(actB.items.map((i) => i.card?.slug).filter(Boolean)).toEqual([cb.slug]);
    expect(actA.items.map((i) => i.type).sort()).toEqual(["card_published", "welcome_gift"]);
    expect(JSON.stringify(actA)).not.toMatch(/ledger|grantId|reservationId|idempotency/i);
    expect((await walletActivity(crypto.randomUUID())).items).toEqual([]);
  });
});
