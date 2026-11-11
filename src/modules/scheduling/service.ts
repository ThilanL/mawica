import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { newSlug } from "@/modules/cards/slug";
import { getTemplate, isAnyTemplateKey, templateTier } from "@/modules/templates/registry";
import { recordAudit } from "@/modules/auth/audit";
import { normalizeEmail } from "@/modules/auth/request";
import { expireGrants, IdempotencyKeyReuseError, requestHash, reserveCredits, settleReservation, ensurePeriodGrants, type Tx } from "@/modules/wallet/engine";
import { ensureWallet } from "@/modules/wallet/wallet";
import type { CreateRecipientInput, CreateScheduleInput, RescheduleInput } from "./schema";
import { UUID_RE } from "./schema";
import { checkWindow, offsetLabel, resolveLocal, type Window } from "./time";

/**
 * Scheduling foundation. A scheduled card is a Card with status SCHEDULED (never public: every public guard requires PUBLISHED) plus a
 * ScheduledDelivery row, created in ONE transaction together with the credit reservation (1 total, +1 premium for a premium card).
 * Nothing here delivers or publishes anything; the reservation stays HELD until a future delivery worker settles it.
 *  - cancel: SCHEDULED -> CANCELLED, release the reservation under the wallet's rule (restore only while the original grant is valid);
 *  - reschedule: only the time changes, the SAME reservation is kept (no second deduction), guarded by a version token;
 *  - every mutation locks the delivery row FOR UPDATE and filters by ownerId, so another account's id is indistinguishable from "not found".
 */
export class ScheduleValidationError extends Error {
  constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) { super(message); }
}
export class ScheduleNotFoundError extends Error {}
export class ScheduleConflictError extends Error {
  constructor(public readonly code: "NOT_CANCELLABLE" | "NOT_EDITABLE" | "STALE_VERSION", message: string, public readonly details: Record<string, unknown> = {}) { super(message); }
}

export type ScheduleDto = {
  id: string;
  status: "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "CANCELLED" | "FAILED";
  channel: "LINK" | "EMAIL";
  deliverAtUtc: string;
  timeZone: string;
  localDate: string;
  localTime: string;
  utcOffsetMinutes: number;
  version: number;
  createdAt: string;
  card: { templateKey: string; title: string; premium: boolean; recipientName: string; senderName: string; message: string };
  recipient: { id: string; name: string } | null;
  /** Credits held for this schedule right now (0 once cancelled or finished). */
  creditsReserved: number;
  /** The live link: present ONLY once the card has been published (never before). */
  link: string | null;
  failureNote: string | null;
  /** FAILED only: whether the held credit was released ("returned") or is being reviewed ("under_review"). Mirrors what the engine did; no credit rule changed. */
  creditOutcome: "returned" | "under_review" | null;
};

type Row = Prisma.ScheduledDeliveryGetPayload<{ include: { card: true; recipient: { select: { id: true; name: true } }; reservation: { select: { status: true } } } }>;
const toDto = (r: Row): ScheduleDto => {
  const premium = r.card.tier === "PREMIUM";
  return {
    id: r.id, status: r.status, channel: r.channel, deliverAtUtc: r.deliverAtUtc.toISOString(), timeZone: r.timeZone, localDate: r.localDate, localTime: r.localTime,
    utcOffsetMinutes: r.utcOffsetMinutes, version: r.version, createdAt: r.createdAt.toISOString(),
    card: { templateKey: r.card.templateKey, title: isAnyTemplateKey(r.card.templateKey) ? getTemplate(r.card.templateKey).title : "Card", premium, recipientName: r.card.recipientName, senderName: r.card.senderName, message: r.card.message },
    recipient: r.recipient ? { id: r.recipient.id, name: r.recipient.name } : null,
    creditsReserved: r.status === "SCHEDULED" || r.status === "PROCESSING" ? (premium ? 2 : 1) : 0,
    link: r.status === "PUBLISHED" ? `${env.NEXT_PUBLIC_SITE_URL}/c/${r.card.slug}` : null,
    failureNote: r.status !== "FAILED" ? null
      : r.reservation.status === "RELEASED" ? "We couldn't publish this card, and nothing was sent to anyone. The credit held for it was released."
      : "We couldn't publish this card, and nothing was sent to anyone. We're reviewing it before releasing its credit.",
    creditOutcome: r.status !== "FAILED" ? null : r.reservation.status === "RELEASED" ? "returned" : "under_review",
  };
};
const include = { card: true, recipient: { select: { id: true, name: true } }, reservation: { select: { status: true } } } as const;

const windowDetails = (w: Window, months: number) => ({ earliest: w.earliest.toISOString(), latest: w.latest.toISOString(), monthsAhead: months });

