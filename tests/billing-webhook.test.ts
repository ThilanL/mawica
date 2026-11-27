import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/stripe/webhook/route";
import { __setHandlerForTests } from "@/modules/billing/webhook/handlers";
import { getOwnBillingCustomer } from "@/modules/billing/ownership";

// A test-only signing secret. The real local secret in .env.local is never used or read by these tests.
const SECRET = "whsec_vitest_only_" + "0123456789abcdef0123456789abcdef";
const PREFIX = `evt_vitest_${Date.now().toString(36)}_`;
let n = 0;
const nextId = () => `${PREFIX}${++n}`;
let savedSecret: string | undefined;

type Obj = Record<string, unknown>;
function makeEvent(over: { id?: string; type?: string; created?: number; livemode?: boolean; object?: Obj; account?: string } = {}) {
  return {
    id: over.id ?? nextId(),
    object: "event",
    api_version: "2026-11-18.endive",
    created: over.created ?? Math.floor(Date.now() / 1000),
    livemode: over.livemode ?? false,
    type: over.type ?? "customer.subscription.updated",
    data: { object: over.object ?? { id: `sub_vitest_${n}`, object: "subscription", customer: "cus_vitest_unknown" } },
    ...(over.account ? { account: over.account } : {}),
  };
}

function signed(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET, timestamp: opts.timestamp });
}

function post(payload: string, signature: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("stripe-signature", signature);
  return POST(new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers, body: payload }));
}

async function send(event: Obj) {
  const payload = JSON.stringify(event);
  return post(payload, signed(payload));
}

const row = (id: string) => db.stripeEvent.findUnique({ where: { id } });
const walletCounts = async () => ({ grants: await db.creditGrant.count(), ledger: await db.ledgerEntry.count(), reservations: await db.creditReservation.count(), accounts: await db.creditAccount.findMany({ select: { planKey: true } }).then((a) => a.map((x) => x.planKey).sort().join(",")) });

const users: string[] = [];
const accounts: string[] = [];
async function mkWallet() {
  const id = crypto.randomUUID();
  await db.user.create({ data: { id, name: "", email: `${id}@billing.example.test`, emailVerified: true } });
  const acc = await db.creditAccount.create({ data: { userId: id } });
  users.push(id); accounts.push(acc.id);
  return { userId: id, accountId: acc.id };
}

beforeAll(() => {
  savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  await db.stripeEvent.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await db.billingCustomer.deleteMany({ where: { accountId: { in: accounts } } });
  await db.creditAccount.deleteMany({ where: { id: { in: accounts } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

describe("signature verification on the raw request body", () => {
  it("accepts a correctly signed sandbox event and records it (deferred, no side effects)", async () => {
    const before = await walletCounts();
    const e = makeEvent();
    const res = await send(e);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false });
    expect(await row(e.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_PHASE2", attempts: 1, livemode: false, type: e.type });
    expect(await walletCounts()).toEqual(before); // no paid entitlement, no wallet change
  });
  it("refuses a wrong secret, a tampered body, a missing header and a stale timestamp, writing nothing", async () => {
    const e = makeEvent();
    const payload = JSON.stringify(e);
    const cases: [string, string | null][] = [
      [payload, signed(payload, { secret: "whsec_wrong_" + "9".repeat(32) })],
      [payload.replace('"livemode":false', '"livemode":false '), signed(payload)], // one byte changed after signing
      [payload, null],
      [payload, signed(payload, { timestamp: Math.floor(Date.now() / 1000) - 3600 })], // replay outside the 5-minute tolerance
      [payload, "t=1,v1=deadbeef"],
    ];
    for (const [body, sig] of cases) {
      const res = await post(body, sig);
      expect(res.status).toBe(400);
    }
    expect(await row(e.id)).toBeNull();
  });
  it("refuses correctly signed LIVE events and Connect events (E1 sandbox only)", async () => {
    const live = makeEvent({ livemode: true });
    const res = await send(live);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "live_event_refused" });
    const connect = makeEvent({ account: "acct_vitest_connected" });
    expect((await send(connect)).status).toBe(400);
    expect(await row(live.id)).toBeNull();
    expect(await row(connect.id)).toBeNull();
  });
  it("refuses oversized bodies before parsing, with or without a Content-Length header", async () => {
    const big = "x".repeat(600 * 1024);
    const res = await post(big, signed(big));
    expect(res.status).toBe(413);
    // Streamed body with no Content-Length: the reader stops at the limit instead of buffering everything.
    const chunk = new TextEncoder().encode("y".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < 20) c.enqueue(chunk); else c.close(); } });
    const streamed = await POST(new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: stream, duplex: "half" } as RequestInit & { duplex: "half" }));
    expect(streamed.status).toBe(413);
    expect(sent).toBeLessThan(20); // stopped early
  });
  it("refuses a correctly signed body that is not a well-formed Stripe event", async () => {
    for (const bad of [{ ...makeEvent(), id: "not_an_event_id" }, { ...makeEvent(), id: "evt_x'; DROP TABLE x;--" }, { ...makeEvent(), created: "yesterday" }]) {
      const res = await send(bad as unknown as Obj);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "malformed_event" });
    }
  });
  it("answers 503 and writes nothing when the signing secret is missing or malformed", async () => {
    const e = makeEvent();
    for (const value of [undefined, "not-a-secret"]) {
      if (value === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = value;
      expect((await send(e)).status).toBe(503);
    }
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect(await row(e.id)).toBeNull();
  });
});

