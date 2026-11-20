import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getPublishedCard } from "@/modules/cards/service";
import { balances, IdempotencyKeyReuseError, InsufficientCreditsError, reconcile, releaseAllHeld, type Tx } from "@/modules/wallet/engine";
import { assignPlan, ensureWallet, walletActivity, welcomeHash } from "@/modules/wallet/wallet";
import { publishOwnedCard } from "@/modules/wallet/publish";
import { cancelSchedule, createRecipient, createSchedule, listRecipients, listSchedules, rescheduleSchedule, ScheduleConflictError, ScheduleNotFoundError, ScheduleValidationError } from "@/modules/scheduling/service";
import { createScheduleSchema, rescheduleSchema } from "@/modules/scheduling/schema";

const users: string[] = [];
const emails: string[] = [];
const run = <T,>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30000, maxWait: 30000 });
const key = (s: string) => s.padEnd(16, "-");
const NOW = new Date("2026-09-20T00:00:00.000Z"); // Free horizon ends 2026-10-20; the Melbourne spring-forward gap (4 Oct) is inside it
const NOW_PLUS = new Date("2026-11-11T00:00:00.000Z");

async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@sched.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
type User = Awaited<ReturnType<typeof mkUser>>;
const base = { templateKey: "snow-globe" as const, recipientName: "SchedTest", senderName: "Sam", message: "Happy days", musicTrackId: "snowlight-on-the-sleigh-path" as const, saveRecipient: true, channel: "LINK" as const };
const when = (localDate: string, localTime = "09:00", timeZone = "UTC", ambiguity?: "earlier" | "later") => ({ localDate, localTime, timeZone, ...(ambiguity ? { ambiguity } : {}) });
const input = (over: Partial<Parameters<typeof createSchedule>[0]> & { schedule?: ReturnType<typeof when> } = {}) => ({ ...base, schedule: when("2026-10-01"), ...over }) as Parameters<typeof createSchedule>[0];
const sched = (u: User, k: string, over = {}, now = NOW) => createSchedule(input(over), u, { idempotencyKey: key(k), now });
const accountOf = async (u: User) => (await db.creditAccount.findUniqueOrThrow({ where: { userId: u.id } }));
const bal = async (u: User, now = NOW) => { const a = await accountOf(u); const b = await run((tx) => balances(tx, a.id, now)); return { total: b.total, premium: b.premium }; };
const drift = async () => run((tx) => reconcile(tx));
const fails = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

