import "server-only";
import Stripe from "stripe";
import { resolveStripeApiConfig } from "@/modules/billing/config";

/**
 * The Stripe API version this integration is written and tested against. Pinned explicitly (never the account default) and
 * equal to the version the installed SDK (stripe@23.2.0) was generated for; a test fails if they ever diverge.
 */
export const STRIPE_API_VERSION = "2026-11-18.endive" as const;

let cached: { key: string; client: Stripe } | null = null;

/**
 * Server-only Stripe client, or null when Stripe is not configured or the key is refused (see modules/billing/config.ts).
 * Callers must handle null as "payments unavailable"; nothing in the free experience depends on this.
 * Constructing the client makes no network call.
 */
export function getStripe(): Stripe | null {
  const config = resolveStripeApiConfig();
  if (!config.enabled) return null;
  if (cached?.key === config.secretKey) return cached.client;
  const client = new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "mawica-web" },
  });
  cached = { key: config.secretKey, client };
  return client;
}

/** Webhook signature verification only needs the signing secret, not an API key, so it uses the SDK's static helper. */
export const stripeWebhooks = Stripe.webhooks;
export type StripeEvent = Stripe.Event;
