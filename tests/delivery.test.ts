import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getPublishedCard } from "@/modules/cards/service";
import { balances, reconcile, reserveCredits, type Tx } from "@/modules/wallet/engine";
import { ensureWallet, welcomeHash } from "@/modules/wallet/wallet";
import { cancelSchedule, createSchedule, listSchedules, rescheduleSchedule } from "@/modules/scheduling/service";
import { DEFAULT_POLICY, retryDelayMs, loadPolicy, type DeliveryPolicy } from "@/modules/delivery/config";
import { claimDue, processClaim, recoverExpired, releaseClaim, runOnce, type Ctx } from "@/modules/delivery/queue";
import { findAnomalies } from "@/modules/delivery/reconcile";
import { SimulatedCrash, classify } from "@/modules/delivery/errors";
import { settleReservation } from "@/modules/wallet/engine";

const users: string[] = [];
const emails: string[] = [];
const run = <T,>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30000, maxWait: 30000 });
const key = (s: string) => s.padEnd(16, "-");
const T0 = new Date("2026-11-11T00:00:00.000Z"); // when schedules are created
const DUE = new Date("2026-11-15T09:00:00.000Z"); // 2026-11-15 09:00 UTC
const AFTER = new Date("2026-11-15T09:00:30.000Z"); // the worker's clock once they are due
const policy = (over: Partial<DeliveryPolicy> = {}): DeliveryPolicy => ({ ...DEFAULT_POLICY, batchSize: 100, concurrency: 8, leaseMs: 60_000, maxAttempts: 3, backoffBaseMs: 1_000, backoffCapMs: 10_000, jitter: 0, ...over });
const ctx = (over: Partial<Ctx> & { at?: Date; pol?: Partial<DeliveryPolicy> } = {}): Ctx => ({ policy: policy(over.pol), clock: over.clock ?? (() => over.at ?? AFTER), hooks: over.hooks });

async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@dlv.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
type User = Awaited<ReturnType<typeof mkUser>>;
const card = { recipientName: "DeliveryTest", senderName: "Sam", saveRecipient: false, channel: "LINK" as const };
let seq = 0;
async function schedule(u: User, o: { templateKey?: "snow-globe" | "lumis-wish"; date?: string } = {}) {
  const r = await createSchedule({ ...card, templateKey: o.templateKey ?? "snow-globe", message: `msg ${++seq}`, schedule: { localDate: o.date ?? "2026-11-15", localTime: "09:00", timeZone: "UTC" } } as never, u, { idempotencyKey: key(`d${seq}-${Math.random().toString(36).slice(2, 8)}`), now: T0 });
  return r.schedule.id;
}
const row = (id: string) => db.scheduledDelivery.findUniqueOrThrow({ where: { id }, include: { card: true, attempts: { orderBy: { attemptNo: "asc" } }, reservation: true } });
const balOf = async (u: User, now = AFTER) => { const a = await db.creditAccount.findUniqueOrThrow({ where: { userId: u.id } }); const b = await run((tx) => balances(tx, a.id, now)); return { total: b.total, premium: b.premium }; };
const clean = async () => { const f = await findAnomalies(AFTER); return f.anomalies; };
const fails = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

// The queue is global: every test starts and ends with an empty one so jobs left by earlier tests (some deliberately corrupt) cannot be claimed or reported by later ones.
beforeAll(async () => { await db.scheduledDelivery.deleteMany(); });
afterEach(async () => { await db.scheduledDelivery.deleteMany(); });

afterAll(async () => {
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
  await db.card.deleteMany({ where: { recipientName: "DeliveryTest", ownerId: null } });
  await db.$disconnect();
});