afterAll(async () => {
  const accs = (await db.creditAccount.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((a) => a.id);
  await db.card.updateMany({ where: { ownerId: { in: users } }, data: { recipientName: "SchedTest" } });
  await db.user.deleteMany({ where: { id: { in: users } } }); // cascades deliveries and recipients
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.card.deleteMany({ where: { recipientName: "SchedTest", ownerId: null } });
  await db.$disconnect();
});

describe("creating a schedule", () => {
  it("creates a hidden SCHEDULED card, a delivery row and one held credit, atomically", async () => {
    const u = await mkUser();
    const { schedule, replay } = await sched(u, "c1", { schedule: when("2026-10-01", "09:00", "Asia/Colombo") });
    expect(replay).toBe(false);
    expect(schedule).toMatchObject({ status: "SCHEDULED", channel: "LINK", timeZone: "Asia/Colombo", localDate: "2026-10-01", localTime: "09:00", utcOffsetMinutes: 330, deliverAtUtc: "2026-10-01T03:30:00.000Z", version: 0, creditsReserved: 1 });
    const d = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id }, include: { card: true, recipient: true } });
    expect(d.card).toMatchObject({ status: "SCHEDULED", ownerId: u.id, tier: "STANDARD" });
    expect(d.recipient).toMatchObject({ name: "SchedTest", timeZone: "Asia/Colombo", email: null });
    expect(d.nextAttemptAt.toISOString()).toBe(d.deliverAtUtc.toISOString());
    const res = await db.creditReservation.findUniqueOrThrow({ where: { id: d.reservationId } });
    expect(res).toMatchObject({ status: "HELD", premium: false, cardId: d.cardId });
    expect(await bal(u)).toEqual({ total: 9, premium: 1 });
    expect(await getPublishedCard(d.card.slug)).toBeNull(); // not public before delivery
    expect(await drift()).toEqual([]);
  });
  it("a premium card reserves one total AND one premium credit; the next premium schedule is refused and rolls back completely", async () => {
    const u = await mkUser();
    const a = await sched(u, "p1", { templateKey: "lumis-wish" });
    expect(a.schedule).toMatchObject({ creditsReserved: 2, card: { premium: true } });
    expect(await bal(u)).toEqual({ total: 9, premium: 0 });
    const cards = await db.card.count({ where: { ownerId: u.id } });
    const err = await fails(sched(u, "p2", { templateKey: "lumis-wish", message: "second" }));
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(await bal(u)).toEqual({ total: 9, premium: 0 });
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(cards);
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(1);
    expect(await db.creditReservation.count({ where: { account: { userId: u.id } } })).toBe(1);
    expect(await drift()).toEqual([]);
  });
  it("is atomic when a later step fails: nothing is reserved, created or left behind", async () => {
    const u = await mkUser();
    const other = await mkUser();
    const otherRecipient = await createRecipient(other.id, { name: "Other", timeZone: "UTC" });
    const err = await fails(sched(u, "a1", { recipientId: otherRecipient.id })); // fails AFTER the wallet is bootstrapped, before any card
    expect(err).toBeInstanceOf(ScheduleNotFoundError);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await db.creditReservation.count({ where: { account: { userId: u.id } } })).toBe(0);
  });
  it("only the LINK channel works today; EMAIL is refused with a clear code", async () => {
    const u = await mkUser();
    const err = await fails(sched(u, "e1", { channel: "EMAIL" }));
    expect(err).toBeInstanceOf(ScheduleValidationError);
    expect((err as ScheduleValidationError).code).toBe("CHANNEL_UNAVAILABLE");
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(0);
  });
  it("schedules and publishes share one wallet: scheduling reserves, wallet activity shows it as scheduled", async () => {
    const u = await mkUser();
    await sched(u, "w1");
    await publishOwnedCard({ templateKey: "snow-globe", recipientName: "SchedTest", senderName: "S", message: "now" , musicTrackId: "snowlight-on-the-sleigh-path" }, u, { idempotencyKey: key("w2"), now: NOW });
    expect(await bal(u)).toEqual({ total: 8, premium: 1 });
    const act = await walletActivity(u.id);
    expect(act.items.map((i) => i.type).sort()).toEqual(["card_published", "card_scheduled", "welcome_gift"]);
  });
});

