/**
 * Provider-neutral delivery-status model (design + pure logic only: no route, no database, no provider is wired to it yet).
 * A future receiver (Event Grid, SES/SNS, or a webhook) must first AUTHENTICATE the callback, then map the provider payload to
 * DeliveryEvent and fold it into the per-message state with applyDeliveryEvent. Events arrive at-least-once and out of order, so the
 * fold must be idempotent, commutative and never let a weaker signal overwrite a stronger one.
 */
export type DeliveryStatus = "accepted" | "deferred" | "delivered" | "failed" | "suppressed" | "bounced" | "complained";
export type DeliveryEvent = { providerRef: string; status: DeliveryStatus; at: Date };
export type DeliveryState = { providerRef: string; status: DeliveryStatus; at: Date; seen: number };

/** Higher wins. An asynchronous bounce after "delivered" is real (the receiving server accepted, then bounced), so bounced > delivered. */
const RANK: Record<DeliveryStatus, number> = { accepted: 0, deferred: 1, delivered: 2, failed: 3, suppressed: 4, bounced: 5, complained: 6 };

export function applyDeliveryEvent(state: DeliveryState | null, ev: DeliveryEvent): { state: DeliveryState; changed: boolean } {
  if (!state) return { state: { providerRef: ev.providerRef, status: ev.status, at: ev.at, seen: 1 }, changed: true };
  if (state.providerRef !== ev.providerRef) throw new Error("event is for a different message");
  const next = { ...state, seen: state.seen + 1 };
  const stronger = RANK[ev.status] > RANK[state.status];
  if (!stronger) return { state: next, changed: false }; // duplicate, replay or out-of-order weaker event
  return { state: { ...next, status: ev.status, at: ev.at }, changed: true };
}

/** Statuses that must add the address to the suppression list (permanent: never mailed again by Mawica without a fresh, explicit request from its owner). */
export const SUPPRESSING: ReadonlySet<DeliveryStatus> = new Set(["bounced", "complained", "suppressed"]);