describe("policy", () => {
  it("backs off exponentially, bounded by the base and the cap, with bounded jitter", () => {
    const p = policy({ backoffBaseMs: 1000, backoffFactor: 2, backoffCapMs: 8000, jitter: 0 });
    expect([1, 2, 3, 4, 5, 9].map((n) => retryDelayMs(n, p))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    const j = policy({ backoffBaseMs: 1000, backoffFactor: 2, backoffCapMs: 8000, jitter: 0.5 });
    for (const r of [0, 0.25, 0.5, 0.99, 1]) for (const n of [1, 3, 6]) { const d = retryDelayMs(n, j, () => r); expect(d).toBeGreaterThanOrEqual(1000); expect(d).toBeLessThanOrEqual(8000); }
    expect(retryDelayMs(3, j, () => 0)).toBeLessThan(retryDelayMs(3, j, () => 1));
  });
  it("clamps unsafe or garbage settings", () => {
    expect(loadPolicy({ DELIVERY_LEASE_MS: "5", DELIVERY_MAX_ATTEMPTS: "9999", DELIVERY_CONCURRENCY: "-3", DELIVERY_JITTER: "7", DELIVERY_BATCH_SIZE: "abc" })).toMatchObject({ leaseMs: 1000, maxAttempts: 20, concurrency: 1, jitter: 1, batchSize: DEFAULT_POLICY.batchSize });
    expect(loadPolicy({})).toEqual(DEFAULT_POLICY);
  });
  it("classifies errors", () => {
    expect(classify(Object.assign(new Error("x"), { code: "P1001" }))).toEqual({ category: "DB_TRANSIENT", retryable: true });
    expect(classify(new Error("terminating connection due to administrator command"))).toMatchObject({ category: "DB_TRANSIENT" });
    expect(classify(Object.assign(new Error("deadlock detected"), { code: "40P01" }))).toMatchObject({ category: "DB_TRANSIENT" });
    expect(classify(new Error("something odd"))).toEqual({ category: "UNKNOWN", retryable: true });
  });
});

describe("publishing one schedule", () => {
  it("publishes atomically: card live, reservation committed, delivery PUBLISHED, attempt recorded; credits spent once", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const before = await row(id);
    expect(await getPublishedCard(before.card.slug)).toBeNull(); // private until published
    expect((await listSchedules(u.id))[0].link).toBeNull();
    const s = await runOnce({ ...ctx(), workerId: "w-test-1" });
    expect(s).toMatchObject({ claimed: 1, published: 1, errors: 0 });
    const after = await row(id);
    expect(after).toMatchObject({ status: "PUBLISHED", leaseToken: null, leaseOwner: null, leaseExpiresAt: null, attemptCount: 1, version: 1 });
    expect(after.publishedAt?.toISOString()).toBe(AFTER.toISOString());
    expect(after.card.status).toBe("PUBLISHED");
    expect(after.reservation).toMatchObject({ status: "COMMITTED", cardId: after.cardId });
    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0]).toMatchObject({ attemptNo: 1, status: "SUCCEEDED", workerId: "w-test-1", retryable: false });
    expect(after.attempts[0].leaseToken).toBeTruthy();
    expect(after.attempts[0].finishedAt).not.toBeNull();
    expect(await getPublishedCard(after.card.slug)).toMatchObject({ slug: after.card.slug });
    const dto = (await listSchedules(u.id))[0];
    expect(dto).toMatchObject({ status: "PUBLISHED", creditsReserved: 0 });
    expect(dto.link).toMatch(new RegExp(`/c/${after.card.slug}$`));
    expect(await balOf(u)).toEqual({ total: 9, premium: 1 });
    expect(await clean()).toEqual([]);
    const audit = await db.auditLog.findFirst({ where: { action: "delivery.published", meta: { path: ["deliveryId"], equals: id } } });
    expect(audit).toMatchObject({ actorId: null });
  });
  it("a premium scheduled card commits both credits exactly once", async () => {
    const u = await mkUser();
    const id = await schedule(u, { templateKey: "lumis-wish" });
    expect(await balOf(u)).toEqual({ total: 9, premium: 0 });
    await runOnce({ ...ctx(), workerId: "w" });
    const r = await row(id);
    expect(r).toMatchObject({ status: "PUBLISHED", card: { status: "PUBLISHED", tier: "PREMIUM" } });
    const commits = await db.ledgerEntry.findMany({ where: { reservationId: r.reservationId, kind: "COMMIT" } });
    expect(commits).toHaveLength(2);
    expect(commits.every((c) => c.delta === 0)).toBe(true);
    expect(await balOf(u)).toEqual({ total: 9, premium: 0 });
    expect(await clean()).toEqual([]);
  });
  it("ignores future schedules, cancelled schedules and EMAIL-channel schedules (LINK is never converted)", async () => {
    const u = await mkUser();
    const future = await schedule(u, { date: "2026-12-01" });
    const cancelled = await schedule(u);
    await cancelSchedule(u, cancelled, T0);
    // an EMAIL-channel row (built directly: the service refuses to create one)
    const emailId = await run(async (tx) => {
      const a = await ensureWallet(tx, u, T0);
      const r = await reserveCredits(tx, a, { key: key("email-ch"), request: { e: 1 }, premium: false, now: T0 });
      const c = await tx.card.create({ data: { slug: `em${Math.random().toString(36).slice(2, 12)}`.slice(0, 12), templateKey: "snow-globe", recipientName: "DeliveryTest", senderName: "S", message: "m", ownerId: u.id, status: "SCHEDULED" } });
      await tx.$executeRaw`UPDATE "CreditReservation" SET "cardId" = ${c.id}::uuid WHERE id = ${r.reservationId}::uuid`;
      return (await tx.scheduledDelivery.create({ data: { ownerId: u.id, cardId: c.id, channel: "EMAIL", deliverAtUtc: DUE, timeZone: "UTC", localDate: "2026-11-15", localTime: "09:00", utcOffsetMinutes: 0, reservationId: r.reservationId, idempotencyKey: key("email-ch"), requestHash: "x", nextAttemptAt: DUE } })).id;
    });
    const s = await runOnce({ ...ctx(), workerId: "w" });
    expect(s.claimed).toBe(0);
    expect((await row(future)).status).toBe("SCHEDULED");
    expect((await row(cancelled)).status).toBe("CANCELLED");
    expect((await row(emailId)).status).toBe("SCHEDULED");
    expect((await row(emailId)).card.status).toBe("SCHEDULED");
    expect((await row(cancelled)).card.status).toBe("CANCELLED");
  });
  it("claims the earliest due schedules first and respects the batch size", async () => {
    const u = await mkUser();
    const late = await schedule(u, { date: "2026-11-15" });
    const early = await schedule(u, { date: "2026-11-14" });
    const mid = await schedule(u, { date: "2026-11-14" });
    const claims = await claimDue("w-order", AFTER, { limit: 2, leaseMs: 60_000 });
    expect(claims).toHaveLength(2);
    expect(new Set(claims.map((c) => c.deliveryId))).toEqual(new Set([early, mid]));
    expect((await row(late)).status).toBe("SCHEDULED");
    for (const c of claims) await releaseClaim(c, AFTER);
  });
  it("running again publishes nothing twice: no double settlement, replaying a finished claim is fenced", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const [claim] = (await claimDue("w1", AFTER, { limit: 100, leaseMs: 60_000 })).filter((x) => x.deliveryId === id);
    expect(claim).toBeTruthy();
    expect(await processClaim(claim, ctx())).toBe("PUBLISHED");
    expect(await processClaim(claim, ctx())).toBe("STALE");
    expect((await runOnce({ ...ctx(), workerId: "w2" })).claimed).toBe(0);
    const r = await row(id);
    expect(await db.ledgerEntry.count({ where: { reservationId: r.reservationId, kind: "COMMIT" } })).toBe(1);
    expect(await db.ledgerEntry.count({ where: { reservationId: r.reservationId, kind: "RESERVE" } })).toBe(1);
    expect(r.attempts).toHaveLength(1);
    expect((await balOf(u)).total).toBe(9);
  });
});

