# Azure staging readiness (Phase 2D.2)

**Nothing here has been deployed, created, changed or sent.** This is the plan to execute only after explicit approval. It extends [azure-staging.md](azure-staging.md) (topology, resource groups, App Service and PostgreSQL settings), which still stands unless noted.

## 1. Azure read-only audit: not performed (identity guard)
- `az account show` (read-only) reported the logged-in subscription **`tricab`** (user at the TriCab tenant). `docs/azure-staging.md` section 0 and the deploy workflow require the subscription ID to match the Mawica value from `docs/azure/mawica-ids.md`; **that file does not exist and no Mawica subscription ID is recorded anywhere in the repository.**
- Per the project rule and this phase's own restriction ("do not inspect unrelated applications"), I **stopped there**: no resource groups, App Services, databases, Key Vaults, identities, DNS zones or monitoring resources were listed or read.
- **Inventory result: unknown. Nothing is assumed to exist.** Whether a Mawica subscription, a staging environment, DNS zone for `mawica.com`, Key Vault or managed identity exists cannot be stated from this session.
- To complete the audit: supply the Mawica subscription ID and tenant ID (not secrets), run `az login` against that tenant, and re-run the read-only commands below. All are `list`/`show`; none writes.
```bash
az account show --query "{name:name,id:id,tenant:tenantId}" -o table          # must match the Mawica IDs
az group list --query "[?contains(name,'mawica')].{name:name,location:location}" -o table
az resource list -g <rg> --query "[].{name:name,type:type}" -o table
az network dns zone list --query "[].name" -o tsv
```

## 2. Repository preflight (Phase 0)
| Item | State |
|---|---|
| Git | clean except untracked `.claude/`; HEAD was `dc12148` at the start of this phase |
| Build | `output: "standalone"`, `cacheComponents`, HSTS 86400 (raise at launch); `npm run build` succeeds |
| Migrations | 7, ordered by timestamp; additive since accounts; `scripts/migration-dryrun.sh` proves apply, drift and upgrade on the isolated cluster |
| DB connections | `@prisma/adapter-pg`, every connection forced to UTC (`-c timezone=UTC`); local guard refuses non-5433 and refuses remote hosts outside `NODE_ENV=production`; **no pool-size setting is configured yet** (default pg pool of 10 per process) |
| Sessions | Better Auth, cookie prefix `mawica`, `Secure` + `__Secure-` when the base URL is https, 14-day sessions, `ipAddressHeaders` only from the app's own trusted header |
| Email | provider-independent service; local outbox refused in production unless `MAWICA_ENV=local` + loopback DB; ACS adapter present but **not to be deployed** (retirement) |
| Worker | `scripts/delivery-worker.mts` (once/loop/reconcile) runs under `tsx` and **refuses `NODE_ENV=production` without `--allow-production`**; it is not part of the standalone output |
| Deploy scripts | only `docs/azure/deploy-staging.yml.example` (not active) |
| Health | `/api/health` exists |
| Tests before changes | 325 passed |

### Deployment blockers found
1. **Worker is not deployable as-is**: it needs a bundled production entrypoint (compiled with the `react-server` condition for the `server-only` imports), production env handling and a documented command. Not built in this phase.
2. **No connection-pool limits**: set `max` explicitly (see 5) before more than one process connects.
3. **No production email provider** (section email-provider-assessment).
4. **Trusted-proxy hop count unverified** (section 4).
5. **Photo processing uses `sharp` (native libvips binaries, Phase 2E).** The standalone build only contains the binaries of the machine that built it: build the release on Linux x64 (CI) so `@img/sharp-linux-x64` is traced into the artifact, or the upload route fails on App Service. Verify with one real upload on the staging slot before enabling the photo field.

## 3. ACS compatibility findings
See [email-provider-assessment.md](email-provider-assessment.md). Summary: the adapter targets a current REST version (2025-09-01) but the **service itself is retiring on 30 September 2028**; recommendation is to migrate before staging. I did not replace the adapter.

## 4. Trusted proxy plan
### How the app derives the client IP
`pickClientIp(X-Forwarded-For, TRUSTED_PROXY_HOPS)` takes the entry `hops` places from the **right**, strips a trailing `:port`, accepts only a plausible address, else falls into one shared bucket (`unidentified`). `hops = 0` ignores forwarded headers entirely. The auth route wrapper deletes any client-sent `x-mawica-client-ip` and sets its own; Better Auth reads only that header. Rate-limit keys are `HMAC(RATE_LIMIT_SALT, scope|ip)`; raw IPs are never stored or logged (audit rows store the keyed hash).

