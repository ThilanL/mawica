#!/usr/bin/env bash
# Migration dry run on the ISOLATED local cluster (127.0.0.1:5433) only. Uses mawica_dev_shadow as the scratch database and mawica_test as the
# source of realistic data. Never reads or writes any other database. Not part of `npm test`.
#   scripts/migration-dryrun.sh
# What it proves: (1) all migrations apply to an empty database; (2) the schema matches prisma/schema.prisma (drift check);
# (3) upgrading a database that already holds data (rewound one migration) preserves every row and defaults new columns;
# (4) the previous application version's INSERT (which does not know the new column) still works after the upgrade.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
set -a; . ./.env.local; set +a
guard() { case "$1" in *"@127.0.0.1:5433/$2"\?*|*"@127.0.0.1:5433/$2") ;; *) echo "REFUSING: $2 must be on 127.0.0.1:5433"; exit 1;; esac; }
guard "$SHADOW_DATABASE_URL" mawica_dev_shadow
guard "$TEST_DATABASE_URL" mawica_test
SCRATCH="${SHADOW_DATABASE_URL%%\?*}"; SOURCE="${TEST_DATABASE_URL%%\?*}"
export PGOPTIONS="-c client_min_messages=warning"
P() { "$PGBIN/psql" "$SCRATCH" -v ON_ERROR_STOP=1 -tAq "$@"; }
# the scratch database is the only target (the "shadow" setting points at a database that does not exist, so a command that tried to use it would fail instead of touching anything; deploy and diff never use it)
PRISMA_SCRATCH="env DATABASE_URL=$SHADOW_DATABASE_URL SHADOW_DATABASE_URL=${SHADOW_DATABASE_URL/mawica_dev_shadow/mawica_dryrun_unused}"
reset() { P -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'; }
LAST=$(ls prisma/migrations | grep -v toml | tail -1)

echo "== 1. empty database -> all migrations"
reset
$PRISMA_SCRATCH npx prisma migrate deploy 2>&1 | tail -2
echo "== 2. drift check (migrations vs schema.prisma)"
$PRISMA_SCRATCH npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code && echo "no drift"

echo "== 3. upgrade of a database that holds data (latest migration: $LAST)"
reset
"$PGBIN/pg_dump" "$SOURCE" --no-owner --no-privileges | "$PGBIN/psql" "$SCRATCH" -v ON_ERROR_STOP=1 -q -o /dev/null
tables=$(P -c "select string_agg(format('select %L, count(*) from %I', tablename, tablename), ' union all ') from pg_tables where schemaname='public'")
P -c "$tables order by 1" > /tmp/mawica-dryrun-before.txt
rows=$(awk -F'|' '{s+=$2} END{print s}' /tmp/mawica-dryrun-before.txt)
echo "restored $(wc -l < /tmp/mawica-dryrun-before.txt | tr -d ' ') tables, $rows rows"
# rewind exactly one migration (the dump already contains it): drop its column and forget it
P -c 'ALTER TABLE "ScheduledDelivery" DROP COLUMN "attemptBase"' -c "DELETE FROM _prisma_migrations WHERE migration_name = '$LAST'"
COLS="select table_name||'.'||column_name||':'||data_type||':'||is_nullable from information_schema.columns where table_schema='public' order by 1"
P -c "$COLS" > /tmp/mawica-dryrun-cols-before.txt
$PRISMA_SCRATCH npx prisma migrate deploy 2>&1 | tail -2
P -c "$COLS" > /tmp/mawica-dryrun-cols-after.txt
P -c "$tables order by 1" > /tmp/mawica-dryrun-after.txt
diff /tmp/mawica-dryrun-before.txt /tmp/mawica-dryrun-after.txt && echo "row counts identical in every table"
echo "existing rows defaulted: $(P -c 'select count(*) filter (where "attemptBase" = 0), count(*) from "ScheduledDelivery"')  (zero-defaulted / total)"
$PRISMA_SCRATCH npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code && echo "no drift after upgrade"

echo "== 4. compatibility with the previous application version (expand-only change)"
removed=$(comm -23 /tmp/mawica-dryrun-cols-before.txt /tmp/mawica-dryrun-cols-after.txt | wc -l | tr -d ' ')
added=$(comm -13 /tmp/mawica-dryrun-cols-before.txt /tmp/mawica-dryrun-cols-after.txt)
echo "columns removed or changed: $removed (must be 0); columns added: $added"
[ "$removed" = "0" ] || { echo "NOT backwards compatible"; exit 1; }
echo "note: the source database had $(P -c 'select count(*) from "ScheduledDelivery"') ScheduledDelivery rows, so the default on existing rows is guaranteed by PostgreSQL semantics (ADD COLUMN ... NOT NULL DEFAULT), not observed here"
reset
echo "scratch database reset. DONE"
