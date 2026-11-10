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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: DB_SESSION_OPTIONS }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
