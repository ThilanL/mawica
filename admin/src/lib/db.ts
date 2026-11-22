import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { adminPrisma?: PrismaClient };

export const DB_SESSION_OPTIONS = "-c timezone=UTC";

export const db =
  globalForPrisma.adminPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      options: DB_SESSION_OPTIONS,
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 300_000,
      keepAlive: true,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.adminPrisma = db;
