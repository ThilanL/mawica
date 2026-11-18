import "server-only";
import { z } from "zod";
import { assertMawicaDatabaseUrl } from "./db-guard";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  /** Max PostgreSQL connections per process (pg pool). Small servers (Azure B1ms) allow few connections; staging sets 5. Default 10 (pg default). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  RATE_LIMIT_SALT: z.string().min(16),
  ADMIN_TOKEN: z.string().min(24).optional(),
  /** Staging only: enables /api/_proxy-debug (needs ADMIN_TOKEN). Must be unset in production. */
  ENABLE_PROXY_DEBUG: z.enum(["0", "1"]).optional(),
  /** Number of trusted reverse proxies in front of the app (see docs/security.md). 0 = ignore forwarded headers. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  /** Accounts (Better Auth). Optional so the guest card flow never depends on them; auth routes fail closed without them. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Public base URL used for Origin checks and cookies. Defaults to NEXT_PUBLIC_SITE_URL. */
  BETTER_AUTH_URL: z.string().url().optional(),
  /** Extra comma-separated origins allowed to call auth endpoints (local dev on other ports only). */
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  /** Secret for the welcome-credit tombstone HMAC. Used for nothing else; never rotate (rotating unlinks old tombstones). Wallet creation fails closed without it. */
  WELCOME_PEPPER: z.string().min(32).optional(),
  /** File that the LOCAL mail transport appends one-time codes to. Dev/test only; unset in production = no mail is sent. */
  MAIL_LOCAL_OUTBOX: z.string().optional(),
  /** Transactional email provider. Unset = local outbox in development/test, none in production (sending fails closed). */
  EMAIL_PROVIDER: z.enum(["none", "local-outbox", "acs"]).optional(),
  /** Marks a deliberate local run of a production build (with a loopback database). Never set it in staging or production. */
  MAWICA_ENV: z.enum(["local"]).optional(),
  ACS_EMAIL_ENDPOINT: z.string().optional(),
  ACS_EMAIL_ACCESS_KEY: z.string().optional(),
  /** Sender for account sign-in codes, e.g. DoNotReply@<verified domain>. */
  EMAIL_FROM_AUTH: z.string().optional(),
  /** "1" = no external provider is ever used (kill switch). */
  MAWICA_DISABLE_EXTERNAL_EMAIL: z.enum(["0", "1"]).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Never print values, only which keys are wrong.
  throw new Error(`Invalid environment: ${Object.keys(parsed.error.flatten().fieldErrors).join(", ")}`);
}

export const env = parsed.data;

// Isolation guard: always enforced (see db-guard.ts).
assertMawicaDatabaseUrl(env.DATABASE_URL);
