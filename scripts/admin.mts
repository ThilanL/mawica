/**
 * Admin CLI (run on a trusted machine with DATABASE_URL set; there is no public admin endpoint).
 *   npm run admin -- remove <slug> "reason"
 *   npm run admin -- reports            (list reported cards)
 *   npm run admin -- purge              (delete expired rate-limit rows and reports older than 90 days)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertMawicaDatabaseUrl } from "../src/lib/db-guard";

try { process.loadEnvFile(".env.local"); } catch { /* use real env */ }
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
assertMawicaDatabaseUrl(url);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c timezone=UTC" }) });

const [cmd, slug, ...rest] = process.argv.slice(2);
try {
  if (cmd === "remove" && slug) {
    const r = await db.card.updateMany({ where: { slug, status: "PUBLISHED" }, data: { status: "REMOVED", removedAt: new Date(), removedReason: rest.join(" ").slice(0, 200) || "admin" } });
    console.log(r.count ? `Removed ${slug}` : `No published card ${slug}`);
  } else if (cmd === "reports") {
    const rows = await db.report.groupBy({ by: ["cardId", "reason"], _count: true, orderBy: { _count: { cardId: "desc" } } });
    const cards = await db.card.findMany({ where: { id: { in: rows.map((r) => r.cardId) } }, select: { id: true, slug: true, status: true } });
    for (const r of rows) console.log(cards.find((c) => c.id === r.cardId)?.slug, cards.find((c) => c.id === r.cardId)?.status, r.reason, r._count);
  } else if (cmd === "purge") {
    const a = await db.$executeRaw`DELETE FROM "RateLimit" WHERE "expiresAt" < now() - interval '24 hours'`;
    const b = await db.$executeRaw`DELETE FROM "Report" WHERE "createdAt" < now() - interval '90 days'`;
    console.log(`Purged ${a} rate-limit rows, ${b} old reports`);
  } else {
    console.log("Usage: remove <slug> [reason] | reports | purge");
  }
} finally {
  await db.$disconnect();
}
