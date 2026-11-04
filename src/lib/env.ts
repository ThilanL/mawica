import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  RATE_LIMIT_SALT: z.string().min(16),
  ADMIN_TOKEN: z.string().min(24).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Never print values, only which keys are wrong.
  throw new Error(`Invalid environment: ${Object.keys(parsed.error.flatten().fieldErrors).join(", ")}`);
}

export const env = parsed.data;

// Isolation guard: development must never point at a non-local database.
if (process.env.NODE_ENV === "development") {
  const url = new URL(env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Refusing to run in development against a non-local DATABASE_URL.");
  }
  // 5432 is the machine's shared Postgres. Mawica uses its own cluster (docs/local-database.md).
  if (url.port === "5432" || url.port === "") {
    throw new Error("Refusing to use the shared Postgres on port 5432. Use the Mawica cluster (default 5433).");
  }
}