describe("scheduling horizon (server-side)", () => {
  it("Free: exactly one calendar month ahead is allowed, one minute more is not", async () => {
    const u = await mkUser();
    await sched(u, "h1", { schedule: when("2026-10-20", "00:00") });
    const err = (await fails(sched(u, "h2", { schedule: when("2026-10-20", "00:01") }))) as ScheduleValidationError;
    expect(err.code).toBe("TOO_FAR");
    expect(err.details).toMatchObject({ monthsAhead: 1, latest: "2026-10-20T00:00:00.000Z" });
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(1);
  });
  it("calendar months, not 30 days: from 31 Jan the Free limit is 28 Feb", async () => {
    const u = await mkUser();
    const now = new Date("2027-01-31T00:00:00Z");
    await sched(u, "m1", { schedule: when("2027-02-28", "00:00") }, now);
    expect(((await fails(sched(u, "m2", { schedule: when("2027-03-01", "00:00") }, now))) as ScheduleValidationError).code).toBe("TOO_FAR");
  });
  it("Plus: up to 12 calendar months (granted only by the server-side plan), Free cannot use it", async () => {
    const plus = await mkUser(), free = await mkUser();
    await run(async (tx) => { const a = await ensureWallet(tx, plus, NOW_PLUS); await assignPlan(tx, a.id, "plus", NOW_PLUS); });
    await sched(plus, "pl1", { schedule: when("2027-11-11", "00:00") }, NOW_PLUS);
    expect(((await fails(sched(plus, "pl2", { schedule: when("2027-11-11", "00:01") }, NOW_PLUS))) as ScheduleValidationError).code).toBe("TOO_FAR");
    expect(((await fails(sched(free, "pl3", { schedule: when("2027-06-01") }, NOW_PLUS))) as ScheduleValidationError).code).toBe("TOO_FAR");
  });
  it("past times and times inside the 5-minute lead are refused; 5 minutes is accepted", async () => {
    const u = await mkUser();
    for (const [i, d] of [["2026-09-19", "23:59"], ["2020-01-01", "00:00"], ["2026-09-20", "00:04"]].entries()) {
      expect(((await fails(sched(u, `pa${i}`, { schedule: when(d[0], d[1]) }))) as ScheduleValidationError).code).toBe("IN_THE_PAST");
    }
    await sched(u, "pa9", { schedule: when("2026-09-20", "00:05") });
  });
  it("invalid dates, times and zones are rejected with specific codes", async () => {
    const u = await mkUser();
    const code = async (s: ReturnType<typeof when>) => ((await fails(sched(u, `iv${Math.random()}`.slice(0, 15), { schedule: s }))) as ScheduleValidationError).code;
    expect(await code(when("2026-02-30"))).toBe("INVALID_DATE");
    expect(await code({ localDate: "2026-10-01", localTime: "25:00", timeZone: "UTC" })).toBe("INVALID_TIME");
    expect(await code(when("2026-10-01", "09:00", "Mars/Olympus"))).toBe("INVALID_ZONE");
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(0);
  });
});

describe("daylight saving", () => {
  it("a nonexistent local time is refused (never shifted) and costs nothing", async () => {
    const u = await mkUser();
    const err = (await fails(sched(u, "d1", { schedule: when("2026-10-04", "02:30", "Australia/Melbourne") }))) as ScheduleValidationError;
    expect(err.code).toBe("NONEXISTENT_LOCAL_TIME");
    expect(err.details).toMatchObject({ gapMinutes: 60, suggestion: { localDate: "2026-10-04", localTime: "03:30" } });
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await db.creditReservation.count({ where: { account: { userId: u.id } } })).toBe(0);
  });
  it("an ambiguous local time needs an explicit choice; each choice stores its own instant and offset", async () => {
    const plus = await mkUser();
    await run(async (tx) => { const a = await ensureWallet(tx, plus, NOW_PLUS); await assignPlan(tx, a.id, "plus", NOW_PLUS); });
    const s = when("2027-04-04", "02:30", "Australia/Melbourne");
    const err = (await fails(sched(plus, "a0", { schedule: s }, NOW_PLUS))) as ScheduleValidationError;
    expect(err.code).toBe("AMBIGUOUS_LOCAL_TIME");
    expect((err.details.options as { choice: string; offsetMinutes: number }[]).map((o) => [o.choice, o.offsetMinutes])).toEqual([["earlier", 660], ["later", 600]]);
    const e = await sched(plus, "a1", { schedule: { ...s, ambiguity: "earlier" } }, NOW_PLUS);
    const l = await sched(plus, "a2", { schedule: { ...s, ambiguity: "later" }, message: "later" }, NOW_PLUS);
    expect([e.schedule.deliverAtUtc, e.schedule.utcOffsetMinutes]).toEqual(["2027-04-03T15:30:00.000Z", 660]);
    expect([l.schedule.deliverAtUtc, l.schedule.utcOffsetMinutes]).toEqual(["2027-04-03T16:30:00.000Z", 600]);
    expect(e.schedule.localTime).toBe("02:30"); // the intended wall-clock is preserved either way
  });
  it("a schedule keeps its wall-clock when the zone's offset changes later (stored local time + zone, plus the resolved offset)", async () => {
    const u = await mkUser();
    const a = await sched(u, "w1", { schedule: when("2026-09-28", "09:00", "Australia/Melbourne") }); // +10 (before DST starts on 4 Oct)
    const b = await sched(u, "w2", { schedule: when("2026-10-10", "09:00", "Australia/Melbourne"), message: "later" }); // +11
    expect([a.schedule.localTime, a.schedule.utcOffsetMinutes, a.schedule.deliverAtUtc]).toEqual(["09:00", 600, "2026-09-27T23:00:00.000Z"]);
    expect([b.schedule.localTime, b.schedule.utcOffsetMinutes, b.schedule.deliverAtUtc]).toEqual(["09:00", 660, "2026-10-09T22:00:00.000Z"]);
  });
});

