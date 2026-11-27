import "server-only";

/**
 * Stripe configuration guard (Phase 2 / release gate E1: sandbox foundation only).
 *
 * Rules, enforced on every call (values are read at call time so a rotated key is picked up without a rebuild):
 *  - Only a RESTRICTED sandbox key (`rk_test_…`) is accepted. Full-access secret keys (`sk_…`) are refused, test or live.
 *  - Any live-mode key (`*_live_…`) is refused. There is no live mode in E1; enabling it needs gate E4 and a code change.
 *  - Missing or malformed configuration never throws: Stripe features are simply disabled and the free experience is unaffected.
 *  - Nothing here ever returns, logs or embeds a secret value. Callers get a status and a reason code only.
 */

export type StripeKeyProblem =
  | "missing_secret_key"
  | "live_key_refused"
  | "full_access_key_refused"
  | "publishable_key_in_secret_slot"
  | "malformed_secret_key";

export type WebhookSecretProblem = "missing_webhook_secret" | "malformed_webhook_secret";

export type StripeApiConfig =
  | { enabled: true; secretKey: string; keyKind: "restricted"; mode: "test" }
  | { enabled: false; reason: StripeKeyProblem };

export type StripeWebhookConfig = { enabled: true; secret: string } | { enabled: false; reason: WebhookSecretProblem };

const RESTRICTED_TEST_KEY = /^rk_test_[A-Za-z0-9]{16,255}$/;
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=_-]{16,255}$/;

type EnvLike = Record<string, string | undefined>;

/** Classifies STRIPE_SECRET_KEY. Pure: takes the environment as an argument so it can be tested without touching process.env. */
export function resolveStripeApiConfig(source: EnvLike = process.env): StripeApiConfig {
  const key = source.STRIPE_SECRET_KEY?.trim();
  if (!key) return { enabled: false, reason: "missing_secret_key" };
  if (/^(sk|rk|pk)_live_/.test(key)) return { enabled: false, reason: "live_key_refused" };
  if (key.startsWith("sk_")) return { enabled: false, reason: "full_access_key_refused" };
  if (key.startsWith("pk_")) return { enabled: false, reason: "publishable_key_in_secret_slot" };
  if (!RESTRICTED_TEST_KEY.test(key)) return { enabled: false, reason: "malformed_secret_key" };
  return { enabled: true, secretKey: key, keyKind: "restricted", mode: "test" };
}

/** Classifies STRIPE_WEBHOOK_SECRET (the signing secret of the endpoint, or of `stripe listen` locally). */
export function resolveStripeWebhookConfig(source: EnvLike = process.env): StripeWebhookConfig {
  const secret = source.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return { enabled: false, reason: "missing_webhook_secret" };
  if (!WEBHOOK_SECRET.test(secret)) return { enabled: false, reason: "malformed_webhook_secret" };
  return { enabled: true, secret };
}

/** Safe, value-free description for logs and health checks. */
export function describeStripeConfig(source: EnvLike = process.env): { api: string; webhook: string } {
  const api = resolveStripeApiConfig(source);
  const webhook = resolveStripeWebhookConfig(source);
  return { api: api.enabled ? "enabled:restricted-test-key" : `disabled:${api.reason}`, webhook: webhook.enabled ? "enabled" : `disabled:${webhook.reason}` };
}
