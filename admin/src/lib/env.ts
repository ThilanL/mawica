import "server-only";
import { z } from "zod";
import { assertMawicaDatabaseUrl } from "../../../src/lib/db-guard";
import {
  assertProductionRuntimeConfig,
  entraFullyConfigured,
} from "./production-guards";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  RATE_LIMIT_SALT: z.string().min(16),
  ADMIN_APP_URL: z.string().url().default("http://localhost:3010"),
  ADMIN_SESSION_SECRET: z.string().min(32),
  ADMIN_ENTRA_TENANT_ID: z.string().min(1).optional(),
  ADMIN_ENTRA_CLIENT_ID: z.string().min(1).optional(),
  ADMIN_ENTRA_CLIENT_SECRET: z.string().min(1).optional(),
  ADMIN_ENTRA_REDIRECT_URI: z.string().url().optional(),
  ADMIN_STAFF_ALLOWLIST: z.string().optional(),
  /** Explicit extra origins only — never populated from forwarded Host headers. */
  ADMIN_TRUSTED_ORIGINS: z.string().optional(),
  ADMIN_DEV_AUTH: z.enum(["0", "1"]).optional(),
  ADMIN_DEV_STAFF_EMAIL: z.string().email().optional(),
  ADMIN_DEV_STAFF_OID: z.string().min(3).optional(),
  ADMIN_DEV_STAFF_ROLE: z.string().optional(),
  /** How many reverse-proxy hops to trust for X-Forwarded-For (ACA = 1). */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid admin environment: ${Object.keys(parsed.error.flatten().fieldErrors).join(", ")}`);
}

export const env = parsed.data;
assertMawicaDatabaseUrl(env.DATABASE_URL, env.NODE_ENV === "test" ? "development" : env.NODE_ENV);
assertProductionRuntimeConfig(env);

export function entraConfigured(): boolean {
  return entraFullyConfigured(env);
}

/** Local-only bypass. Always false in production, even if ADMIN_DEV_AUTH=1 (startup already throws). */
export function devAuthEnabled(): boolean {
  return env.ADMIN_DEV_AUTH === "1" && env.NODE_ENV !== "production";
}