/** Resolves + validates the requested local time against the account's horizon. Throws ScheduleValidationError. */
function resolveAndCheck(when: { localDate: string; localTime: string; timeZone: string; ambiguity?: "earlier" | "later" }, now: Date, months: number) {
  const r = resolveLocal(when.localDate, when.localTime, when.timeZone, when.ambiguity);
  switch (r.kind) {
    case "invalid": {
      const m = { DATE: ["INVALID_DATE", "Choose a real calendar date."], TIME: ["INVALID_TIME", "Choose a valid time."], ZONE: ["INVALID_ZONE", "Choose a valid time zone."] }[r.reason];
      throw new ScheduleValidationError(m[0], m[1]);
    }
    case "nonexistent":
      throw new ScheduleValidationError("NONEXISTENT_LOCAL_TIME", `${when.localTime} doesn't exist on ${when.localDate} in ${when.timeZone}: the clocks skip forward that day. Please choose a valid time.`, { gapMinutes: r.gapMinutes, suggestion: r.suggestion });
    case "ambiguous":
      throw new ScheduleValidationError("AMBIGUOUS_LOCAL_TIME", `${when.localTime} happens twice on ${when.localDate} in ${when.timeZone}: the clocks go back that day. Choose which one you mean.`, { options: r.options.map((o) => ({ choice: o.choice, offsetMinutes: o.offsetMinutes, offset: offsetLabel(o.offsetMinutes), utc: o.instant.toISOString() })) });
  }
  const w = checkWindow(r.instant, now, months);
  if (!w.ok) {
    throw new ScheduleValidationError(w.code, w.code === "IN_THE_PAST" ? "Choose a time that's still in the future (at least 5 minutes from now)." : `You can schedule up to ${months} calendar month${months === 1 ? "" : "s"} ahead.`, windowDetails(w.window, months));
  }
  return r;
}

async function horizonMonths(tx: Tx, user: { id: string; email: string; emailVerified: boolean }, now: Date): Promise<{ months: number; account: { id: string; planKey: string; periodAnchor: Date } }> {
  const account = await ensureWallet(tx, user, now);
  await expireGrants(tx, account.id, now);
  const { entitlements } = await ensurePeriodGrants(tx, account, now);
  return { months: entitlements.scheduleMonthsAhead ?? 1, account };
}

export async function createSchedule(
  input: CreateScheduleInput,
  user: { id: string; email: string; emailVerified: boolean },
  opts: { idempotencyKey: string; now?: Date },
): Promise<{ schedule: ScheduleDto; replay: boolean; premiumRemaining?: number }> {
  if (input.channel !== "LINK") throw new ScheduleValidationError("CHANNEL_UNAVAILABLE", "Email delivery isn't available yet. Schedule a link card instead.");
  const tier = templateTier(input.templateKey);
  const now = opts.now ?? new Date();
  const fingerprint = {
    templateKey: input.templateKey, recipientName: input.recipientName, senderName: input.senderName, message: input.message,
    recipientId: input.recipientId ?? null, saveRecipient: input.saveRecipient, recipientEmail: input.recipientEmail ?? null, channel: input.channel,
    schedule: { localDate: input.schedule.localDate, localTime: input.schedule.localTime, timeZone: input.schedule.timeZone, ambiguity: input.schedule.ambiguity ?? null },
  };
  const hash = requestHash(fingerprint);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const out = await db.$transaction(async (tx) => {
        // Replays never re-validate the time (it may legitimately have moved into the past since): they return what already exists.
        const existing = await tx.scheduledDelivery.findUnique({ where: { ownerId_idempotencyKey: { ownerId: user.id, idempotencyKey: opts.idempotencyKey } }, include });
        if (existing) {
          if (existing.requestHash !== hash) throw new IdempotencyKeyReuseError();
          return { schedule: toDto(existing), replay: true };
        }
        const { months, account } = await horizonMonths(tx, user, now);
        const when = resolveAndCheck(input.schedule, now, months);

        if (input.recipientId && !(await tx.recipient.findFirst({ where: { id: input.recipientId, ownerId: user.id }, select: { id: true } }))) throw new ScheduleNotFoundError("recipient");

        const res = await reserveCredits(tx, account, { key: opts.idempotencyKey, request: fingerprint, premium: tier === "PREMIUM", deliverAt: when.instant, now });
        if (res.replay) {
          // Same key + same request already reserved (a concurrent twin committed first): return its schedule.
          const row = await tx.scheduledDelivery.findUnique({ where: { reservationId: res.reservationId }, include });
          if (!row) throw new IdempotencyKeyReuseError(); // the key was used by a publish, not a schedule
          return { schedule: toDto(row), replay: true };
        }

        let recipientId: string | null = input.recipientId ?? null;
        if (!recipientId && (input.saveRecipient || input.recipientEmail)) {
          recipientId = (await upsertRecipient(tx, user.id, { name: input.recipientName, timeZone: input.schedule.timeZone, email: input.recipientEmail, senderAttestsPermission: input.senderAttestsPermission }, now)).id;
        }

        const card = await tx.card.create({
          data: { slug: newSlug(), templateKey: input.templateKey, recipientName: input.recipientName, senderName: input.senderName, message: input.message, ownerId: user.id, tier, status: "SCHEDULED" },
          select: { id: true },
        });
        // Link the held reservation to its card (allowed while HELD) so the wallet can show it.
        await tx.$executeRaw`UPDATE "CreditReservation" SET "cardId" = ${card.id}::uuid WHERE id = ${res.reservationId}::uuid AND status = 'HELD'`;
        const row = await tx.scheduledDelivery.create({
          data: {
            ownerId: user.id, cardId: card.id, recipientId, channel: "LINK", status: "SCHEDULED", deliverAtUtc: when.instant, timeZone: input.schedule.timeZone,
            localDate: input.schedule.localDate, localTime: input.schedule.localTime, utcOffsetMinutes: when.offsetMinutes, reservationId: res.reservationId,
            idempotencyKey: opts.idempotencyKey, requestHash: hash, nextAttemptAt: when.instant, updatedAt: now,
          },
          include,
        });
        return { schedule: toDto(row), replay: false };
      }, { timeout: 15000, maxWait: 15000 });
      if (!out.replay) await recordAudit("schedule.created", { userId: user.id, meta: { premium: tier === "PREMIUM" } });
      return out;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // Either a slug collision or a concurrent twin with the same idempotency key; both are safe to retry (the whole transaction rolled back).
        continue;
      }
      throw e;
    }
  }
  throw new Error("Could not create the schedule");
}

