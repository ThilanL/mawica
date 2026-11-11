/**
 * Delivery policy. Pure and host-independent: the same numbers apply whether the engine runs from the local worker process or, later,
 * from an Azure Functions timer. Every value is bounded, so a bad setting cannot create an unbounded retry storm or a zero-length lease.
 */
export type DeliveryPolicy = {
  /** Jobs claimed per cycle. */
  batchSize: number;
  /** How long a claim is valid. A worker that stops renewing loses it and the job is recovered. Must comfortably exceed one publish. */
  leaseMs: number;
  /** Total attempts (first try included) before a job is failed for good. */
  maxAttempts: number;
  backoffBaseMs: number;
  backoffFactor: number;
  backoffCapMs: number;
  /** 0..1: random spread applied to each delay so retries from many jobs do not synchronise. */
  jitter: number;
  /** Jobs processed in parallel inside one process. */
  concurrency: number;
};

export const DEFAULT_POLICY: DeliveryPolicy = { batchSize: 10, leaseMs: 60_000, maxAttempts: 5, backoffBaseMs: 30_000, backoffFactor: 2, backoffCapMs: 15 * 60_000, jitter: 0.2, concurrency: 4 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) ? n : d; };

/** Reads DELIVERY_* settings (all optional) and clamps them to safe ranges. */
export function loadPolicy(env: Record<string, string | undefined> = process.env): DeliveryPolicy {
  const d = DEFAULT_POLICY;
  return {
    batchSize: clamp(Math.trunc(num(env.DELIVERY_BATCH_SIZE, d.batchSize)), 1, 200),
    leaseMs: clamp(Math.trunc(num(env.DELIVERY_LEASE_MS, d.leaseMs)), 1_000, 15 * 60_000),
    maxAttempts: clamp(Math.trunc(num(env.DELIVERY_MAX_ATTEMPTS, d.maxAttempts)), 1, 20),
    backoffBaseMs: clamp(Math.trunc(num(env.DELIVERY_BACKOFF_BASE_MS, d.backoffBaseMs)), 100, 10 * 60_000),
    backoffFactor: clamp(num(env.DELIVERY_BACKOFF_FACTOR, d.backoffFactor), 1, 10),
    backoffCapMs: clamp(Math.trunc(num(env.DELIVERY_BACKOFF_CAP_MS, d.backoffCapMs)), 100, 6 * 3_600_000),
    jitter: clamp(num(env.DELIVERY_JITTER, d.jitter), 0, 1),
    concurrency: clamp(Math.trunc(num(env.DELIVERY_CONCURRENCY, d.concurrency)), 1, 32),
  };
}

/** Delay before retry number `attemptNo` (the attempt that just failed, 1-based): bounded exponential backoff with jitter, never below the base or above the cap. */
export function retryDelayMs(attemptNo: number, policy: DeliveryPolicy, rand: () => number = Math.random): number {
  const raw = policy.backoffBaseMs * policy.backoffFactor ** Math.max(0, attemptNo - 1);
  const capped = Math.min(policy.backoffCapMs, raw);
  const spread = capped * (1 + policy.jitter * (rand() * 2 - 1));
  return Math.round(clamp(spread, policy.backoffBaseMs, policy.backoffCapMs));
}
