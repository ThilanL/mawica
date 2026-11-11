import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { settleReservation, type Tx } from "@/modules/wallet/engine";
import { hasAttemptsLeft, retryDelayMs, type DeliveryPolicy } from "./config";
import { classify, DeliveryStateError, SimulatedCrash, StaleLeaseError, type FailureCategory } from "./errors";

/**
 * The LINK delivery engine: a PostgreSQL-backed durable queue (no Redis, no new service) with leases and fencing tokens.
 *
 *  claim     SCHEDULED -> PROCESSING   one statement: FOR UPDATE SKIP LOCKED picks due rows, stamps a fresh lease + fencing token,
 *                                      bumps the attempt counter and writes a STARTED DeliveryAttempt. Concurrent workers never get the same row.
 *  publish   PROCESSING -> PUBLISHED   ONE transaction: verify owner/card/reservation, card SCHEDULED -> PUBLISHED, reservation COMMIT,
 *                                      delivery PUBLISHED, attempt SUCCEEDED, audit row. Every write is fenced by the token; any failure rolls
 *                                      back all of it, so the card stays private and the credit untouched.
 *  retry     PROCESSING -> SCHEDULED   bounded exponential backoff while attempts remain.
 *  fail      PROCESSING -> FAILED      permanent errors or exhausted retries. The reservation is released ONLY when the outcome is certain
 *                                      (card still private, reservation HELD, relationships intact); otherwise it is left alone and flagged for review.
 *  recover   expired lease -> reconcile expired leases are read-before-act: already published? certainly not published? corrupt?
 *
 * Hosting is a thin adapter around runOnce/runLoop (local process today, an Azure Functions timer later). Time is injectable for tests.
 */
export type Claim = { deliveryId: string; leaseToken: string; attemptNo: number; workerId: string; dueAt: Date };
export type Outcome = "PUBLISHED" | "PUBLISHED_REPLAY" | "RETRY_SCHEDULED" | "FAILED_RELEASED" | "FAILED_REVIEW" | "STALE" | "ERROR";
export type Hooks = {
  /** Inside the publish transaction, after every write, immediately before COMMIT (tests: crash or kill the connection here). */
  beforeCommit?: (tx: Tx, claim: Claim) => Promise<void> | void;
  /** After the publish transaction committed (tests: crash here; nothing may be lost or duplicated). */
  afterCommit?: (claim: Claim) => Promise<void> | void;
};
export type Ctx = { policy: DeliveryPolicy; clock: () => Date; hooks?: Hooks };

type Locked = {
  deliveryId: string; status: string; ownerId: string; cardId: string; reservationId: string; leaseToken: string | null; attemptCount: number; attemptBase: number;
  cardStatus: string; cardOwnerId: string | null; resStatus: string; accountId: string; resCardId: string | null; accountUserId: string | null;
};
const relationshipsOk = (l: Locked) => l.cardOwnerId === l.ownerId && l.accountUserId === l.ownerId && l.resCardId === l.cardId;
const TXN = { timeout: 20_000, maxWait: 20_000 };

// ----------------------------------------------------------------------------- claim
export async function claimDue(workerId: string, now: Date, opts: { limit: number; leaseMs: number }): Promise<Claim[]> {
  const leaseExpires = new Date(now.getTime() + opts.leaseMs);
  const rows = await db.$queryRaw<{ deliveryId: string; leaseToken: string; attemptNo: number; dueAt: Date }[]>`
    WITH due AS (
      SELECT id FROM "ScheduledDelivery"
       WHERE status = 'SCHEDULED' AND channel = 'LINK' AND "nextAttemptAt" <= ${now}
       ORDER BY "nextAttemptAt", id
       LIMIT ${opts.limit} FOR UPDATE SKIP LOCKED),
    claimed AS (
      UPDATE "ScheduledDelivery" d SET status = 'PROCESSING', "leaseToken" = gen_random_uuid(), "leaseOwner" = ${workerId}, "leaseExpiresAt" = ${leaseExpires},
             "attemptCount" = d."attemptCount" + 1, "updatedAt" = ${now}
        FROM due WHERE d.id = due.id
      RETURNING d.id, d."leaseToken", d."attemptCount", d."nextAttemptAt"),
    att AS (
      INSERT INTO "DeliveryAttempt" ("deliveryId", "attemptNo", channel, status, "startedAt", "workerId", "leaseToken")
      SELECT id, "attemptCount", 'LINK', 'STARTED', ${now}, ${workerId}, "leaseToken" FROM claimed RETURNING "deliveryId")
    SELECT id::text AS "deliveryId", "leaseToken"::text AS "leaseToken", "attemptCount" AS "attemptNo", "nextAttemptAt" AS "dueAt" FROM claimed ORDER BY "nextAttemptAt", id`;
  return rows.map((r) => ({ ...r, attemptNo: Number(r.attemptNo), workerId }));
}

