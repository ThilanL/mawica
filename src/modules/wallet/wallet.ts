import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/modules/auth/request";
import { templates, isTemplateKey } from "@/modules/templates/registry";
import { balances, ensurePeriodGrants, expireGrants, grantCredit, type Tx } from "./engine";
import { loadEntitlements, UnsupportedPlanError } from "./entitlements";
import { periodFor } from "./periods";

export type WalletAccount = { id: string; planKey: string; periodAnchor: Date };

/**
 * Keyed hash of the canonical verified email, kept forever after account deletion to stop a second welcome credit.
 * The pepper is a dedicated secret (WELCOME_PEPPER): rotating it would unlink old tombstones, so it must not be rotated.
 * The hash is never logged and never leaves the server; the raw email is never stored in the tombstone.
 */
export function welcomeHash(email: string): string {
  if (!env.WELCOME_PEPPER) throw new Error("WELCOME_PEPPER is required for the card wallet");
  const canonical = normalizeEmail(email);
  if (!canonical) throw new Error("A valid email is required");
  return createHmac("sha256", env.WELCOME_PEPPER).update(`welcome|${canonical}`).digest("hex");
}

/**
 * Finds or creates the user's wallet (one account per user, race-safe) and, for a VERIFIED email that has never received it,
 * grants the one-time premium welcome credit. Safe to call on every request: everything is idempotent.
 *  - exactly one welcome grant per account (grantKey "welcome" is unique per account);
 *  - never again for the same verified email, even after deletion and re-registration (tombstone);
 *  - never from a monthly reset (it is a separate, never-expiring grant, not a period grant).
 */
export async function ensureWallet(tx: Tx, user: { id: string; email: string; emailVerified: boolean }, now: Date): Promise<WalletAccount> {
  const created = await tx.$queryRaw<WalletAccount[]>`
    INSERT INTO "CreditAccount" ("userId", "periodAnchor") VALUES (${user.id}::uuid, ${now})
    ON CONFLICT ("userId") DO NOTHING RETURNING id::text, "planKey", "periodAnchor"`;
  const account = created[0] ?? (await tx.$queryRaw<WalletAccount[]>`SELECT id::text, "planKey", "periodAnchor" FROM "CreditAccount" WHERE "userId" = ${user.id}::uuid`)[0];
  if (user.emailVerified) {
    const free = await loadEntitlements(tx, "free");
    if (free.welcomePremium > 0) {
      const claimed = await tx.$executeRaw`INSERT INTO "WelcomeGrantTombstone" ("emailHash") VALUES (${welcomeHash(user.email)}) ON CONFLICT DO NOTHING`;
      if (claimed === 1) {
        await grantCredit(tx, { accountId: account.id, unit: "PREMIUM", source: "WELCOME", grantKey: "welcome", amount: free.welcomePremium, validFrom: now, validTo: null, reason: "welcome gift" });
      }
    }
  }
  return account;
}

export type WalletSummary = {
  plan: { key: string; name: string; purchasable: boolean };
  period: { start: string; end: string; nextReset: string };
  sends: { limit: number; used: number; remaining: number };
  premium: { perPeriodLimit: number; remaining: number; welcomeCredit: number; periodCredit: number };
  schedulingMonthsAhead: number | null;
};

/** Server-computed view of the wallet. Never reads or accepts anything from the client except the session user. */
export async function walletSummary(user: { id: string; email: string; emailVerified: boolean }, now = new Date()): Promise<WalletSummary> {
  return db.$transaction(async (tx) => {
    const account = await ensureWallet(tx, user, now);
    await expireGrants(tx, account.id, now);
    const { period, entitlements } = await ensurePeriodGrants(tx, account, now);
    const b = await balances(tx, account.id, now);
    const remaining = Math.max(0, Math.min(b.total, entitlements.sendsTotal));
    return {
      plan: { key: entitlements.planKey, name: entitlements.name, purchasable: entitlements.purchasable },
      period: { start: period.start.toISOString(), end: period.end.toISOString(), nextReset: period.end.toISOString() },
      sends: { limit: entitlements.sendsTotal, used: Math.max(0, entitlements.sendsTotal - remaining), remaining },
      premium: { perPeriodLimit: entitlements.sendsPremium, remaining: b.premium, welcomeCredit: b.premiumFromWelcome, periodCredit: b.premiumFromPeriod },
      schedulingMonthsAhead: entitlements.scheduleMonthsAhead,
    };
  }, { timeout: 15000, maxWait: 15000 });
}

export type ActivityItem = { at: string; type: "card_published" | "card_scheduled" | "card_cancelled" | "welcome_gift"; premium: boolean; card: { title: string; slug: string } | null };