type Owner = { id: string; email: string; emailVerified: boolean };

type LockedRow = { id: string; status: string; version: number; reservationId: string; cardId: string; accountId: string };
async function lockOwned(tx: Tx, ownerId: string, id: string): Promise<LockedRow> {
  if (!UUID_RE.test(id)) throw new ScheduleNotFoundError("schedule");
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT d.id::text, d.status::text AS status, d.version, d."reservationId"::text AS "reservationId", d."cardId"::text AS "cardId", r."accountId"::text AS "accountId"
      FROM "ScheduledDelivery" d JOIN "CreditReservation" r ON r.id = d."reservationId" JOIN "CreditAccount" a ON a.id = r."accountId"
     WHERE d.id = ${id}::uuid AND d."ownerId" = ${ownerId}::uuid AND a."userId" = ${ownerId}::uuid
       FOR UPDATE OF d`;
  if (!rows[0]) throw new ScheduleNotFoundError("schedule"); // not yours and not existing look identical
  return rows[0];
}

/** Cancel a schedule that has not entered delivery processing. Idempotent: cancelling again returns the same result and changes nothing. */
export async function cancelSchedule(user: Owner, id: string, now = new Date()): Promise<{ schedule: ScheduleDto; changed: boolean }> {
  const out = await db.$transaction(async (tx) => {
    const l = await lockOwned(tx, user.id, id);
    let changed = false;
    if (l.status !== "CANCELLED") {
      if (l.status !== "SCHEDULED") throw new ScheduleConflictError("NOT_CANCELLABLE", "This card is already being delivered or has been delivered, so it can't be cancelled.", { status: l.status });
      const upd = await tx.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'CANCELLED', "cancelledAt" = ${now}, "updatedAt" = ${now}, version = version + 1 WHERE id = ${l.id}::uuid AND status = 'SCHEDULED'`;
      if (upd !== 1) throw new ScheduleConflictError("NOT_CANCELLABLE", "This schedule just changed. Please refresh.");
      await settleReservation(tx, l.accountId, l.reservationId, "RELEASE", { now }); // the wallet's rule: restore only inside the original period
      await tx.$executeRaw`UPDATE "Card" SET status = 'CANCELLED' WHERE id = ${l.cardId}::uuid AND status = 'SCHEDULED'`;
      changed = true;
    }
    const row = await tx.scheduledDelivery.findUniqueOrThrow({ where: { id: l.id }, include });
    return { schedule: toDto(row), changed };
  }, { timeout: 15000, maxWait: 15000 });
  if (out.changed) await recordAudit("schedule.cancelled", { userId: user.id });
  return out;
}

