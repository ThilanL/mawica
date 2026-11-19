#!/usr/bin/env bash
# Mawica STAGING workload (infra/staging/app.json). Run ONLY with the owner's approval. Images must already exist in the private ACR
# (built and pushed by the deploy-staging workflow, build-only mode). Every image is deployed by DIGEST, resolved here from the commit tag.
#   infra/staging/app.sh identities         bootstrap the role/migration identities, AcrPull and secret-scoped grants (no jobs, no secrets)
#   infra/staging/app.sh what-if <tag>      preview (no changes; uses tag references if the registry does not exist yet)
#   infra/staging/app.sh roles   <tag>      import postgres:17 into ACR (pinned digest); NEW passwords for mawica_app/mawica_migrator -> Key Vault; create/update jobs; run the role job
#   infra/staging/app.sh migrate            run `prisma migrate deploy` (migration job, inside the VNet), then re-apply grants
#   infra/staging/app.sh web     <tag>      create/update the web container app (scale 0-1) and smoke-test it
#   infra/staging/app.sh status             show jobs, app revision and URL
# Passwords are generated here and passed to ARM through a pipe (never on disk, never on a command line, never printed).
set -euo pipefail

SUBSCRIPTION="d5b6244c-44ac-49fb-9e93-a628acfea802"; TENANT="82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8"
RG="rg-mawica-staging-aue"; ACR="acrmawicastgurw2b"; LOGIN="$ACR.azurecr.io"; KV="kv-mawica-stg-urw2b"
HERE="$(cd "$(dirname "$0")" && pwd)"
export AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-$HOME/.azure-mawica}" AZURE_CORE_ONLY_SHOW_ERRORS=true
MODE="${1:-status}"; TAG="${2:-}"

read -r sub ten < <(az account show --query "[id, tenantId]" -o tsv | paste -sd' ' -)
[[ "$sub" == "$SUBSCRIPTION" && "$ten" == "$TENANT" ]] || { echo "STOP: not the Mawica subscription/tenant" >&2; exit 1; }

need_tag() { [[ -n "$TAG" ]] || { echo "usage: $0 $MODE <image tag>" >&2; exit 2; }; }
acr_exists() { [[ -n "$(az acr show -n "$ACR" -g "$RG" --query id -o tsv 2>/dev/null || true)" ]]; }
digest_ref() { # $1 = repository, $2 = tag -> LOGIN/repo@sha256:... (fails if the image is missing)
  local d; d="$(az acr repository show -n "$ACR" --image "$1:$2" --query digest -o tsv)"
  [[ "$d" == sha256:* ]] || { echo "STOP: $1:$2 not found in $ACR" >&2; exit 1; }; echo "$LOGIN/$1@$d"
}
mirror_postgres() { # database-role job image: postgres:17 copied into ACR once, then pinned by digest (no Docker Hub pulls at run time)
  az acr repository show -n "$ACR" --image mirror/postgres:17 -o none 2>/dev/null || az acr import -n "$ACR" --source docker.io/library/postgres:17 --image mirror/postgres:17 -o none
}
images() { # sets WEB, MIG, PGI
  if [[ "${1:-}" == preview ]] && ! acr_exists; then WEB="$LOGIN/mawica/web:$TAG"; MIG="$LOGIN/mawica/migrate:$TAG"; PGI="$LOGIN/mirror/postgres:17"; echo "(registry not created yet: preview uses tag references)" >&2; return; fi
  WEB="$(digest_ref mawica/web "$TAG")"; MIG="$(digest_ref mawica/migrate "$TAG")"; PGI="$(digest_ref mirror/postgres 17)"
}
roles_b64() { base64 < "$HERE/sql/roles.sql" | tr -d '\n'; }
cas_b64() { base64 < "$HERE/sql/azure-pg-roots.crt" | tr -d '\n'; }   # public root CAs for verify-full (postgres image has none)
pw_params() { # new random passwords (URL-safe; 3 character classes)
  printf '{"$schema":"https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#","contentVersion":"1.0.0.0","parameters":{"appDbPassword":{"value":"Ma%sQ7x"},"migrateDbPassword":{"value":"Mm%sR4y"}}}' "$(openssl rand -hex 20)" "$(openssl rand -hex 20)"
}
existing_secrets() { # JSON array of secret NAMES in the vault (control plane; values are never read)
  az rest --method get --url "https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.KeyVault/vaults/$KV/secrets?api-version=2023-07-01" \
    --query "value[].name" -o json | tr -d ' \n'
}
deploy() { # $1 = deployWebApp, $2 = deployJobs, $3 = rotate (yes/no)
  local extra=(); [[ "$3" == yes ]] && extra=(--parameters "@"<(pw_params))
  az deployment group create -g "$RG" -n mawica-staging-app --template-file "$HERE/app.json" \
    --parameters webImage="${WEB:-}" migrateImage="${MIG:-}" rolesImage="${PGI:-}" rolesSqlB64="$(roles_b64)" pgRootCasB64="$(cas_b64)" \
      deployWebApp="$1" deployJobs="$2" existingSecrets="$(existing_secrets)" "${extra[@]}" \
    --query "properties.{state:provisioningState, outputs:outputs}" -o json
}
rbac_wait() { echo "waiting 180 s for new Key Vault / ACR role assignments to propagate"; sleep 180; }
run_job() { # $1 = job name; waits and prints only lines the job marks as results
  local ex st; ex="$(az containerapp job start -g "$RG" -n "$1" --query name -o tsv)"; echo "started $1 ($ex)"
  for _ in $(seq 1 90); do st="$(az containerapp job execution show -g "$RG" -n "$1" --job-execution-name "$ex" --query properties.status -o tsv 2>/dev/null || true)"; [[ "$st" == Succeeded || "$st" == Failed ]] && break; sleep 10; done
  echo "$1: ${st:-unknown}"; [[ "$st" == Succeeded ]]
}

