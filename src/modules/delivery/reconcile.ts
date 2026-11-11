import "server-only";
import { db } from "@/lib/db";
import { reconcile as reconcileLedger } from "@/modules/wallet/engine";

export type Anomaly = { kind: string; deliveryId?: string; detail?: string };

/**
 * Read-only consistency report across schedules, cards, reservations and the ledger. An empty list means: every PUBLISHED delivery has a live card and a
 * committed reservation; every waiting delivery has a private card and a held reservation; no finished delivery still holds credit; no balance drifts.
 * (Expired leases are reported separately because they are expected after a crash until recovery runs.)
 */
export async function findAnomalies(now = new Date()): Promise<{ anomalies: Anomaly[]; expiredLeases: string[] }> {
  const rows = await db.$queryRaw<{ kind: string; id: string }[]>`
    SELECT 'PUBLISHED_NOT_LIVE_OR_COMMITTED' AS kind, d.id::text AS id FROM "ScheduledDelivery" d JOIN "Card" c ON c.id = d."cardId" JOIN "CreditReservation" r ON r.id = d."reservationId"
     WHERE d.status = 'PUBLISHED' AND (c.status <> 'PUBLISHED' OR r.status <> 'COMMITTED')
    UNION ALL
    SELECT 'WAITING_NOT_PRIVATE_OR_HELD', d.id::text FROM "ScheduledDelivery" d JOIN "Card" c ON c.id = d."cardId" JOIN "CreditReservation" r ON r.id = d."reservationId"
     WHERE d.status IN ('SCHEDULED', 'PROCESSING') AND (c.status <> 'SCHEDULED' OR r.status <> 'HELD')
    UNION ALL
    SELECT 'FINISHED_HOLDS_CREDIT', d.id::text FROM "ScheduledDelivery" d JOIN "CreditReservation" r ON r.id = d."reservationId"
     WHERE d.status IN ('PUBLISHED', 'FAILED', 'CANCELLED') AND r.status = 'HELD'
    UNION ALL
    SELECT 'CARD_LIVE_WITHOUT_PUBLISHED_DELIVERY', d.id::text FROM "ScheduledDelivery" d JOIN "Card" c ON c.id = d."cardId"
     WHERE c.status = 'PUBLISHED' AND d.status <> 'PUBLISHED'
    UNION ALL
    SELECT 'ATTEMPT_COUNT_MISMATCH', d.id::text FROM "ScheduledDelivery" d WHERE d."attemptCount" < (SELECT COALESCE(MAX("attemptNo"), 0) FROM "DeliveryAttempt" a WHERE a."deliveryId" = d.id)
    UNION ALL
    SELECT 'MULTIPLE_OPEN_ATTEMPTS', a."deliveryId"::text FROM "DeliveryAttempt" a WHERE a.status = 'STARTED' GROUP BY a."deliveryId" HAVING count(*) > 1`;
  const anomalies: Anomaly[] = rows.map((r) => ({ kind: r.kind, deliveryId: r.id }));
  const drift = await db.$transaction((tx) => reconcileLedger(tx));
  for (const d of drift) anomalies.push({ kind: "LEDGER_DRIFT", detail: `${d.remaining} vs ${d.ledgerSum}` });
  const expired = await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM "ScheduledDelivery" WHERE status = 'PROCESSING' AND "leaseExpiresAt" < ${now}`;
  return { anomalies, expiredLeases: expired.map((e) => e.id) };
}
