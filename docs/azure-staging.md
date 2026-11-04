# Azure staging proposal (NOT provisioned; for review)

**Nothing in this document has been executed.** No Azure resource exists, no Azure command has been run for
Mawica, and the machine's current Azure CLI login must **not** be assumed to be a Mawica subscription.

## 0. Identity guard (do this before any `az` command)
```bash
az account show --query "{name:name, id:id, tenant:tenantId, user:user.name}" -o table
```
Proceed only if `id` and `tenant` match the Mawica values the owner supplies (kept in `docs/azure/mawica-ids.md`, not
committed with secrets). Anything else (including any TriCab subscription/tenant) = stop. Every script and the CI
workflow assert the subscription ID against `MAWICA_SUBSCRIPTION_ID` before acting.

## 1. Topology
```
Users (AU / LK)
   |  HTTPS (staging.mawica.com)
   v
[Azure App Service, Linux, Node 22 LTS]  --(VNet integration)-->  [Azure Database for PostgreSQL Flexible Server v17, private access]
   |  Key Vault references (managed identity)                              ^
   v                                                                        |
[Key Vault: DATABASE_URL, RATE_LIMIT_SALT, ADMIN_TOKEN]            [pg_dump exports -> Storage account (optional)]
   |
[Application Insights / Log Analytics (optional, capped)]
```
- **Region:** Australia East (primary market). Sri Lanka latency should be measured from staging before choosing a second region or Front Door (decision for the owner).
- **Subscription:** a dedicated Mawica subscription (or two: `mawica-nonprod`, `mawica-prod`). Never shared with TriCab.

## 2. Resource groups
| RG | Contents |
|---|---|
| `rg-mawica-stg-aue` | App Service plan + web app, PostgreSQL server, VNet, Key Vault, Log Analytics/App Insights, DNS records |
| `rg-mawica-prod-aue` | same shape, larger SKUs (later) |
| `rg-mawica-shared-aue` (optional) | DNS zone `mawica.com`, Storage account for backups/artwork originals |

## 3. Configuration
**App Service (staging):** Linux plan B1; Node 22 LTS (confirm the runtime is offered at deploy time); HTTPS Only on; min TLS 1.2;
FTP disabled; Always On; health check path `/api/health`; startup command `node server.js` (standalone build); app setting `WEBSITES_PORT=8080` or read `PORT` (the standalone server honours `PORT` and `HOSTNAME=0.0.0.0`).
**PostgreSQL:** Flexible Server v17 (matches local), Burstable B1ms, 32 GB, private access in a delegated subnet, `require_secure_transport=on`, 7-day backups (PITR), no public endpoint. Roles: `mawica_app` (runtime, no DDL beyond migrations), separate migration role optional.
**Storage:** none required today (no uploads; artwork ships in the app bundle). Add one Storage account only for (a) `pg_dump` exports and (b) final artwork originals/large assets if the repo size becomes a problem. Cards remain in Postgres.

## 4. Environment variables and secrets
| Name | Where | Notes |
|---|---|---|
| `DATABASE_URL` | Key Vault ref | `postgresql://mawica_app:***@<server>.postgres.database.azure.com:5432/mawica?sslmode=require`. The local guard permits remote hosts only when `NODE_ENV=production`. |
| `RATE_LIMIT_SALT` | Key Vault ref | 32+ random bytes; rotating it unlinks old limiter data |
| `ADMIN_TOKEN` | Key Vault ref | only needed for the staging proxy-debug route |
| `TRUSTED_PROXY_HOPS` | app setting | **verify on staging** (section 6); start with `1` |
| `NEXT_PUBLIC_SITE_URL` | **build-time** variable AND app setting | e.g. `https://staging.mawica.com`. It is inlined into static pages at build, so staging and production need separate builds |
| `ENABLE_PROXY_DEBUG` | app setting, staging only | `1` only during the verification window; never in production |
| `NODE_ENV` | `production` | set by the runtime |
No secrets in the repo, workflow files or logs. GitHub holds only OIDC identifiers (not secrets) in repository *variables*.

