// Process-level delivery tests against the isolated mawica_test database: REAL worker processes, real crashes (process exit at an exact point),
// graceful shutdown, throughput and latency. Local measurements only: they say nothing about production capacity.
//   DATABASE_URL=<mawica_test url> node --conditions=react-server --import tsx scripts/delivery-load.mts
try { process.loadEnvFile(".env.local"); } catch { /* real environment */ }
import { spawn, execFileSync } from "node:child_process";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/mawica_test" || dbUrl.port !== "5433") throw new Error("Refusing to run: DATABASE_URL must point at mawica_test on port 5433");
const { db } = await import("../src/lib/db");
const { createSchedule } = await import("../src/modules/scheduling/service");
const { findAnomalies } = await import("../src/modules/delivery/reconcile");
const { welcomeHash } = await import("../src/modules/wallet/wallet");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const users: string[] = []; const emails: string[] = [];
const num = (v: unknown) => Number(v);
const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

async function mkUser() {
  const id = crypto.randomUUID();
  const u = { id, email: `${id}@dlvload.example.test`, emailVerified: true };
  await db.user.create({ data: { id, name: "", email: u.email, emailVerified: true } });
  users.push(id); emails.push(u.email);
  return u;
}
/** Creates schedules through the real service, then makes them due now (time fields may change while SCHEDULED). */
async function seed(userCount: number, perUser: number, premiumEvery = 0): Promise<{ ids: string[]; tMark: Date }> {
  const ids: string[] = [];
  for (let i = 0; i < userCount; i++) {
    const u = await mkUser();
    const made = await Promise.all(Array.from({ length: perUser }, (_, j) => createSchedule({ templateKey: premiumEvery && j === 0 ? "lumis-wish" : "snow-globe", recipientName: "LoadTest", senderName: "Sam", message: `m${i}-${j}`, saveRecipient: false, channel: "LINK", schedule: { localDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), localTime: "09:00", timeZone: "UTC" } } as never, u, { idempotencyKey: `load-${crypto.randomUUID()}`.slice(0, 40) })));
    ids.push(...made.map((m) => m.schedule.id));
  }
  const tMark = new Date();
  await db.$executeRaw`UPDATE "ScheduledDelivery" SET "deliverAtUtc" = ${new Date(tMark.getTime() - 60_000)}, "nextAttemptAt" = ${new Date(tMark.getTime() - 60_000)}, "updatedAt" = now() WHERE id = ANY(${ids}::uuid[])`;
  return { ids, tMark };
}
function worker(mode: "loop" | "once", args: string[] = [], env: Record<string, string> = {}) {
  const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/delivery-worker.mts", mode, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
  const exited = new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
  return { child, exited, output: () => out };
}
async function waitUntil(fn: () => Promise<boolean>, ms: number, step = 100) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(step); } return false; }
const countStatus = async (ids: string[], status: string) => num((await db.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "ScheduledDelivery" WHERE id = ANY(${ids}::uuid[]) AND status::text = ${status}`)[0].c);
const FAST = { DELIVERY_BACKOFF_BASE_MS: "500", DELIVERY_BACKOFF_CAP_MS: "1000", DELIVERY_JITTER: "0" };

async function verifyExactlyOnce(ids: string[], label: string) {
  const rows = await db.scheduledDelivery.findMany({ where: { id: { in: ids } }, include: { attempts: true, card: true, reservation: true } });
  const published = rows.filter((r) => r.status === "PUBLISHED");
  check(`${label}: every job is PUBLISHED exactly once`, published.length === ids.length && rows.every((r) => r.card.status === "PUBLISHED" && r.reservation.status === "COMMITTED" && r.attempts.filter((a) => a.status === "SUCCEEDED").length === 1), `${published.length}/${ids.length}`);
  const commits = num((await db.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "LedgerEntry" l JOIN "CreditReservation" r ON r.id = l."reservationId" JOIN "ScheduledDelivery" d ON d."reservationId" = r.id WHERE d.id = ANY(${ids}::uuid[]) AND l.kind = 'COMMIT'`)[0].c);
  const spent = rows.reduce((n, r) => n + (r.card.tier === "PREMIUM" ? 2 : 1), 0);
  check(`${label}: each credit was committed exactly once (${spent} COMMIT entries)`, commits === spent, `${commits}`);
  const f = await findAnomalies();
  check(`${label}: reconciliation clean (no anomalies, no ledger drift, no negative balance)`, f.anomalies.length === 0 && num((await db.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "CreditGrant" WHERE remaining < 0`)[0].c) === 0, JSON.stringify(f.anomalies.slice(0, 2)));
  return rows;
}

try {
  // ---------------------------------------------------------------- A: throughput, latency, graceful shutdown (3 worker processes)
  {
    // Workers are started FIRST and left idle, so the measured latency is queue latency (poll interval + processing), not process start-up.
    const ws = [0, 1, 2].map(() => worker("loop", ["--interval", "300", "--concurrency", "4", "--batch", "8"]));
    await sleep(1500);
    const { ids, tMark } = await seed(6, 10, 5); // 60 jobs, some premium; they only become due at tMark
    const done = await waitUntil(async () => (await countStatus(ids, "PUBLISHED")) === ids.length, 90_000, 20);
    const tDone = Date.now();
    check("A: 60 due jobs drained by 3 worker processes", done, `${(tDone - tMark.getTime())} ms`);
    const rows = await verifyExactlyOnce(ids, "A");
    const lat = rows.map((r) => r.publishedAt!.getTime() - tMark.getTime());
    const secs = (tDone - tMark.getTime()) / 1000;
    const span = Math.max(...rows.map((r) => r.publishedAt!.getTime())) - Math.min(...rows.map((r) => r.publishedAt!.getTime()));
    console.log(`      [measure] due->published latency (workers already running, 300 ms poll): p50 ${pct(lat, 50)} ms, p95 ${pct(lat, 95)} ms, max ${Math.max(...lat)} ms`);
    console.log(`      [measure] drain: ${ids.length} jobs in ${secs.toFixed(2)} s from the due instant (${(ids.length / secs).toFixed(0)} jobs/s overall; first-to-last publication span ${span} ms); database statements per job are measured separately by scripts/delivery-querycount.mts`);
    for (const w of ws) w.child.kill("SIGTERM");
    const codes = await Promise.all(ws.map((w) => w.exited));
    check("A: workers stop gracefully on SIGTERM (exit code 0, 'stopped' logged)", codes.every((c) => c === 0) && ws.every((w) => /"event":"stopped"/.test(w.output())), codes.join(","));
    check("A: worker output contains only counts and ids (no card text or addresses)", ws.every((w) => !/m\d-\d|LoadTest|@dlvload|leaseToken/.test(w.output())));
    const per = new Map<string, number>(); for (const r of rows) for (const a of r.attempts) per.set(a.workerId ?? "?", (per.get(a.workerId ?? "?") ?? 0) + 1);
    console.log(`      [measure] work spread across worker processes: ${[...per.values()].sort((a, b) => b - a).join(" / ")}`);
  }

  // ---------------------------------------------------------------- B: a worker process dies before commit
  {
    const { ids } = await seed(2, 6);
    const dead = worker("once", ["--concurrency", "4", "--batch", "12", "--lease-ms", "3000"], { ...FAST, MAWICA_DELIVERY_TEST_HOOKS: "1", DELIVERY_TEST_CRASH: "before_commit" });
    const code = await dead.exited; const tCrash = Date.now();
    check("B: the crashing worker died hard (exit 137)", code === 137, String(code));
    check("B: after the crash all jobs are PROCESSING, cards still private, credits still held", (await countStatus(ids, "PROCESSING")) === ids.length && (await countStatus(ids, "PUBLISHED")) === 0 && num((await db.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "Card" c JOIN "ScheduledDelivery" d ON d."cardId" = c.id WHERE d.id = ANY(${ids}::uuid[]) AND c.status = 'SCHEDULED'`)[0].c) === ids.length);
    const mid = await findAnomalies();
    check("B: reconciliation after the crash shows no corruption (only leases awaiting expiry)", mid.anomalies.length === 0);
    const healthy = worker("loop", ["--interval", "300", "--concurrency", "4", "--batch", "12", "--lease-ms", "3000"], FAST);
    const ok = await waitUntil(async () => (await countStatus(ids, "PUBLISHED")) === ids.length, 60_000, 150);
    const recoveryMs = Date.now() - tCrash;
    check("B: a healthy worker recovers the abandoned jobs and publishes them all", ok, `${recoveryMs} ms after the crash (lease 3000 ms + 500 ms backoff + polling)`);
    console.log(`      [measure] recovery time after a hard crash: ${recoveryMs} ms with a 3 s lease`);
    healthy.child.kill("SIGTERM"); await healthy.exited;
    const rows = await verifyExactlyOnce(ids, "B");
    check("B: every crashed attempt is recorded as ABANDONED and every job has exactly one SUCCEEDED attempt", rows.every((r) => r.attempts.some((a) => a.attemptNo === 1 && a.status === "ABANDONED") && r.attempts.filter((a) => a.status === "SUCCEEDED").length === 1));
  }

  // ---------------------------------------------------------------- C: a worker process dies right after a commit
  {
    const { ids } = await seed(1, 8);
    const dead = worker("once", ["--concurrency", "1", "--batch", "8", "--lease-ms", "3000"], { ...FAST, MAWICA_DELIVERY_TEST_HOOKS: "1", DELIVERY_TEST_CRASH: "after_commit" });
    const code = await dead.exited;
    check("C: the worker died hard right after its first commit (exit 137)", code === 137);
    check("C: exactly one job was published before the crash, the rest are PROCESSING", (await countStatus(ids, "PUBLISHED")) === 1 && (await countStatus(ids, "PROCESSING")) === ids.length - 1);
    const healthy = worker("loop", ["--interval", "300", "--concurrency", "4", "--batch", "8", "--lease-ms", "3000"], FAST);
    const ok = await waitUntil(async () => (await countStatus(ids, "PUBLISHED")) === ids.length, 60_000, 150);
    check("C: the survivor recovers the rest", ok);
    healthy.child.kill("SIGTERM"); await healthy.exited;
    await verifyExactlyOnce(ids, "C");
  }
} finally {
  // Delete by address pattern (not only the ids of this run) so a crashed earlier run cannot leave rows behind that block cleanup.
  const accs = (await db.creditAccount.findMany({ where: { user: { email: { endsWith: "@dlvload.example.test" } } }, select: { id: true } })).map((a) => a.id);
  await db.user.deleteMany({ where: { email: { endsWith: "@dlvload.example.test" } } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
    await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accs}::uuid[])`;
    await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
  });
  await db.card.deleteMany({ where: { recipientName: "LoadTest" } });
  await db.$disconnect();
  void execFileSync;
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name).join(" | ")); process.exitCode = 1; }
