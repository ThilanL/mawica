import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { loadEntitlements, type Entitlements } from "./entitlements";
import { periodFor, type Period } from "./periods";

/**
 * The credit transaction engine. Every function takes a transaction client: callers own the transaction so that spending
 * can commit atomically with other writes (publishing a card). Rules proven by the isolated spike and the tests:
 *  - balances live in CreditGrant.remaining and change ONLY by a conditional decrement (WHERE remaining > 0) on a row locked
 *    FOR UPDATE, backed by CHECK constraints: concurrent spenders cannot overspend and balances cannot go negative;
 *  - TOTAL is spent before PREMIUM, so a premium send that lacks total allowance leaves the welcome credit untouched;
 *  - credits expiring soonest are spent first, never-expiring (welcome) last;
 *  - a reservation stays tied to the exact grants it drew from; a release restores only while THAT grant is still valid;
 *  - LedgerEntry is append-only (database trigger) and reconciles to grant balances.
 * `now` is explicit so period boundaries are deterministic in tests; production passes the current time.
 */
export type Tx = Prisma.TransactionClient;
export type Unit = "TOTAL" | "PREMIUM";

export class InsufficientCreditsError extends Error {
  constructor(public readonly unit: Unit) { super(`Insufficient ${unit} credits`); }
}
export class IdempotencyKeyReuseError extends Error {
  constructor() { super("Idempotency key was already used with a different request"); }
}
export class ReservationNotFoundError extends Error {}

/** Canonical (key-sorted, recursive) JSON hash of a request, so the same logical request always hashes the same. */
export function requestHash(request: unknown): string {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canon(request))).digest("hex");
}

type GrantInput = { accountId: string; unit: Unit; source: "WELCOME" | "PLAN_PERIOD" | "PURCHASE" | "ADJUSTMENT"; grantKey: string; amount: number; remaining?: number; validFrom: Date; validTo: Date | null; reason?: string };

/** Creates a grant and its GRANT ledger entry. Returns null (and writes nothing) when this grantKey already exists: idempotent. */
export async function grantCredit(tx: Tx, g: GrantInput): Promise<string | null> {
  const remaining = g.remaining ?? g.amount;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "CreditGrant" ("accountId", unit, source, "grantKey", amount, remaining, "validFrom", "validTo")
    VALUES (${g.accountId}::uuid, ${g.unit}::"GrantUnit", ${g.source}::"GrantSource", ${g.grantKey}, ${g.amount}, ${remaining}, ${g.validFrom}, ${g.validTo})
    ON CONFLICT ("accountId", "grantKey") DO NOTHING RETURNING id::text`;
  if (!rows[0]) return null;
  await tx.$executeRaw`INSERT INTO "LedgerEntry" ("accountId","grantId",kind,delta,reason) VALUES (${g.accountId}::uuid, ${rows[0].id}::uuid, 'GRANT', ${remaining}, ${g.reason ?? g.grantKey})`;
  return rows[0].id;
}

type AccountRef = { id: string; planKey: string; periodAnchor: Date };

export type PeriodInfo = { period: Period; entitlements: Entitlements };

/** Creates the current period's grants if missing (idempotent, safe under concurrency). There is no reset job. */
export async function ensurePeriodGrants(tx: Tx, account: AccountRef, now: Date): Promise<PeriodInfo> {
  const entitlements = await loadEntitlements(tx, account.planKey);
  const period = periodFor(account.periodAnchor, now, entitlements.periodMonths);
  const stamp = period.start.toISOString();
  await grantCredit(tx, { accountId: account.id, unit: "TOTAL", source: "PLAN_PERIOD", grantKey: `period:${account.planKey}:${stamp}:TOTAL`, amount: entitlements.sendsTotal, validFrom: period.start, validTo: period.end });
  if (entitlements.sendsPremium > 0) {
    await grantCredit(tx, { accountId: account.id, unit: "PREMIUM", source: "PLAN_PERIOD", grantKey: `period:${account.planKey}:${stamp}:PREMIUM`, amount: entitlements.sendsPremium, validFrom: period.start, validTo: period.end });
  }
  return { period, entitlements };
}

async function spendOne(tx: Tx, accountId: string, unit: Unit, reservationId: string, now: Date) {
  const picked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM "CreditGrant"
     WHERE "accountId" = ${accountId}::uuid AND unit = ${unit}::"GrantUnit" AND remaining > 0
       AND "validFrom" <= ${now} AND ("validTo" IS NULL OR "validTo" > ${now})
     ORDER BY "validTo" NULLS LAST, id
     LIMIT 1 FOR UPDATE`;
  if (!picked[0]) throw new InsufficientCreditsError(unit);
  const updated = await tx.$executeRaw`UPDATE "CreditGrant" SET remaining = remaining - 1 WHERE id = ${picked[0].id}::uuid AND remaining > 0`;
  if (updated !== 1) throw new InsufficientCreditsError(unit);
  await tx.$executeRaw`INSERT INTO "LedgerEntry" ("accountId","grantId","reservationId",kind,delta) VALUES (${accountId}::uuid, ${picked[0].id}::uuid, ${reservationId}::uuid, 'RESERVE', -1)`;
}