// ----------------------------------------------------------------------------- shared reads / writes
const SELECT_LOCKED = Prisma.sql`
  SELECT d.id::text AS "deliveryId", d.status::text AS status, d."ownerId"::text AS "ownerId", d."cardId"::text AS "cardId", d."reservationId"::text AS "reservationId",
         d."leaseToken"::text AS "leaseToken", d."attemptCount" AS "attemptCount", d."attemptBase" AS "attemptBase",
         c.status::text AS "cardStatus", c."ownerId"::text AS "cardOwnerId",
         r.status::text AS "resStatus", r."accountId"::text AS "accountId", r."cardId"::text AS "resCardId", a."userId"::text AS "accountUserId"
    FROM "ScheduledDelivery" d
    JOIN "Card" c ON c.id = d."cardId"
    JOIN "CreditReservation" r ON r.id = d."reservationId"
    JOIN "CreditAccount" a ON a.id = r."accountId"`;

/** Locks the delivery row ONLY if it is still PROCESSING under this claim's fencing token. */
async function lockClaimed(tx: Tx, claim: Claim): Promise<Locked | null> {
  const rows = await tx.$queryRaw<Locked[]>`${SELECT_LOCKED} WHERE d.id = ${claim.deliveryId}::uuid AND d.status = 'PROCESSING' AND d."leaseToken" = ${claim.leaseToken}::uuid FOR UPDATE OF d`;
  return rows[0] ? { ...rows[0], attemptCount: Number(rows[0].attemptCount), attemptBase: Number(rows[0].attemptBase) } : null;
}

type AttemptEnd = "SUCCEEDED" | "FAILED" | "ABANDONED";
async function closeAttempt(tx: Tx, deliveryId: string, attemptNo: number, status: AttemptEnd, now: Date, extra: { category?: FailureCategory; retryable?: boolean; retryAt?: Date | null } = {}) {
  const lit = Prisma.raw(`'${status}'::"AttemptStatus"`); // closed TS union, never user input
  await tx.$executeRaw`
    UPDATE "DeliveryAttempt" SET status = ${lit}, "finishedAt" = ${now}, "errorCategory" = ${extra.category ?? null}, retryable = ${extra.retryable ?? null}, "retryAt" = ${extra.retryAt ?? null}
     WHERE "deliveryId" = ${deliveryId}::uuid AND "attemptNo" = ${attemptNo} AND status = 'STARTED'`;
}
const audit = (tx: Tx, action: string, meta: Record<string, string | number | boolean>) => tx.auditLog.create({ data: { action, actorId: null, meta } });

/** Moves a PROCESSING delivery to PUBLISHED for a card that is already live (idempotent replay / reconciliation). Never double-commits credits. */
async function finalizeLive(tx: Tx, l: Locked, now: Date, attemptNo: number, via: "replay" | "recovery") {
  if (!relationshipsOk(l) || l.resStatus === "RELEASED") throw new DeliveryStateError("CORRUPT_RELATIONSHIP");
  if (l.resStatus === "HELD") await settleReservation(tx, l.accountId, l.reservationId, "COMMIT", { now, cardId: l.cardId }); // the card IS live: the credit is spent exactly once
  const u = await tx.$executeRaw`
    UPDATE "ScheduledDelivery" SET status = 'PUBLISHED', "publishedAt" = ${now}, "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "lastErrorCategory" = NULL, "updatedAt" = ${now}, version = version + 1
     WHERE id = ${l.deliveryId}::uuid AND status = 'PROCESSING' AND "leaseToken" = ${l.leaseToken}::uuid`;
  if (u !== 1) throw new StaleLeaseError();
  await closeAttempt(tx, l.deliveryId, attemptNo, "SUCCEEDED", now, { retryable: false });
  await audit(tx, "delivery.published", { deliveryId: l.deliveryId, attempt: attemptNo, via });
}

