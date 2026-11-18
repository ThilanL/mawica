-- Mawica database roles (idempotent). Run once per database as the server admin, BEFORE the first migration:
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v app_password="$APP_PW" -v migrate_password="$MIGRATE_PW" -v dbname=mawica -f roles.sql
-- Re-running is safe: it (re)sets the two passwords and re-applies grants. It never drops or truncates anything.
--
-- mawica_migrator  owns the schema objects; used ONLY by `prisma migrate deploy` (migration job). DDL allowed in schema public.
-- mawica_app       runtime role for the web app: data read/write only (no DDL, no TRUNCATE, no role/database changes).
-- The server admin (mawicaadmin) is kept for break-glass only and is never given to the app.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE mawica_migrator LOGIN PASSWORD %L', :'migrate_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mawica_migrator') \gexec
SELECT format('ALTER ROLE mawica_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'migrate_password') \gexec

SELECT format('CREATE ROLE mawica_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mawica_app') \gexec
SELECT format('ALTER ROLE mawica_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_password') \gexec

-- Safety nets for the runtime role: bounded statements, no stuck transactions, few connections (B1ms allows ~50).
ALTER ROLE mawica_app SET statement_timeout = '30s';
ALTER ROLE mawica_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE mawica_app SET timezone = 'UTC';
ALTER ROLE mawica_app CONNECTION LIMIT 15;
ALTER ROLE mawica_migrator SET timezone = 'UTC';
ALTER ROLE mawica_migrator CONNECTION LIMIT 5;

-- Database: both may connect; nobody else (PUBLIC) may.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'dbname') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO mawica_app', :'dbname') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO mawica_migrator', :'dbname') \gexec

-- Schema public: the migrator creates objects; the app only uses them.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mawica_migrator;
GRANT USAGE ON SCHEMA public TO mawica_app;

-- Existing objects (if any were created before this script) are handed to the migrator; the app gets data access.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm') AND pg_get_userbyid(c.relowner) <> 'mawica_migrator' LOOP
    EXECUTE format('ALTER %s public.%I OWNER TO mawica_migrator', CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.relname);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' AND pg_get_userbyid(t.typowner) <> 'mawica_migrator' LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO mawica_migrator', r.typname);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mawica_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mawica_app;
-- Prisma's own bookkeeping table is for migrations only.
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public._prisma_migrations FROM mawica_app'; END IF;
END $$;

-- Future objects created by the migrator get the same app grants automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE mawica_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mawica_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mawica_migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mawica_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mawica_migrator IN SCHEMA public GRANT USAGE ON TYPES TO mawica_app;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolconnlimit FROM pg_roles WHERE rolname IN ('mawica_app', 'mawica_migrator') ORDER BY 1;