export type ReserveResult = { reservationId: string; replay: boolean; status: "HELD" | "COMMITTED" | "RELEASED"; cardId: string | null };

/**
 * Reserves 1 TOTAL credit (+ 1 PREMIUM when `premium`) atomically. Throws InsufficientCreditsError (the caller's transaction
 * must roll back, which also removes the reservation row), or IdempotencyKeyReuseError for the same key with a different request.
 * A repeated call with the same key and request returns the original reservation without spending again.
 */
export async function reserveCredits(tx: Tx, account: AccountRef, opts: { key: string; request: unknown; premium: boolean; deliverAt?: Date | null; now: Date }): Promise<ReserveResult> {
  const hash = requestHash(opts.request);
  await ensurePeriodGrants(tx, account, opts.now);
  const ins = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "CreditReservation" ("accountId","idempotencyKey","requestHash",premium,"deliverAt")
    VALUES (${account.id}::uuid, ${opts.key}, ${hash}, ${opts.premium}, ${opts.deliverAt ?? null})
    ON CONFLICT ("accountId","idempotencyKey") DO NOTHING RETURNING id::text`;
  if (!ins[0]) {
    const [ex] = await tx.$queryRaw<{ id: string; requestHash: string; status: ReserveResult["status"]; cardId: string | null }[]>`
      SELECT id::text, "requestHash", status::text AS status, "cardId"::text AS "cardId" FROM "CreditReservation" WHERE "accountId" = ${account.id}::uuid AND "idempotencyKey" = ${opts.key}`;
    if (ex.requestHash !== hash) throw new IdempotencyKeyReuseError();
    return { reservationId: ex.id, replay: true, status: ex.status, cardId: ex.cardId };
  }
  await spendOne(tx, account.id, "TOTAL", ins[0].id, opts.now); // fixed order TOTAL -> PREMIUM (no deadlocks, welcome credit untouched when TOTAL is empty)
  if (opts.premium) await spendOne(tx, account.id, "PREMIUM", ins[0].id, opts.now);
  return { reservationId: ins[0].id, replay: false, status: "HELD", cardId: null };
}

export type SettleResult = { settled: boolean; status: "HELD" | "COMMITTED" | "RELEASED" };

/**
 * Commit (the credit is spent for good) or Release (cancel). Only HELD reservations of THIS account can change; anything else
 * is a no-op that reports its state, which makes repeated cancels idempotent and makes releasing a committed reservation impossible.
 * Release restores a credit only while the grant it came from is still valid at `now`; after that period ended nothing is restored
 * and nothing is moved into another period (a zero-delta RELEASE records why).
 */
export async function settleReservation(tx: Tx, accountId: string, reservationId: string, outcome: "COMMIT" | "RELEASE", opts: { now: Date; cardId?: string | null }): Promise<SettleResult> {
  const status = outcome === "COMMIT" ? "COMMITTED" : "RELEASED";
  const upd = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "CreditReservation" SET status = ${status}::"ReservationStatus", "settledAt" = ${opts.now}, "cardId" = COALESCE(${opts.cardId ?? null}::uuid, "cardId")
     WHERE id = ${reservationId}::uuid AND "accountId" = ${accountId}::uuid AND status = 'HELD' RETURNING id::text`;
  if (!upd[0]) {
    const [cur] = await tx.$queryRaw<{ status: SettleResult["status"] }[]>`SELECT status::text AS status FROM "CreditReservation" WHERE id = ${reservationId}::uuid AND "accountId" = ${accountId}::uuid`;
    if (!cur) throw new ReservationNotFoundError();
    return { settled: false, status: cur.status };
  }
  const spent = await tx.$queryRaw<{ grantId: string }[]>`SELECT "grantId"::text AS "grantId" FROM "LedgerEntry" WHERE "reservationId" = ${reservationId}::uuid AND kind = 'RESERVE' ORDER BY id`;
  for (const s of spent) {
    if (outcome === "COMMIT") {
      await tx.$executeRaw`INSERT INTO "LedgerEntry" ("accountId","grantId","reservationId",kind,delta) VALUES (${accountId}::uuid, ${s.grantId}::uuid, ${reservationId}::uuid, 'COMMIT', 0)`;
    } else {
      const restored = await tx.$executeRaw`UPDATE "CreditGrant" SET remaining = remaining + 1 WHERE id = ${s.grantId}::uuid AND "validFrom" <= ${opts.now} AND ("validTo" IS NULL OR "validTo" > ${opts.now})`;
      await tx.$executeRaw`INSERT INTO "LedgerEntry" ("accountId","grantId","reservationId",kind,delta,reason) VALUES (${accountId}::uuid, ${s.grantId}::uuid, ${reservationId}::uuid, 'RELEASE', ${restored}, ${restored ? null : "grant expired"})`;
    }
  }
  return { settled: true, status };
}