/** Change the delivery time of a SCHEDULED card. The same reservation is kept: no second deduction. `version` guards against races. */
export async function rescheduleSchedule(user: Owner, id: string, input: RescheduleInput, now = new Date()): Promise<{ schedule: ScheduleDto; changed: boolean }> {
  const out = await db.$transaction(async (tx) => {
    const l = await lockOwned(tx, user.id, id);
    if (l.status !== "SCHEDULED") throw new ScheduleConflictError("NOT_EDITABLE", l.status === "CANCELLED" ? "This schedule was cancelled." : "This card is already being delivered or has been delivered.", { status: l.status });
    if (l.version !== input.version) throw new ScheduleConflictError("STALE_VERSION", "This schedule changed in another tab or device. Please refresh and try again.", { currentVersion: l.version });
    const { months } = await horizonMonths(tx, user, now);
    const when = resolveAndCheck(input, now, months);
    const cur = await tx.scheduledDelivery.findUniqueOrThrow({ where: { id: l.id }, include });
    if (cur.deliverAtUtc.getTime() === when.instant.getTime() && cur.timeZone === input.timeZone && cur.localDate === input.localDate && cur.localTime === input.localTime) return { schedule: toDto(cur), changed: false };
    const upd = await tx.$executeRaw`
      UPDATE "ScheduledDelivery" SET "deliverAtUtc" = ${when.instant}, "nextAttemptAt" = ${when.instant}, "timeZone" = ${input.timeZone}, "localDate" = ${input.localDate}, "localTime" = ${input.localTime},
             "utcOffsetMinutes" = ${when.offsetMinutes}, version = version + 1, "updatedAt" = ${now},
             "attemptBase" = "attemptCount" -- a new time restarts the retry budget (lifetime cap still applies); see docs/delivery.md
       WHERE id = ${l.id}::uuid AND status = 'SCHEDULED' AND version = ${input.version}`;
    if (upd !== 1) throw new ScheduleConflictError("STALE_VERSION", "This schedule changed. Please refresh and try again.");
    await tx.$executeRaw`UPDATE "CreditReservation" SET "deliverAt" = ${when.instant} WHERE id = ${l.reservationId}::uuid AND status = 'HELD'`;
    return { schedule: toDto(await tx.scheduledDelivery.findUniqueOrThrow({ where: { id: l.id }, include })), changed: true };
  }, { timeout: 15000, maxWait: 15000 });
  if (out.changed) await recordAudit("schedule.rescheduled", { userId: user.id });
  return out;
}

/** The signed-in user's own schedules, soonest first. Another account's rows are never selected (ownerId filter). */
export async function listSchedules(ownerId: string): Promise<ScheduleDto[]> {
  const rows = await db.scheduledDelivery.findMany({ where: { ownerId }, include, orderBy: [{ deliverAtUtc: "asc" }], take: 200 });
  const live = rows.filter((r) => r.status === "SCHEDULED" || r.status === "PROCESSING");
  const past = rows.filter((r) => !(r.status === "SCHEDULED" || r.status === "PROCESSING")).reverse();
  return [...live, ...past].map(toDto);
}

// ------------------------------------------------------------------ recipients (minimal)
export type RecipientDto = { id: string; name: string; timeZone: string; hasEmail: boolean };
const rdto = (r: { id: string; name: string; timeZone: string; email: string | null }): RecipientDto => ({ id: r.id, name: r.name, timeZone: r.timeZone, hasEmail: !!r.email });

async function upsertRecipient(tx: Tx, ownerId: string, raw: CreateRecipientInput, now: Date) {
  // Normalise here too (the DB requires lowercase), so callers that bypass the zod schema cannot store a mixed-case address.
  const email = raw.email ? normalizeEmail(raw.email) : null;
  if (raw.email && !email) throw new ScheduleValidationError("INVALID_EMAIL", "Enter a valid email address.");
  const input = { ...raw, email: email ?? undefined };
  if (input.email) {
    const byMail = await tx.recipient.findUnique({ where: { ownerId_email: { ownerId, email: input.email } } });
    if (byMail) return byMail;
  } else {
    const same = await tx.recipient.findFirst({ where: { ownerId, email: null, name: { equals: input.name, mode: "insensitive" }, timeZone: input.timeZone } });
    if (same) return same;
  }
  return tx.recipient.create({ data: { ownerId, name: input.name, timeZone: input.timeZone, email: input.email ?? null, senderAttestedAt: input.email ? now : null } });
}

export async function createRecipient(ownerId: string, input: CreateRecipientInput, now = new Date()): Promise<RecipientDto> {
  const { isKnownTimeZone } = await import("./time");
  if (!isKnownTimeZone(input.timeZone)) throw new ScheduleValidationError("INVALID_ZONE", "Choose a valid time zone.");
  const count = await db.recipient.count({ where: { ownerId } });
  if (count >= 200) throw new ScheduleValidationError("TOO_MANY_RECIPIENTS", "You've reached the limit of 200 saved recipients.");
  return rdto(await db.$transaction((tx) => upsertRecipient(tx, ownerId, input, now)));
}

export async function listRecipients(ownerId: string): Promise<RecipientDto[]> {
  return (await db.recipient.findMany({ where: { ownerId }, orderBy: [{ name: "asc" }], take: 200 })).map(rdto);
}
