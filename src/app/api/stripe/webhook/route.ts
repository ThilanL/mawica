import { MAX_WEBHOOK_BODY_BYTES, readRawBodyCapped, verifyStripeWebhook } from "@/modules/billing/webhook/verify";
import { processStripeEvent } from "@/modules/billing/webhook/process";
import { logWebhook } from "@/modules/billing/webhook/log";

const headers = { "Cache-Control": "no-store" };

/**
 * Stripe webhook endpoint (release gate E1: sandbox only, nothing is granted or activated).
 *
 * Authentication is the Stripe signature over the ORIGINAL request bytes, so this route deliberately has no session, Origin or
 * rate-limit check (Stripe sends none of those). Responses carry no details beyond a short code.
 *  - 2xx: verified and recorded (including duplicates and intentionally ignored events), so Stripe stops retrying.
 *  - 400 / 413: refused before any database write (bad or missing signature, live or Connect event, oversized body).
 *  - 500: processing failed and was rolled back; Stripe retries and the event is reclaimed.
 *  - 503: the signing secret is not configured.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BODY_BYTES) {
    logWebhook("warn", "webhook refused", { code: "body_too_large" });
    return Response.json({ error: "body_too_large" }, { status: 413, headers });
  }
  const raw = await readRawBodyCapped(request);
  if (!raw) {
    logWebhook("warn", "webhook refused", { code: "body_too_large" });
    return Response.json({ error: "body_too_large" }, { status: 413, headers });
  }
  const verified = verifyStripeWebhook(raw, request.headers.get("stripe-signature"));
  if (!verified.ok) {
    logWebhook(verified.status === 503 ? "error" : "warn", "webhook refused", { code: verified.code });
    return Response.json({ error: verified.code }, { status: verified.status, headers });
  }
  const result = await processStripeEvent(verified.event);
  if (result.kind === "failed") return Response.json({ error: "processing_failed" }, { status: 500, headers });
  return Response.json({ received: true, duplicate: result.kind === "duplicate" }, { status: 200, headers });
}
