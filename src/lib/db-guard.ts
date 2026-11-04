/**
 * Database isolation guard (no server-only import so CLIs and Prisma config can use it).
 * Local connections must target the dedicated Mawica cluster port (default 5433), never 5432,
 * which is the machine's shared Postgres. Remote hosts are accepted only in production.
 */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export function assertMawicaDatabaseUrl(raw: string, nodeEnv: string | undefined = process.env.NODE_ENV): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (LOCAL_HOSTS.includes(url.hostname)) {
    const allowed = process.env.MAWICA_PG_PORT ?? "5433";
    if (url.port !== allowed) {
      throw new Error(`Refusing local database on port ${url.port || "5432 (default)"}: Mawica uses its own cluster on port ${allowed}. Never the shared Postgres.`);
    }
    return;
  }
  if (nodeEnv !== "production") {
    throw new Error("Refusing a non-local DATABASE_URL outside production.");
  }
}
