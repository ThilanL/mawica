# Mawica: first Azure staging deployment, readiness (2026-11-19)

**Verdict: ready for a first controlled staging deployment, once five owner actions are done (section 7).**
- The app, database security, infrastructure code and workflow are prepared and tested.
- Nothing is deployed and nothing is committed or pushed.
- The container image has **not** been built yet (no Docker on this Mac); its first build happens in GitHub Actions.

## 1. Files changed (uncommitted)

| File | Change |
|---|---|
| `src/lib/db.ts` | pool `max` from `DATABASE_POOL_MAX`; `connectionTimeoutMillis` 10 s, `idleTimeoutMillis` 5 min, `keepAlive` (warm connections: a new one to Singapore costs ~0.9 s); default transaction limits 10 s wait / 15 s run |
| `src/lib/env.ts` | `DATABASE_POOL_MAX` (1–50, default 10) |
| `next.config.ts` | `Permissions-Policy … xr-spatial-tracking=(self)` (Android WebXR); `/ar/*.usdz` served as `model/vnd.usdz+zip`, `/ar/*.glb` as `model/gltf-binary`, cached 1 h |
| `Dockerfile`, `.dockerignore` | Node 24 multi-stage build: `runner` (standalone server, non-root, port 8080) and `migrate` (`prisma migrate deploy`, with OpenSSL and CA certificates for Prisma's engine) |
| `infra/staging/main.json`, `deploy.sh`, `whatif-summary.py` | foundation: Australia East network, Container Apps environment, Key Vault, logs, identities, budget; Singapore VNet with bidirectional peering; PostgreSQL B1ms in Singapore |
| `infra/staging/app.json`, `app.sh` | workload, deployed only with approval: least-privilege database secrets, role and migration jobs, the web container app, GitHub's minimal permissions |
| `infra/staging/sql/roles.sql` | idempotent least-privilege role setup (`mawica_migrator`, `mawica_app`) |
| `.github/workflows/deploy-staging.yml` | manual-only staging deploy: build and push to GHCR, migrate, update the image, smoke tests |
| `scripts/*-e2e*`, `*-shots*`, `cards-compat`, `delivery-*` (12 files) | the test-database guard now honours `MAWICA_PG_PORT` (default 5433), like the app's own guard, so the suites can run against an isolated cluster |
| `docs/azure-*.md` | audit, trial staging report, this readiness report |

The greeting-card designs, wallet, scheduling and delivery code are unchanged.

## 2. Test results

| Check | Result |
|---|---|
| ESLint | clean |
| TypeScript | clean |
| Unit and integration tests (Vitest) | **450/450** |
| Production build (Next.js 16.4.5, React 19.3) | succeeds |
| Local production server with email off | health 200, home 200, sending a code returns the generic 503 with no email, `.usdz`/`.glb` types correct, WebXR permission header present |
| **Migrations as `mawica_migrator`** on an isolated PostgreSQL 17 | 8/8 applied; `migrate status` up to date; re-run applies nothing; all 25 tables owned by `mawica_migrator` |
| **Runtime as `mawica_app`**: browser suites against a production build | saved-card compatibility **35/35**, auth **66/66**, wallet **51/51**, scheduling **47/47**, premium card **47/47**, cinematic journey **33/33**; no permission errors in the server log |
| 3D and AR | all six 3D cards render (compatibility suite); AR unit tests pass; AR file types correct |
| `npm audit --omit=dev` (shipped dependencies) | **0 vulnerabilities** |
| `npm audit` (including dev tooling) | 7 moderate, all `minimatch` through `typescript-eslint` (lint tooling only, not in the image) |
| **TLS to Azure PostgreSQL, verified from Australia East** (temporary Node 24 job, deleted) | certificate **trusted** by Node's bundled CA store, TLS 1.3, hostname matches; chain: server ← Microsoft TLS G2 RSA CA OCSP 10 ← Microsoft TLS RSA Root G2 ← DigiCert Global Root G2 |
| Container image build | **not run** (no Docker locally); the first build is in GitHub Actions |

## 3. Database security readiness

| Item | State |
|---|---|
| Roles | `mawica_migrator`: owns the schema and may create objects; used only by the migration job. `mawica_app`: data read/write only. Neither has superuser, create-database, create-role or replication rights; the admin is break-glass only |
| App role (tested) | allowed: SELECT/INSERT/UPDATE/DELETE, read migration history. **Denied:** CREATE, DROP, TRUNCATE, ALTER, writes to `_prisma_migrations`, CREATE ROLE |
| Limits on `mawica_app` | `statement_timeout` 30 s, `idle_in_transaction_session_timeout` 60 s, timezone UTC, at most 15 connections (app pool 5) |
| Default privileges | tables, sequences and types the migrator creates later are automatically granted to the app |
| TLS | server enforces `require_secure_transport`, TLS 1.2 minimum. Runtime URL `sslmode=verify-full` (full certificate and hostname check, verified). Migration URL `sslmode=require&sslaccept=strict` (strict check through the image's CA store; first verified at the first migration run) |
| Secrets | Key Vault only, read by `id-mawica-stg-app`: `database-app-url` (runtime), `database-migrate-url`, `pg-app-password`, `pg-migrate-password` (created by `app.sh roles`), plus the existing `database-url` (**admin, used only by the role job**), `better-auth-secret`, `welcome-pepper`, `rate-limit-salt`. Generated passwords travel through a pipe: never on disk, never on a command line, never printed |
| Network | private access only, public endpoint disabled; reached from Australia East over peering |

**Migration procedure** (`infra/staging/app.sh`):
1. `roles <tag>` creates or rotates the two passwords and runs `roles.sql` as admin.
2. `migrate` runs `prisma migrate deploy` as the migrator inside the VNet, then re-applies grants.
3. Migrations are **forward-only** (expand, then contract later).

**Rollback:**
- **Code:** reactivate the previous Container Apps revision.
- **Data:** point-in-time restore (7 days) to a **new** server, then repoint `database-app-url`.
- Never "down-migrate", and never reset or recreate the database.

## 4. Container deployment readiness

| Item | Configuration (`infra/staging/app.json`) |
|---|---|
| App | `ca-mawica-stg`, Consumption profile, **0.5 vCPU / 1 GiB**, **min 0 / max 1** replicas, HTTP scale rule of 20 concurrent requests |
| Ingress | external, **HTTPS only** (`allowInsecure: false`), target port 8080 |
| Health probes on `/api/health` (checks the DB) | startup every 5 s, up to 2 min; readiness every 15 s; liveness every 30 s |
| Identity and secrets | user-assigned `id-mawica-stg-app`; every secret is a Key Vault reference; no secrets in images or settings |
| Settings | `DATABASE_POOL_MAX=5`, `TRUSTED_PROXY_HOPS=1` (verify after deploy), `EMAIL_PROVIDER=none`, `MAWICA_DISABLE_EXTERNAL_EMAIL=1`, `EMAIL_DELIVERY_ENABLED=0`; no worker or scheduled-delivery job; `ENABLE_LAB`/`MAWICA_ENV` unset |
| Jobs | `caj-mawica-stg-dbroles` (`postgres:17`) and `caj-mawica-stg-migrate` (migrate image), both manual-trigger only |
| **Scale to zero** | compatible: the app keeps no state in memory (sessions and rate limits live in PostgreSQL) |
| **Cold start** | when idle, the first request waits for the replica to start: image pull and Node start, *estimated* 10–30 s, plus about 0.9 s for the first database connection. Fine for staging; set `minReplicas: 1` for demos (≈ AUD 15–20/month extra, *estimate*) |
| Azure preview (`app.sh what-if`) | creates exactly: 2 jobs, the app, the custom "join environment" role and 3 role assignments for GitHub; every existing resource is unchanged ("Ignore") |

## 5. GitHub CI/CD readiness

| Item | State |
|---|---|
| `chore/github-ci` (`c857fac`) | test-only CI (Postgres 17 service, lint, tsc, tests, build); **no PR opened yet**; uses **Node 22**, which should move to 24 to match the runtime |
| Branches | default branch is still `feature/phase-1-landing-page`; `main` is at `945f022`; the local feature branch has **unpushed** commits (2E.3, AR-1a to AR-1d, the tree, the follow-up) plus these uncommitted changes |
| `deploy-staging.yml` | manual (`workflow_dispatch`), environment `staging`, OIDC (`id-token: write` in the deploy job only), identity guard, migrations before the app, smoke tests. `workflow_dispatch` only appears once the file is on the default branch |
| OIDC identity `id-mawica-stg-github` | federated credential for `repo:ThilanL/mawica:environment:staging`; client ID `8c2b6d2a-864d-42a4-8227-03702e1bcaf4`. **No role assignments yet** (created by `app.sh`): Contributor on the app and the migration job only, plus a custom role allowing only `managedEnvironments/read` and `join/action` |
| Approval control | must be set in GitHub (owner): environment `staging` with required reviewer = you, deployment branches = `main` |

## 6. Updated monthly cost (AUD)

| Item | Basis | Monthly |
|---|---|---|
| PostgreSQL B1ms compute (Singapore) | AUD 0.0370/h (verified) | 27.01 |
| PostgreSQL storage 32 GB | AUD 0.1961/GB (verified) | 6.28 |
| Backups (7 days) | included up to the provisioned size (*estimate*) | 0 |
| Cross-region peering | AUD 0.1279/GB at each end (verified); 1–5 GB (*estimate*) | 0.26–1.28 |
| Container Apps, web 0.5 vCPU / 1 GiB, scale to zero | within the free monthly grant for light testing (≈ 100 active hours) | 0 |
| Container Apps jobs (roles, migrations) | seconds per run, within the free grant | 0 |
| Log Analytics (cap 0.2 GB/day) | AUD 4.7467/GB after the free allowance (*estimate*) | 0–4.75 |
| GHCR (public packages) | free | 0 |
| Key Vault | AUD 0.0426 per 10k operations (verified) | < 0.10 |
| Private DNS zone | AUD 0.7106 (verified) | 0.71 |
| **Total, light staging** | | **≈ AUD 34.3–40.1** |
| With `minReplicas: 1` for demos | *estimate* | ≈ AUD 50–60 |

Credit: USD 200 (≈ AUD 284) remaining; it expires **4 Dec 2026**.

## 7. Remaining blockers before the first deploy (owner actions)
1. **Approve and push code.** Commit these changes, then decide what reaches `main` (the CI PR, then the feature work). `deploy-staging.yml` must be on the default branch, and the default branch should become `main`.
2. **GitHub settings:**
   - environment `staging` with you as required reviewer, deploying from `main` only;
   - repository variables `AZURE_CLIENT_ID=8c2b6d2a-864d-42a4-8227-03702e1bcaf4`, `AZURE_TENANT_ID=82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8`, `AZURE_SUBSCRIPTION_ID=d5b6244c-44ac-49fb-9e93-a628acfea802`, `STAGING_URL=https://ca-mawica-stg.lemonmushroom-f91c9fdb.australiaeast.azurecontainerapps.io`.
3. **First image build** in Actions, then make the `web` and `migrate` GHCR packages **public** (no secrets in them; the repository is public).
4. **CI on Node 24** (change `node-version` on `chore/github-ci`) and green CI.
5. **Your approval to deploy.**

**Known risks:**
- Data is in Singapore (synthetic only).
- About 93 ms per query, and cold starts.
- The trusted-proxy hop count is unverified until deployed.
- Prisma strict TLS is unverified until the first migration. Fallback: `sslmode=require` (encrypted over the private network).
- The trial expires 4 Dec.
- Re-applying `main.json` would rewrite the VNets without their peerings. `deploy.sh` refuses to re-run once PostgreSQL exists; change the foundation only per resource.

## 8. Exact deployment steps (after approval)
1. Push the approved branches; merge the CI PR (Node 24) and green CI; make `main` the default branch; set the GitHub environment and variables from section 7.
2. Actions → **deploy-staging** → Run workflow, with **run_migrations = false** for the first run, so only the images are built.
   - The deploy job will fail at "Update the web app image", because the app doesn't exist yet. Expected.
   - Make both GHCR packages public.
3. Locally (`AZURE_CONFIG_DIR=$HOME/.azure-mawica`), with `<tag>` = the first 12 characters of the commit SHA:
   ```bash
   infra/staging/app.sh what-if <tag>
   ```
   Preview, check that only the expected resources are created.
   ```bash
   infra/staging/app.sh roles <tag>
   ```
   Creates the passwords, secrets and jobs and runs `roles.sql`. Expect `caj-mawica-stg-dbroles: Succeeded`.
   ```bash
   infra/staging/app.sh migrate
   ```
   Migrations as `mawica_migrator`, then the grants are re-applied. If strict TLS fails, stop and decide on the fallback.
   ```bash
   infra/staging/app.sh web <tag>
   ```
   Creates the app and runs smoke tests: health 200, home 200, unknown card 404.
4. Verify the trusted proxy setting (docs/azure-staging.md §6, against the Container Apps ingress), the security headers, `.usdz` type, sign-in returning the generic 503 (email off), and a guest card publish and view with **synthetic** text.
5. Later deploys: Actions → deploy-staging (approval required). Rollback: activate the previous revision with `az containerapp revision activate`, or redeploy the previous tag.
6. **Cleanup before 4 Dec 2026:**
   ```bash
   az group delete -n rg-mawica-staging-aue
   ```
   Then `az keyvault purge -n kv-mawica-stg-urw2b`, and delete the GHCR packages if you want.
