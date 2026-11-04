import { defineConfig } from "prisma/config";
import { assertMawicaDatabaseUrl } from "./src/lib/db-guard";

// Prisma does not read .env.local on its own. Node 20.12+ can load it natively.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI / production provide real environment variables */
}

if (process.env.DATABASE_URL) assertMawicaDatabaseUrl(process.env.DATABASE_URL);
if (process.env.SHADOW_DATABASE_URL) assertMawicaDatabaseUrl(process.env.SHADOW_DATABASE_URL);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
