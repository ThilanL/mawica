import "server-only";
import { db } from "@/lib/db";
import type { StripeEvent } from "@/lib/stripe";
import { handlerFor, type HandlerContext } from "./handlers";
import { logWebhook } from "./log";

export type ProcessResult =
  | { kind: "processed"; status: "PROCESSED" | "IGNORED"; outcome: string; attempts: number }
  | { kind: "duplicate"; status: string }
  | { kind: "failed" };

type DataObject = { id?: unknown; object?: unknown };

/**
 * Transactional processing of one verified Stripe event. Stripe delivers AT LEAST once, in ANY order, possibly concurrently;
 * this function never assumes otherwise.
 *
 *  1. CLAIM: insert the StripeEvent row as PROCESSING, or reclaim it if a previous attempt FAILED. The primary key serialises
 *     concurrent deliveries of the same event: a second delivery blocks until the first commits (then it is a duplicate) or rolls
 *     back (then it claims the event itself). PROCESSED / IGNORED rows are never reprocessed.
 *  2. SERIALISE PER OBJECT: a transaction-scoped advisory lock on the Stripe object id, so two different events about the same
 *     subscription/invoice/... never run concurrently.
 *  3. ORDERING IS INFORMATION, NOT A DECISION: whether a newer (or same-second) event for the same object was already processed is
 *     passed to the handler. `event.created` has one-second resolution and is not authoritative, so no event is dropped on that basis.
 *     Handlers that change state must re-fetch the authoritative object from Stripe and apply it idempotently (see handlers.ts).
 *  4. HANDLE, then record the outcome, in the SAME transaction as the claim. A row reaches PROCESSED/IGNORED only if that whole
 *     transaction commits, so a failure or an interruption (crash, lost connection, timeout) can never leave an event marked done:
 *     the claim rolls back with the effects, the row stays absent or FAILED, the caller answers 5xx, and Stripe's retry reclaims it.
 *  Nothing here stores the payload.
 */
export async function processStripeEvent(event: StripeEvent): Promise<ProcessResult> {
  const started = Date.now();
  const obj = (event.data?.object ?? {}) as DataObject;
  const objectId = typeof obj.id === "string" ? obj.id.slice(0, 255) : null;
  const objectType = typeof obj.object === "string" ? obj.object.slice(0, 60) : null;
  const created = new Date(event.created * 1000);
  const apiVersion = typeof event.api_version === "string" ? event.api_version.slice(0, 40) : null;

  try {
    const result = await db.$transaction(
      async (tx) => {
        const claimed = await tx.$queryRaw<{ attempts: number }[]>`
          INSERT INTO "StripeEvent" (id, type, livemode, "apiVersion", "stripeCreatedAt", "objectId", "objectType", status, attempts)
          VALUES (${event.id}, ${event.type.slice(0, 100)}, ${event.livemode}, ${apiVersion}, ${created}, ${objectId}, ${objectType}, 'PROCESSING', 1)
          ON CONFLICT (id) DO UPDATE SET status = 'PROCESSING', attempts = "StripeEvent".attempts + 1, outcome = NULL
            WHERE "StripeEvent".status = 'FAILED'
          RETURNING attempts`;
        if (!claimed[0]) {
          const [existing] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "StripeEvent" WHERE id = ${event.id}`;
          return { kind: "duplicate", status: existing?.status ?? "UNKNOWN" } as const;
        }
        const attempts = claimed[0].attempts;

        const ctx: HandlerContext = { objectId, attempts, newerEventProcessed: false, sameSecondEventProcessed: false };
        if (objectId) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"stripe-object:" + objectId}, 0))`;
          const [order] = await tx.$queryRaw<{ newer: boolean; same: boolean }[]>`
            SELECT
              EXISTS (SELECT 1 FROM "StripeEvent" WHERE "objectId" = ${objectId} AND id <> ${event.id} AND status = 'PROCESSED' AND "stripeCreatedAt" > ${created}) AS newer,
              EXISTS (SELECT 1 FROM "StripeEvent" WHERE "objectId" = ${objectId} AND id <> ${event.id} AND status = 'PROCESSED' AND "stripeCreatedAt" = ${created}) AS same`;
          ctx.newerEventProcessed = order.newer;
          ctx.sameSecondEventProcessed = order.same;
        }

        const handler = handlerFor(event.type);
        const outcome = handler ? await handler(tx, event, ctx) : { status: "IGNORED" as const, outcome: "UNSUPPORTED_TYPE" };
        await tx.$executeRaw`
          UPDATE "StripeEvent" SET status = ${outcome.status}::"StripeEventStatus", outcome = ${outcome.outcome.slice(0, 40)}, "processedAt" = now()
           WHERE id = ${event.id} AND status = 'PROCESSING'`;
        return { kind: "processed", status: outcome.status, outcome: outcome.outcome, attempts } as const;
      },
      { timeout: 15_000, maxWait: 15_000 },
    );
    logWebhook("info", result.kind === "duplicate" ? "duplicate event" : "event handled", {
      eventId: event.id, type: event.type, livemode: event.livemode,
      status: result.status, outcome: result.kind === "processed" ? result.outcome : "DUPLICATE",
      attempts: result.kind === "processed" ? result.attempts : null, durationMs: Date.now() - started,
    });
    return result;
  } catch (e) {
    logWebhook("error", "event processing failed", { eventId: event.id, type: event.type, errorName: e instanceof Error ? e.name : "unknown", durationMs: Date.now() - started });
    try {
      // Observability only: the event is recorded as FAILED (never as done). A later delivery reclaims it.
      await db.$executeRaw`
        INSERT INTO "StripeEvent" (id, type, livemode, "apiVersion", "stripeCreatedAt", "objectId", "objectType", status, outcome, attempts)
        VALUES (${event.id}, ${event.type.slice(0, 100)}, ${event.livemode}, ${apiVersion}, ${created}, ${objectId}, ${objectType}, 'FAILED', 'HANDLER_ERROR', 1)
        ON CONFLICT (id) DO UPDATE SET attempts = "StripeEvent".attempts + 1, outcome = 'HANDLER_ERROR'
          WHERE "StripeEvent".status = 'FAILED'`;
    } catch {
      logWebhook("error", "could not record failed event", { eventId: event.id });
    }
    return { kind: "failed" };
  }
}
