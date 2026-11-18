# Mawica staging on the Azure Free Trial (2026-11-19): status report

**Status: STOPPED at the database.** Azure refused to create PostgreSQL B1ms (`SkuNotAvailable`) in Australia East twice, the second time pinned to zone 1. Per the brief, I stopped instead of changing SKU, region or database security. Nothing is deployed, the subscription is still a Free Trial, DNS is untouched, and nothing is pushed.

## 1. Hosting quota (Phase 1)

| Check | Result |
|---|---|
| App Service, Australia East | **0 instances for every tier** (F1, B1, B2, S1, P0v3, P1v3): `SubscriptionIsOverQuotaForSku` |
| App Service, Australia Southeast | F1, B1, B2, S1, P0v3 allowed; P1v3 not |
| PostgreSQL Flexible, Australia Southeast | **restricted for this subscription** ("Subscriptions are restricted from provisioning in this region") |
| PostgreSQL Flexible, Australia Central | restricted for this subscription |
| PostgreSQL Flexible, Australia East | listed as available (B1ms, zones 1–3, v17), but **creation fails with `SkuNotAvailable`** |
| PostgreSQL Flexible, Southeast Asia | listed as available (not attempted: outside the approved region) |
| Container Apps, Australia East and Southeast | 1 managed environment allowed per region; Consumption profile available |

**Hosting selected: Azure Container Apps (Consumption workload profile) in Australia East.**
- Microsoft's billing docs confirm that a Consumption-only environment has **no plan management fee**, as long as private endpoints and planned maintenance stay off.
- Each month, the first 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests are free.
- The app scales to zero when idle.
- It runs the standalone Next.js server in a container, can reach PostgreSQL through the VNet, and can run the migration and delivery worker as Container Apps jobs later.
- App Service B1 in Melbourne was rejected because PostgreSQL can't be created there, and the alternative (cross-region VNet peering to Sydney) adds latency and moving parts for no benefit.

## 2. Infrastructure as code
- `infra/staging/main.json` (ARM): VNet `10.40.0.0/16` with a Container Apps subnet (/27) and a PostgreSQL subnet (/28), each delegated; private DNS zone and link; PostgreSQL 17 B1ms (private access only, 7-day backups, no HA or geo-redundancy, `pgZone` optional); Log Analytics (0.2 GB/day cap, 30 days); Key Vault (RBAC, soft delete 7 days); the app identity with *Key Vault Secrets User*; the Container Apps environment (Consumption only, VNet-integrated); the container app (placeholder image, scale 0–1, Key Vault secret references, email off); the GitHub OIDC identity with a federated credential and *Contributor* on the container app only; and the budget.
- `infra/staging/deploy.sh what-if|create`:
  - identity guard (Mawica subscription and tenant, or stop);
  - secrets generated with `openssl` and passed to `az` through a process-substitution pipe: never on disk, never on a command line, never printed;
  - `secureString` parameters only: their values aren't kept in deployment history, and none are output;
  - refuses to re-run once PostgreSQL exists, because re-running would rotate secrets.

## 3. What exists now in `rg-mawica-staging-aue` (Australia East)

| Resource | Name | Monthly cost |
|---|---|---|
| Virtual network + 2 delegated subnets | `vnet-mawica-stg` | AUD 0 |
| Private DNS zone + VNet link | `mawica-stg.private.postgres.database.azure.com` | AUD 0.71 (verified price) |
| Key Vault (RBAC) with 4 secrets: database URL, Better Auth secret, welcome pepper, rate-limit salt | `kv-mawica-stg-urw2b` | ~AUD 0 (operations only) |
| Log Analytics workspace (0.2 GB/day cap) | `log-mawica-stg` | AUD 0 while idle |
| Container Apps environment (Consumption, VNet-integrated, external ingress) | `cae-mawica-stg` (domain `lemonmushroom-f91c9fdb.australiaeast.azurecontainerapps.io`) | AUD 0 (no apps running) |
| Managed identity for the app | `id-mawica-stg-app` | AUD 0 |
| Managed identity for GitHub OIDC, federated credential `repo:ThilanL/mawica:environment:staging` | `id-mawica-stg-github` | AUD 0 |
| Budget AUD 60/month; alerts at actual AUD 40 (66.67%) and AUD 55 (91.67%), plus forecast AUD 60, to subscription Owners | `budget-mawica-stg` (resource group scope) | free |