### Expected Azure topologies (to confirm on staging, not verified here)
| Topology | Expected `X-Forwarded-For` at the app | `TRUSTED_PROXY_HOPS` |
|---|---|---|
| App Service directly | `client:port` appended by the App Service front end | 1 |
| Front Door -> App Service | `client, frontdoor-edge` style chain, the last entry added by App Service | 2 |
Unverified assumptions: whether the platform appends one or two entries, and whether the IPv4 port suffix is present. The parser tolerates the port suffix.

### Spoofing and rate-limit implications
- Wrong hops too low: spoofed leftmost values count as the client (limit evasion). Too high or `0`: everyone shares one bucket (OTP limit 20 per IP per hour, 3 per minute at Better Auth would lock out legitimate users). Both fail visibly in the staging test below.
- With Front Door, App Service must accept traffic only from it (service tag `AzureFrontDoor.Backend` plus `X-Azure-FDID` check), otherwise a client can skip the edge and choose the origin's `X-Forwarded-For`.

### Safe staging verification procedure (read-only for production; staging only)
1. Deploy staging with `TRUSTED_PROXY_HOPS=1`, `ENABLE_PROXY_DEBUG=1`, a random `ADMIN_TOKEN` (Key Vault), never on production.
2. From a known network, call `/api/_proxy-debug` with `x-admin-token` and **no** forwarded header. Record `xForwardedFor`, `trustedProxyHops`, `rateLimitClient`. `rateLimitClient` must equal your public address.
3. Repeat with a forged `X-Forwarded-For: 203.0.113.9`. `rateLimitClient` must still be your real address (forged value appears to the left). If it equals `203.0.113.9`, hops are too low.
4. Repeat from a second network (mobile data); `bucketPrefix` must differ from the first.
5. If the real address is not the second-from-right/rightmost entry as assumed, adjust hops (1 or 2) and repeat from step 2.
6. Behavioural check (no debug route needed): from one network, request 4 sign-in codes within a minute to a **test** address: the 4th must be 429; from a second network the first request must succeed.
7. Remove `ENABLE_PROXY_DEBUG` and `ADMIN_TOKEN` from staging when finished, and confirm `/api/_proxy-debug` returns 404.
No production proxy setting is changed by this plan.

### Logging privacy
Application logs carry no addresses, IPs, codes or card text (tested). Platform logs (App Service HTTP logs, Front Door logs) **do** contain client IPs: decide retention (see release gates) and disable or shorten them for staging.

## 5. Database and migration readiness
| Topic | Assessment |
|---|---|
| Ordering | `prisma migrate deploy` applies by timestamp; verified on an empty database and on a restored copy |
| UTC | every connection sets `timezone=UTC`; migrations use `timestamptz`; a deploy tool must not override the session timezone |
| Compatibility with a running old version | the latest migration only adds a `NOT NULL DEFAULT 0` column; no column removed or changed (dry run asserts 0 removed). Earlier migrations were also additive; the enum extensions in the delivery engine use hand-written, forward-only SQL. Rule going forward: expand first, deploy code, contract later. |
| Rollback limits | schema migrations are forward-only. App rollback is safe after an expand-only migration; rollback of data is **point-in-time restore** to a new server. Never "down-migrate". |
| Backups | enable Flexible Server 7-day PITR before the first migration; take a manual `pg_dump` (to a private storage account) immediately before each staging deploy |
| Pooling | Flexible Server default connection limits are small on B1ms: set the app pool `max` (suggest 5 per App Service instance, worker 3) and use PgBouncer only if instances exceed what connections allow; confirm the limit with `show max_connections`. Unverified: exact limit for the chosen SKU |
| Existing data | additive migrations preserve rows (dry run: 23 tables, 1,116 rows identical before and after). `ScheduledDelivery` had no rows in the source, so the default on existing rows rests on PostgreSQL semantics |
| Procedure | `scripts/migration-dryrun.sh` (isolated cluster only; uses `mawica_dev_shadow` as scratch and `mawica_test` as data source): 1 empty -> all migrations, 2 drift check, 3 restore data, rewind one migration, upgrade, compare counts, 4 assert no removed or changed columns. Run it before every release that adds a migration. |
| Staging/production | not run; no writes planned until approved |

## 6. Delivery worker hosting
All three options run the same engine (`runOnce`: recover, claim, publish), which is lease-based and safe with several workers, so hosting only decides **when it is invoked**.