/** Recent card activity for the signed-in user's own wallet. Only user-meaningful fields: no ledger, grant or reservation ids. */
export async function walletActivity(userId: string, opts: { limit?: number; before?: Date } = {}): Promise<{ items: ActivityItem[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const account = await db.creditAccount.findUnique({ where: { userId }, select: { id: true } });
  if (!account) return { items: [], nextBefore: null };
  const before = opts.before ?? new Date(Date.now() + 60_000);
  const [reservations, welcome] = await Promise.all([
    db.creditReservation.findMany({ where: { accountId: account.id, createdAt: { lt: before } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, select: { createdAt: true, status: true, premium: true, cardId: true } }),
    db.creditGrant.findMany({ where: { accountId: account.id, source: "WELCOME", createdAt: { lt: before } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } }),
  ]);
  const cardIds = reservations.map((r) => r.cardId).filter((x): x is string => !!x);
  const cards = cardIds.length ? await db.card.findMany({ where: { id: { in: cardIds }, ownerId: userId }, select: { id: true, slug: true, templateKey: true } }) : [];
  const items: ActivityItem[] = [
    ...reservations.map((r): ActivityItem => {
      const c = cards.find((x) => x.id === r.cardId);
      return {
        at: r.createdAt.toISOString(),
        type: r.status === "RELEASED" ? "card_cancelled" : r.status === "HELD" ? "card_scheduled" : "card_published",
        premium: r.premium,
        card: c ? { title: isTemplateKey(c.templateKey) ? templates[c.templateKey].title : "Card", slug: c.slug } : null,
      };
    }),
    ...welcome.map((g): ActivityItem => ({ at: g.createdAt.toISOString(), type: "welcome_gift", premium: true, card: null })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
  return { items, nextBefore: items.length === limit ? items[items.length - 1].at : null };
}

/**
 * INTERNAL, authorised-server-side only (no route calls this; tests and the future payments phase do).
 * Moves an account to another purchasable-or-internal plan for the CURRENT period: new period grants are created with the plan's
 * allowance minus what this period already consumed, and the old plan's period grants are expired. Credits already reserved by
 * the old grants stay tied to them (a later cancel restores nothing once they are expired): the full upgrade/downgrade policy is
 * settled in the payments phase, this only guarantees no client path to a plan and no double allowance.
 */
export async function assignPlan(tx: Tx, accountId: string, planKey: string, now: Date): Promise<void> {
  const [acc] = await tx.$queryRaw<WalletAccount[]>`SELECT id::text, "planKey", "periodAnchor" FROM "CreditAccount" WHERE id = ${accountId}::uuid FOR UPDATE`;
  if (!acc) throw new UnsupportedPlanError("No such account");
  if (acc.planKey === planKey) return;
  await loadEntitlements(tx, planKey); // throws for unknown / inactive / unsupported plans
  const old = await ensurePeriodGrants(tx, acc, now);
  const consumed = await tx.$queryRaw<{ unit: "TOTAL" | "PREMIUM"; used: bigint }[]>`
    SELECT unit::text AS unit, COALESCE(SUM(amount - remaining), 0) AS used FROM "CreditGrant"
     WHERE "accountId" = ${accountId}::uuid AND source = 'PLAN_PERIOD' AND "validFrom" = ${old.period.start}::timestamptz GROUP BY unit`;
  const usedOf = (u: "TOTAL" | "PREMIUM") => Number(consumed.find((c) => c.unit === u)?.used ?? 0);
  await tx.$executeRaw`
    WITH due AS (SELECT id, remaining FROM "CreditGrant" WHERE "accountId" = ${accountId}::uuid AND source = 'PLAN_PERIOD' AND "validFrom" = ${old.period.start}::timestamptz AND remaining > 0 FOR UPDATE),
    upd AS (UPDATE "CreditGrant" g SET remaining = 0 FROM due WHERE g.id = due.id RETURNING g.id AS id, due.remaining AS gone)
    INSERT INTO "LedgerEntry" ("accountId","grantId",kind,delta,reason) SELECT ${accountId}::uuid, id, 'EXPIRE', -gone, 'plan changed' FROM upd`;
  await tx.$executeRaw`UPDATE "CreditAccount" SET "planKey" = ${planKey} WHERE id = ${accountId}::uuid`;
  const next = await loadEntitlements(tx, planKey);
  const p = periodFor(acc.periodAnchor, now, next.periodMonths);
  const stamp = p.start.toISOString();
  await grantCredit(tx, { accountId, unit: "TOTAL", source: "PLAN_PERIOD", grantKey: `period:${planKey}:${stamp}:TOTAL`, amount: next.sendsTotal, remaining: Math.max(0, next.sendsTotal - usedOf("TOTAL")), validFrom: p.start, validTo: p.end, reason: "plan changed" });
  if (next.sendsPremium > 0) {
    await grantCredit(tx, { accountId, unit: "PREMIUM", source: "PLAN_PERIOD", grantKey: `period:${planKey}:${stamp}:PREMIUM`, amount: next.sendsPremium, remaining: Math.max(0, next.sendsPremium - usedOf("PREMIUM")), validFrom: p.start, validTo: p.end, reason: "plan changed" });
  }
}