describe("idempotency", () => {
  it("replaying the same key and request returns the same schedule: one card, one reservation, one credit", async () => {
    const u = await mkUser();
    const a = await sched(u, "i1");
    const b = await sched(u, "i1");
    expect(b.replay).toBe(true);
    expect(b.schedule.id).toBe(a.schedule.id);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
    expect((await bal(u)).total).toBe(9);
  });
  it("a replay after the time has passed still returns the original (no re-validation)", async () => {
    const u = await mkUser();
    const a = await sched(u, "i2", { schedule: when("2026-09-25") });
    const later = await sched(u, "i2", { schedule: when("2026-09-25") }, new Date("2026-10-30T00:00:00Z"));
    expect(later).toMatchObject({ replay: true, schedule: { id: a.schedule.id } });
  });
  it("the same key with a different request is refused and spends nothing", async () => {
    const u = await mkUser();
    await sched(u, "i3");
    expect(await fails(sched(u, "i3", { message: "different" }))).toBeInstanceOf(IdempotencyKeyReuseError);
    expect(await fails(sched(u, "i3", { schedule: when("2026-10-02") }))).toBeInstanceOf(IdempotencyKeyReuseError);
    expect((await bal(u)).total).toBe(9);
  });
  it("a key already used by a publish cannot be replayed as a schedule", async () => {
    const u = await mkUser();
    await publishOwnedCard({ templateKey: "snow-globe", recipientName: "SchedTest", senderName: "S", message: "m" , musicTrackId: "snowlight-on-the-sleigh-path" }, u, { idempotencyKey: key("x1"), now: NOW });
    expect(await fails(sched(u, "x1"))).toBeInstanceOf(IdempotencyKeyReuseError);
  });
  it("15 concurrent duplicates create exactly one schedule", async () => {
    const u = await mkUser();
    const r = await Promise.all(Array.from({ length: 15 }, () => sched(u, "dup15")));
    expect(new Set(r.map((x) => x.schedule.id)).size).toBe(1);
    expect(r.filter((x) => !x.replay)).toHaveLength(1);
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1);
    expect((await bal(u)).total).toBe(9);
  });
});

describe("concurrency against limited credits", () => {
  it("30 concurrent schedules against 10 credits: exactly 10 succeed, 20 refused, balance 0, ledger reconciles", async () => {
    const u = await mkUser();
    const r = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => sched(u, `cc${i}`, { message: `m${i}` })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect(r.filter((x) => x.status === "rejected" && x.reason instanceof InsufficientCreditsError)).toHaveLength(20);
    expect(await db.scheduledDelivery.count({ where: { ownerId: u.id } })).toBe(10);
    expect(await db.card.count({ where: { ownerId: u.id, status: "SCHEDULED" } })).toBe(10);
    expect((await bal(u)).total).toBe(0);
    expect(await drift()).toEqual([]);
  });
  it("schedules and immediate publishes compete for the same credits without overspending", async () => {
    const u = await mkUser();
    const ops = Array.from({ length: 24 }, (_, i) => i % 2
      ? sched(u, `mx${i}`, { message: `s${i}` }).then((x) => x.schedule.id)
      : publishOwnedCard({ templateKey: "snow-globe", recipientName: "SchedTest", senderName: "S", message: `p${i}`, musicTrackId: "snowlight-on-the-sleigh-path" }, u, { idempotencyKey: key(`mp${i}`), now: NOW }).then((x) => x.slug));
    const r = await Promise.allSettled(ops);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect((await bal(u)).total).toBe(0);
    expect(await drift()).toEqual([]);
  });
  it("20 concurrent premium schedules with one premium credit: exactly one", async () => {
    const u = await mkUser();
    const r = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => sched(u, `pr${i}`, { templateKey: "lumis-wish", message: `m${i}` })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await bal(u)).toEqual({ total: 9, premium: 0 });
    expect(await drift()).toEqual([]);
  });
});