| | App Service WebJob | Azure Functions timer | Container Apps job |
|---|---|---|---|
| Verified facts | Supported on every plan, no extra cost; Linux supports `.sh` and scripts in the site's runtime (Node `.js` for a Node app); scheduled/triggered jobs need **Always On** (Basic+); NCRONTAB with seconds; triggered job runs on one instance, continuous can be limited to one; `WEBJOBS_STOPPED` / `WEBJOBS_DISABLE_SCHEDULE` stop jobs per slot | NCRONTAB with seconds (UTC by default); **no retry on failure** (next schedule); singleton across instances via a blob-storage lock; needs a storage account; past-due flag exists; `RunOnStartup` discouraged | Schedule trigger uses 5-field cron (**minute resolution**, UTC); replica timeout and retry limit; secrets and managed identity supported; billing by consumption; separate environment, image and registry |
| Operational complexity | Lowest: same deploy, same app settings, same Key Vault references and managed identity | Medium: second app, storage account, separate deploy and rollback, own monitoring | Highest: image build, registry, environment, job config |
| Cold start / accuracy | None on Always On; sub-minute cron possible | Consumption cold starts possible; sub-minute schedules work but `useMonitor` is off under 1 minute | Start latency per execution; minute-level schedule |
| PostgreSQL connectivity (private access) | Inherits the web app's VNet integration | Needs VNet-capable plan (unverified which plans); otherwise cannot reach a private DB | Environment must be VNet-integrated (unverified here) |
| Secrets | Same as the app | Own Key Vault references | Own secrets or identity |
| Rollback | Rolls with the app (slot swap), but a job exists in both slots: use the documented `WEBJOBS_STOPPED` slot setting | Independent | Independent |
| Cost | $0 extra | storage + executions (not quantified) | consumption (not quantified) |
**Recommendation for the MVP: an App Service triggered WebJob on a one-minute schedule (`0 * * * * *`), single instance, Always On.** It adds no resources, shares the VNet, identity and secrets, and one-minute granularity is fine because schedules must be at least five minutes ahead. Prerequisites (not built): a bundled production worker entrypoint, `--allow-production` handling, a deploy step that places it under `app_data/Jobs/Triggered`, `WEBJOBS_STOPPED=1` as a slot setting on staging-slot-only deployments, an alert on missed runs (reconcile run exit code, `expiredLeases`) and `delivery:worker -- reconcile` in the release checklist. Move to Container Apps jobs or Functions only if worker load or deploy coupling becomes a problem; the engine is host-independent.

## 7. Staging configuration manifest (placeholders only; never commit values)
### Azure resources (create only after approval)
| Resource | Notes |
|---|---|
| Subscription/RG `rg-mawica-stg-aue` | Australia East; dedicated Mawica subscription |
| App Service plan B1 Linux + web app (staging) | Node 22, HTTPS only, TLS 1.2, FTP off, Always On, health check `/api/health`, system-assigned managed identity |
| PostgreSQL Flexible Server 17 | private access, delegated subnet, 7-day PITR, `require_secure_transport=on`, roles `mawica_app` and a migration role |
| VNet + subnets | integration subnet for the app, delegated subnet for PostgreSQL, private DNS zone |
| Key Vault | access via managed identity (Key Vault Secrets User) |
| Log Analytics / Application Insights | capped daily ingestion, short retention for staging |
| Storage account (optional) | `pg_dump` exports only |
| Email provider account | per [email-provider-assessment.md](email-provider-assessment.md): owner decision pending |
| DNS | `staging.mawica.com` plus provider records below |

### Environment variables (App Service settings; secrets as Key Vault references)
| Name | Source | Notes |
|---|---|---|
| `NODE_ENV=production`, `PORT`, `HOSTNAME=0.0.0.0` | setting | |
| `DATABASE_URL` | Key Vault `<kv>/database-url` | `sslmode=require`; role `mawica_app` |
| `RATE_LIMIT_SALT` | Key Vault | >= 16 chars, never rotate casually |
| `BETTER_AUTH_SECRET` | Key Vault | >= 32 chars |
| `WELCOME_PEPPER` | Key Vault | >= 32 chars, never rotate (tombstones) |
| `ADMIN_TOKEN` | Key Vault | staging proxy test only |
| `NEXT_PUBLIC_SITE_URL`, `BETTER_AUTH_URL` | setting | `https://staging.mawica.com` |
| `TRUSTED_PROXY_HOPS` | setting | `1` or `2` after verification |
| `ENABLE_PROXY_DEBUG` | setting | `1` only during verification |
| `EMAIL_PROVIDER`, provider credentials, `EMAIL_FROM_AUTH` | Key Vault/setting | provider decision pending; start with `EMAIL_PROVIDER=none` |
| `MAWICA_DISABLE_EXTERNAL_EMAIL=1` | setting | kill switch ON until limited OTP testing |
| `MAWICA_ENV`, `MAIL_LOCAL_OUTBOX` | **unset** | local only |
| `DELIVERY_*` | setting | policy overrides (defaults are safe) |
| `WEBJOBS_STOPPED` | slot setting | per [section 6] |

