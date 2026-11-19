# Mawica Azure staging: cost protection (AUD 60/month)

Files: `infra/staging/costguard.json` (infrastructure), `infra/staging/costguard/guard.py` (runbook), `infra/staging/costguard.sh` (operations).
Subscription: the personal Mawica Free Trial only (`d5b6244c-…`, tenant `82fd894e-…`), Azure CLI config `~/.azure-mawica`.

## What it sets up

| Piece | Detail |
|---|---|
| Budget `budget-mawica-sub` | **Subscription scope**, AUD 60/month, no filter: covers `rg-mawica-staging-aue` (incl. PostgreSQL in Singapore), the Azure-managed `ME_cae-mawica-stg_…` group (Container Apps public IP / load balancer) and anything Azure adds later |
| Alerts | Actual AUD 40 / 50 / 55 / 60, forecast AUD 60 (Azure allows 5 per budget). Each emails the subscription **Owner** role and the action group |
| Action group `ag-mawica-cost` | Emails the Owner role (no address stored in code) |
| Cost guard | Automation account `aa-mawica-costguard` in **Southeast Asia** (Basic, system-assigned identity, no local auth; Free Trial accounts can't create Automation accounts in Australia East), Python runbook `mawica-costguard`, every 4 hours once `enable-schedule` has been run |
| Activity-log alert `alert-mawica-costguard` | Emails the owner whenever the web app is **stopped**, by the guard or by anyone, explaining what was stopped and how to recover |
| Activity-log alert `alert-mawica-costguard-jobs` | Emails the owner when the **guard's identity** switches a job to Manual |

## What the guard does at AUD 55 (actual month-to-date spend)

1. **Stops the web app `ca-mawica-stg`.** No replicas run, so no compute is billed. Configuration, revisions, secrets, URL and data are kept.
2. **Switches scheduled or event-driven Container Apps jobs to Manual**, unless tagged `costguard=essential`. The original trigger is saved in the job's tags. Manual jobs (the role and migration jobs) are left alone, and **running executions are never killed**.

It never deletes anything. It never touches PostgreSQL, Key Vault, ACR, networking, DNS, Log Analytics (the 0.2 GB/day cap stays) or GitHub deployment permissions.

- **Idempotent:** an app that is already stopped, or a job that is already manual, is skipped.
- **Bounded:** 30 s per HTTP call, 5 minutes per run.

## Permissions (minimum)

| Identity | Role | Scope |
|---|---|---|
| Guard (Automation system identity) | Custom "Mawica staging cost guard": `containerApps/read`, `containerApps/stop/action`, `jobs/read`, `jobs/write`, `managedEnvironments/read`, `managedEnvironments/join/action` | `rg-mawica-staging-aue` only |
| Guard | Custom "Mawica cost guard: read budgets": `Microsoft.Consumption/budgets/read` | Mawica subscription |

No delete, no secrets, no networking, no database, no role-assignment rights.

**It cannot affect TriCab:**
- The identity exists only in the Mawica tenant and has roles only in the Mawica subscription.
- `guard.py` hard-codes the Mawica subscription and resource group, and refuses any other path.
- Local runs always use `~/.azure-mawica`, never the default Azure login.

## Manual recovery (owner)

```bash
infra/staging/costguard.sh restore
```

This starts the web app and restores the original job triggers from their tags. The same by hand:

```bash
AZURE_CONFIG_DIR=~/.azure-mawica az containerapp start -g rg-mawica-staging-aue -n ca-mawica-stg
```

For a job the guard switched to Manual, its tags `costguard-original-trigger` and `costguard-original-config` hold the original. If spend is still at or above AUD 55, the next 4-hourly run stops the app again. To keep it running for a limited time, set an override **first**, then restore:

```bash
infra/staging/costguard.sh override 24
infra/staging/costguard.sh restore
```

`override` takes 1–72 hours. It tags the web app with `costguard-override-until=<UTC time>`, and until then the guard doesn't stop the app; job handling is unchanged. The override expires by itself. The guard ignores a malformed or expired tag, or one more than 72 hours ahead. To get more time, run `override` again; each run is a deliberate owner action.

For a longer pause, raise `THRESHOLD_AUD` in `guard.py` and run `costguard.sh publish`, or turn the schedule off in the Automation account.

## If billing data is delayed or the automation fails

- **Billing data lags 8–24 hours (up to 72)**, and budgets are evaluated on that delayed data. Real spend can be past AUD 55, or even AUD 60, before anything reacts. Polling every 4 hours adds up to 4 more hours.
- **This is not a hard cap.** Budgets only notify; the guard only stops the web app and scheduled jobs. Fixed costs keep running after it acts (ACR ≈ AUD 0.24/day, public IP ≈ AUD 0.17/day, DNS zone).
- **If the runbook fails** (identity problem, Automation outage, a Python runtime change), the budget emails at 40/50/55/60 still arrive. Failed runs appear under Automation account → Jobs. Act by hand: `az containerapp stop -g rg-mawica-staging-aue -n ca-mawica-stg`.
- **If email fails,** the guard still acts on its own schedule.
- **The real money limit is the Free Trial.** Charges come out of the trial credit, and when the credit or trial ends Azure disables the subscription (PostgreSQL included) rather than billing a card. The trial must not be upgraded.

## Rollout order (each step needs approval)

1. `costguard.sh what-if`
2. `costguard.sh apply`
3. `costguard.sh publish`: uploads the runbook but doesn't schedule it
4. `costguard.sh azure-dry-run`: one read-only run inside Azure
5. `costguard.sh verify`
6. Test the email path: Azure portal → Monitor → Alerts → Action groups → `ag-mawica-cost` → Test (email only).
7. `costguard.sh enable-schedule`: switches on automatic shutdown
8. `costguard.sh retire-old-budget`, only after `verify` shows the new budget and its 5 notifications.
