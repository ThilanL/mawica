#!/usr/bin/env bash
# Mawica STAGING workload (infra/staging/app.json). Run ONLY with the owner's approval. Images must already exist in the private ACR
# (built and pushed by the deploy-staging workflow, build-only mode). Every image is deployed by DIGEST, resolved here from the commit tag.
#   infra/staging/app.sh identities         bootstrap the role/migration identities, AcrPull and secret-scoped grants (no jobs, no secrets)
#   infra/staging/app.sh what-if <tag>      preview of exactly what `web <tag>` deploys (no changes; uses tag references if the registry does not exist yet)
#   infra/staging/app.sh roles   <tag>      import postgres:17 into ACR (pinned digest); NEW passwords for mawica_app/mawica_migrator -> Key Vault; create/update jobs; run the role job
#   infra/staging/app.sh roles-resume <tag> after a failed roles run: jobs + role job again, NO new passwords
#   infra/staging/app.sh pepper             DISABLED: welcome-pepper exists and must never be rotated (always refuses)
#   infra/staging/app.sh job-log <job> <execution>   the job's marker lines from Log Analytics
#   infra/staging/app.sh migrate            run `prisma migrate deploy` (migration job, inside the VNet), then re-apply grants
#   infra/staging/app.sh web     <tag>      create/update the web container app (scale 0-1) and smoke-test it
#   infra/staging/app.sh status             show jobs, app revision and URL
# Passwords are generated here and passed to ARM through a pipe (never on disk, never on a command line, never printed).
set -euo pipefail

