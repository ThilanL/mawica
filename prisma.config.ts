import { defineConfig } from "prisma/config";

// Prisma does not read .env.local on its own. Node 20.12+ can load it natively.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI / production provide real environment variables */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
