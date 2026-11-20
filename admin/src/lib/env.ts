import "server-only";
import { z } from "zod";
import { assertMawicaDatabaseUrl } from "../../../src/lib/db-guard";

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
  ADMIN_DEV_AUTH: z.enum(["0", "1"]).optional(),
  ADMIN_DEV_STAFF_EMAIL: z.string().email().optional(),
  ADMIN_DEV_STAFF_OID: z.string().min(3).optional(),
  ADMIN_DEV_STAFF_ROLE: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid admin environment: ${Object.keys(parsed.error.flatten().fieldErrors).join(", ")}`);
}

export const env = parsed.data;
assertMawicaDatabaseUrl(env.DATABASE_URL, env.NODE_ENV === "test" ? "development" : env.NODE_ENV);

export function entraConfigured(): boolean {
  return Boolean(
    env.ADMIN_ENTRA_TENANT_ID &&
      env.ADMIN_ENTRA_CLIENT_ID &&
      env.ADMIN_ENTRA_CLIENT_SECRET &&
      env.ADMIN_ENTRA_REDIRECT_URI,
  );
}

export function devAuthEnabled(): boolean {
  return env.ADMIN_DEV_AUTH === "1" && env.NODE_ENV !== "production";
}
