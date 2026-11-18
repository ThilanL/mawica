#!/usr/bin/env bash
# Mawica STAGING workload (infra/staging/app.json). Run ONLY with the owner's approval. Images must already exist in GHCR (built by CI).
#   infra/staging/app.sh what-if <tag>      preview (no changes)
#   infra/staging/app.sh roles   <tag>      NEW passwords for mawica_app/mawica_migrator -> Key Vault; create/update jobs; run the role job
#   infra/staging/app.sh migrate            run `prisma migrate deploy` (migration job, inside the VNet), then re-apply grants
#   infra/staging/app.sh web     <tag>      create/update the web container app (scale 0-1) and smoke-test it
#   infra/staging/app.sh status             show jobs, app revision and URL
# Passwords are generated here and passed to ARM through a pipe (never on disk, never on a command line, never printed).
set -euo pipefail

SUBSCRIPTION="d5b6244c-44ac-49fb-9e93-a628acfea802"; TENANT="82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8"
RG="rg-mawica-staging-aue"; REPO_IMG="ghcr.io/thilanl/mawica"
HERE="$(cd "$(dirname "$0")" && pwd)"
export AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-$HOME/.azure-mawica}" AZURE_CORE_ONLY_SHOW_ERRORS=true
MODE="${1:-status}"; TAG="${2:-}"

read -r sub ten < <(az account show --query "[id, tenantId]" -o tsv | paste -sd' ' -)
[[ "$sub" == "$SUBSCRIPTION" && "$ten" == "$TENANT" ]] || { echo "STOP: not the Mawica subscription/tenant" >&2; exit 1; }

need_tag() { [[ -n "$TAG" ]] || { echo "usage: $0 $MODE <image tag>" >&2; exit 2; }; }
roles_b64() { base64 < "$HERE/sql/roles.sql" | tr -d '\n'; }
pw_params() { # new random passwords (URL-safe; 3 character classes)
  printf '{"$schema":"https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#","contentVersion":"1.0.0.0","parameters":{"appDbPassword":{"value":"Ma%sQ7x"},"migrateDbPassword":{"value":"Mm%sR4y"}}}' "$(openssl rand -hex 20)" "$(openssl rand -hex 20)"
}
deploy() { # $1 = deployWebApp, $2 = rotate (yes/no)
  local extra=(); [[ "$2" == yes ]] && extra=(--parameters "@"<(pw_params))
  az deployment group create -g "$RG" -n mawica-staging-app --template-file "$HERE/app.json" \
    --parameters webImage="$REPO_IMG/web:$TAG" migrateImage="$REPO_IMG/migrate:$TAG" rolesSqlB64="$(roles_b64)" deployWebApp="$1" "${extra[@]}" \
    --query "properties.{state:provisioningState, outputs:outputs}" -o json
}
run_job() { # $1 = job name; waits and prints only lines the job marks as results
  local ex st; ex="$(az containerapp job start -g "$RG" -n "$1" --query name -o tsv)"; echo "started $1 ($ex)"
  for _ in $(seq 1 90); do st="$(az containerapp job execution show -g "$RG" -n "$1" --job-execution-name "$ex" --query properties.status -o tsv 2>/dev/null || true)"; [[ "$st" == Succeeded || "$st" == Failed ]] && break; sleep 10; done
  echo "$1: ${st:-unknown}"; [[ "$st" == Succeeded ]]
}

case "$MODE" in
  what-if)
    need_tag
    az deployment group what-if -g "$RG" -n mawica-staging-app --template-file "$HERE/app.json" \
      --parameters webImage="$REPO_IMG/web:$TAG" migrateImage="$REPO_IMG/migrate:$TAG" rolesSqlB64="$(roles_b64)" deployWebApp=true "@"<(pw_params) \
      --no-pretty-print -o json | python3 -I "$HERE/whatif-summary.py" ;;
  roles)   need_tag; deploy false yes; run_job caj-mawica-stg-dbroles ;;
  migrate) run_job caj-mawica-stg-migrate && run_job caj-mawica-stg-dbroles ;;   # re-apply grants (revokes app writes on _prisma_migrations)
  web)
    need_tag; deploy true no
    url="$(az containerapp show -g "$RG" -n ca-mawica-stg --query properties.configuration.ingress.fqdn -o tsv)"
    for _ in $(seq 1 30); do code="$(curl -s -o /dev/null -w '%{http_code}' "https://$url/api/health" || true)"; [[ "$code" == 200 ]] && break; sleep 10; done
    echo "health: $code"; echo "home: $(curl -s -o /dev/null -w '%{http_code}' "https://$url/")"; echo "unknown card: $(curl -s -o /dev/null -w '%{http_code}' "https://$url/c/doesnotexist1")"
    echo "url: https://$url" ;;
  status)
    az containerapp job list -g "$RG" --query "[].{job:name, image:properties.template.containers[0].image}" -o table
    az containerapp list -g "$RG" --query "[].{app:name, image:properties.template.containers[0].image, revision:properties.latestRevisionName, url:properties.configuration.ingress.fqdn}" -o table ;;
  *) echo "usage: $0 what-if|roles|migrate|web|status [tag]" >&2; exit 2 ;;
esac
