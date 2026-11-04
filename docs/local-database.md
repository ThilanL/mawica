# Local database (isolated Mawica PostgreSQL cluster)

Mawica runs its **own** PostgreSQL 17 cluster for local development. It is separate from any other
Postgres on the machine (e.g. the Homebrew `postgresql@17` service on port 5432): different data
directory, port, superuser, application role and databases. No script here touches the Homebrew service.

| | Value |
|---|---|
| Data directory | `~/.mawica/postgres/data` (override with `MAWICA_PG_HOME`) |
| Listen address / port | `127.0.0.1:5433` (override with `MAWICA_PG_PORT`) |
| Auth | `scram-sha-256` for every connection (local socket and TCP) |
| Cluster superuser | `mawica_admin` (password in `~/.mawica/postgres/.admin_pw`, mode 600) |
| App role | `mawica_app`, no superuser/createdb/createrole (password in `.app_pw`, mode 600) |
| Databases | `mawica_dev`, `mawica_dev_shadow` (Prisma migrate shadow DB) |
| Log | `~/.mawica/postgres/server.log` |

Binaries come from Homebrew (`/opt/homebrew/opt/postgresql@17/bin`, override with `PGBIN`); only the
binaries are shared, never the running service or its data.

## Setup (once)
```bash
scripts/mawica-db.sh init        # creates cluster, role, databases, starts it
```
Put the printed password into `.env.local` (see `.env.example`):
```
DATABASE_URL="postgresql://mawica_app:<pw>@127.0.0.1:5433/mawica_dev?schema=public"
SHADOW_DATABASE_URL="postgresql://mawica_app:<pw>@127.0.0.1:5433/mawica_dev_shadow?schema=public"
```
Then `npx prisma migrate deploy`.

## Daily use
```bash
scripts/mawica-db.sh start | stop | status
scripts/mawica-db.sh psql        # psql as mawica_app on mawica_dev
```
The cluster does not start at login. Start it before `npm run dev`. Stopping it never affects other Postgres instances.

## Safety rails
- `src/lib/env.ts` refuses, in development, a non-local host or port 5432.
- `.env.local` is gitignored; `.env.example` holds fake values only.

## Recovery
- **Server won't start:** read `~/.mawica/postgres/server.log`. A stale `postmaster.pid` after a crash is removed by `pg_ctl` automatically; if the port is taken, set `MAWICA_PG_PORT` and update both URLs.
- **Locale error ("multithreaded during startup"):** the script exports `LC_ALL=en_US.UTF-8`; export it yourself if you call `pg_ctl` by hand.
- **Lost password:** `.app_pw` / `.admin_pw` hold the originals. To reset: connect as `mawica_admin` and `ALTER ROLE mawica_app PASSWORD '...'`, then update `.env.local`.
- **Data lost or corrupted (dev only):** `scripts/mawica-db.sh destroy && scripts/mawica-db.sh init && npx prisma migrate deploy`. `destroy` deletes only `~/.mawica/postgres`.
- **Backup:** `PGPASSWORD=$(cat ~/.mawica/postgres/.app_pw) pg_dump -h 127.0.0.1 -p 5433 -U mawica_app mawica_dev > mawica_dev.sql`
- **Production:** separate Azure Database for PostgreSQL (not provisioned; needs approval). Never reuse these credentials.