/**
 * Terminal failure. Reconciles FIRST: credits are released only when it is CERTAIN nothing was published (card still SCHEDULED, reservation HELD,
 * owner/card/reservation consistent). Anything else (corrupt relationships, an uncertain state) is failed WITHOUT touching credits and flagged for review.
 */
async function terminalFail(tx: Tx, l: Locked, now: Date, attemptNo: number, category: FailureCategory): Promise<Outcome> {
  const certain = category !== "CORRUPT_RELATIONSHIP" && l.cardStatus === "SCHEDULED" && l.resStatus === "HELD" && relationshipsOk(l);
  const u = await tx.$executeRaw`
    UPDATE "ScheduledDelivery" SET status = 'FAILED', "failedAt" = ${now}, "lastErrorCategory" = ${category}, "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = ${now}, version = version + 1
     WHERE id = ${l.deliveryId}::uuid AND status = 'PROCESSING' AND "leaseToken" = ${l.leaseToken}::uuid`;
  if (u !== 1) throw new StaleLeaseError();
  await closeAttempt(tx, l.deliveryId, attemptNo, "FAILED", now, { category, retryable: false });
  if (certain) {
    await settleReservation(tx, l.accountId, l.reservationId, "RELEASE", { now }); // the wallet's rule: restores only inside the original allowance period
    await tx.$executeRaw`UPDATE "Card" SET status = 'CANCELLED' WHERE id = ${l.cardId}::uuid AND status = 'SCHEDULED'`;
    await audit(tx, "delivery.failed", { deliveryId: l.deliveryId, attempt: attemptNo, category, released: true });
    return "FAILED_RELEASED";
  }
  await audit(tx, "delivery.needs_review", { deliveryId: l.deliveryId, attempt: attemptNo, category, released: false });
  return "FAILED_REVIEW";
}

// ----------------------------------------------------------------------------- publish (the atomic step)
async function publishTx(claim: Claim, ctx: Ctx): Promise<Outcome> {
  const now = ctx.clock();
  const out = await db.$transaction(async (tx) => {
    const l = await lockClaimed(tx, claim);
    if (!l) throw new StaleLeaseError();
    if (l.cardStatus === "PUBLISHED") { await finalizeLive(tx, l, now, claim.attemptNo, "replay"); return "PUBLISHED_REPLAY" as const; }
    if (!relationshipsOk(l)) throw new DeliveryStateError("CORRUPT_RELATIONSHIP");
    if (l.cardStatus !== "SCHEDULED") throw new DeliveryStateError("CARD_NOT_SCHEDULED");
    if (l.resStatus !== "HELD") throw new DeliveryStateError("RESERVATION_NOT_HELD");

    const pub = await tx.$executeRaw`UPDATE "Card" SET status = 'PUBLISHED' WHERE id = ${l.cardId}::uuid AND status = 'SCHEDULED'`;
    if (pub !== 1) throw new DeliveryStateError("CARD_NOT_SCHEDULED");
    const s = await settleReservation(tx, l.accountId, l.reservationId, "COMMIT", { now, cardId: l.cardId });
    if (!s.settled) throw new DeliveryStateError("RESERVATION_NOT_HELD");
    const u = await tx.$executeRaw`
      UPDATE "ScheduledDelivery" SET status = 'PUBLISHED', "publishedAt" = ${now}, "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "lastErrorCategory" = NULL, "updatedAt" = ${now}, version = version + 1
       WHERE id = ${l.deliveryId}::uuid AND status = 'PROCESSING' AND "leaseToken" = ${claim.leaseToken}::uuid`;
    if (u !== 1) throw new StaleLeaseError();
    await closeAttempt(tx, l.deliveryId, claim.attemptNo, "SUCCEEDED", now, { retryable: false });
    await audit(tx, "delivery.published", { deliveryId: l.deliveryId, attempt: claim.attemptNo, via: "worker" });
    await ctx.hooks?.beforeCommit?.(tx, claim);
    return "PUBLISHED" as const;
  }, TXN);
  return out;
}

