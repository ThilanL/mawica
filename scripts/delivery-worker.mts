// Local delivery worker. Publishes due LINK schedules (see src/modules/delivery and docs/delivery.md).
//   npm run delivery:worker -- once                      one bounded cycle (recover + claim + publish), prints counts, exits
//   npm run delivery:worker -- loop [--interval 5000]    keeps running; SIGINT/SIGTERM stop it gracefully (in-flight jobs finish, unstarted claims are handed back)
//   npm run delivery:worker -- reconcile                 read-only consistency report; exit 1 if anything is inconsistent
// Options: --concurrency N  --batch N  --lease-ms N  --max-attempts N
// It is a command-line process only: there is no HTTP endpoint that can trigger delivery. A future Azure Functions timer trigger calls runDeliveryCycle() instead.
// Runs only against the isolated local database (the same guard as the app). Logs counts only: never card text, names, addresses, tokens or secrets.
try { process.loadEnvFile(".env.local"); } catch { /* real environment */ }
const args = process.argv.slice(2);
const mode = args[0] ?? "once";
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
if (!["once", "loop", "reconcile"].includes(mode)) { console.error("usage: delivery-worker.mts once|loop|reconcile [--interval ms] [--concurrency n] [--batch n] [--lease-ms n] [--max-attempts n]"); process.exit(2); }
if (process.env.NODE_ENV === "production" && !args.includes("--allow-production")) { console.error("Refusing to run with NODE_ENV=production without --allow-production."); process.exit(2); }

const { loadPolicy } = await import("../src/modules/delivery/config");
const { newWorkerId, runOnce, runLoop } = await import("../src/modules/delivery/queue");
const { findAnomalies } = await import("../src/modules/delivery/reconcile");
const { db } = await import("../src/lib/db");

const policy = loadPolicy({
  ...process.env,
  ...(opt("concurrency") ? { DELIVERY_CONCURRENCY: opt("concurrency") } : {}), ...(opt("batch") ? { DELIVERY_BATCH_SIZE: opt("batch") } : {}),
  ...(opt("lease-ms") ? { DELIVERY_LEASE_MS: opt("lease-ms") } : {}), ...(opt("max-attempts") ? { DELIVERY_MAX_ATTEMPTS: opt("max-attempts") } : {}),
});
const workerId = newWorkerId();

// Test-only fault injection (never active unless explicitly enabled outside production): simulates a process killed at an exact point.
const crashAt = process.env.MAWICA_DELIVERY_TEST_HOOKS === "1" && process.env.NODE_ENV !== "production" ? process.env.DELIVERY_TEST_CRASH : undefined;
const hooks = crashAt === "before_commit" ? { beforeCommit: () => { process.exit(137); } } : crashAt === "after_commit" ? { afterCommit: () => { process.exit(137); } } : undefined;
const ctx = { policy, clock: () => new Date(), workerId, hooks };
const line = (o: object) => console.log(JSON.stringify({ worker: workerId, ...o }));

try {
  if (mode === "reconcile") {
    const r = await findAnomalies();
    line({ anomalies: r.anomalies.length, kinds: [...new Set(r.anomalies.map((a) => a.kind))], expiredLeases: r.expiredLeases.length });
    process.exitCode = r.anomalies.length ? 1 : 0;
  } else if (mode === "once") {
    const s = await runOnce(ctx);
    line({ ...s, durationMs: Math.round(s.durationMs) });
  } else {
    const ac = new AbortController();
    const stop = () => { line({ event: "stopping" }); ac.abort(); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    line({ event: "started", concurrency: policy.concurrency, batchSize: policy.batchSize, leaseMs: policy.leaseMs });
    await runLoop({ ...ctx, signal: ac.signal, intervalMs: Number(opt("interval") ?? 5000), onCycle: (s) => { if (s.claimed || s.recovered) line({ ...s, durationMs: Math.round(s.durationMs) }); } });
    line({ event: "stopped" });
  }
} finally {
  await db.$disconnect();
}