case "$MODE" in
  what-if)
    need_tag; images preview
    az deployment group what-if -g "$RG" -n mawica-staging-app --template-file "$HERE/app.json" \
      --parameters webImage="$WEB" migrateImage="$MIG" rolesImage="$PGI" rolesSqlB64="$(roles_b64)" pgRootCasB64="$(cas_b64)" deployWebApp=true deployJobs=true \
        existingSecrets="$(existing_secrets)" "@"<(pw_params) \
      --no-pretty-print -o json | python3 -I "$HERE/whatif-summary.py" ;;
  identities)  # bootstrap: the role-job and migration-job identities, their ACR pulls, and secret-scoped grants for secrets that exist
    deploy false false no ;;
  roles)
    need_tag
    # Run ONCE: it generates new database passwords. A second run would rotate them and break a running web app until it restarts.
    if existing_secrets | grep -q '"pg-app-password"' && [[ "${ROTATE:-}" != yes ]]; then
      echo "STOP: database role passwords already exist; re-running would rotate them (set ROTATE=yes deliberately). To re-apply grants use: $0 migrate" >&2; exit 1
    fi
    mirror_postgres; images
    deploy false false yes        # 1) new passwords + connection URLs in Key Vault, and the per-secret grants on them (no jobs yet)
    rbac_wait                     # 2) grants must be effective before Container Apps resolves the Key Vault references
    deploy false true no          # 3) the jobs, with their own identities (passwords unchanged)
    run_job caj-mawica-stg-dbroles ;;
  migrate) run_job caj-mawica-stg-migrate && run_job caj-mawica-stg-dbroles ;;   # re-apply grants (revokes app writes on _prisma_migrations)
  web)
    need_tag; images; deploy true true no
    url="$(az containerapp show -g "$RG" -n ca-mawica-stg --query properties.configuration.ingress.fqdn -o tsv)"
    for _ in $(seq 1 30); do code="$(curl -s -o /dev/null -w '%{http_code}' "https://$url/api/health" || true)"; [[ "$code" == 200 ]] && break; sleep 10; done
    echo "health: $code"; echo "home: $(curl -s -o /dev/null -w '%{http_code}' "https://$url/")"; echo "unknown card: $(curl -s -o /dev/null -w '%{http_code}' "https://$url/c/doesnotexist1")"
    echo "url: https://$url" ;;
  status)
    az containerapp job list -g "$RG" --query "[].{job:name, image:properties.template.containers[0].image}" -o table
    az containerapp list -g "$RG" --query "[].{app:name, image:properties.template.containers[0].image, revision:properties.latestRevisionName, url:properties.configuration.ingress.fqdn}" -o table ;;
  *) echo "usage: $0 what-if|identities|roles|migrate|web|status [tag]" >&2; exit 2 ;;
esac