// ----------------------------------------------------------------------------- failure handling
async function handleFailure(claim: Claim, err: unknown, ctx: Ctx): Promise<Outcome> {
  const now = ctx.clock();
  const c = classify(err);
  try {
    return await db.$transaction(async (tx) => {
      const l = await lockClaimed(tx, claim);
      if (!l) {
        // We no longer hold the claim. Reconcile before deciding anything: if the earlier (uncertain) attempt actually committed, the
        // delivery is PUBLISHED and nothing may be released or retried.
        const [cur] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "ScheduledDelivery" WHERE id = ${claim.deliveryId}::uuid`;
        return cur?.status === "PUBLISHED" ? ("PUBLISHED_REPLAY" as const) : ("STALE" as const);
      }
      if (c.retryable && hasAttemptsLeft(ctx.policy, claim.attemptNo, l.attemptBase)) {
        const retryAt = new Date(now.getTime() + retryDelayMs(claim.attemptNo - l.attemptBase, ctx.policy));
        await tx.$executeRaw`
          UPDATE "ScheduledDelivery" SET status = 'SCHEDULED', "nextAttemptAt" = ${retryAt}, "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "lastErrorCategory" = ${c.category}, "updatedAt" = ${now}
           WHERE id = ${l.deliveryId}::uuid AND status = 'PROCESSING' AND "leaseToken" = ${claim.leaseToken}::uuid`;
        await closeAttempt(tx, l.deliveryId, claim.attemptNo, "FAILED", now, { category: c.category, retryable: true, retryAt });
        await audit(tx, "delivery.retry_scheduled", { deliveryId: l.deliveryId, attempt: claim.attemptNo, category: c.category });
        return "RETRY_SCHEDULED" as const;
      }
      return terminalFail(tx, l, now, claim.attemptNo, c.category);
    }, TXN);
  } catch (e) {
    if (e instanceof StaleLeaseError) return "STALE";
    // The failure handler itself could not run (for example the database is down). Nothing was written: the lease will expire and recovery reconciles.
    return "ERROR";
  }
}

export async function processClaim(claim: Claim, ctx: Ctx): Promise<Outcome> {
  try {
    const out = await publishTx(claim, ctx);
    await ctx.hooks?.afterCommit?.(claim);
    return out;
  } catch (e) {
    if (e instanceof SimulatedCrash) throw e; // a dead process runs no handlers
    if (e instanceof StaleLeaseError) return "STALE";
    return handleFailure(claim, e, ctx);
  }
}

// ----------------------------------------------------------------------------- recovery of abandoned work
export async function recoverExpired(ctx: Ctx, limit = 50): Promise<{ recovered: number; published: number; failed: number }> {
  const now = ctx.clock();
  const ids = await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM "ScheduledDelivery" WHERE status = 'PROCESSING' AND "leaseExpiresAt" < ${now} ORDER BY "leaseExpiresAt" LIMIT ${limit}`;
  const stats = { recovered: 0, published: 0, failed: 0 };
  for (const { id } of ids) {
    try {
      await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Locked[]>`${SELECT_LOCKED} WHERE d.id = ${id}::uuid AND d.status = 'PROCESSING' AND d."leaseExpiresAt" < ${now} FOR UPDATE OF d SKIP LOCKED`;
        if (!rows[0]) return; // someone else recovered it, or the lease was renewed
        const l = { ...rows[0], attemptCount: Number(rows[0].attemptCount), attemptBase: Number(rows[0].attemptBase) };
        if (l.cardStatus === "PUBLISHED" && relationshipsOk(l) && l.resStatus !== "RELEASED") { await finalizeLive(tx, l, now, l.attemptCount, "recovery"); stats.published++; return; }
        const certain = l.cardStatus === "SCHEDULED" && l.resStatus === "HELD" && relationshipsOk(l);
        if (!certain) { await terminalFail(tx, l, now, l.attemptCount, "CORRUPT_RELATIONSHIP"); stats.failed++; return; }
        if (!hasAttemptsLeft(ctx.policy, l.attemptCount, l.attemptBase)) {
          await terminalFail(tx, l, now, l.attemptCount, "LEASE_EXPIRED");
          stats.failed++;
          return;
        }
        const retryAt = new Date(now.getTime() + retryDelayMs(l.attemptCount - l.attemptBase, ctx.policy));
        await tx.$executeRaw`
          UPDATE "ScheduledDelivery" SET status = 'SCHEDULED', "nextAttemptAt" = ${retryAt}, "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "lastErrorCategory" = 'LEASE_EXPIRED', "updatedAt" = ${now}
           WHERE id = ${l.deliveryId}::uuid AND status = 'PROCESSING' AND "leaseToken" = ${l.leaseToken}::uuid`;
        await closeAttempt(tx, l.deliveryId, l.attemptCount, "ABANDONED", now, { category: "LEASE_EXPIRED", retryable: true, retryAt });
        await audit(tx, "delivery.recovered", { deliveryId: l.deliveryId, attempt: l.attemptCount });
        stats.recovered++;
      }, TXN);
    } catch { /* a transient failure here is retried on the next cycle */ }
  }
  return stats;
}

/** Graceful shutdown: hands back a claim that never started (the attempt row is removed and the counter restored, so no attempt is wasted). */
export async function releaseClaim(claim: Claim, now: Date): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const l = await lockClaimed(tx, claim);
      if (!l) return false;
      await tx.$executeRaw`DELETE FROM "DeliveryAttempt" WHERE "deliveryId" = ${claim.deliveryId}::uuid AND "attemptNo" = ${claim.attemptNo} AND "leaseToken" = ${claim.leaseToken}::uuid AND status = 'STARTED'`;
      await tx.$executeRaw`
        UPDATE "ScheduledDelivery" SET status = 'SCHEDULED', "nextAttemptAt" = ${claim.dueAt}, "attemptCount" = "attemptCount" - 1, "leaseToken" = NULL, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = ${now}
         WHERE id = ${claim.deliveryId}::uuid AND status = 'PROCESSING' AND "leaseToken" = ${claim.leaseToken}::uuid`;
      return true;
    }, TXN);
  } catch { return false; }
}

