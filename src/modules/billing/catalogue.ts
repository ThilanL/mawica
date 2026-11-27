/**
 * Mawica's single authoritative pricing and entitlement catalogue (approved in STRIPE-PHASE-1B-DECISIONS.md, revision 3).
 *
 * Shared by: the public website and membership comparison pages, future Checkout, backend entitlement services, the Stripe
 * product/price mapping (by lookup key), admin finance projections and future mobile apps.
 * Pure data: no secrets, no Stripe IDs, no server-only imports, so it is safe to import from any environment.
 *
 * Phase 2 (release gate E1): nothing is purchasable. `purchasable` is false for every product and is additionally overridden by
 * the payment feature gates (modules/billing/flags.ts). Nothing on the website displays these prices yet, so no
 * customer-facing price or availability changes.
 *
 * Money is integer cents in AUD. Prices are final consumer prices (approved display policy). No tax is collected until
 * obligations are confirmed.
 */

export const CURRENCY = "aud" as const;

export type PlanKey = "free" | "plus" | "corporate" | "unlimited";
export type StripeProductKey = "plus" | "corporate" | "unlimited" | "premium_card" | "event";
export type CatalogueCode =
  | "plus_month"
  | "plus_year"
  | "corporate_month"
  | "corporate_year"
  | "unlimited_month"
  | "unlimited_year"
  | "premium_card"
  | "event";

export type CatalogueEntry = {
  code: CatalogueCode;
  /** One Stripe Product per plan or one-off product; monthly and annual are Prices on the same Product. */
  product: StripeProductKey;
  kind: "subscription" | "one_time";
  interval: "month" | "year" | null;
  amountCents: number;
  currency: typeof CURRENCY;
  /** Versioned Stripe Price lookup key. A price change is a new version, never an edit (Stripe prices are immutable). */
  lookupKey: string;
  plan: PlanKey | null;
  /** Phase 2: always false. Also gated by PAYMENT_GATES. */
  purchasable: false;
  name: string;
};

export const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  { code: "plus_month", product: "plus", kind: "subscription", interval: "month", amountCents: 1_000, currency: CURRENCY, lookupKey: "mawica_plus_month_aud_v1", plan: "plus", purchasable: false, name: "Mawica Plus (monthly)" },
  { code: "plus_year", product: "plus", kind: "subscription", interval: "year", amountCents: 6_000, currency: CURRENCY, lookupKey: "mawica_plus_year_aud_v1", plan: "plus", purchasable: false, name: "Mawica Plus (annual)" },
  { code: "corporate_month", product: "corporate", kind: "subscription", interval: "month", amountCents: 2_000, currency: CURRENCY, lookupKey: "mawica_corporate_month_aud_v1", plan: "corporate", purchasable: false, name: "Mawica Corporate (monthly)" },
  { code: "corporate_year", product: "corporate", kind: "subscription", interval: "year", amountCents: 12_000, currency: CURRENCY, lookupKey: "mawica_corporate_year_aud_v1", plan: "corporate", purchasable: false, name: "Mawica Corporate (annual)" },
  { code: "unlimited_month", product: "unlimited", kind: "subscription", interval: "month", amountCents: 3_000, currency: CURRENCY, lookupKey: "mawica_unlimited_month_aud_v1", plan: "unlimited", purchasable: false, name: "Mawica Unlimited (monthly)" },
  { code: "unlimited_year", product: "unlimited", kind: "subscription", interval: "year", amountCents: 18_000, currency: CURRENCY, lookupKey: "mawica_unlimited_year_aud_v1", plan: "unlimited", purchasable: false, name: "Mawica Unlimited (annual)" },
  { code: "premium_card", product: "premium_card", kind: "one_time", interval: null, amountCents: 299, currency: CURRENCY, lookupKey: "mawica_premium_card_aud_v1", plan: null, purchasable: false, name: "Premium card" },
  { code: "event", product: "event", kind: "one_time", interval: null, amountCents: 6_000, currency: CURRENCY, lookupKey: "mawica_event_aud_v1", plan: null, purchasable: false, name: "Mawica Event" },
] satisfies CatalogueEntry[]);

/** Flat price of every individually purchased premium card, whatever its technology (standard, animated, 3D, AR). */
export const PREMIUM_CARD_PRICE_CENTS = 299;

/** Approved annual discount: annual price = 6 × monthly (50% off 12 months). */
export const ANNUAL_PRICE_MONTHS = 6;

export type PlanEntitlementSummary = {
  plan: PlanKey;
  name: string;
  /** Total card sends per allowance period; null = unlimited (fair use applies). */
  sendsTotal: number | null;
  /** Premium sends allowed WITHIN sendsTotal per period; null = unlimited. */
  sendsPremium: number | null;
  period: "month" | "year";
  /** One-time welcome premium card for new verified accounts (Free only, once per email ever). */
  welcomePremium: number;
  /** Individual premium cards can be bought at PREMIUM_CARD_PRICE_CENTS. */
  premiumAddOn: boolean;
};

/**
 * Approved entitlements. Free and Plus mirror the seeded Plan / PlanEntitlement rows (a test enforces the match). Corporate
 * and Unlimited rows are not seeded until their phases are approved, so the engine cannot assign them yet.
 */
export const PLAN_ENTITLEMENTS: Readonly<Record<PlanKey, PlanEntitlementSummary>> = Object.freeze({
  free: { plan: "free", name: "Free", sendsTotal: 10, sendsPremium: 0, period: "month", welcomePremium: 1, premiumAddOn: true },
  plus: { plan: "plus", name: "Plus", sendsTotal: 50, sendsPremium: 5, period: "month", welcomePremium: 0, premiumAddOn: true },
  corporate: { plan: "corporate", name: "Corporate", sendsTotal: 1_000, sendsPremium: 100, period: "year", welcomePremium: 0, premiumAddOn: true },
  unlimited: { plan: "unlimited", name: "Unlimited", sendsTotal: null, sendsPremium: null, period: "month", welcomePremium: 0, premiumAddOn: false },
});

/** Event package entitlements (approved). Not purchasable until the event architecture exists. */
export const EVENT_PACKAGE = Object.freeze({ maxInvitations: 500, features: ["rsvp", "guests", "tables", "reminders", "digital_tickets"] as const });

const byCode = new Map(CATALOGUE.map((e) => [e.code, e]));

export function getCatalogueEntry(code: string): CatalogueEntry | null {
  return byCode.get(code as CatalogueCode) ?? null;
}

/** "A$10.00" style display (en-AU). Display only; never used to compute a charge. */
export function formatAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}