SUBSCRIPTION="d5b6244c-44ac-49fb-9e93-a628acfea802"; TENANT="82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8"
RG="rg-mawica-staging-aue"; ACR="acrmawicastgurw2b"; LOGIN="$ACR.azurecr.io"; KV="kv-mawica-stg-urw2b"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMPERR="$(mktemp)"; trap 'rm -f "$TMPERR"' EXIT
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
KV_SECRETS_URL="https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.KeyVault/vaults/$KV/secrets?api-version=2023-07-01"
kv_list() { python3 -I "$HERE/kv_secrets.py" list "$KV_SECRETS_URL"; }
kv_guard_absent() { python3 -I "$HERE/kv_secrets.py" guard-absent "$KV_SECRETS_URL" "$@"; }
kv_require() { python3 -I "$HERE/kv_secrets.py" require "$KV_SECRETS_URL" "$@"; }
# The COMPLETE secret inventory (names only, every page; kv_secrets.py). Fails closed: if it cannot be verified, the script stops.
# Loaded into a variable first: a failing $(...) inside a command's arguments would NOT stop the script under set -e.
load_secrets() { SECRETS_JSON="$(kv_list)" || { echo "STOP: Key Vault secret inventory could not be verified; nothing was changed" >&2; exit 1; }; }
# Web URL + custom domain parameters (web_params.py). A full deployment REPLACES the app's ingress and environment, so the live
# custom domain/certificate, site URL and extra trusted origins are carried forward unless explicitly changed through
# SITE_URL / AUTH_TRUSTED_ORIGINS (none = clear) / CUSTOM_DOMAIN / CUSTOM_DOMAIN_CERT_ID (/ REPLACE_DOMAIN=yes). Fails closed.
load_web_params() {
  local env_id dom live
  env_id="/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.App/managedEnvironments/cae-mawica-stg"
  dom="$(az containerapp env show -g "$RG" -n cae-mawica-stg --query properties.defaultDomain -o tsv)" || { echo "STOP: cannot read the environment" >&2; exit 1; }
  if [[ -n "$(az containerapp list -g "$RG" --query "[?name=='ca-mawica-stg'].name" -o tsv)" ]]; then
    live="$(az containerapp show -g "$RG" -n ca-mawica-stg --query "{exists: \`true\`, customDomains: properties.configuration.ingress.customDomains, env: {NEXT_PUBLIC_SITE_URL: properties.template.containers[0].env[?name=='NEXT_PUBLIC_SITE_URL'].value | [0], AUTH_TRUSTED_ORIGINS: properties.template.containers[0].env[?name=='AUTH_TRUSTED_ORIGINS'].value | [0]}}" -o json)" \
      || { echo "STOP: cannot read the live web app" >&2; exit 1; }
  else
    live='{"exists": false}'
  fi
  WEB_PARAMS="$(python3 -I -c 'import json,os,sys; print(json.dumps({"envId": sys.argv[1], "azureDefaultUrl": sys.argv[2], "live": json.loads(sys.argv[3]),
      "request": {k: os.environ.get(k, "") for k in ("SITE_URL", "AUTH_TRUSTED_ORIGINS", "CUSTOM_DOMAIN", "CUSTOM_DOMAIN_CERT_ID", "REPLACE_DOMAIN")}}))' \
      "$env_id" "https://ca-mawica-stg.$dom" "$live" | python3 -I "$HERE/web_params.py")" || exit 1
}
web_params_file() { python3 -I -c 'import json,sys; print(json.dumps({"parameters": {k: {"value": v} for k, v in json.loads(sys.argv[1]).items()}}))' "$WEB_PARAMS"; }

deploy() { # $1 = deployWebApp, $2 = deployJobs, $3 = rotate (yes/no)
  load_secrets; load_web_params
  local extra=(); [[ "$3" == yes ]] && extra=(--parameters "@"<(pw_params))
  az deployment group create -g "$RG" -n mawica-staging-app --template-file "$HERE/app.json" \
    --parameters webImage="${WEB:-}" migrateImage="${MIG:-}" rolesImage="${PGI:-}" rolesSqlB64="$(roles_b64)" pgRootCasB64="$(cas_b64)" \
      deployWebApp="$1" deployJobs="$2" existingSecrets="$SECRETS_JSON" --parameters "@"<(web_params_file) ${extra[@]+"${extra[@]}"} \
    --query "properties.{state:provisioningState, outputs:outputs}" -o json
}
deploy_jobs() { # create/update the jobs (no password change). New secret grants can take minutes to become effective; Container Apps
  # resolves Key Vault references when it creates a job, so retry instead of guessing a fixed wait (up to ~10 minutes).
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if deploy false true no >/dev/null 2>"$TMPERR"; then echo "jobs deployed (attempt $i)"; return 0; fi
    echo "jobs not deployable yet (attempt $i): $(grep -oE 'Code: [A-Za-z]+|"code": ?"[A-Za-z]+"' "$TMPERR" | sort -u | tr '\n' ' ')"; sleep 60
  done
  echo "STOP: jobs still not deployable; recover with: $0 roles-resume <tag>" >&2; return 1
}
job_log() { # $1 = job, $2 = execution: print only the job's marker lines (never raw logs). Console logs reach Log Analytics after a delay.
  local ws q out i; ws="$(az monitor log-analytics workspace show -g "$RG" -n log-mawica-stg --query customerId -o tsv)"
  q="ContainerAppConsoleLogs_CL | where ContainerJobName_s == '$1' and ContainerGroupName_s startswith '$2' | where Log_s matches regex @'^(ROLES_OK|APP_CHECK_OK|MIGRATOR_CHECK_OK|CHECKS_OK)$' or Log_s has_any ('ERROR', 'FATAL', 'failed', 'unexpected database host') | project TimeGenerated, Log_s | order by TimeGenerated asc"
  for i in $(seq 1 20); do
    out="$(az rest --method post --resource https://api.loganalytics.io --url "https://api.loganalytics.io/v1/workspaces/$ws/query" \
      --body "$(python3 -I -c 'import json,sys; print(json.dumps({"query": sys.argv[1], "timespan": "PT6H"}))' "$q")" --query "tables[0].rows[*][1]" -o tsv 2>/dev/null || true)"
    [[ -n "$out" ]] && { echo "$out" | cut -c1-200; return 0; }; sleep 15
  done
  echo "(no log lines yet; Log Analytics can lag several minutes: $0 job-log $1 $2)"
}
run_job() { # $1 = job name; waits, then prints only the lines the job marks as results
  local ex st; ex="$(az containerapp job start -g "$RG" -n "$1" --query name -o tsv)"; echo "started $1 (execution $ex)"
  for _ in $(seq 1 90); do st="$(az containerapp job execution show -g "$RG" -n "$1" --job-execution-name "$ex" --query properties.status -o tsv 2>/dev/null || true)"; [[ "$st" == Succeeded || "$st" == Failed ]] && break; sleep 10; done
  echo "$1: ${st:-unknown}"; job_log "$1" "$ex"; [[ "$st" == Succeeded ]]
}

case "$MODE" in
  what-if)
    # Preview of EXACTLY what `web <tag>` would deploy (no password rotation), including the carried-forward URL/domain parameters.
    need_tag; images preview; load_secrets; load_web_params
    echo "web parameters: $WEB_PARAMS" >&2
    az deployment group what-if -g "$RG" -n mawica-staging-app --template-file "$HERE/app.json" \
      --parameters webImage="$WEB" migrateImage="$MIG" rolesImage="$PGI" rolesSqlB64="$(roles_b64)" pgRootCasB64="$(cas_b64)" deployWebApp=true deployJobs=true \
        existingSecrets="$SECRETS_JSON" --parameters "@"<(web_params_file) \
      --no-pretty-print -o json | python3 -I "$HERE/whatif-summary.py" ;;
  identities)  # bootstrap: the role-job and migration-job identities, their ACR pulls, and secret-scoped grants for secrets that exist
    deploy false false no ;;
  roles)
    need_tag
    # Run ONCE: it generates new database passwords. A second run would rotate them and break a running web app until it restarts.
    if [[ "${ROTATE:-}" != yes ]]; then
      rc=0; kv_guard_absent pg-app-password pg-migrate-password database-app-url database-migrate-url || rc=$?
      case "$rc" in
        0) ;;
        4) echo "STOP: database role secrets already exist; re-running would rotate them (ROTATE=yes only as a deliberate, approved rotation). To re-apply grants use: $0 migrate" >&2; exit 1 ;;
        *) echo "STOP: could not verify the Key Vault secret inventory; nothing was changed" >&2; exit 1 ;;
      esac
    fi
    mirror_postgres; images
    deploy false false yes >/dev/null && echo "passwords, connection URLs and their grants written (values never shown)"   # 1) no jobs yet
    deploy_jobs                   # 2) the jobs, with their own identities, once the new grants are effective (passwords unchanged)
    run_job caj-mawica-stg-dbroles ;;
  roles-resume)
    # After a failed first attempt: NO new passwords. Re-creates the jobs and re-runs the role job, which sets the PostgreSQL passwords
    # from Key Vault again, so Key Vault stays the single source of truth. If step 1 itself failed part-way, use ROTATE=yes roles instead.
    need_tag
    rc=0; kv_require pg-app-password pg-migrate-password database-app-url database-migrate-url || rc=$?
    case "$rc" in 0) ;; 5) echo "STOP: role secrets are incomplete; this needs an approved ROTATE=yes $0 roles $TAG" >&2; exit 1 ;;
      *) echo "STOP: could not verify the Key Vault secret inventory; nothing was changed" >&2; exit 1 ;; esac
    mirror_postgres; images; deploy_jobs; run_job caj-mawica-stg-dbroles ;;
  job-log) job_log "$TAG" "${3:?usage: $0 job-log <job> <execution>}" ;;
  pepper)
    # DISABLED: welcome-pepper exists (created with the infrastructure on 2026-11-18) and must NEVER be rotated: rotating it unlinks
    # welcome-credit tombstones. There is deliberately no command here that writes it. Grant access with: $0 identities
    rc=0; kv_require welcome-pepper || rc=$?
    case "$rc" in
      0) echo "STOP: welcome-pepper already exists; creation is disabled and it must never be rotated. To grant it: $0 identities" >&2 ;;
      5) echo "STOP: welcome-pepper is missing. Creating it is a deliberate, reviewed one-time action; this script no longer does it." >&2 ;;
      *) echo "STOP: could not verify the Key Vault secret inventory; nothing was changed" >&2 ;;
    esac
    exit 1 ;;
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
  *) echo "usage: $0 what-if|identities|roles|roles-resume|migrate|web|status|pepper|job-log [tag]" >&2; exit 2 ;;
esac
