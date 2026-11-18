# Mawica Azure subscription audit (read-only, 2026-11-18)

**Nothing was created, deployed, registered or changed.** Every command ran with `AZURE_CONFIG_DIR="$HOME/.azure-mawica"`. The commands used were `az account show/list`, `az group list`, `az resource list`, `az provider show`, `az postgres flexible-server list-skus`, `az webapp list-runtimes`, `az billing account/profile list`, and GET calls to the Consumption credits APIs. AUD list prices came from Microsoft's public Retail Prices API. No tokens or secrets were printed. TriCab's CLI configuration (`~/.azure`) was not used.

## 1. Subscription and tenant (verified)

| | |
|---|---|
| Subscription | Azure subscription 1, `d5b6244c-44ac-49fb-9e93-a628acfea802`, **Enabled**, default in this config |
| Tenant | `82fd894e-62c7-4fc9-9773-4dc2ae8b2ee8` ("Default Directory"), also the home tenant |
| Offer | **Free Trial** (`quotaId: FreeTrial_2014-09-01`), **spending limit: On** |
| Billing account | Microsoft Customer Agreement, Individual, Active. Billing currency AUD. |
| Security | Entra security defaults are on (they blocked device-code sign-in; browser sign-in with MFA works). Unchanged. |

## 2. Existing resources (verified)
- **No resource groups and no resources.** The subscription is empty.
- **No resource providers registered** for the services Mawica needs. Each shows `NotRegistered`: Microsoft.Web, DBforPostgreSQL, Storage, KeyVault, App, Insights, OperationalInsights, ContainerRegistry, ManagedIdentity, Communication, Compute.
- Registering them is a subscription-level change, so it needs your approval. It usually happens automatically on first deploy, or can be done explicitly with `az provider register`.

## 3. Australia East availability (verified from platform metadata)

| Service | Resource type | Australia East |
|---|---|---|
| App Service (Next.js) | Microsoft.Web/sites, serverFarms | ✅ offered |
| PostgreSQL Flexible Server | Microsoft.DBforPostgreSQL/flexibleServers | ✅ offered. **Not restricted for this subscription.** Burstable (15 SKUs incl. B1ms), General Purpose and Memory Optimized; versions 11–18 (17 matches local) |
| Blob Storage | Microsoft.Storage/storageAccounts | ✅ offered |
| Key Vault | Microsoft.KeyVault/vaults | ✅ offered |
| Container Apps / scheduled jobs | Microsoft.App/managedEnvironments, jobs | ✅ offered |
| Application Insights / Log Analytics | Microsoft.Insights/components, OperationalInsights/workspaces | ✅ offered |

**App Service Linux Node runtimes:**

| Runtime | Status | End of support |
|---|---|---|
| Node 22 LTS | "Near" end of life | 30 Apr 2027 |
| Node 24 LTS | Active | 30 Apr 2028 |
| Node 26 | Active | 30 Apr 2029 |

This is a finding: the app targets Node 22 (see section 10).