// ----------------------------------------------------------------------------- one cycle / a loop
export type CycleStats = { recovered: number; recoveredPublished: number; recoveredFailed: number; claimed: number; published: number; replayed: number; retried: number; failedReleased: number; failedReview: number; stale: number; errors: number; released: number; durationMs: number };

export function newWorkerId(): string { return `w-${process.pid}-${randomUUID().slice(0, 8)}`; }

export async function runOnce(ctx: Ctx & { workerId: string; signal?: AbortSignal }): Promise<CycleStats> {
  const t0 = performance.now();
  const s: CycleStats = { recovered: 0, recoveredPublished: 0, recoveredFailed: 0, claimed: 0, published: 0, replayed: 0, retried: 0, failedReleased: 0, failedReview: 0, stale: 0, errors: 0, released: 0, durationMs: 0 };
  const rec = await recoverExpired(ctx);
  s.recovered = rec.recovered; s.recoveredPublished = rec.published; s.recoveredFailed = rec.failed;
  if (ctx.signal?.aborted) { s.durationMs = performance.now() - t0; return s; }
  const claims = await claimDue(ctx.workerId, ctx.clock(), { limit: ctx.policy.batchSize, leaseMs: ctx.policy.leaseMs });
  s.claimed = claims.length;
  const queue = [...claims];
  const tally = (o: Outcome) => {
    if (o === "PUBLISHED") s.published++; else if (o === "PUBLISHED_REPLAY") s.replayed++; else if (o === "RETRY_SCHEDULED") s.retried++;
    else if (o === "FAILED_RELEASED") s.failedReleased++; else if (o === "FAILED_REVIEW") s.failedReview++; else if (o === "STALE") s.stale++; else s.errors++;
  };
  await Promise.all(Array.from({ length: Math.min(ctx.policy.concurrency, queue.length) }, async () => {
    while (!ctx.signal?.aborted) {
      const c = queue.shift();
      if (!c) return;
      tally(await processClaim(c, ctx));
    }
  }));
  for (const c of queue) if (await releaseClaim(c, ctx.clock())) s.released++; // aborted before they started
  s.durationMs = performance.now() - t0;
  return s;
}

export async function runLoop(ctx: Ctx & { workerId: string; signal: AbortSignal; intervalMs: number; onCycle?: (s: CycleStats) => void }): Promise<void> {
  while (!ctx.signal.aborted) {
    let s: CycleStats | null = null;
    try { s = await runOnce(ctx); ctx.onCycle?.(s); } catch (e) { if (e instanceof SimulatedCrash) throw e; /* keep the loop alive; the next cycle retries */ }
    if (ctx.signal.aborted) break;
    const busy = s && (s.claimed > 0 || s.recovered > 0);
    if (!busy) await new Promise<void>((resolve) => { const t = setTimeout(resolve, ctx.intervalMs); ctx.signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true }); });
  }
}