### Key Vault secrets
`database-url`, `rate-limit-salt`, `better-auth-secret`, `welcome-pepper`, `admin-token`, `email-provider-credential` (if keys are used), each with an owner and rotation note. Access: the web app's managed identity only.

### DNS records (none created)
- `staging` `CNAME` to the App Service default hostname (or Front Door), plus the App Service domain-verification `TXT` (`asuid.staging`).
- Email provider records (SPF, DKIM CNAMEs, verification TXT, DMARC `p=none` first, MAIL FROM records for SES) on a dedicated sending subdomain such as `mail.staging.mawica.com`. Exact values come from the provider after the domain is added.

### Database network
App Service VNet integration subnet -> PostgreSQL delegated subnet on 5432; no public endpoint; private DNS zone linked to the VNet; operators reach it through a bastion or a time-limited firewall rule (decision needed); the worker (WebJob) shares the app's network.

### Managed identity permissions
Web app identity: Key Vault Secrets User (vault scope). Provider access: via the chosen provider's mechanism (IAM role/keys for SES; **Entra role** if ACS were used). No Contributor on the subscription.

### Monitoring and alerts
HTTP 5xx rate, response time, `/api/health` availability test, PostgreSQL CPU/connections/storage, auth 503 rate (email failures), `rate_limited` rate, worker: missed run (no `delivery` log line in 5 minutes), `reconcile` anomalies > 0, `expiredLeases` > 0, queue lag (oldest due `ScheduledDelivery`). Action group: owner email only. Alert thresholds are proposals.

### Email kill switch
`MAWICA_DISABLE_EXTERNAL_EMAIL=1` (setting change + restart): sign-in returns the generic 503; sessions keep working. `EMAIL_PROVIDER=none` is the second lever.

## 8. Deployment procedure (to run only after approval)
1. Confirm identity (`az account show` equals the Mawica IDs); stop if not.
2. Create resource group, VNet, Key Vault, PostgreSQL (private), App Service (staging) using reviewed templates (IaC preferred; a `what-if` first).
3. Add secrets to Key Vault; grant the managed identity; add Key Vault references.
4. Enable PITR; take a manual backup; run the migration from a controlled host in the VNet: `npx prisma migrate deploy` (never `migrate dev`/`reset`).
5. Deploy the standalone build to the **staging slot**; set `MAWICA_DISABLE_EXTERNAL_EMAIL=1`, `EMAIL_PROVIDER=none`, `TRUSTED_PROXY_HOPS=1`, `ENABLE_PROXY_DEBUG=1`.
6. Smoke: `/api/health`, homepage, guest card publish and view, `/sign-in` renders, sign-in returns the generic 503 (kill switch on), no secrets in logs.
7. Run the proxy verification (section 4); set the final hop count; disable the debug route.
8. Deploy the worker WebJob (once bundled); run `delivery:worker -- reconcile`; schedule a test card well in the future on a **test account**.
9. Add DNS and the email provider domain; wait for verification; run the limited OTP test (gate B).
10. Record versions, settings (not secrets) and results in the release log.

## 9. Rollback
| Layer | Action |
|---|---|
| App code | swap the slot back; settings are slot-sticky only where marked |
| Email | `MAWICA_DISABLE_EXTERNAL_EMAIL=1` |
| Worker | `WEBJOBS_STOPPED=1` (already-claimed leases expire and recover; nothing publishes twice, tested) |
| Database | forward-only; for a bad migration restore PITR to a **new** server, repoint `DATABASE_URL`, keep the old one for forensics |
| DNS | revert records (low TTL during cut-over) |
| Secrets | rotate the affected secret; `WELCOME_PEPPER` and `BETTER_AUTH_SECRET` rotations have consequences (tombstones unlinked; sessions invalidated) |

## 10. Expected costs and unknowns
Not quantified (no authenticated pricing source this phase): App Service B1, PostgreSQL B1ms with 32 GB and backups, Key Vault operations, Log Analytics ingestion, VNet/private DNS, optional storage. Public SES numbers are in the provider assessment. ACS Email pricing was not retrievable. **Estimate with the Azure pricing calculator for Australia East before approval.**
Unknowns: Mawica Azure inventory; proxy hop count; SKU connection limits; which Functions/Container Apps plans support the private DB; the chosen email provider and its production quota; legal decisions in [release-gates.md](release-gates.md).
