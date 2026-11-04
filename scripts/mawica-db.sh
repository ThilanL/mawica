#!/usr/bin/env bash
# Isolated local PostgreSQL cluster for Mawica. Independent of any other Postgres on this machine.
# Usage: scripts/mawica-db.sh init | start | stop | status | psql | destroy
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"   # binaries only; the running Homebrew service is never touched
BASE="${MAWICA_PG_HOME:-$HOME/.mawica/postgres}"
DATA="$BASE/data"
LOG="$BASE/server.log"
PORT="${MAWICA_PG_PORT:-5433}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"

case "${1:-}" in
  init)
    [ -e "$DATA/PG_VERSION" ] && { echo "Cluster already exists at $DATA"; exit 1; }
    if lsof -iTCP:"$PORT" -sTCP:LISTEN -P -n >/dev/null 2>&1; then echo "Port $PORT is in use; choose MAWICA_PG_PORT"; exit 1; fi
    mkdir -p "$BASE" && chmod 700 "$BASE"
    umask 077
    openssl rand -hex 24 > "$BASE/.admin_pw"; openssl rand -hex 24 > "$BASE/.app_pw"
    "$PGBIN/initdb" -D "$DATA" -U mawica_admin --auth=scram-sha-256 --pwfile="$BASE/.admin_pw" -E UTF8 --locale=en_US.UTF-8 >/dev/null
    cat >> "$DATA/postgresql.conf" <<CONF
port = $PORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '$BASE'
CONF
    "$0" start
    export PGPASSWORD="$(cat "$BASE/.admin_pw")"
    APP_PW="$(cat "$BASE/.app_pw")"
    PSQL=("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U mawica_admin -d postgres -v ON_ERROR_STOP=1 -q)
    "${PSQL[@]}" -c "CREATE ROLE mawica_app LOGIN PASSWORD '$APP_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE"
    "${PSQL[@]}" -c "CREATE DATABASE mawica_dev OWNER mawica_app" -c "CREATE DATABASE mawica_dev_shadow OWNER mawica_app"
    "${PSQL[@]}" -c "REVOKE CONNECT ON DATABASE mawica_dev, mawica_dev_shadow FROM PUBLIC"
    echo "Created cluster at $DATA on 127.0.0.1:$PORT. Passwords are in $BASE/.app_pw and .admin_pw (mode 600)."
    ;;
  start)  "$PGBIN/pg_ctl" -D "$DATA" -l "$LOG" -w start ;;
  stop)   "$PGBIN/pg_ctl" -D "$DATA" -m fast -w stop ;;
  status) "$PGBIN/pg_ctl" -D "$DATA" status ;;
  psql)   PGPASSWORD="$(cat "$BASE/.app_pw")" exec "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U mawica_app -d mawica_dev ;;
  destroy) # Deletes ONLY this Mawica cluster directory.
    "$0" stop || true; [ "$(basename "$BASE")" = postgres ] && rm -rf "$BASE" && echo "Removed $BASE" ;;
  *) echo "Usage: $0 init|start|stop|status|psql|destroy"; exit 2 ;;
esac
