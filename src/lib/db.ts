import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Every app connection runs in UTC. With @prisma/adapter-pg, Dates sent to / read from timestamptz columns are
 * interpreted in the SESSION time zone, so a server or database set to anything else (this machine: Australia/Melbourne)
 * silently shifts timestamps by the UTC offset: sessions, OTP expiry and audit times would be wrong.
 * Found by the accounts end-to-end tests; see docs/accounts.md.
 */
export const DB_SESSION_OPTIONS = "-c timezone=UTC";

/**
 * Pool settings for a database that may be far away (staging: Singapore, ~93 ms per round trip, ~0.9 s to open a TLS connection):
 * keep connections open and warm instead of reconnecting, fail fast when the database is unreachable, and cap the pool so a small
 * server (Azure B1ms) is never exhausted. Statement and idle-in-transaction limits are also set on the runtime database role.
 */
export const DB_POOL = { connectionTimeoutMillis: 10_000, idleTimeoutMillis: 300_000, keepAlive: true } as const;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: DB_SESSION_OPTIONS, max: env.DATABASE_POOL_MAX, ...DB_POOL }),
    // Default for transactions without explicit limits (the wallet/scheduling ones set 15 s themselves); 5 s is tight at ~93 ms per query.
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
