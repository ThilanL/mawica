/* eslint-disable @typescript-eslint/no-explicit-any, no-var -- dev tooling */
// Counts the exact database statements the delivery engine issues per job (the pg driver's query() is wrapped). One process, isolated mawica_test.
//   DATABASE_URL=<mawica_test url> node --conditions=react-server --import tsx scripts/delivery-querycount.mts
try { process.loadEnvFile(".env.local"); } catch { /* real environment */ }
import pg from "pg";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/mawica_test" || dbUrl.port !== (process.env.MAWICA_PG_PORT ?? "5433")) throw new Error("Refusing to run: DATABASE_URL must point at mawica_test on port 5433");
let counting = false; const counts = { statements: 0, begin: 0, commit: 0 };
const orig = (pg.Client.prototype as any).query;
(pg.Client.prototype as any).query = function (...args: any[]) {
  if (counting) { const t = String(typeof args[0] === "string" ? args[0] : args[0]?.text ?? ""); if (/^\s*BEGIN/i.test(t)) counts.begin++; else if (/^\s*COMMIT/i.test(t)) counts.commit++; else counts.statements++; }
  return orig.apply(this, args);
};
const { db } = await import("../src/lib/db");
const { createSchedule } = await import("../src/modules/scheduling/service");
const { claimDue, processClaim } = await import("../src/modules/delivery/queue");
const { DEFAULT_POLICY } = await import("../src/modules/delivery/config");
const { welcomeHash } = await import("../src/modules/wallet/wallet");

const N = 20, users: string[] = [], emails: string[] = [];
const ids: string[] = [];
for (let i = 0; i < N; i++) {
  if (i % 10 === 0) { var u = { id: crypto.randomUUID(), email: "", emailVerified: true }; u.email = `${u.id}@dlvcount.example.test`; await db.user.create({ data: { id: u.id, name: "", email: u.email, emailVerified: true } }); users.push(u.id); emails.push(u.email); } // Free plan: 10 credits each
  ids.push((await createSchedule({ templateKey: "snow-globe", recipientName: "CountTest", senderName: "S", message: `c${i}`, saveRecipient: false, channel: "LINK", schedule: { localDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), localTime: "09:00", timeZone: "UTC" } } as never, u, { idempotencyKey: `count-${crypto.randomUUID()}`.slice(0, 40) })).schedule.id);
}
const past = new Date(Date.now() - 60_000);
await db.$executeRaw`UPDATE "ScheduledDelivery" SET "deliverAtUtc" = ${past}, "nextAttemptAt" = ${past}, "updatedAt" = now() WHERE id = ANY(${ids}::uuid[])`;

const ctx = { policy: { ...DEFAULT_POLICY }, clock: () => new Date() };
counting = true;
const claims = await claimDue("count-worker", new Date(), { limit: N, leaseMs: 60_000 });
const claimStmts = counts.statements, claimTx = counts.begin;
await Promise.all(claims.map((c) => processClaim(c, ctx)));
counting = false;
const publishStmts = counts.statements - claimStmts, publishTx = counts.begin - claimTx;
console.log(JSON.stringify({ jobs: claims.length, claim: { statementsForBatch: claimStmts, transactions: claimTx, statementsPerJob: +(claimStmts / N).toFixed(2) }, publish: { statementsPerJob: +(publishStmts / N).toFixed(1), transactionsPerJob: +(publishTx / N).toFixed(1), commitsTotal: counts.commit } }));
const accs = (await db.creditAccount.findMany({ where: { user: { email: { endsWith: "@dlvcount.example.test" } } }, select: { id: true } })).map((a) => a.id);
await db.user.deleteMany({ where: { email: { endsWith: "@dlvcount.example.test" } } });
await db.$transaction(async (tx) => {
  await tx.$executeRaw`SET LOCAL mawica.ledger_purge = 'on'`;
  await tx.$executeRaw`DELETE FROM "LedgerEntry" WHERE "accountId" = ANY(${accs}::uuid[])`;
  await tx.$executeRaw`DELETE FROM "CreditReservation" WHERE "accountId" = ANY(${accs}::uuid[])`;
  await tx.$executeRaw`DELETE FROM "CreditGrant" WHERE "accountId" = ANY(${accs}::uuid[])`;
  await tx.$executeRaw`DELETE FROM "CreditAccount" WHERE id = ANY(${accs}::uuid[])`;
  await tx.$executeRaw`DELETE FROM "WelcomeGrantTombstone" WHERE "emailHash" = ANY(${emails.map(welcomeHash)})`;
});
await db.card.deleteMany({ where: { recipientName: "CountTest" } });
await db.$disconnect();