describe("workers racing for the same queue", () => {
  it("two workers on 20 due jobs publish each exactly once (SKIP LOCKED: no job is claimed twice)", async () => {
    const u1 = await mkUser(), u2 = await mkUser();
    const ids = [...(await Promise.all(Array.from({ length: 10 }, () => schedule(u1)))), ...(await Promise.all(Array.from({ length: 10 }, () => schedule(u2))))];
    const pol = { batchSize: 5, concurrency: 3 };
    let claimed = 0, published = 0;
    for (let round = 0; round < 6; round++) {
      const rs = await Promise.all([runOnce({ ...ctx({ pol }), workerId: "wa" }), runOnce({ ...ctx({ pol }), workerId: "wb" })]);
      for (const r of rs) { claimed += r.claimed; published += r.published; expect(r.errors).toBe(0); expect(r.stale).toBe(0); }
    }
    expect(claimed).toBe(20); expect(published).toBe(20);
    for (const id of ids) { const r = await row(id); expect(r.status).toBe("PUBLISHED"); expect(r.attempts).toHaveLength(1); }
    expect(await clean()).toEqual([]);
    expect((await balOf(u1)).total).toBe(0); expect((await balOf(u2)).total).toBe(0);
  });
  it("4 worker instances drain 60 due jobs: every job published exactly once, ledger reconciles, no negative balances", async () => {
    const us = await Promise.all(Array.from({ length: 6 }, () => mkUser()));
    const ids: string[] = [];
    for (const u of us) ids.push(...(await Promise.all(Array.from({ length: 10 }, () => schedule(u)))));
    const t0 = performance.now();
    const totals = { claimed: 0, published: 0 };
    const worker = async (name: string) => { for (let i = 0; i < 12; i++) { const s = await runOnce({ ...ctx({ pol: { batchSize: 7, concurrency: 4 } }), workerId: name }); totals.claimed += s.claimed; totals.published += s.published; expect(s.errors + s.stale).toBe(0); if (!s.claimed) break; } };
    await Promise.all(["w1", "w2", "w3", "w4"].map(worker));
    const ms = performance.now() - t0;
    console.info(`[perf] 60 jobs, 4 instances: ${ms.toFixed(0)} ms (${(60 / (ms / 1000)).toFixed(0)} jobs/s, local only)`);
    expect(totals).toEqual({ claimed: 60, published: 60 });
    expect(await db.scheduledDelivery.count({ where: { id: { in: ids }, status: "PUBLISHED" } })).toBe(60);
    expect(await db.deliveryAttempt.count({ where: { deliveryId: { in: ids }, status: "SUCCEEDED" } })).toBe(60);
    expect(await db.creditReservation.count({ where: { scheduledDelivery: { id: { in: ids } }, status: "COMMITTED" } })).toBe(60);
    expect(Number((await db.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "CreditGrant" WHERE remaining < 0`)[0].c)).toBe(0);
    expect(await clean()).toEqual([]);
  }, 120_000);
});

describe("crashes, leases and fencing", () => {
  it("crash BEFORE commit: nothing changed, the lease expires, recovery reconciles and a later cycle publishes exactly once", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const crash = ctx({ hooks: { beforeCommit: () => { throw new SimulatedCrash("before-commit"); } } });
    expect(await fails(runOnce({ ...crash, workerId: "dead-worker" }))).toBeInstanceOf(SimulatedCrash);
    const mid = await row(id);
    expect(mid).toMatchObject({ status: "PROCESSING", leaseOwner: "dead-worker", attemptCount: 1 });
    expect(mid.card.status).toBe("SCHEDULED"); // private: the transaction rolled back as a whole
    expect(mid.reservation.status).toBe("HELD");
    expect(await getPublishedCard(mid.card.slug)).toBeNull();
    expect((await balOf(u)).total).toBe(9);
    const report = await findAnomalies(AFTER);
    expect(report.anomalies).toEqual([]);
    expect(report.expiredLeases).toEqual([]); // still within the lease
    const later = new Date(AFTER.getTime() + 61_000);
    expect((await findAnomalies(later)).expiredLeases).toEqual([id]); // expired and awaiting recovery
    expect(await recoverExpired(ctx({ at: AFTER }))).toEqual({ recovered: 0, published: 0, failed: 0 }); // not before expiry
    expect(await recoverExpired(ctx({ at: later }))).toEqual({ recovered: 1, published: 0, failed: 0 });
    const rec = await row(id);
    expect(rec).toMatchObject({ status: "SCHEDULED", leaseToken: null, lastErrorCategory: "LEASE_EXPIRED" });
    expect(rec.attempts[0]).toMatchObject({ attemptNo: 1, status: "ABANDONED", errorCategory: "LEASE_EXPIRED", retryable: true });
    expect(rec.nextAttemptAt.getTime()).toBeGreaterThan(later.getTime()); // backoff
    const retryClock = new Date(rec.nextAttemptAt.getTime() + 1);
    const s = await runOnce({ ...ctx({ at: retryClock }), workerId: "healthy" });
    expect(s).toMatchObject({ claimed: 1, published: 1 });
    const done = await row(id);
    expect(done.attempts.map((a) => [a.attemptNo, a.status])).toEqual([[1, "ABANDONED"], [2, "SUCCEEDED"]]);
    expect(await db.ledgerEntry.count({ where: { reservationId: done.reservationId, kind: "COMMIT" } })).toBe(1);
    expect((await balOf(u, retryClock)).total).toBe(9);
    expect((await findAnomalies(retryClock)).anomalies).toEqual([]);
  });
  it("crash AFTER commit: the publication stands, nothing is lost or repeated", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const crash = ctx({ hooks: { afterCommit: () => { throw new SimulatedCrash("after-commit"); } } });
    expect(await fails(runOnce({ ...crash, workerId: "dies-after-commit" }))).toBeInstanceOf(SimulatedCrash);
    const r = await row(id);
    expect(r).toMatchObject({ status: "PUBLISHED", card: { status: "PUBLISHED" }, reservation: { status: "COMMITTED" } });
    expect((await runOnce({ ...ctx({ at: new Date(AFTER.getTime() + 600_000) }), workerId: "restarted" })).claimed).toBe(0);
    expect(await db.ledgerEntry.count({ where: { reservationId: r.reservationId, kind: "COMMIT" } })).toBe(1);
    expect((await findAnomalies(AFTER)).anomalies).toEqual([]);
  });
  it("stale worker fencing: a worker whose lease was recovered cannot overwrite the newer worker's result", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const [a] = (await claimDue("worker-A", AFTER, { limit: 100, leaseMs: 60_000 })).filter((c) => c.deliveryId === id);
    const later = new Date(AFTER.getTime() + 61_000);
    await recoverExpired(ctx({ at: later }));
    const retryClock = new Date(later.getTime() + 11_000);
    const [b] = (await claimDue("worker-B", retryClock, { limit: 100, leaseMs: 60_000 })).filter((c) => c.deliveryId === id);
    expect(b.attemptNo).toBe(2);
    expect(b.leaseToken).not.toBe(a.leaseToken);
    // A wakes up late and tries everything: publish, failure handling, releasing: all fenced, nothing is written.
    const snapshot = await row(id);
    expect(await processClaim(a, ctx({ at: retryClock }))).toBe("STALE");
    expect(await processClaim(a, ctx({ at: retryClock, hooks: { beforeCommit: () => { throw new Error("late failure"); } } }))).toBe("STALE");
    expect(await releaseClaim(a, retryClock)).toBe(false);
    const still = await row(id);
    expect(still).toMatchObject({ status: "PROCESSING", leaseToken: b.leaseToken, leaseOwner: "worker-B", attemptCount: 2 });
    expect(still.card.status).toBe(snapshot.card.status);
    // B finishes normally.
    expect(await processClaim(b, ctx({ at: retryClock }))).toBe("PUBLISHED");
    // A, even now, still cannot touch the finished delivery.
    expect(await processClaim(a, ctx({ at: retryClock }))).toBe("STALE");
    const done = await row(id);
    expect(done.status).toBe("PUBLISHED");
    expect(done.attempts.map((x) => [x.attemptNo, x.status, x.workerId])).toEqual([[1, "ABANDONED", "worker-A"], [2, "SUCCEEDED", "worker-B"]]);
    expect(await db.ledgerEntry.count({ where: { reservationId: done.reservationId, kind: "COMMIT" } })).toBe(1);
  });
  it("graceful shutdown: unstarted claims are handed back without wasting an attempt", async () => {
    const u = await mkUser();
    const ids = await Promise.all(Array.from({ length: 5 }, () => schedule(u).catch(() => null)));
    const live = ids.filter((x): x is string => !!x);
    const ac = new AbortController();
    const s = await runOnce({ ...ctx({ pol: { batchSize: 10, concurrency: 1 }, hooks: { afterCommit: () => ac.abort() } }), workerId: "stopping", signal: ac.signal });
    expect(s.published).toBe(1);
    expect(s.released).toBe(live.length - 1);
    const rows = await Promise.all(live.map(row));
    expect(rows.filter((r) => r.status === "SCHEDULED")).toHaveLength(live.length - 1);
    expect(rows.every((r) => r.attemptCount <= 1 && r.leaseToken === null)).toBe(true);
    expect(rows.filter((r) => r.status === "SCHEDULED").every((r) => r.attempts.length === 0 && r.attemptCount === 0)).toBe(true);
    expect((await runOnce({ ...ctx(), workerId: "restarted" })).published).toBe(live.length - 1);
    expect(await clean()).toEqual([]);
  });
});

describe("failures, retries and the dead-letter state", () => {
  it("a REAL lost database connection at commit time is retried; the card stays private until a later attempt succeeds", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const killer: Ctx["hooks"] = { beforeCommit: async (tx) => { const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; await db.$queryRaw`SELECT pg_terminate_backend(${pid})`; await new Promise((r) => setTimeout(r, 150)); } };
    const s = await runOnce({ ...ctx({ hooks: killer }), workerId: "w-kill" });
    expect(s).toMatchObject({ claimed: 1, published: 0, retried: 1 });
    const r = await row(id);
    expect(r).toMatchObject({ status: "SCHEDULED", lastErrorCategory: expect.stringMatching(/DB_TRANSIENT|UNKNOWN/) });
    expect(r.card.status).toBe("SCHEDULED");
    expect(r.reservation.status).toBe("HELD");
    expect(r.attempts[0]).toMatchObject({ status: "FAILED", retryable: true });
    expect(r.attempts[0].retryAt).not.toBeNull();
    expect(await getPublishedCard(r.card.slug)).toBeNull();
    expect((await balOf(u)).total).toBe(9);
    const ok = await runOnce({ ...ctx({ at: new Date(r.nextAttemptAt.getTime() + 1) }), workerId: "w-ok" });
    expect(ok.published).toBe(1);
    expect(await db.ledgerEntry.count({ where: { reservationId: r.reservationId, kind: "COMMIT" } })).toBe(1);
    expect(await clean()).toEqual([]);
  });
  it("retry exhaustion dead-letters the job (FAILED), certainly unpublished: the credit is released, the card stays private", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const boom = { beforeCommit: () => { throw Object.assign(new Error("db down"), { code: "P1001" }); } };
    let at = AFTER;
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await runOnce({ ...ctx({ at, hooks: boom }), workerId: "w-fail" });
      outcomes.push(s.retried ? "retry" : s.failedReleased ? "failed" : s.claimed ? "other" : "idle");
      at = new Date((await row(id)).nextAttemptAt.getTime() + 1);
    }
    expect(outcomes).toEqual(["retry", "retry", "failed", "idle"]);
    const r = await row(id);
    expect(r).toMatchObject({ status: "FAILED", lastErrorCategory: "DB_TRANSIENT", attemptCount: 3, leaseToken: null, card: { status: "CANCELLED" }, reservation: { status: "RELEASED" } });
    expect(r.failedAt).not.toBeNull();
    expect(r.attempts.map((a) => [a.attemptNo, a.status, a.retryable])).toEqual([[1, "FAILED", true], [2, "FAILED", true], [3, "FAILED", false]]);
    expect(await getPublishedCard(r.card.slug)).toBeNull();
    expect((await balOf(u)).total).toBe(10); // released inside the original allowance period
    expect(await db.auditLog.count({ where: { action: "delivery.failed", meta: { path: ["deliveryId"], equals: id } } })).toBe(1);
    expect((await listSchedules(u.id)).find((s) => s.id === id)).toMatchObject({ status: "FAILED", link: null });
    expect(await clean()).toEqual([]);
    // dead-lettered jobs are never picked up again
    expect((await runOnce({ ...ctx({ at: new Date(at.getTime() + 3_600_000) }), workerId: "later" })).claimed).toBe(0);
  });
  it("permanent invalid state fails WITHOUT releasing credits: corrupt ownership, card not scheduled, reservation not held", async () => {
    const a = await mkUser(), b = await mkUser();
    // 1) corrupt ownership: the card belongs to someone else
    const corrupt = await schedule(a);
    await db.card.update({ where: { id: (await row(corrupt)).cardId }, data: { ownerId: b.id } });
    // 2) the card is no longer SCHEDULED (cancelled behind the schedule's back)
    const cancelledCard = await schedule(a);
    await db.card.update({ where: { id: (await row(cancelledCard)).cardId }, data: { status: "CANCELLED" } });
    // 3) the reservation was released behind the schedule's back
    const released = await schedule(a);
    const rr = await row(released);
    await run((tx) => settleReservation(tx, rr.reservation.accountId, rr.reservationId, "RELEASE", { now: T0 }));
    const s = await runOnce({ ...ctx({ pol: { maxAttempts: 3 } }), workerId: "w" });
    expect(s).toMatchObject({ claimed: 3, published: 0, failedReview: 3, failedReleased: 0, retried: 0 });
    for (const id of [corrupt, cancelledCard, released]) {
      const r = await row(id);
      expect(r.status).toBe("FAILED");
      expect(r.attemptCount).toBe(1); // permanent: no retries
      expect(await db.auditLog.count({ where: { action: "delivery.needs_review", meta: { path: ["deliveryId"], equals: id } } })).toBe(1);
    }
    expect((await row(corrupt)).reservation.status).toBe("HELD"); // untouched: never released on an uncertain / corrupt state
    expect((await row(corrupt)).card.status).toBe("SCHEDULED");
    expect((await row(corrupt)).lastErrorCategory).toBe("CORRUPT_RELATIONSHIP");
    expect((await row(cancelledCard)).lastErrorCategory).toBe("CARD_NOT_SCHEDULED");
    expect((await row(released)).lastErrorCategory).toBe("RESERVATION_NOT_HELD");
    expect(await db.ledgerEntry.count({ where: { reservationId: (await row(corrupt)).reservationId, kind: "RELEASE" } })).toBe(0);
    expect(await db.ledgerEntry.count({ where: { reservationId: rr.reservationId, kind: "RELEASE" } })).toBe(1); // only the manual one
    expect((await db.$transaction((tx) => reconcile(tx)))).toEqual([]);
  });
  it("an already-published card is reconciled (idempotent replay): the delivery completes and credits are spent exactly once", async () => {
    const u = await mkUser();
    const heldId = await schedule(u), committedId = await schedule(u);
    // someone made the card live while the reservation was still held
    await db.card.update({ where: { id: (await row(heldId)).cardId }, data: { status: "PUBLISHED" } });
    // and one where the reservation was ALSO committed already
    const cr = await row(committedId);
    await db.card.update({ where: { id: cr.cardId }, data: { status: "PUBLISHED" } });
    await run((tx) => settleReservation(tx, cr.reservation.accountId, cr.reservationId, "COMMIT", { now: T0, cardId: cr.cardId }));
    const s = await runOnce({ ...ctx(), workerId: "w" });
    expect(s).toMatchObject({ claimed: 2, replayed: 2, published: 0 });
    for (const id of [heldId, committedId]) {
      const r = await row(id);
      expect(r).toMatchObject({ status: "PUBLISHED", card: { status: "PUBLISHED" }, reservation: { status: "COMMITTED" } });
      expect(await db.ledgerEntry.count({ where: { reservationId: r.reservationId, kind: "COMMIT" } })).toBe(1);
    }
    expect((await balOf(u)).total).toBe(8);
    expect(await clean()).toEqual([]);
  });
});

describe("races with the user", () => {
  it("cancellation racing with delivery: exactly one wins, consistently, credits settled exactly once", async () => {
    const u1 = await mkUser(), u2 = await mkUser();
    const ids: { id: string; u: User }[] = [];
    for (let i = 0; i < 8; i++) { ids.push({ id: await schedule(u1), u: u1 }); ids.push({ id: await schedule(u2), u: u2 }); }
    const results = await Promise.all(ids.map(async ({ id, u }, i) => {
      const [c] = await Promise.allSettled([cancelSchedule(u, id, AFTER), i % 2 ? runOnce({ ...ctx(), workerId: `w${i}` }) : Promise.resolve(null)]);
      return { id, cancel: c };
    }));
    await runOnce({ ...ctx(), workerId: "sweep" }); // anything still due
    let published = 0, cancelled = 0;
    for (const { id } of results) {
      const r = await row(id);
      expect(["PUBLISHED", "CANCELLED"]).toContain(r.status);
      if (r.status === "PUBLISHED") { published++; expect(r.card.status).toBe("PUBLISHED"); expect(r.reservation.status).toBe("COMMITTED"); }
      else { cancelled++; expect(r.card.status).toBe("CANCELLED"); expect(r.reservation.status).toBe("RELEASED"); expect(await getPublishedCard(r.card.slug)).toBeNull(); }
    }
    expect(published + cancelled).toBe(16);
    expect(await clean()).toEqual([]);
  });
  it("rescheduling racing with delivery: the schedule is either published or moved, never both", async () => {
    const u = await mkUser(), v = await mkUser();
    const items: { id: string; u: User; version: number }[] = [];
    for (let i = 0; i < 6; i++) { items.push({ id: await schedule(u), u, version: 0 }); items.push({ id: await schedule(v), u: v, version: 0 }); }
    await Promise.all(items.map(({ id, u: owner }, i) => Promise.allSettled([rescheduleSchedule(owner, id, { localDate: "2026-11-20", localTime: "10:00", timeZone: "UTC", version: 0 }, AFTER), i % 2 ? runOnce({ ...ctx(), workerId: `r${i}` }) : Promise.resolve(null)])));
    for (const { id } of items) {
      const r = await row(id);
      if (r.status === "PUBLISHED") { expect(r.card.status).toBe("PUBLISHED"); expect(r.version).toBeGreaterThanOrEqual(1); }
      else { expect(r.status).toBe("SCHEDULED"); expect(r.card.status).toBe("SCHEDULED"); expect(r.deliverAtUtc.toISOString()).toBe("2026-11-20T10:00:00.000Z"); }
    }
    expect((await findAnomalies(AFTER)).anomalies.filter((a) => a.kind !== "LEDGER_DRIFT")).toEqual([]);
    expect(await clean()).toEqual([]);
  });
});

describe("database state machine", () => {
  const attempt = (q: Promise<unknown>) => q.then(() => "allowed", () => "blocked");
  it("only the intended schedule transitions are possible, and the lease is tied to PROCESSING", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = ${id}::uuid`)).toBe("blocked"); // SCHEDULED -> PUBLISHED
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'FAILED', "failedAt" = now() WHERE id = ${id}::uuid`)).toBe("blocked"); // SCHEDULED -> FAILED
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'PROCESSING' WHERE id = ${id}::uuid`)).toBe("blocked"); // no lease: CHECK
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'PROCESSING', "leaseToken" = gen_random_uuid(), "leaseOwner" = 'x', "leaseExpiresAt" = now() + interval '1 minute' WHERE id = ${id}::uuid`)).toBe("blocked"); // claim without a new attempt
    const [claim] = (await claimDue("w", AFTER, { limit: 100, leaseMs: 60_000 })).filter((c) => c.deliveryId === id);
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET "leaseToken" = gen_random_uuid() WHERE id = ${id}::uuid`)).toBe("blocked"); // fencing token is immutable while held
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'CANCELLED', "cancelledAt" = now(), "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL WHERE id = ${id}::uuid`)).toBe("blocked"); // PROCESSING -> CANCELLED
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'SCHEDULED' WHERE id = ${id}::uuid`)).toBe("blocked"); // lease must be cleared: CHECK
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET "deliverAtUtc" = now() WHERE id = ${id}::uuid`)).toBe("blocked"); // time frozen while PROCESSING
    expect(await processClaim(claim, ctx())).toBe("PUBLISHED");
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'SCHEDULED', "leaseToken" = NULL WHERE id = ${id}::uuid`)).toBe("blocked"); // PUBLISHED is terminal
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'FAILED', "failedAt" = now() WHERE id = ${id}::uuid`)).toBe("blocked");
  });
  it("card status only moves SCHEDULED -> PUBLISHED | CANCELLED and PUBLISHED -> REMOVED", async () => {
    const u = await mkUser();
    const mk = (status: "SCHEDULED" | "PUBLISHED") => db.card.create({ data: { slug: `cg${Math.random().toString(36).slice(2, 12)}`.slice(0, 12), templateKey: "snow-globe", recipientName: "DeliveryTest", senderName: "S", message: "m", ownerId: u.id, status } });
    const sched = await mk("SCHEDULED"), live = await mk("PUBLISHED");
    const set = (id: string, s: string) => attempt(db.$executeRawUnsafe(`UPDATE "Card" SET status = '${s}' WHERE id = '${id}'`));
    expect(await set(live.id, "SCHEDULED")).toBe("blocked");
    expect(await set(sched.id, "REMOVED")).toBe("blocked");
    expect(await set(live.id, "REMOVED")).toBe("allowed");
    expect(await set(live.id, "PUBLISHED")).toBe("blocked"); // REMOVED is terminal
    expect(await set(sched.id, "CANCELLED")).toBe("allowed");
    expect(await set(sched.id, "PUBLISHED")).toBe("blocked"); // CANCELLED is terminal
  });
});

