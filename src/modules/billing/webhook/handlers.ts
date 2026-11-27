import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { StripeEvent } from "@/lib/stripe";
import { resolveOwnership } from "@/modules/billing/ownership";

type Tx = Prisma.TransactionClient;

export type HandlerResult = { status: "PROCESSED" | "IGNORED"; outcome: string };

/** Ordering facts about the event's Stripe object, computed under the per-object lock. Hints only, never authoritative state. */
export type HandlerContext = {
  objectId: string | null;
  /** Delivery attempt number for this event (1 = first). */
  attempts: number;
  /** A PROCESSED event for the same object has a strictly later `created`: this event's snapshot is probably out of date. */
  newerEventProcessed: boolean;
  /** A PROCESSED event for the same object has the same `created` second: ordering between them is unknown. */
  sameSecondEventProcessed: boolean;
};

export type EventHandler = (tx: Tx, event: StripeEvent, ctx: HandlerContext) => Promise<HandlerResult>;

/**
 * HANDLER CONTRACT (binding for every Phase 3+ handler; Phase 2 handlers are deferred no-ops):
 *  1. An event is a NOTIFICATION, not the state. Before changing anything, re-fetch the authoritative object from Stripe
 *     (subscription, invoice, checkout session, charge, ...) with the restricted key, and apply THAT state. Processing an older
 *     event late, or two events from the same second, then converges on the same current state. Never trust `event.created`
 *     or the payload snapshot to decide which state wins.
 *  2. State writes on mirror rows (BillingSubscription, BillingOrder, ...) are compare-and-set: only move forward along the
 *     allowed transitions (e.g. order PENDING -> PAID), and record `lastStripeEventAt` / `lastStripeEventId` for diagnostics.
 *  3. Business effects are idempotent on business keys, not on event ids: wallet grants use deterministic grantKeys derived from
 *     Stripe ids (e.g. "purchase:<order id>:1", "sub:<subscription id>:<slice start>:<unit>") with the existing unique constraint,
 *     so a different event that leads to the same effect (checkout.session.completed and async_payment_succeeded; a replayed
 *     invoice.paid) is a no-op the second time.
 *  4. Effects happen inside the provided transaction only. No network call may commit anything outside it; re-fetches are reads.
 *  5. Ownership comes from Stripe's object graph (resolveOwnership); metadata is a cross-check only.
 *  6. A handler that cannot complete must THROW (the whole transaction, including the claim, rolls back and Stripe retries).
 *     Returning IGNORED is only for events that are intentionally not acted on.
 *  7. Paid effects run only behind the matching payment feature gate (modules/billing/flags.ts). In Phase 2 every gate is off.
 */
export const SUPPORTED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.finalized",
  "invoice.voided",
  "invoice.marked_uncollectible",
  "invoice.overdue",
  "credit_note.created",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "radar.early_fraud_warning.created",
  "customer.updated",
  "customer.deleted",
] as const;

export type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

/** Phase 2 handler: ownership check only, no side effects, no grants. Records whether the snapshot was already superseded. */
const deferred: EventHandler = async (tx, event, ctx) => {
  const ownership = await resolveOwnership(tx, event.data.object as unknown as Record<string, unknown>, event.livemode);
  if (ownership.kind === "mismatch") return { status: "IGNORED", outcome: "OWNERSHIP_MISMATCH" };
  return { status: "PROCESSED", outcome: ctx.newerEventProcessed ? "DEFERRED_SUPERSEDED_SNAPSHOT" : "DEFERRED_PHASE2" };
};

const registry = new Map<string, EventHandler>(SUPPORTED_EVENT_TYPES.map((t) => [t, deferred]));

export function handlerFor(type: string): EventHandler | null {
  return registry.get(type) ?? null;
}

/** Test seam: lets tests install a failing or slow handler for one type. Never called by application code. */
export function __setHandlerForTests(type: string, handler: EventHandler | null): void {
  if (!process.env.VITEST) throw new Error("__setHandlerForTests is only available under the test runner");
  if (handler) registry.set(type, handler);
  else if ((SUPPORTED_EVENT_TYPES as readonly string[]).includes(type)) registry.set(type, deferred);
  else registry.delete(type);
}