/** Cancels every HELD reservation of an account (used when an account is being closed). Committed ones are never touched. */
export async function releaseAllHeld(tx: Tx, accountId: string, now: Date): Promise<number> {
  const held = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM "CreditReservation" WHERE "accountId" = ${accountId}::uuid AND status = 'HELD' ORDER BY "createdAt" FOR UPDATE`;
  let n = 0;
  for (const h of held) if ((await settleReservation(tx, accountId, h.id, "RELEASE", { now })).settled) n++;
  return n;
}

/** Writes EXPIRE entries for grants whose period ended with credit left, so ledger and balances keep reconciling. Idempotent. */
export async function expireGrants(tx: Tx, accountId: string, now: Date): Promise<number> {
  return tx.$executeRaw`
    WITH due AS (SELECT id, remaining FROM "CreditGrant" WHERE "accountId" = ${accountId}::uuid AND "validTo" IS NOT NULL AND "validTo" <= ${now} AND remaining > 0 FOR UPDATE),
    upd AS (UPDATE "CreditGrant" g SET remaining = 0 FROM due WHERE g.id = due.id RETURNING g.id AS id, due.remaining AS gone)
    INSERT INTO "LedgerEntry" ("accountId","grantId",kind,delta,reason) SELECT ${accountId}::uuid, id, 'EXPIRE', -gone, 'period ended' FROM upd`;
}

export type Balances = { total: number; premium: number; premiumFromWelcome: number; premiumFromPeriod: number };

/** Spendable credit right now (valid grants only). */
export async function balances(tx: Tx, accountId: string, now: Date): Promise<Balances> {
  const rows = await tx.$queryRaw<{ unit: Unit; source: string; n: bigint }[]>`
    SELECT unit::text AS unit, source::text AS source, COALESCE(SUM(remaining), 0) AS n FROM "CreditGrant"
     WHERE "accountId" = ${accountId}::uuid AND "validFrom" <= ${now} AND ("validTo" IS NULL OR "validTo" > ${now}) GROUP BY unit, source`;
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + Number(r.n), 0);
  return {
    total: sum((r) => r.unit === "TOTAL"),
    premium: sum((r) => r.unit === "PREMIUM"),
    premiumFromWelcome: sum((r) => r.unit === "PREMIUM" && r.source === "WELCOME"),
    premiumFromPeriod: sum((r) => r.unit === "PREMIUM" && r.source === "PLAN_PERIOD"),
  };
}

export type Drift = { grantId: string; remaining: number; ledgerSum: number };

/** Integrity check: every grant's remaining must equal the sum of its ledger deltas. Returns the drifted grants (expected: none). */
export async function reconcile(tx: Tx, accountId?: string): Promise<Drift[]> {
  const rows = await tx.$queryRaw<{ id: string; remaining: number; s: bigint }[]>`
    SELECT g.id::text AS id, g.remaining, COALESCE(SUM(l.delta), 0) AS s FROM "CreditGrant" g LEFT JOIN "LedgerEntry" l ON l."grantId" = g.id
     WHERE (${accountId ?? null}::uuid IS NULL OR g."accountId" = ${accountId ?? null}::uuid)
     GROUP BY g.id, g.remaining HAVING g.remaining <> COALESCE(SUM(l.delta), 0)`;
  return rows.map((r) => ({ grantId: r.id, remaining: r.remaining, ledgerSum: Number(r.s) }));
}
