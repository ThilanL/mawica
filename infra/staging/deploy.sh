#!/usr/bin/env bash
# Provision (or preview) the temporary Mawica STAGING infrastructure from infra/staging/main.json.
#   infra/staging/deploy.sh what-if     # preview only (no changes)
#   infra/staging/deploy.sh create      # first provisioning (PG_ZONE=1|2|3 pins PostgreSQL to a zone)
#
# Secret hygiene:
# - The PostgreSQL admin password, Better Auth secret, welcome pepper and rate-limit salt are generated here with openssl and handed to az
#   through a process-substitution pipe (/dev/fd/N): never written to disk, never on a command line (so not visible in `ps`), never echoed.
# - They are secureString parameters: ARM does not store their values in deployment history; the template never outputs them; they end up only
#   in PostgreSQL and Key Vault. The script prints only the deployment state and non-secret outputs. Never add --debug (it logs request bodies).
# - Re-running "create" generates NEW secrets (the welcome pepper must never rotate once data exists), so it refuses once PostgreSQL exists.
set -euo pipefail

SUBSCRIPTION="d5b6244c-44ac-49fb-9e93-a628acfea802"
TENANT="82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8"
RG="rg-mawica-staging-aue"
LOCATION="australiaeast"
HERE="$(cd "$(dirname "$0")" && pwd)"
export AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-$HOME/.azure-mawica}"
export AZURE_CORE_ONLY_SHOW_ERRORS=true
MODE="${1:-what-if}"

# Identity guard: the Mawica subscription and tenant, or stop.
read -r sub ten < <(az account show --query "[id, tenantId]" -o tsv | paste -sd' ' -)
if [[ "$sub" != "$SUBSCRIPTION" || "$ten" != "$TENANT" ]]; then echo "STOP: active Azure account is not the Mawica subscription/tenant" >&2; exit 1; fi

# Re-running generates NEW secrets. That is harmless only while no database (and so no data or sessions) exists: refuse once PostgreSQL is there.
if [[ "$MODE" == "create" ]] && [[ -n "$(az postgres flexible-server list -g "$RG" --query '[].name' -o tsv 2>/dev/null || true)" ]]; then
  echo "STOP: PostgreSQL already exists in $RG. Re-running would rotate secrets (and the welcome pepper must never rotate); change resources individually instead." >&2; exit 1
fi

secrets_json() {
  # PostgreSQL needs 3 of 4 character classes; URL-safe characters only (it is embedded in DATABASE_URL).
  printf '{"$schema":"https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#","contentVersion":"1.0.0.0","parameters":{"pgAdminPassword":{"value":"Mw%sZq9"},"betterAuthSecret":{"value":"%s"},"welcomePepper":{"value":"%s"},"rateLimitSalt":{"value":"%s"}}}' \
    "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 24)"
}

az group create -n "$RG" -l "$LOCATION" --tags app=mawica env=staging temporary=true -o none
case "$MODE" in
  what-if) az deployment group what-if -g "$RG" -n mawica-staging --template-file "$HERE/main.json" --parameters "@"<(secrets_json) pgZone="${PG_ZONE:-}" --no-pretty-print -o json \
             | python3 -I "$HERE/whatif-summary.py" ;;
  create)  az deployment group create -g "$RG" -n mawica-staging --template-file "$HERE/main.json" --parameters "@"<(secrets_json) pgZone="${PG_ZONE:-}" --query "properties.{state:provisioningState, outputs:outputs}" -o json ;;
  *) echo "usage: $0 what-if|create" >&2; exit 2 ;;
esac
