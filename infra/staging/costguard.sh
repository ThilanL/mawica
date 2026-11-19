#!/usr/bin/env bash
# Mawica STAGING cost protection (infra/staging/costguard.json + costguard/guard.py). Run ONLY with the owner's approval.
#   infra/staging/costguard.sh what-if            preview the budget, action group, cost guard and roles (no changes)
#   infra/staging/costguard.sh apply              create/update them (registers Microsoft.Automation if needed)
#   infra/staging/costguard.sh publish            upload + publish guard.py as the runbook (NOT scheduled)
#   infra/staging/costguard.sh azure-dry-run      run the published runbook once inside Azure with --dry-run and show its output
#   infra/staging/costguard.sh enable-schedule    link the runbook to the 4-hourly schedule: activates automatic shutdown at AUD 55
#   infra/staging/costguard.sh dry-run [AUD]      run guard.py locally, read-only (optionally simulating a spend in AUD)
#   infra/staging/costguard.sh restore            recovery: start the web app and restore job triggers (owner login)
#   infra/staging/costguard.sh override HOURS     time-limited (1-72 h) override: the guard will not stop the web app again until then
#   infra/staging/costguard.sh verify             show the new budget, its notifications and the guard's role assignments
#   infra/staging/costguard.sh retire-old-budget  delete the old resource-group budget (only after `verify` looks right)
# Free Trial: no subscription upgrade, no spending-limit change. Every command is limited to the Mawica subscription.
set -euo pipefail

SUBSCRIPTION="d5b6244c-44ac-49fb-9e93-a628acfea802"; TENANT="82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8"
RG="rg-mawica-staging-aue"; LOCATION="australiaeast"; AA="aa-mawica-costguard"; RUNBOOK="mawica-costguard"
HERE="$(cd "$(dirname "$0")" && pwd)"
export AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-$HOME/.azure-mawica}" AZURE_CORE_ONLY_SHOW_ERRORS=true
MODE="${1:-what-if}"

read -r sub ten < <(az account show --query "[id, tenantId]" -o tsv | paste -sd' ' -)
[[ "$sub" == "$SUBSCRIPTION" && "$ten" == "$TENANT" ]] || { echo "STOP: not the Mawica subscription/tenant" >&2; exit 1; }
AA_ID="/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.Automation/automationAccounts/$AA"
API="api-version=2023-11-01"

case "$MODE" in
  what-if)
    az deployment sub what-if -l "$LOCATION" -n mawica-costguard --template-file "$HERE/costguard.json" --no-pretty-print -o json | python3 -I "$HERE/whatif-summary.py" ;;
  apply)
    [[ "$(az provider show -n Microsoft.Automation --query registrationState -o tsv)" == Registered ]] || az provider register -n Microsoft.Automation --wait
    az deployment sub create -l "$LOCATION" -n mawica-costguard --template-file "$HERE/costguard.json" --query "properties.{state:provisioningState, outputs:outputs}" -o json ;;
  publish)
    az rest --method put --url "https://management.azure.com$AA_ID/runbooks/$RUNBOOK/draft/content?$API" --headers "Content-Type=text/x-python" --body "@$HERE/costguard/guard.py" -o none
    az rest --method post --url "https://management.azure.com$AA_ID/runbooks/$RUNBOOK/publish?$API" -o none
    az rest --method get --url "https://management.azure.com$AA_ID/runbooks/$RUNBOOK?$API" --query "{runbook:name, state:properties.state, type:properties.runbookType}" -o json
    echo "published; NOT scheduled (run '$0 azure-dry-run', then '$0 enable-schedule')" ;;
  azure-dry-run)
    job="$(python3 -I -c 'import uuid; print(uuid.uuid4())')"
    az rest --method put --url "https://management.azure.com$AA_ID/jobs/$job?$API" --body "{\"properties\":{\"runbook\":{\"name\":\"$RUNBOOK\"},\"parameters\":{\"mode\":\"--dry-run\"}}}" -o none
    for _ in $(seq 1 40); do st="$(az rest --method get --url "https://management.azure.com$AA_ID/jobs/$job?$API" --query properties.status -o tsv)"; case "$st" in Completed|Failed|Stopped|Suspended) break ;; esac; sleep 15; done
    echo "job $job: $st"
    az rest --method get --url "https://management.azure.com$AA_ID/jobs/$job/streams?$API" --query "value[].properties.summary" -o tsv ;;
  enable-schedule)
    js="$(python3 -I -c 'import uuid; print(uuid.uuid5(uuid.NAMESPACE_URL, "mawica-costguard/every-4-hours"))')"
    az rest --method put --url "https://management.azure.com$AA_ID/jobSchedules/$js?$API" \
      --body "{\"properties\":{\"runbook\":{\"name\":\"$RUNBOOK\"},\"schedule\":{\"name\":\"every-4-hours\"}}}" -o none
    echo "4-hourly schedule linked: the cost guard is now ACTIVE" ;;
  dry-run)
    if [[ -n "${2:-}" ]]; then python3 -I "$HERE/costguard/guard.py" --simulate-spend "$2" ${3:+--old-budget}; else python3 -I "$HERE/costguard/guard.py" --dry-run ${3:+--old-budget}; fi ;;
  restore)
    python3 -I "$HERE/costguard/guard.py" --restore ;;
  override)
    h="${2:-}"; [[ "$h" =~ ^[0-9]+$ ]] && (( h >= 1 && h <= 72 )) || { echo "usage: $0 override HOURS (1-72)" >&2; exit 2; }
    until="$(python3 -I -c "import datetime,sys; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=int(sys.argv[1]))).strftime('%Y-%m-%dT%H:%MZ'))" "$h")"
    az tag update --resource-id "/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.App/containerApps/ca-mawica-stg" --operation Merge --tags "costguard-override-until=$until" -o none
    echo "cost guard will not stop ca-mawica-stg until $until UTC" ;;
  verify)
    az rest --method get --url "https://management.azure.com/subscriptions/$SUBSCRIPTION/providers/Microsoft.Consumption/budgets/budget-mawica-sub?api-version=2023-11-01" \
      --query "{amount:properties.amount, spend:properties.currentSpend, filter:properties.filter, notifications:properties.notifications}" -o json
    p="$(az automation account show -g "$RG" -n "$AA" --query identity.principalId -o tsv 2>/dev/null || az resource show --ids "$AA_ID" --query identity.principalId -o tsv)"
    az role assignment list --assignee "$p" --all --query "[].{role:roleDefinitionName, scope:scope}" -o table ;;
  retire-old-budget)
    az rest --method get --url "https://management.azure.com/subscriptions/$SUBSCRIPTION/providers/Microsoft.Consumption/budgets/budget-mawica-sub?api-version=2023-11-01" -o none \
      || { echo "STOP: the subscription budget does not exist yet" >&2; exit 1; }
    az rest --method delete --url "https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.Consumption/budgets/budget-mawica-stg?api-version=2023-11-01" -o none
    echo "old resource-group budget budget-mawica-stg deleted" ;;
  *) echo "usage: $0 what-if|apply|publish|azure-dry-run|enable-schedule|dry-run [AUD]|restore|override HOURS|verify|retire-old-budget" >&2; exit 2 ;;
esac
