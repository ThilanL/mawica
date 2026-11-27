/**
 * Payment feature gates. Phase 2 (release gate E1) authorises foundation work only, so EVERY gate is off and cannot be turned on
 * by configuration: the values are code constants, not environment variables. Turning any gate on is a reviewed code change that
 * needs the owner's explicit approval for the matching release gate (E2 sandbox testing, E3 customer-facing, E4 live).
 */
export const PAYMENT_GATES = Object.freeze({
  /** Any Stripe Checkout Session for customers. */
  checkout: false,
  /** Plus / Unlimited / Corporate subscription purchasing. */
  subscriptions: false,
  /** AUD $2.99 individual premium card purchases. */
  premiumPurchases: false,
  /** Corporate membership purchasing (also needs organisations, Phase 5). */
  corporate: false,
  /** Event package purchasing (also needs the event architecture, Phase 6). */
  events: false,
  /** Unlimited membership purchasing (also needs approved fair-use terms). */
  unlimited: false,
  /** Stripe live mode. Only possible after release gate E4. */
  livePayments: false,
} as const);

export type PaymentGate = keyof typeof PAYMENT_GATES;

export function isPaymentGateOpen(gate: PaymentGate): boolean {
  return PAYMENT_GATES[gate];
}

/** True when no purchasing of any kind is possible. Phase 2 invariant, asserted by tests. */
export function allPurchasingDisabled(): boolean {
  return Object.values(PAYMENT_GATES).every((open) => open === false);
}