describe("cancellation", () => {
  it("releases the credits, hides the card for good, and is idempotent", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "x1", { templateKey: "lumis-wish" });
    expect(await bal(u)).toEqual({ total: 9, premium: 0 });
    const c1 = await cancelSchedule(u, schedule.id, NOW);
    expect(c1).toMatchObject({ changed: true, schedule: { status: "CANCELLED", creditsReserved: 0 } });
    expect(await bal(u)).toEqual({ total: 10, premium: 1 });
    const c2 = await cancelSchedule(u, schedule.id, NOW);
    expect(c2).toMatchObject({ changed: false, schedule: { status: "CANCELLED" } });
    expect(await bal(u)).toEqual({ total: 10, premium: 1 }); // no double restore
    const d = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id }, include: { card: true } });
    expect(d.card.status).toBe("CANCELLED");
    expect(d.cancelledAt).not.toBeNull();
    expect(await getPublishedCard(d.card.slug)).toBeNull();
    expect(await db.card.count({ where: { ownerId: u.id } })).toBe(1); // no second card
    expect(await drift()).toEqual([]);
  });
  it("20 concurrent cancels change the schedule once and restore exactly once", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "x2");
    const r = await Promise.all(Array.from({ length: 20 }, () => cancelSchedule(u, schedule.id, NOW)));
    expect(r.filter((x) => x.changed)).toHaveLength(1);
    expect((await bal(u)).total).toBe(10);
    expect(await drift()).toEqual([]);
  });
  it("after the original allowance period has ended nothing is restored and nothing is added to the new period", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "x3", { schedule: when("2026-10-15") });
    const later = new Date("2026-10-25T00:00:00Z"); // the account's first period (from 20 Sep) ended on 20 Oct
    await run(async (tx) => { const a = await accountOf(u); const { ensurePeriodGrants } = await import("@/modules/wallet/engine"); await ensurePeriodGrants(tx, a, later); });
    const before = await bal(u, later);
    await cancelSchedule(u, schedule.id, later);
    expect(await bal(u, later)).toEqual(before);
    const entry = await db.ledgerEntry.findFirst({ where: { reservationId: (await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } })).reservationId, kind: "RELEASE" } });
    expect(entry).toMatchObject({ delta: 0, reason: "grant expired" });
    expect(await drift()).toEqual([]);
  });
  it("a schedule that is being delivered cannot be cancelled", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "x4");
    await db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'PROCESSING', "leaseToken" = gen_random_uuid(), "leaseOwner" = 'test', "leaseExpiresAt" = now() + interval '5 minutes', "attemptCount" = "attemptCount" + 1, "updatedAt" = now() WHERE id = ${schedule.id}::uuid`;
    const err = (await fails(cancelSchedule(u, schedule.id, NOW))) as ScheduleConflictError;
    expect(err).toBeInstanceOf(ScheduleConflictError);
    expect(err.code).toBe("NOT_CANCELLABLE");
    expect((await bal(u)).total).toBe(9);
  });
});

describe("rescheduling", () => {
  it("changes only the time: same reservation, no second deduction, version bumps, card stays hidden", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "r1", { templateKey: "lumis-wish" });
    const before = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } });
    const r = await rescheduleSchedule(u, schedule.id, { ...when("2026-10-10", "18:30", "Asia/Colombo"), version: 0 }, NOW);
    expect(r).toMatchObject({ changed: true, schedule: { version: 1, deliverAtUtc: "2026-10-10T13:00:00.000Z", localTime: "18:30", timeZone: "Asia/Colombo", creditsReserved: 2 } });
    const after = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id }, include: { card: true } });
    expect(after.reservationId).toBe(before.reservationId);
    expect(after.nextAttemptAt.toISOString()).toBe("2026-10-10T13:00:00.000Z");
    expect(await db.creditReservation.count({ where: { account: { userId: u.id } } })).toBe(1);
    expect(await bal(u)).toEqual({ total: 9, premium: 0 });
    expect(after.card.status).toBe("SCHEDULED");
    expect((await db.creditReservation.findUniqueOrThrow({ where: { id: after.reservationId } })).deliverAt?.toISOString()).toBe("2026-10-10T13:00:00.000Z");
    expect(await drift()).toEqual([]);
  });
  it("a stale version is refused; an identical request is a no-op", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "r2");
    await rescheduleSchedule(u, schedule.id, { ...when("2026-10-05"), version: 0 }, NOW);
    const stale = (await fails(rescheduleSchedule(u, schedule.id, { ...when("2026-10-06"), version: 0 }, NOW))) as ScheduleConflictError;
    expect(stale.code).toBe("STALE_VERSION");
    expect(stale.details.currentVersion).toBe(1);
    expect(await rescheduleSchedule(u, schedule.id, { ...when("2026-10-05"), version: 1 }, NOW)).toMatchObject({ changed: false, schedule: { version: 1 } });
  });
  it("12 concurrent reschedules from the same version: exactly one wins", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "r3");
    const r = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => rescheduleSchedule(u, schedule.id, { ...when(`2026-10-${String(2 + i).padStart(2, "0")}`), version: 0 }, NOW)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected" && (x.reason as ScheduleConflictError).code === "STALE_VERSION")).toHaveLength(11);
    expect((await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } })).version).toBe(1);
    expect((await bal(u)).total).toBe(9);
  });
  it("reschedule and cancel racing: the outcome is consistent and credits are released at most once", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "r4");
    const r = await Promise.allSettled([rescheduleSchedule(u, schedule.id, { ...when("2026-10-08"), version: 0 }, NOW), cancelSchedule(u, schedule.id, NOW), cancelSchedule(u, schedule.id, NOW)]);
    const row = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(["SCHEDULED", "CANCELLED"]).toContain(row.status);
    expect((await bal(u)).total).toBe(row.status === "CANCELLED" ? 10 : 9);
    expect(r.filter((x) => x.status === "fulfilled").length).toBeGreaterThanOrEqual(2);
    expect(await drift()).toEqual([]);
  });
  it("refuses invalid, past and too-far times without changing anything, and refuses edits to cancelled schedules", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "r5");
    const code = async (w: ReturnType<typeof when>) => ((await fails(rescheduleSchedule(u, schedule.id, { ...w, version: 0 }, NOW))) as ScheduleValidationError).code;
    expect(await code(when("2026-09-19"))).toBe("IN_THE_PAST");
    expect(await code(when("2026-12-25"))).toBe("TOO_FAR");
    expect(await code(when("2026-10-04", "02:30", "Australia/Melbourne"))).toBe("NONEXISTENT_LOCAL_TIME");
    expect((await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } })).version).toBe(0);
    await cancelSchedule(u, schedule.id, NOW);
    expect(((await fails(rescheduleSchedule(u, schedule.id, { ...when("2026-10-03"), version: 1 }, NOW))) as ScheduleConflictError).code).toBe("NOT_EDITABLE");
  });
  it("a Free account cannot extend a schedule beyond its horizon", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "r6");
    expect(((await fails(rescheduleSchedule(u, schedule.id, { ...when("2026-10-20", "00:01"), version: 0 }, NOW))) as ScheduleValidationError).code).toBe("TOO_FAR");
    await rescheduleSchedule(u, schedule.id, { ...when("2026-10-20", "00:00"), version: 0 }, NOW);
  });
});

describe("ownership isolation", () => {
  it("another account can neither cancel, reschedule nor see a schedule: it looks like 'not found'", async () => {
    const a = await mkUser(), b = await mkUser();
    const { schedule } = await sched(a, "o1");
    await sched(b, "o2", { message: "b's" });
    expect(await fails(cancelSchedule(b, schedule.id, NOW))).toBeInstanceOf(ScheduleNotFoundError);
    expect(await fails(rescheduleSchedule(b, schedule.id, { ...when("2026-10-05"), version: 0 }, NOW))).toBeInstanceOf(ScheduleNotFoundError);
    expect(await fails(cancelSchedule(b, crypto.randomUUID(), NOW))).toBeInstanceOf(ScheduleNotFoundError); // same answer for an id that does not exist
    expect(await fails(cancelSchedule(b, "not-a-uuid", NOW))).toBeInstanceOf(ScheduleNotFoundError);
    const row = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(row).toMatchObject({ status: "SCHEDULED", version: 0 });
    expect((await listSchedules(a.id)).map((s) => s.id)).toEqual([schedule.id]);
    expect((await listSchedules(b.id)).map((s) => s.id)).not.toContain(schedule.id);
    expect((await listSchedules(b.id))).toHaveLength(1);
    expect((await bal(a)).total).toBe(9);
  });
  it("recipients belong to one account: another account's recipient id is refused", async () => {
    const a = await mkUser(), b = await mkUser();
    const ra = await createRecipient(a.id, { name: "Ava", timeZone: "UTC" });
    expect(await fails(sched(b, "o3", { recipientId: ra.id }))).toBeInstanceOf(ScheduleNotFoundError);
    expect((await listRecipients(b.id)).map((r) => r.id)).not.toContain(ra.id);
    const ok = await sched(a, "o4", { recipientId: ra.id });
    expect(ok.schedule.recipient).toEqual({ id: ra.id, name: "Ava" });
  });
});

describe("recipients (minimal personal data)", () => {
  it("reuses a saved recipient instead of duplicating it, and stores no email unless given", async () => {
    const u = await mkUser();
    await sched(u, "rc1");
    await sched(u, "rc2", { message: "again" });
    const list = await listRecipients(u.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "SchedTest", hasEmail: false });
  });
  it("an email needs the SENDER's attestation; the recipient's own consent stays NONE (they are different facts)", async () => {
    expect(createScheduleSchema.safeParse({ ...base, recipientEmail: "x@example.com", schedule: when("2026-10-01") }).success).toBe(false);
    const u = await mkUser();
    const r = await createRecipient(u.id, { name: "Mia", timeZone: "Asia/Colombo", email: "Mia@Example.com", senderAttestsPermission: true });
    expect(r.hasEmail).toBe(true);
    const row = await db.recipient.findFirstOrThrow({ where: { ownerId: u.id } });
    expect(row).toMatchObject({ email: "mia@example.com", consentStatus: "NONE", consentUpdatedAt: null });
    expect(row.senderAttestedAt).not.toBeNull();
    expect(await fails(createRecipient(u.id, { name: "X", timeZone: "Not/AZone" }))).toBeInstanceOf(ScheduleValidationError);
  });
  it("saveRecipient=false stores nothing about the recipient", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "rc3", { saveRecipient: false });
    expect(schedule.recipient).toBeNull();
    expect(await db.recipient.count({ where: { ownerId: u.id } })).toBe(0);
  });
});

describe("privacy of scheduled cards", () => {
  it("SCHEDULED and CANCELLED cards are invisible to every public path; PUBLISHED cards are unaffected", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "pv1");
    const d = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id }, include: { card: true } });
    expect(await getPublishedCard(d.card.slug)).toBeNull();
    const { GET: qr } = await import("@/app/(card)/c/[slug]/qr.png/route");
    expect((await qr(new Request("http://t/x"), { params: Promise.resolve({ slug: d.card.slug }) })).status).toBe(404);
    const { POST: report } = await import("@/app/api/cards/[slug]/report/route");
    expect((await report(new Request("http://t/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1, 198.51.100.77" }, body: JSON.stringify({ reason: "SPAM" }) }), { params: Promise.resolve({ slug: d.card.slug }) })).status).toBe(404);
    await cancelSchedule(u, schedule.id, NOW);
    expect(await getPublishedCard(d.card.slug)).toBeNull();
    const pub = await publishOwnedCard({ templateKey: "snow-globe", recipientName: "SchedTest", senderName: "S", message: "live" , musicTrackId: "snowlight-on-the-sleigh-path" }, u, { idempotencyKey: key("pv2"), now: NOW });
    expect(await getPublishedCard(pub.slug)).toMatchObject({ slug: pub.slug });
    expect(await db.card.count({ where: { status: "PUBLISHED", ownerId: u.id } })).toBe(1);
  });
  it("a card id or slug is never part of the schedule DTO until delivery exists", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "pv3");
    expect(JSON.stringify(schedule)).not.toMatch(/slug|reservation|ownerId|idempotency/i);
  });
});

describe("database guarantees", () => {
  it("identity fields are immutable; illegal state changes and edits to finished schedules are blocked", async () => {
    const u = await mkUser(), v = await mkUser();
    const { schedule } = await sched(u, "g1");
    const attempt = (q: Promise<unknown>) => q.then(() => "allowed", () => "blocked");
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET "ownerId" = ${v.id}::uuid WHERE id = ${schedule.id}::uuid`)).toBe("blocked");
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = ${schedule.id}::uuid`)).toBe("blocked"); // SCHEDULED -> PUBLISHED skips PROCESSING
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET "localDate" = '2026-13-45' WHERE id = ${schedule.id}::uuid`)).toBe("blocked"); // CHECK
    await cancelSchedule(u, schedule.id, NOW);
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET status = 'SCHEDULED', "cancelledAt" = NULL WHERE id = ${schedule.id}::uuid`)).toBe("blocked"); // CANCELLED is terminal
    expect(await attempt(db.$executeRaw`UPDATE "ScheduledDelivery" SET "deliverAtUtc" = now() + interval '1 day' WHERE id = ${schedule.id}::uuid`)).toBe("blocked");
  });
  it("one delivery per card and per reservation; due jobs are indexed", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "g2");
    const d = await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id } });
    const dup = await fails(db.scheduledDelivery.create({ data: { ownerId: u.id, cardId: d.cardId, channel: "LINK", status: "SCHEDULED", deliverAtUtc: new Date(), timeZone: "UTC", localDate: "2026-10-01", localTime: "09:00", utcOffsetMinutes: 0, reservationId: d.reservationId, idempotencyKey: key("dupe"), requestHash: "x", nextAttemptAt: new Date() } }));
    expect(dup).toBeTruthy();
    const idx = await db.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'ScheduledDelivery_due'`;
    expect(idx[0].indexdef).toMatch(/WHERE \(status = 'SCHEDULED'/);
  });
  it("account deletion: held credits are released first, then schedules and recipients are removed; cards stay hidden", async () => {
    const u = await mkUser();
    const { schedule } = await sched(u, "g3", { templateKey: "lumis-wish" });
    const acc = await accountOf(u);
    const slug = (await db.scheduledDelivery.findUniqueOrThrow({ where: { id: schedule.id }, include: { card: true } })).card.slug;
    expect(await run((tx) => releaseAllHeld(tx, acc.id, NOW))).toBe(1);
    await db.user.delete({ where: { id: u.id } });
    expect(await db.scheduledDelivery.count({ where: { id: schedule.id } })).toBe(0);
    expect(await db.recipient.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await getPublishedCard(slug)).toBeNull();
    const b = await run((tx) => balances(tx, acc.id, NOW));
    expect(b).toMatchObject({ total: 10, premium: 1 });
    expect(await drift()).toEqual([]);
  });
});

describe("input validation", () => {
  it("rejects unknown fields (no smuggled owner, tier or status) and bad shapes", () => {
    expect(createScheduleSchema.safeParse({ ...base, schedule: when("2026-10-01"), ownerId: crypto.randomUUID() }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...base, schedule: when("2026-10-01"), tier: "STANDARD" }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...base, schedule: { ...when("2026-10-01"), extra: 1 } }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...base, schedule: { localDate: "10/01/2026", localTime: "9am", timeZone: "UTC" } }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...base, templateKey: "nope", schedule: when("2026-10-01") }).success).toBe(false);
    expect(rescheduleSchema.safeParse({ ...when("2026-10-01"), version: -1 }).success).toBe(false);
    expect(rescheduleSchema.safeParse({ ...when("2026-10-01") }).success).toBe(false);
  });
});
