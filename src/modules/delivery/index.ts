import "server-only";
import { loadPolicy, type DeliveryPolicy } from "./config";
import { newWorkerId, runOnce, type CycleStats } from "./queue";

/**
 * Hosting-independent entry point. The local worker (scripts/delivery-worker.mts) and a future Azure Functions timer trigger both call exactly this:
 * one bounded cycle of recover + claim + publish. All business logic lives in queue.ts; this adapter only supplies configuration and the clock.
 * There is deliberately NO HTTP route for it: nothing public can trigger delivery.
 */
export async function runDeliveryCycle(overrides: Partial<DeliveryPolicy> = {}, workerId = newWorkerId()): Promise<CycleStats> {
  return runOnce({ policy: { ...loadPolicy(), ...overrides }, clock: () => new Date(), workerId });
}
export { loadPolicy, retryDelayMs, DEFAULT_POLICY } from "./config";
export { runOnce, runLoop, claimDue, processClaim, recoverExpired, releaseClaim, newWorkerId } from "./queue";
export type { CycleStats, Claim, Outcome, Hooks } from "./queue";
