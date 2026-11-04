import "server-only";
import { db } from "@/lib/db";

export type RateResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Atomic fixed-window limiter: one INSERT .. ON CONFLICT statement both resets an
 * expired window and increments the counter, so concurrent requests cannot race.
 * Retention: rows live until their window ends, then are purged after 24h.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<RateResult> {
  const rows = await db.$queryRaw<{ count: number; ttl: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "expiresAt")
    VALUES (${key}, 1, now(), now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"       = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN now() ELSE "RateLimit"."windowStart" END,
      "expiresAt"   = CASE WHEN "RateLimit"."expiresAt" <= now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimit"."expiresAt" END
    RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("expiresAt" - now())))::int AS ttl`;
  const { count, ttl } = rows[0];
  if (Math.random() < 0.02) void purgeExpired();
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: Math.max(1, ttl) };
}

export async function purgeExpired(): Promise<number> {
  return db.$executeRaw`DELETE FROM "RateLimit" WHERE "expiresAt" < now() - interval '24 hours'`;
}
