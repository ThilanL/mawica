/** Error categories recorded on attempts and schedules. Categories never contain card text, names or addresses. */
export type FailureCategory =
  | "DB_TRANSIENT" // connection loss, deadlock, serialization failure, pool timeout: retry
  | "UNKNOWN" // unclassified: retried (bounded), then reconciled before any decision
  | "LEASE_EXPIRED" // the worker stopped (crash or stall): recovered by another worker
  | "SHUTDOWN" // graceful stop before the job started
  | "CARD_NOT_SCHEDULED" // permanent: the card is not in the SCHEDULED state
  | "RESERVATION_NOT_HELD" // permanent: the credit reservation is not HELD
  | "CORRUPT_RELATIONSHIP" // permanent: owner / card / reservation do not line up
  | "ALREADY_PUBLISHED"; // reconciled: the card is already live

/** The delivery row is not (or no longer) held under this worker's fencing token: someone else owns the outcome. Nothing is written. */
export class StaleLeaseError extends Error { constructor() { super("stale lease"); } }

/** A permanent, state-based problem (not a transient failure): retrying cannot fix it. */
export class DeliveryStateError extends Error {
  constructor(public readonly category: FailureCategory, message = category) { super(message); }
}

/** Test-only: simulates a process dying at a precise point. The engine must NOT run its failure handling for it (a dead process cannot). */
export class SimulatedCrash extends Error { constructor(public readonly point: string) { super(`simulated crash at ${point}`); } }

const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2034", "40001", "40P01", "57P01", "57P02", "57P03", "53300", "08000", "08001", "08003", "08006", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"]);

export function classify(e: unknown): { category: FailureCategory; retryable: boolean } {
  if (e instanceof DeliveryStateError) return { category: e.category, retryable: false };
  const anyE = e as { code?: unknown; name?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const code = String(anyE?.code ?? anyE?.cause?.code ?? "");
  const msg = String(anyE?.message ?? "") + " " + String(anyE?.cause?.message ?? "");
  if (TRANSIENT_CODES.has(code) || /connection terminated|terminating connection|connection (?:closed|reset|refused)|timeout|timed out|deadlock|could not serialize|too many connections/i.test(msg) || anyE?.name === "PrismaClientInitializationError") {
    return { category: "DB_TRANSIENT", retryable: true };
  }
  return { category: "UNKNOWN", retryable: true };
}