## 5. Deployment (GitHub Actions, OIDC, no stored Azure secrets)
Example workflow: `docs/azure/deploy-staging.yml.example` (kept out of `.github/workflows` on purpose, so nothing runs until you approve).
Flow: install, `prisma generate`, lint, type-check, tests (service Postgres on the Mawica port), build with `NEXT_PUBLIC_SITE_URL`, assemble standalone artifact (copy `.next/static` and `public`), then a **manual-approval** `staging` environment: Azure login via federated credential, assert subscription ID, deploy, run `prisma migrate deploy`, smoke tests (`/api/health`, home 200, unknown card 404, security headers).
Migrations: for staging, run `npx prisma migrate deploy` from the deployed app (SSH/startup step) because the database is private. Revisit with a dedicated migration job/runner in the VNet for production.

## 6. Trusted proxy and rate-limit verification plan (launch blocker until done)
1. Deploy staging with `ENABLE_PROXY_DEBUG=1`, `ADMIN_TOKEN` set, `TRUSTED_PROXY_HOPS=1`.
2. `curl -H "x-admin-token: $T" -H "X-Forwarded-For: 1.2.3.4" https://<staging>/api/_proxy-debug` from a machine with a known public IP. Expect `xForwardedFor` = `1.2.3.4, <your public IP>[:port]` and `rateLimitClient` = **your public IP** (not 1.2.3.4). If it shows 1.2.3.4, hops is too low; if `unidentified`, too high or the header is absent.
3. Repeat from a second network and with 3 different spoofed left-hand values: the bucket (`bucketPrefix`) must not change with the spoof, and must differ between networks.
4. If a CDN/Front Door is added later, repeat and set `TRUSTED_PROXY_HOPS=2`; lock the origin to Front Door (access restriction on service tag `AzureFrontDoor.Backend` + `X-Azure-FDID` check) so clients cannot bypass it.
5. Load check: 6 publishes from one network within an hour must return 429 on the 6th; a different network must still succeed.
6. Disable `ENABLE_PROXY_DEBUG`, remove `ADMIN_TOKEN` if unused, redeploy, confirm the route returns 404.

## 7. Rollback
- **App:** keep the last 5 build artifacts in GitHub; roll back by re-running the deploy job with an earlier artifact (B1 has no deployment slots; moving to S1 adds slot swap with instant rollback).
- **Database:** Prisma migrations are forward-only. Use expand/contract changes so the previous app version still works with the new schema. Before each migration take a `pg_dump` (or rely on PITR: restore to a new server and repoint `DATABASE_URL`).
- **Content emergency:** `npm run admin -- remove <slug>` (run from a trusted host with DB access) removes a card instantly; no deploy needed.

## 8. Domain and HTTPS
- Staging: `staging.mawica.com`, CNAME to `<app>.azurewebsites.net` plus the `asuid.staging` TXT verification record, then App Service Managed Certificate (free, auto-renewing). HTTPS Only on.
- Production: `mawica.com` (apex A record + TXT) and `www` CNAME with managed certificates (or Front Door-managed certs if Front Door is used); redirect `www` to apex (or the reverse) at one place only.
- The app sends HSTS `max-age=86400` today. Raise to one year once HTTPS and subdomains are proven.
- Owner must confirm who controls `mawica.com` DNS and the registrar.

## 9. Indicative monthly costs (USD, **estimates, not verified against the current Azure price list**; use the Azure Pricing Calculator before approval)
| Item | Staging | Production (initial) |
|---|---|---|
| App Service plan | B1 ~ $13 | P0v3/S1 ~ $60-75 (slots, autoscale) |
| PostgreSQL Flexible (Burstable B1ms / B2s, 32 GB) | ~ $17-20 | ~ $35-60 (+ HA optional, about double) |
| Key Vault, DNS zone, managed certs | ~ $1-2 | ~ $1-2 |
| Log Analytics / App Insights (capped ingestion) | $0-5 | $5-15 |
| Storage account (backups/exports) | < $1 | $1-3 |
| Front Door Standard (optional) | n/a | ~ $35 + usage |
| **Total** | **~ $30-45** | **~ $105-150** (about $70-95 without Front Door) |
Costs scale mainly with the database and plan tier; there are no per-card charges at launch volumes. Stop/scale-down options: stop the PostgreSQL server when idle (staging), use B1 only.

## 10. Open decisions for the owner
Subscription IDs and tenant; region (Australia East vs adding a Sri Lanka-friendly edge); domain ownership; Front Door yes/no; log retention and region wording for the privacy policy; who approves production deploys.