describe("idempotency and concurrency", () => {
  it("a duplicate delivery is acknowledged but not processed again", async () => {
    const e = makeEvent();
    expect((await send(e)).status).toBe(200);
    const res = await send(e);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(await row(e.id)).toMatchObject({ status: "PROCESSED", attempts: 1 });
  });
  it("20 concurrent deliveries of the same event: processed exactly once", async () => {
    const e = makeEvent();
    const results = await Promise.all(Array.from({ length: 20 }, () => send(e).then((r) => r.json())));
    expect(results.filter((r) => r.duplicate === false)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate === true)).toHaveLength(19);
    expect(await db.stripeEvent.count({ where: { id: e.id } })).toBe(1);
    expect(await row(e.id)).toMatchObject({ status: "PROCESSED", attempts: 1 });
  });
  it("concurrent different events about the same object are serialised and all reach a terminal state", async () => {
    const object = { id: `sub_vitest_same_${Date.now()}`, object: "subscription", customer: "cus_vitest_unknown" };
    const base = Math.floor(Date.now() / 1000);
    const events = Array.from({ length: 10 }, (_, i) => makeEvent({ object, created: base + i }));
    const statuses = await Promise.all(events.map((e) => send(e).then((r) => r.status)));
    expect(statuses.every((s) => s === 200)).toBe(true);
    const rows = await db.stripeEvent.findMany({ where: { id: { in: events.map((e) => e.id) } } });
    expect(rows).toHaveLength(10);
    // No event is dropped because of its timestamp: every one is processed (handlers re-fetch authoritative state).
    expect(rows.every((r) => r.status === "PROCESSED" && r.attempts === 1 && r.processedAt !== null)).toBe(true);
    expect(rows.every((r) => r.outcome === "DEFERRED_PHASE2" || r.outcome === "DEFERRED_SUPERSEDED_SNAPSHOT")).toBe(true);
  });
  it("a handler's partial writes are rolled back with the claim when it fails (atomicity)", async () => {
    const w = await mkWallet();
    const ref = `cus_vitest_partial_${Date.now()}`;
    const e = makeEvent({ type: "invoice.finalized", object: { id: `in_vitest_partial_${Date.now()}`, object: "invoice", customer: ref } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    __setHandlerForTests("invoice.finalized", async (tx) => {
      await tx.billingCustomer.create({ data: { accountId: w.accountId, stripeCustomerRef: ref, livemode: false } });
      throw new Error("fails after a write");
    });
    try {
      expect((await send(e)).status).toBe(500);
    } finally {
      __setHandlerForTests("invoice.finalized", null);
    }
    expect(await db.billingCustomer.findUnique({ where: { stripeCustomerRef: ref } })).toBeNull(); // the write did not survive
    expect(await row(e.id)).toMatchObject({ status: "FAILED", processedAt: null }); // never marked done
  });
  it("an interrupted transaction (database connection killed mid-processing) is never marked done and recovers on retry", async () => {
    const w = await mkWallet();
    const ref = `cus_vitest_crash_${Date.now()}`;
    const e = makeEvent({ type: "invoice.voided", object: { id: `in_vitest_crash_${Date.now()}`, object: "invoice", customer: ref } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    __setHandlerForTests("invoice.voided", async (tx) => {
      await tx.billingCustomer.create({ data: { accountId: w.accountId, stripeCustomerRef: ref, livemode: false } });
      await tx.$executeRaw`SELECT pg_terminate_backend(pg_backend_pid())`; // simulates a crash / lost connection inside the transaction
      return { status: "PROCESSED", outcome: "UNREACHABLE" };
    });
    try {
      expect((await send(e)).status).toBe(500);
    } finally {
      __setHandlerForTests("invoice.voided", null);
    }
    expect(await db.billingCustomer.findUnique({ where: { stripeCustomerRef: ref } })).toBeNull();
    const after = await row(e.id);
    expect(after === null || (after.status === "FAILED" && after.processedAt === null)).toBe(true);
    const retry = await send(e); // Stripe's retry
    expect(retry.status).toBe(200);
    expect(await row(e.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_PHASE2" });
  });
  it("a failed attempt rolls back, is recorded as FAILED, and Stripe's retry reprocesses it exactly once", async () => {
    const e = makeEvent({ type: "invoice.paid", object: { id: `in_vitest_${Date.now()}`, object: "invoice", customer: "cus_vitest_unknown" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    __setHandlerForTests("invoice.paid", async () => { throw new Error("simulated handler failure"); });
    const res = await send(e);
    expect(res.status).toBe(500);
    expect(await row(e.id)).toMatchObject({ status: "FAILED", outcome: "HANDLER_ERROR", attempts: 1, processedAt: null });
    __setHandlerForTests("invoice.paid", null); // restore the real (deferred) handler
    const retry = await send(e);
    expect(retry.status).toBe(200);
    expect(await row(e.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_PHASE2", attempts: 2 });
    expect((await (await send(e)).json()).duplicate).toBe(true); // and never again
  });
});

describe("out-of-order events", () => {
  it("an older event arriving after a newer one is still processed (never dropped on its timestamp) and flagged as superseded", async () => {
    const object = { id: `sub_vitest_ooo_${Date.now()}`, object: "subscription", customer: "cus_vitest_unknown" };
    const t = Math.floor(Date.now() / 1000);
    const newer = makeEvent({ object, created: t + 60 });
    const older = makeEvent({ object, created: t });
    const sameSecond = makeEvent({ object, created: t + 60 });
    expect((await send(newer)).status).toBe(200);
    expect((await send(older)).status).toBe(200);
    expect(await row(older.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_SUPERSEDED_SNAPSHOT" });
    expect((await send(sameSecond)).status).toBe(200);
    expect(await row(sameSecond.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_PHASE2" }); // same second: order unknown, not superseded
  });
  it("handlers receive ordering hints under the per-object lock, never a decision", async () => {
    const object = { id: `sub_vitest_ctx_${Date.now()}`, object: "subscription", customer: "cus_vitest_unknown" };
    const t = Math.floor(Date.now() / 1000);
    const seen: { newer: boolean; same: boolean; objectId: string | null }[] = [];
    __setHandlerForTests("customer.subscription.deleted", async (_tx, _e, ctx) => {
      seen.push({ newer: ctx.newerEventProcessed, same: ctx.sameSecondEventProcessed, objectId: ctx.objectId });
      return { status: "PROCESSED", outcome: "TEST" };
    });
    try {
      await send(makeEvent({ object, created: t + 10 }));
      await send(makeEvent({ type: "customer.subscription.deleted", object, created: t }));
      await send(makeEvent({ type: "customer.subscription.deleted", object, created: t + 10 }));
    } finally {
      __setHandlerForTests("customer.subscription.deleted", null);
    }
    expect(seen).toEqual([{ newer: true, same: false, objectId: object.id }, { newer: false, same: true, objectId: object.id }]);
  });
  it("a replay of an already processed event with a fresh valid signature is acknowledged as a duplicate, not re-applied", async () => {
    const e = makeEvent();
    expect((await send(e)).status).toBe(200);
    const payload = JSON.stringify(e);
    const replay = await post(payload, signed(payload, { timestamp: Math.floor(Date.now() / 1000) + 1 }));
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    expect(await row(e.id)).toMatchObject({ attempts: 1 });
  });
  it("unsupported event types are acknowledged and ignored, never acted on", async () => {
    const e = makeEvent({ type: "payout.paid", object: { id: `po_vitest_${Date.now()}`, object: "payout" } });
    expect((await send(e)).status).toBe(200);
    expect(await row(e.id)).toMatchObject({ status: "IGNORED", outcome: "UNSUPPORTED_TYPE" });
  });
  it("credit_note.created is a supported (deferred) type for future processing", async () => {
    const e = makeEvent({ type: "credit_note.created", object: { id: `cn_vitest_${Date.now()}`, object: "credit_note", customer: "cus_vitest_unknown" } });
    expect((await send(e)).status).toBe(200);
    expect(await row(e.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_PHASE2" });
  });
});

describe("customer and object ownership", () => {
  it("events map to a wallet through the Stripe customer, and conflicting metadata is treated as a mismatch", async () => {
    const a = await mkWallet();
    const b = await mkWallet();
    const ref = `cus_vitest_${Date.now()}`;
    await db.billingCustomer.create({ data: { accountId: a.accountId, userId: a.userId, stripeCustomerRef: ref, livemode: false } });
    const ok = makeEvent({ object: { id: `sub_vitest_own_${Date.now()}`, object: "subscription", customer: ref, metadata: { mawica_account_id: a.accountId } } });
    expect((await send(ok)).status).toBe(200);
    expect(await row(ok.id)).toMatchObject({ status: "PROCESSED", outcome: "DEFERRED_PHASE2" });
    const forged = makeEvent({ object: { id: `sub_vitest_forged_${Date.now()}`, object: "subscription", customer: ref, metadata: { mawica_account_id: b.accountId } } });
    expect((await send(forged)).status).toBe(200);
    expect(await row(forged.id)).toMatchObject({ status: "IGNORED", outcome: "OWNERSHIP_MISMATCH" });
  });
  it("a user can only ever read their own billing customer", async () => {
    const a = await mkWallet();
    const b = await mkWallet();
    await db.billingCustomer.create({ data: { accountId: a.accountId, userId: a.userId, stripeCustomerRef: `cus_vitest_own_${Date.now()}`, livemode: false } });
    expect(await getOwnBillingCustomer(db, a.userId)).toMatchObject({ accountId: a.accountId });
    expect(await getOwnBillingCustomer(db, b.userId)).toBeNull();
  });
});

describe("database guarantees (E1)", () => {
  it("live-mode billing data, non-AUD amounts and mistyped Stripe ids are refused by the database", async () => {
    const w = await mkWallet();
    await expect(db.billingCustomer.create({ data: { accountId: w.accountId, stripeCustomerRef: `cus_vitest_live_${Date.now()}`, livemode: true } })).rejects.toThrow();
    await expect(db.billingCustomer.create({ data: { accountId: w.accountId, stripeCustomerRef: `sub_vitest_wrong_${Date.now()}`, livemode: false } })).rejects.toThrow();
    await expect(db.billingOrder.create({ data: { accountId: w.accountId, kind: "PREMIUM_PASS", catalogueCode: "premium_card", amountTotal: 299, currency: "usd", idempotencyKey: `k${Date.now()}`, requestHash: "h", livemode: false } })).rejects.toThrow();
    await expect(db.stripeEvent.create({ data: { id: `${PREFIX}live`, type: "x", livemode: true, stripeCreatedAt: new Date() } })).rejects.toThrow();
  });
});

describe("safe logging", () => {
  it("logs never contain the payload, signature or secrets", async () => {
    const lines: string[] = [];
    for (const m of ["info", "warn", "error", "log"] as const) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
    const marker = "PAYLOAD_MARKER_jane.doe@example.test";
    const e = makeEvent({ object: { id: `sub_vitest_log_${Date.now()}`, object: "subscription", customer: "cus_vitest_unknown", metadata: { note: marker } } });
    const payload = JSON.stringify(e);
    const sig = signed(payload);
    await post(payload, sig);
    await post(payload, "t=1,v1=bad");
    const all = lines.join("\n");
    expect(lines.length).toBeGreaterThan(0);
    expect(all).not.toContain(marker);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(sig);
    expect(all).not.toMatch(/(sk|rk)_(test|live)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/);
    expect(all).toContain(e.id);
  });
});