## 4. Quotas and restrictions
- **PostgreSQL:** the SKU list reports no restriction in Australia East for this subscription. The regional usage endpoint returned an empty list because the provider isn't registered yet.
- **App Service and compute (vCPU) quotas** can't be read until `Microsoft.Web` and `Microsoft.Compute` are registered. The APIs reject the subscription until then.
- **Free Trial restrictions that apply** (from Azure's published free-account terms, not readable through the API):
  - a spending limit (resources are disabled when credit runs out or expires);
  - low default vCPU quotas;
  - no paid support;
  - some SKUs blocked until you upgrade.

  The staging plan below uses only small PaaS SKUs, which normally fit inside trial quotas. I'll confirm the real numbers after provider registration.

## 5. Offer type
**Free Trial**, not Pay-As-You-Go (verified: `quotaId FreeTrial_2014-09-01`, spending limit On).

## 6. Credits and expiry (verified via read-only billing APIs)

| | |
|---|---|
| Credit | Azure sign-up credit, **USD 200**, current balance **USD 200** (≈ **AUD 284** at Microsoft's November rate of 1.4212) |
| Start | 4 Nov 2026 |
| **Expiry** | **4 Dec 2026, 03:22 UTC (16 days from today)** |
| Used / expired so far | USD 0 / USD 0 |

**What this means:**
- Staging costs roughly AUD 2 a day (section 8), so most of the credit will expire unused.
- When the trial ends, Azure **disables** a Free Trial subscription unless you upgrade it to Pay-As-You-Go. Anything built on it would stop.
- Decide on upgrading before building anything you want to keep past 4 December. Upgrading keeps the remaining credit until its expiry and, per Azure's terms, the 12 months of free services.

**To confirm in the portal:**
- **Subscriptions** → Azure subscription 1 → Overview: offer and the credit banner.
- **Cost Management + Billing** → *Azure credits*.
- The upgrade option is in the same Subscription overview: "Upgrade".

## 7. Proposed staging architecture (minimal, cost-conscious)

```
GitHub Actions (OIDC, manual approval)
        │ zip deploy (standalone build, built on Linux)
        ▼
App Service plan B1 Linux ── web app "mawica-stg" (Node 24 LTS, Always On, HTTPS only, system managed identity)
        │   └─ WebJob (triggered, every minute): delivery worker
        │ VNet integration
        ▼
PostgreSQL Flexible Server 17, Burstable B1ms, 32 GB, private access, 7-day PITR
Key Vault (Standard): secrets as App Service Key Vault references
Log Analytics + Application Insights: daily cap 0.2 GB, 30-day retention
(Optional later) Storage account: pg_dump exports; photo blobs if they move out of PostgreSQL
```

- **One resource group:** `rg-mawica-stg-aue`, Australia East.
- **What's left out on purpose:**
  - Front Door: not needed for staging.
  - Container Apps and a container registry: the WebJob runs the worker at no extra cost.
  - Deployment slots: B1 has none, so rollback means redeploying the previous build.
  - High availability.
- This matches the earlier proposal in `docs/azure-staging.md` and `docs/azure-readiness.md`, which still applies. The new facts from this audit are Node 24 and the trial expiry.

## 8. Estimated monthly cost (AUD, 730 hours)
"Verified" means the unit price comes from Microsoft's Retail Prices API for Australia East in AUD, list price, today. Usage amounts are my **estimates**.

| Item | Unit price | Basis | Monthly |
|---|---|---|---|
| App Service B1 Linux | AUD 0.0270 / hour (verified) | 730 h | **AUD 19.71** |
| PostgreSQL B1ms compute | AUD 0.0370 / hour (verified) | 730 h | **AUD 27.01** |
| PostgreSQL storage | AUD 0.1961 / GB-month (verified) | 32 GB | **AUD 6.28** |
| PostgreSQL backup | AUD 0.135 / GB-month (verified) | backup up to provisioned size is normally included (estimate) | ~AUD 0 |
| Key Vault Standard | AUD 0.0426 / 10k operations (verified) | < 50k ops (estimate) | < AUD 0.25 |
| Log Analytics ingestion | AUD 4.7467 / GB (verified) | under the 5 GB/month free allowance with a cap (allowance is an estimate) | AUD 0–5 |
| Blob Hot LRS (optional) | AUD 0.0261–0.0284 / GB-month (verified) | 5 GB + operations (estimate) | < AUD 1 |
| VNet, private DNS zone | not fetched | VNet free; private DNS zone about AUD 1 (estimate) | ~AUD 1 |
| **Staging total** | | | **≈ AUD 55–60 / month (estimate)** |

**Ways to lower it:**
- **Free services for 12 months (to verify).** Azure's free account terms include 750 h/month of PostgreSQL Flexible B1ms plus 32 GB storage. If that applies to this account after upgrading, PostgreSQL drops to about AUD 0, for a total of **≈ AUD 21–27 / month**. Check in the portal under *Free services* before relying on it.
- **Stop PostgreSQL when idle.** Compute isn't billed while stopped (Azure restarts it after 7 days); storage still is.
- **Use B1 only**, and delete staging between test rounds.

**Not needed for staging:**
- Container Apps: consumption usage showed AUD 0 at the first tier (the free monthly grant), but an environment can add management charges. Not recommended here.
- Container Registry Basic: AUD 0.2368 a day ≈ AUD 7.2 a month (verified).
- Premium P0v3: AUD 0.1307 / hour ≈ AUD 95 a month (verified). It's an option for production when slots are needed.

## 9. GitHub Actions deployment with OIDC (recommendation only; nothing configured)

**1. Identity.** Create an Entra app registration (or a user-assigned managed identity) named `gh-mawica-staging`.
- Its federated credential subject is `repo:ThilanL/mawica:environment:staging`, so only jobs in the protected `staging` environment can sign in.
- There is no client secret.

**2. Role assignments at the smallest scope.**
- **Website Contributor** on the staging web app only (not the subscription, not Contributor).
- Optionally **Key Vault Secrets Officer** on the vault, if CI rotates secrets. Prefer setting secrets by hand.
- No database role for CI.

**3. GitHub configuration.**
- Repository **variables** (not secrets): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
- A `staging` environment with you as required reviewer, and deployment restricted to `main`.

**4. Workflow.** Extend the CI already prepared on `chore/github-ci` (merge that first). On push to `main`:
- `ci` job → `build` on `ubuntu-latest`. Building on Linux makes the photo pipeline's `sharp` Linux binaries part of the build. Uses Node 24 and `NEXT_PUBLIC_SITE_URL=https://<staging host>`; assembles the standalone artefact; uploads it.
- `deploy` job (environment `staging`, `permissions: id-token: write, contents: read`):
  - `azure/login@v2` with OIDC;
  - assert that `az account show` returns the Mawica subscription ID and stop otherwise;
  - `azure/webapps-deploy` with the zip;
  - smoke tests: `/api/health`, home 200, unknown card 404, security headers.
  
  `docs/azure/deploy-staging.yml.example` already sketches this.

**5. Migrations.**
- The database is private, so run `prisma migrate deploy` inside the VNet: as a one-off step on the web app (SSH/Kudu or a triggered WebJob), after a manual `pg_dump`.
- For production, move this into a dedicated migration job.

**6. Safety rules.**
- Concurrency group per environment.
- No auto-deploy to production.
- Artefacts kept for rollback (redeploy the previous artefact).

## 10. Application changes needed for Azure hosting

| # | Change | Why | Status |
|---|---|---|---|
| 1 | **Node 24 LTS** in `engines`, CI and App Service | Node 22 on App Service ends 30 Apr 2027 (status "Near") | new finding |
| 2 | **Bundled production entrypoint for the delivery worker** (WebJob) | `scripts/delivery-worker.mts` runs under `tsx` and isn't in the standalone output | known blocker |
| 3 | **Database pool limit** (`max` of about 5 per instance, 3 for the worker) | B1ms allows few connections; there's no pool setting today | known blocker |
| 4 | **Production email provider** | ACS Email is retiring (Sept 2028); without a provider, staging sign-in must run with the kill switch on, which blocks sign-in testing | owner decision |
| 5 | **Build on Linux** (CI) | `sharp` native binaries for photo uploads | handled by CI build |
| 6 | **Per-environment build** | `NEXT_PUBLIC_SITE_URL` is inlined at build time | known |
| 7 | **Trusted-proxy hop count** check on staging | rate limits and audit IP hashing depend on it | launch blocker |
| 8 | **`Permissions-Policy: xr-spatial-tracking=(self)`** | Android WebXR "View in AR" may otherwise be blocked | from the AR work, unverified |
| 9 | Photos stored in PostgreSQL (`CardMediaBlob`) | fine for staging; move to Blob Storage later if photo volume grows (the schema already allows it) | optional |
| 10 | AR model files (`public/ar/*`, about 14 MB) | served from App Service with the build. A CDN can come later. | none for staging |
| 11 | Keep `ENABLE_LAB`, `MAWICA_ENV`, `MAIL_LOCAL_OUTBOX` unset in Azure | lab routes and the local outbox must stay off | settings checklist |

## 11. Decisions needed before anything is created
1. ~~Upgrade to Pay-As-You-Go before 4 Dec 2026~~. **Decided (2026-11-18): stay on the Free Trial.** Anything built is temporary: it stops when the credit expires on 4 Dec 2026 unless the subscription is upgraded then. Build only what can be recreated from code (IaC and the CI workflow), and keep no data on it that isn't also elsewhere.
2. **Approve registering the resource providers** listed in section 2 (a subscription-level change).
3. **Approve the staging architecture and SKUs** in section 7, and the budget. I'd also recommend a Cost Management budget alert at AUD 50 and AUD 80 a month.
4. **Choose the staging host name.** DNS is not touched until you approve.
5. **Choose the email provider** for staging sign-in.
6. **Merge the CI PR** (`chore/github-ci`) before any deploy workflow is added.
