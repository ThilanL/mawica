import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Ownership resolution. Stripe events are mapped to a Mawica wallet through Stripe's own object graph (the customer the object
 * belongs to → BillingCustomer → CreditAccount), never by trusting metadata. Metadata (`mawica_account_id`) is only a
 * cross-check: if it disagrees with the mapping, the event is treated as an ownership mismatch and nothing is applied.
 */
export type Ownership =
  | { kind: "no_customer" }
  | { kind: "unknown_customer" }
  | { kind: "owned"; accountId: string; billingCustomerId: string }
  | { kind: "mismatch" };

type StripeObjectLike = { id?: unknown; object?: unknown; customer?: unknown; metadata?: unknown };

/** The Stripe customer id an object belongs to (a customer object is its own owner). */
export function customerRefOf(obj: StripeObjectLike): string | null {
  if (obj.object === "customer" && typeof obj.id === "string") return obj.id;
  const c = obj.customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") return (c as { id: string }).id;
  return null;
}

export async function resolveOwnership(tx: Tx, obj: StripeObjectLike, livemode: boolean): Promise<Ownership> {
  const ref = customerRefOf(obj);
  if (!ref) return { kind: "no_customer" };
  const customer = await tx.billingCustomer.findUnique({ where: { stripeCustomerRef: ref }, select: { id: true, accountId: true, livemode: true } });
  if (!customer || customer.livemode !== livemode) return { kind: "unknown_customer" };
  const meta = obj.metadata && typeof obj.metadata === "object" ? (obj.metadata as Record<string, unknown>) : {};
  const claimed = meta.mawica_account_id;
  if (claimed !== undefined && claimed !== customer.accountId) return { kind: "mismatch" };
  return { kind: "owned", accountId: customer.accountId, billingCustomerId: customer.id };
}

/**
 * The signed-in user's OWN billing customer, looked up only from the session user's wallet. There is deliberately no variant that
 * accepts a customer id, account id or Stripe id from a request, so one user can never address another user's billing records.
 */
export async function getOwnBillingCustomer(tx: Tx, sessionUserId: string, livemode = false) {
  return tx.billingCustomer.findFirst({
    where: { livemode, account: { userId: sessionUserId } },
    select: { id: true, accountId: true, stripeCustomerRef: true, refType: true },
  });
}
