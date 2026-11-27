import "server-only";
import { stripeWebhooks, type StripeEvent } from "@/lib/stripe";
import { resolveStripeWebhookConfig } from "@/modules/billing/config";

/** Stripe events are small; anything larger is refused before it is parsed. */
export const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;
/** Signature timestamp tolerance (seconds): Stripe's default, limits replay of a captured request. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type VerifyFailure = { ok: false; status: 400 | 413 | 503; code: "webhook_not_configured" | "missing_signature" | "body_too_large" | "invalid_signature" | "malformed_event" | "live_event_refused" | "connect_event_refused" };
export type VerifyResult = { ok: true; event: StripeEvent } | VerifyFailure;

const EVENT_ID = /^evt_[A-Za-z0-9_]{1,250}$/;

/**
 * Reads the request body as the exact original bytes, stopping as soon as it exceeds `max` (so a client that omits or lies about
 * Content-Length cannot make the server buffer an unbounded body). Returns null when the limit is exceeded.
 */
export async function readRawBodyCapped(request: Request, max = MAX_WEBHOOK_BODY_BYTES): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/**
 * Verifies a webhook delivery against the ORIGINAL request bytes (never re-serialised JSON) with the configured signing secret,
 * then enforces E1's sandbox-only rule. Pure apart from reading the secret: no database access, nothing logged here.
 */
export function verifyStripeWebhook(rawBody: Buffer, signatureHeader: string | null, source: Record<string, string | undefined> = process.env): VerifyResult {
  const config = resolveStripeWebhookConfig(source);
  if (!config.enabled) return { ok: false, status: 503, code: "webhook_not_configured" };
  if (!signatureHeader) return { ok: false, status: 400, code: "missing_signature" };
  if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) return { ok: false, status: 413, code: "body_too_large" };
  let event: StripeEvent;
  try {
    event = stripeWebhooks.constructEvent(rawBody, signatureHeader, config.secret, SIGNATURE_TOLERANCE_SECONDS);
  } catch {
    return { ok: false, status: 400, code: "invalid_signature" };
  }
  // A signed body that is not a well-formed event is refused before it reaches the database.
  if (typeof event?.id !== "string" || !EVENT_ID.test(event.id) || typeof event.type !== "string" || !Number.isInteger(event.created) || typeof event.livemode !== "boolean") {
    return { ok: false, status: 400, code: "malformed_event" };
  }
  // Release gate E1: sandbox only. A live event is refused even when correctly signed.
  if (event.livemode !== false) return { ok: false, status: 400, code: "live_event_refused" };
  // Mawica is not a Connect platform: events about connected accounts are never expected.
  if ((event as { account?: string }).account) return { ok: false, status: 400, code: "connect_event_refused" };
  return { ok: true, event };
}