describe("security and logging", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const src = (f: string) => readFileSync(f, "utf8");
  it("no route, page or client component can run or trigger the worker", () => {
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("generated"));
    const offenders = files.filter((f) => /@\/modules\/delivery\/(queue|index|reconcile)/.test(src(f)) && !f.startsWith("src/modules/delivery/")).map((f) => f.replaceAll("\\", "/"));
    expect(offenders).toEqual([]);
    const apiPaths = walk("src/app/api").map((f) => f.replaceAll("\\", "/"));
    expect(apiPaths.filter((f) => /deliver|worker|cron|queue|job/i.test(f))).toEqual([]);
  });
  it("the delivery worker never touches the email transport (LINK only) and the email module is never wired to it", () => {
    expect(src("src/modules/delivery/queue.ts")).not.toMatch(/email|getEmailTransport|attemptSend/i);
    expect(src("src/modules/delivery/queue.ts")).toMatch(/channel = 'LINK'/);
  });
  it("cycles log nothing (no card text, names, addresses or tokens reach the console)", async () => {
    const u = await mkUser();
    const id = await schedule(u);
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await runOnce({ ...ctx(), workerId: "quiet" });
    const noisy = spies.flatMap((s) => s.mock.calls.flat().map(String)).join(" ");
    spies.forEach((s) => s.mockRestore());
    expect(noisy).toBe("");
    const a = await db.deliveryAttempt.findFirstOrThrow({ where: { deliveryId: id } });
    const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    expect(j(a)).not.toMatch(/msg \d|DeliveryTest|@dlv\.example/);
    const audit = await db.auditLog.findMany({ where: { action: { startsWith: "delivery." } }, take: 50 });
    expect(j(audit)).not.toMatch(/msg \d|DeliveryTest|@dlv\.example|leaseToken/);
  });
});
