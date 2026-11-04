import "server-only";
import { z } from "zod";
import { assertMawicaDatabaseUrl } from "./db-guard";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  RATE_LIMIT_SALT: z.string().min(16),
  ADMIN_TOKEN: z.string().min(24).optional(),
  /** Number of trusted reverse proxies in front of the app (see docs/security.md). 0 = ignore forwarded headers. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Never print values, only which keys are wrong.
  throw new Error(`Invalid environment: ${Object.keys(parsed.error.flatten().fieldErrors).join(", ")}`);
}

export const env = parsed.data;

// Isolation guard: always enforced (see db-guard.ts).
assertMawicaDatabaseUrl(env.DATABASE_URL);