**Not created:**
- PostgreSQL: it failed, nothing remains and nothing is billed.
- The container app and its role assignment: they depend on the database.
- No App Service, Front Door, registry, storage account or private endpoints.

**Current ongoing cost: about AUD 0.71/month**, the private DNS zone.

**Secrets.** The Key Vault secrets were written twice, once per attempt, and no database uses them. They hold no live credentials until PostgreSQL exists. The database-URL secret contains a password for a server that doesn't exist.

## 4. Cost estimates (AUD/month, Australia East)
Unit prices are from Microsoft's Retail Prices API (verified list prices). Usage figures are estimates.

| Item | Idle staging | Light testing | Small public beta |
|---|---|---|---|
| PostgreSQL B1ms compute (AUD 0.037/h) | 27.01 | 27.01 | 27.01 (B2s at AUD 0.1478/h = 107.89 if it needs more) |
| PostgreSQL storage 32 GB (AUD 0.1961/GB) | 6.28 | 6.28 | 6.28 |
| Container Apps (0.5 vCPU / 1 GiB, scale to zero) | 0 | 0 (within the free grant: ~100 active hours) | ~0–15 (estimate; paid per-second rates weren't returned by the price API) |
| Log Analytics (AUD 4.7467/GB after the free allowance) | 0 | 0–2 | 2–5 |
| Private DNS, Key Vault | ~1 | ~1 | ~1 |
| Container registry | 0 (GHCR) | 0 (GHCR) | 0 (GHCR) or ACR Basic AUD 7.20 |
| **Total** | **≈ AUD 34** | **≈ AUD 34–37** | **≈ AUD 37–55** (B1ms); over AUD 60 if B2s is needed |

Stopping PostgreSQL when it's idle removes the AUD 27 compute cost (storage stays). Azure restarts a stopped server after 7 days.

## 5. App preparation (local, not committed, not deployed)

| Item | Change / finding |
|---|---|
| Node runtime | `Dockerfile` uses `node:24-bookworm-slim` (Node 22 on Azure's App Service reaches end of life on 30 Apr 2027) |
| Linux build | the multi-stage `Dockerfile` builds on Linux x64 in CI (sharp and Prisma native binaries); runs as non-root `node` on port 8080; a `migrate` target runs `prisma migrate deploy` |
| Database connections | new `DATABASE_POOL_MAX` (default 10; staging 5) passed to the pg pool |
| Secrets | runtime secrets come only from Key Vault references on the container app; build-time placeholders are non-secret |
| Trusted proxy | `TRUSTED_PROXY_HOPS=1` set; must be verified on staging (Container Apps ingress adds `X-Forwarded-For`) |
| Android WebXR | `Permissions-Policy` now includes `xr-spatial-tracking=(self)` |
| AR files | `.usdz` was served as `application/octet-stream`; now `model/vnd.usdz+zip` (`.glb` stays `model/gltf-binary`), cached 1 h. Verified on a local production build |
| Sign-in without email | verified on a local production build with `EMAIL_PROVIDER=none` and `MAWICA_DISABLE_EXTERNAL_EMAIL=1`: health 200, home 200, sending a code returns the generic 503, and no code is sent |
| Deploy workflow | `.github/workflows/deploy-staging.yml`: manual only, environment `staging`, OIDC, builds and pushes to GHCR, migrate job, image update, smoke tests. It needs the migration job created and repo variables set (not done) |
| Tests | 450/450 pass; TypeScript and ESLint clean |

## 6. Blockers and options
1. **PostgreSQL B1ms can't be created in Australia East on this trial** (`SkuNotAvailable`, even pinned to a zone). Options:
   - **(a) Support request (free, done by you):** Azure portal → Help + support → *Service and subscription limits (quotas)* → Azure Database for PostgreSQL Flexible Server → Australia East → Burstable B1ms.
   - **(b) Try another zone** (2 or 3) once. Low odds, and it costs nothing if it fails.
   - **(c) Move all of staging to Southeast Asia (Singapore)**, where B1ms is listed. Untested. Adds about 90 ms latency, and the data sits outside Australia, which needs your decision for privacy wording.
   - **Not viable within the brief:** B2s (about AUD 108/month, over budget), a public database endpoint (weakens security), or upgrading the subscription (declined).
2. The free credit expires on **4 Dec 2026**, and a support request may not be resolved before then.
3. Still open from earlier: a production email provider, the trusted-proxy check, the delivery worker bundle (scheduled deliveries stay off), a least-privilege `mawica_app` database role, and merging the CI PR.

## 7. Cost monitoring
- Portal → **Cost Management + Billing** → *Cost analysis*, scoped to `rg-mawica-staging-aue`, grouped by resource. Data lags about 8–24 hours.
- Portal → *Budgets* → `budget-mawica-stg` shows the AUD 40 and 55 alerts and the forecast.
- CLI (read-only):
  ```bash
  AZURE_CONFIG_DIR=$HOME/.azure-mawica az consumption usage list --start-date 2026-11-01 --end-date 2026-11-30 -o table
  ```
- Credit balance: Portal → Subscription → Overview (credit banner), or *Cost Management + Billing → Azure credits*.

## 8. Rollback and cleanup
- **Everything** (before 4 Dec 2026, or any time):
  ```bash
  AZURE_CONFIG_DIR=$HOME/.azure-mawica az group delete -n rg-mawica-staging-aue --yes
  ```
  Then purge the soft-deleted vault if you want its name back:
  ```bash
  az keyvault purge -n kv-mawica-stg-urw2b
  ```
  The budget is scoped to the resource group, so it's removed with the group.
- The resource providers stay registered (no cost).
- **Should be deleted or stopped before the trial expires:** PostgreSQL (if created), the container app and environment. The private DNS zone is the only item that costs anything today.

---

## 9. PostgreSQL capacity recovery attempt (2026-11-19)

Approved limit: one attempt each in Australia East zones 2 and 3, same configuration (PostgreSQL 17, B1ms, 32 GB, private access, TLS). The container app was skipped (`DEPLOY_APP=false`), so only the database and its Key Vault secret were attempted.

| Attempt | Result | Correlation ID |
|---|---|---|
| Zone (none, Azure's choice) | `SkuNotAvailable`: "Specified SKU is not supported in this region. Please choose a different SKU." | 3de652b6-133e-4948-a84e-cba646e3b2c0 |
| Zone 1 | `SkuNotAvailable` (same message) | 6a08ddc7-9367-4e26-a0e8-850cb2a41c38 |
| Zone 2 | `SkuNotAvailable` (same message) | dcce2cd6-9771-44ff-a9a3-104692f55692 |
| Zone 3 | `SkuNotAvailable` (same message) | 79219403-216c-47a0-a6b4-adcd9482f559 |

**Conclusion:** Burstable B1ms isn't provisionable for this Free Trial subscription in Australia East in any zone, even though the SKU catalogue lists it. This is a capacity or offer restriction on Azure's side, not a configuration problem.
- **Cleanup:** after each failure Azure removed the failed server itself ("Dropping", about 3 minutes). No PostgreSQL server exists and nothing is billed for the attempts.
- **Unchanged:** the other resources in section 3. Each attempt only wrote new versions of the four Key Vault secrets, which no database uses.

### Options (nothing done; for your decision)

| | A. Wait for Azure (quota/capacity support request) | B. PostgreSQL B1ms in Southeast Asia (Singapore) | C. PostgreSQL in a container inside the existing Container Apps environment (Australia East) |
|---|---|---|---|
| What | Portal → Help + support → *Service and subscription limits (quotas)* → Azure Database for PostgreSQL Flexible Server → Australia East → Burstable B1ms. Free on a trial. | Rebuild staging in Southeast Asia: VNet, private DNS and Container Apps environment in Singapore (1 environment allowed there), B1ms there; Key Vault can stay in Australia East. | `postgres:17` as an internal-only container app (TCP ingress inside the VNet), data on an Azure Files share, password from Key Vault. |
| Networking / security | unchanged: private access, TLS, no public endpoint | same design: private access, TLS, no public endpoint | no public endpoint (internal ingress), but TLS would need a self-managed certificate; no managed patching, auditing or `require_secure_transport` |
| Latency | best (Sydney) | about 90–100 ms each way from Australian users and testers | best (Sydney) |
| Data residency | Australia | **outside Australia** (Singapore). Fine for synthetic test data; the privacy policy and APP 8 (cross-border disclosure) matter if real people's data is used | Australia |
| Reliability | managed PITR (7 days), backups | managed PITR, backups | **no managed backups or PITR**; Postgres on an SMB file share risks corruption; suitable only for throwaway smoke tests |
| Will it work? | depends on Azure; timing unknown, and the credit expires **4 Dec 2026** | **untested**: it's listed as available, but Australia East was listed too and still failed | works within the trial's Container Apps quota |
| Monthly cost (AUD) | ≈ 34 total once granted (B1ms AUD 0.0370/h, storage AUD 0.1961/GB, both verified) | ≈ 34 total (same verified prices in Southeast Asia) + about AUD 1 for a second private DNS zone and VNet | ≈ 40–50 (estimate: one always-on 0.5 vCPU / 1 GiB replica exceeds the free grant; paid per-second rates weren't returned by the AUD price API) + Azure Files storage account ≈ AUD 1–2 |
| Cleanup | none | delete the Singapore resources (or the whole resource group) before 4 Dec | delete the container app, storage account and share |

**My recommendation:**
1. **File A now.** It costs nothing and keeps the approved design.
2. **If you need a database before the answer arrives,** use **B** for synthetic test data only. Try it once; if it also returns `SkuNotAvailable`, stop.
3. **Avoid C** except for a one-day smoke test. It gives up backups and managed TLS, which is a security and reliability step down from what you asked for.

A public database endpoint (Azure or an external provider) and larger SKUs are excluded by your rules.

---

## 10. Keeping staging in Australia: database options (read-only analysis, 2026-11-19)

Nothing was created or changed. All prices are AUD list prices from Microsoft's Retail Prices API (Australia East, verified today) unless marked *estimate*.

### 10.1 Managed PostgreSQL Flexible Server in Australian regions

| Region | Catalogue for this subscription | Quota (cores) |
|---|---|---|
| Australia East | open: Burstable (15 SKUs incl. B1ms, B2s, B2ms), General Purpose (82), Memory Optimized (93) | 24 total; B-series 8 |
| Australia Southeast | **restricted**: "Subscriptions are restricted from provisioning in this region… open a support request (Service and subscription limits)" | 16 (unusable while restricted) |
| Australia Central | **restricted** (same message) | 16 (unusable) |
| Australia Central 2 | **not offered** (no PostgreSQL Flexible Server in that region) | n/a |

**Can anything actually be provisioned?** Not provably without trying.
- Azure's read-only checks (SKU list and pre-deployment validation) all said B1ms was fine in Australia East, and four real attempts still failed with `SkuNotAvailable`.
- So no larger SKU can be confirmed without a create attempt either. A failed attempt is free, but every larger SKU is over budget anyway (below).

**Cost against the AUD 60 budget** (compute 730 h, plus storage 32 GB × AUD 0.1961 = AUD 6.28, plus about AUD 1 for DNS and Key Vault):

| SKU | Compute / month | Staging total | Within AUD 60? |
|---|---|---|---|
| **B1ms** (1 vCore burstable, 2 GiB) | AUD 27.01 | **≈ 34** | ✅. But **not provisionable on this trial** (4 attempts) |
| B2s (2 vCores burstable, 4 GiB) | AUD 107.89 | ≈ 115 | ❌ |
| General Purpose, cheapest (D2 v3/v4/v5/v6 at AUD 0.167–0.173 per vCore-hour, 2 vCores minimum) | AUD 244–253 | ≈ 250+ | ❌ |
| Memory Optimized, cheapest (E2, about AUD 0.20–0.21 per vCore-hour × 2) | ≈ AUD 294–311 | ≈ 300+ | ❌ |

**Only B1ms fits the budget**, and only Australia East offers it to this subscription.

### 10.2 PostgreSQL 17 on Azure Container Apps, Australia East

**Design:**
- `postgres:17` (pinned digest) as a container app in the existing VNet-integrated environment `cae-mawica-stg`.
- **Internal TCP ingress only** (reachable inside the VNet, no public endpoint), one replica that is always on.
- **Storage.** PostgreSQL needs a POSIX file system (it refuses a data directory without `0700` permissions), so the standard SMB file shares aren't usable. It needs **Premium Azure Files over NFS v4.1**, which requires:
  - a FileStorage (Premium) storage account;
  - a share of at least 100 GiB;
  - access restricted to the VNet (service endpoint and network rules, no public access, no private endpoint).
- **TLS:** `ssl=on` with a staging certificate held as a Container Apps secret from Key Vault; the app connects with `sslmode=require` (or `verify-ca` with the staging CA).
- **Backups:** a scheduled Container Apps job runs `pg_dump` daily to a private Blob container (Cool LRS) through managed identity, keeping 7 days.
- **Recovery:** restore the latest dump into a fresh database. RPO is about 24 hours and RTO about 15–30 minutes, done by hand. **No point-in-time restore.**

**Cost (AUD/month):**

| Item | Basis | Monthly |
|---|---|---|
| Premium Files LRS, 100 GiB provisioned minimum | AUD 0.2729/GiB (verified) | **27.29** |
| Database replica, 0.5 vCPU / 1 GiB, always on | after the monthly free grant (shared with the web app); mostly idle-rate billing. Rates are Microsoft's published USD figures, because the AUD API returned only the free tier (estimate) | ≈ 15–20 |
| Backups: Blob Cool LRS, 7 × about 50 MB, plus the job runs | AUD 0.0156/GB (verified); job within the free grant | < 0.50 |
| Existing items: private DNS, Key Vault, logs | as section 4 | ≈ 1–5 |
| **Total with the web app scaled to zero** | | **≈ AUD 44–53 (estimate)**, within AUD 60 but with little headroom |

**Trade-offs compared with managed Flexible Server:**

| | Managed B1ms | PostgreSQL on Container Apps |
|---|---|---|
| Network exposure | private subnet, no public endpoint | internal ingress only; equivalent |
| TLS | managed, enforced (`require_secure_transport`) | self-managed certificate; enforced through `hostssl`-only `pg_hba.conf` |
| Patching | automatic minor versions | by hand (pin the image, rebuild for CVEs) |
| Backups and restore | automatic, 7-day point-in-time restore | daily dump only (RPO 24 h), manual restore, untested until we test it |
| Durability | managed storage | Premium NFS share (redundant within the zone, encrypted at rest). PostgreSQL on NFS works with `hard` mounts, but it's a less common setup with less tooling |
| Availability | single server (staging) | single replica; platform restarts or moves cause a short outage, and two replicas must **never** run against the same data |
| Auditing and monitoring | built-in metrics and logs | container logs only |
| Access control | admin, separate roles, Azure-managed | same roles in SQL; also the storage network rules and the Key Vault-held password |
| Cost | ≈ 34 (not available) | ≈ 44–53 (estimate) |
| Moving to a managed server later | n/a | dump and restore (straightforward) |

**Suitable for:** a temporary staging database holding only synthetic test data. **Not suitable** for production or real users' data without the managed service.

### 10.3 Other Australian options
- **Other Azure regions in Australia:** none open for managed PostgreSQL on this subscription (10.1).
- **Managed PostgreSQL outside Azure but in Sydney** (for example AWS RDS or Neon): keeps data in Australia, but reaching it from Azure means a public endpoint, or site-to-site networking that costs more than the budget. That conflicts with "no public database access", so it's not recommended.

### 10.4 Recommendation
1. **Safest: managed B1ms in Australia East, through a support request.** Portal → Help + support → *Service and subscription limits (quotas)* → Azure Database for PostgreSQL Flexible Server → **Australia East** → Burstable **B1ms** (1 vCore). Quote correlation IDs `79219403-216c-47a0-a6b4-adcd9482f559` and `dcce2cd6-9771-44ff-a9a3-104692f55692`.
   - Cost about AUD 34/month; managed TLS, patching and point-in-time restore; data stays in Australia.
   - If it's approved, re-run `infra/staging/deploy.sh create` (DEPLOY_APP=false first). Nothing else changes.
2. **Lowest-cost option available today in Australia: PostgreSQL 17 on Container Apps with Premium NFS and daily dumps** (about AUD 44–53, estimate).
   - Use it only if you need staging before the support request is answered, with synthetic data only.
   - Plan to move to managed B1ms with a single dump and restore.
   - It would add one Premium FileStorage account, an NFS share, one internal container app and one backup job, all in Australia East.
3. **Not recommended:** larger managed SKUs (AUD 108+), any public database endpoint, or any non-Australian region.

---

## 11. PostgreSQL in Southeast Asia (Singapore): provisioned and verified (2026-11-19)

Approved as a conditional go. **Synthetic test data only. Data in this database is stored outside Australia.**

### Pre-deployment checks (all passed)

| Check | Result |
|---|---|
| Subscription and tenant | `d5b6244c-…a802` / `82fd894e-…2ee8`, Free Trial, spending limit on |
| B1ms in Southeast Asia | listed in zones 1–3, PostgreSQL 17 available, no restriction |
| Quota (Southeast Asia) | 24 cores total, B-series 8, both 0 used |
| Address space | Australia East `10.40.0.0/16` and Southeast Asia `10.41.0.0/16`: no overlap |
| Container Apps route | environment `cae-mawica-stg` is VNet-integrated with no custom routes; uses the VNet's DNS, so the private zone linked to `vnet-mawica-stg` resolves |
| Cost | ≈ AUD 34–40/month (below), under AUD 60 |

### Architecture

```
Australia East                                         Southeast Asia
vnet-mawica-stg 10.40.0.0/16                           vnet-mawica-stg-sea 10.41.0.0/16
  snet-aca 10.40.0.0/27  ── cae-mawica-stg ─┐            snet-db 10.41.2.0/28 (delegated)
  (snet-db 10.40.2.0/28, unused)             │  Global      └─ psql-mawica-stg-urw2b (10.41.2.4)
                                             └─ VNet ─────────    PostgreSQL 17.11, B1ms, zone 1
  peer-to-sea  <──────────────── peering ───────────────> peer-to-aue
Private DNS zone mawica-stg.private.postgres.database.azure.com (global), linked to BOTH VNets
Key Vault kv-mawica-stg-urw2b (Australia East): database-url, better-auth-secret, welcome-pepper, rate-limit-salt
```

- Peering in both directions: **Connected / FullyInSync**; VNet access allowed; forwarded traffic, gateway transit and remote gateways all off.
- The hostname `psql-mawica-stg-urw2b.postgres.database.azure.com` resolves publicly only to a private-zone name with no address. It resolves to `10.41.2.4` inside the linked VNets only.

### Database verification

| Item | Value |
|---|---|
| State / region / zone | Ready / Southeast Asia / 1 |
| Version / SKU | 17 (17.11) / Standard_B1ms, Burstable, 1 vCore, 2 GiB |
| Storage | 32 GB Premium_LRS (P4, 120 IOPS), auto-grow disabled |
| HA / geo-redundant backup | Disabled / Disabled |
| Backups | 7-day retention, earliest restore point 2026-11-18 20:40 UTC (point-in-time restore active) |
| Public network access | **Disabled**; no firewall rules apply with private access |
| TLS | `require_secure_transport=on`, `ssl_min_protocol_version=TLSv1.2` |
| Authentication | password authentication (scram-sha-256); Entra authentication off; `log_connections=on` |
| Databases | `mawica` (plus Azure system databases) |

### Connectivity test from Australia East (temporary Container Apps job, now deleted)
The job ran `postgres:17` in `cae-mawica-stg` using the app's managed identity and read the connection string from Key Vault. It printed only results.

| Check | Result |
|---|---|
| DNS | `10.41.2.4` (private) |
| TCP 5432 | open |
| TLS session | TLSv1.3, `TLS_AES_256_GCM_SHA384` |
| Authentication | admin role signs in to `mawica`; **a wrong password is rejected** |
| Plaintext connection (`sslmode=disable`) | **rejected** |
| Synthetic write/read | 1 row in a temporary table (removed when the session ends) |
| Latency | query round trip in a session ≈ **93 ms**; a new connection including TLS ≈ **0.9 s** |

- **Key Vault:** all four secrets enabled; `database-url` is updated to this server (admin role, `sslmode=require`).
- **Cleanup:** `caj-mawica-stg-dbcheck` was deleted; no jobs remain.

### Resources now in `rg-mawica-staging-aue`

| Resource | Region |
|---|---|
| `psql-mawica-stg-urw2b` (+ database `mawica`) | Southeast Asia |
| `vnet-mawica-stg-sea` (+ `peer-to-aue`) | Southeast Asia |
| `vnet-mawica-stg` (+ `peer-to-sea`) | Australia East |
| Private DNS zone + 2 links | global |
| `cae-mawica-stg`, `kv-mawica-stg-urw2b`, `log-mawica-stg`, `id-mawica-stg-app`, `id-mawica-stg-github` | Australia East |
| `budget-mawica-stg` (AUD 60, alerts at AUD 40/55, forecast AUD 60) | resource group |

### Estimated monthly cost (AUD)

| Item | Basis | Monthly |
|---|---|---|
| PostgreSQL B1ms compute | AUD 0.0370/h × 730 (verified) | 27.01 |
| PostgreSQL storage 32 GB | AUD 0.1961/GB (verified) | 6.28 |
| Backup storage | included up to the provisioned size (estimate) | 0 |
| Private DNS zone | AUD 0.7106/zone (verified) | 0.71 |
| Key Vault | AUD 0.0426 per 10k operations (verified) | < 0.10 |
| Container Apps (no app running yet) | free monthly grant | 0 |
| Log Analytics (cap 0.2 GB/day) | AUD 4.7467/GB after the free allowance (allowance is an estimate) | 0–4.75 |
| Global VNet peering | AUD 0.1279/GB at each end (verified) ≈ AUD 0.26/GB; 1–5 GB (estimate) | 0.26–1.28 |
| **Total** | | **≈ AUD 34.4–40.1** |

**Credits:** USD 200.00 remaining (≈ AUD 284). Usage takes 8–24 hours to appear. Expires **4 Dec 2026, 03:22 UTC**.

### Issues and risks
1. **Data residency:** data is stored in Singapore. Synthetic data only; real users' data would need privacy-policy and APP 8 handling, or a move back to Australia (support request open, section 10).
2. **Latency:** about 93 ms per query. A page that runs several queries one after another adds that much per query, so pages will feel slower than they would against an Australian database. Connection setup is about 0.9 s, so the app must reuse pooled connections (`DATABASE_POOL_MAX`, default 10, staging 5) and avoid short-lived connections. Expect slower staging pages; this isn't representative of production performance.
3. **Admin role in `database-url`:** create a least-privilege `mawica_app` role during the first migration and update the secret before any shared testing.
4. **Cross-region traffic is billed** at both ends (small at staging volumes).
5. **`snet-db` in Australia East is unused.** It's harmless and free, and kept for a later move back to Australia.
6. **Trial expiry on 4 Dec 2026:** delete or decide before then. Cleanup is one command: `az group delete -n rg-mawica-staging-aue`.
