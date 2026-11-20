# Mawica Admin — R1 Deployment Foundation

Branch: `feature/admin-deployment-r1`  
Baseline: `78c2d4749995fe0eed0685aa9812ada49811f725`  
Scope: **local preparation only** — Dockerfile, health probes, production env guards, build-only CI.  
**No Azure provision, DNS, Entra, Key Vault, database migrate, push, or deploy in this phase.**

## What R1 adds

| Deliverable | Location |
| --- | --- |
| Multi-stage admin image (non-root, port 8080) | `admin/Dockerfile` |
| Process liveness | `GET /api/health` → `{ status, check: "process" }` |
| DB readiness | `GET /api/health/ready` → `{ status, check: "database" }` (503 if DB down; no secrets) |
| Production env hard-fail | `admin/src/lib/production-guards.ts` + `env.ts` + `instrumentation.ts` (startup) |
| Canonical redirects / cookies | `admin/src/lib/origins.ts` (never `X-Forwarded-Host`) |
| Build-only GitHub Actions | `.github/workflows/admin-image.yml` (`push: false`) |
| Local container smoke | `scripts/admin-container-smoke.mts` |

## Build the image (local)

```bash
# From monorepo root (needs Docker)
docker build -f admin/Dockerfile -t mawica-admin:local .
npx tsx scripts/admin-container-smoke.mts
```

The build context is the **repo root** so Prisma generate and `@mawica/*` shared modules are available. Runtime user is `node` (uid non-root). No `.env` files are copied (root `.dockerignore` excludes `.env*`).

## Required runtime environment

### Always

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Shared Mawica Postgres (`mawica_app`); must pass `assertMawicaDatabaseUrl` |
| `RATE_LIMIT_SALT` | ≥16 chars; share with consumer if IP-hash compatibility needed |
| `ADMIN_SESSION_SECRET` | ≥32 chars; **never** reuse consumer `BETTER_AUTH_SECRET` |
| `ADMIN_APP_URL` | Public admin origin (e.g. `https://admin.mawica.com`). Drives Secure cookies and redirects |

### Production (`NODE_ENV=production`) — required

| Variable | Notes |
| --- | --- |
| `ADMIN_ENTRA_TENANT_ID` | Staff tenant |
| `ADMIN_ENTRA_CLIENT_ID` | App registration |
| `ADMIN_ENTRA_CLIENT_SECRET` | From Key Vault at runtime — not in the image |
| `ADMIN_ENTRA_REDIRECT_URI` | Must be `{ADMIN_APP_URL origin}/api/auth/callback` |
| `ADMIN_STAFF_ALLOWLIST` | `email:ROLE` or `oid:email:ROLE` (gates every Entra login) |

### Optional

| Variable | Notes |
| --- | --- |
| `ADMIN_TRUSTED_ORIGINS` | Comma-separated **explicit** extra origins only |
| `TRUSTED_PROXY_HOPS` | `1` behind Azure Container Apps for `X-Forwarded-For` client IP |
| `DATABASE_POOL_MAX` | Default 5 |
| `CMS_MARKETING_MEDIA_DIR` | Durable shared media root (still local-disk in product; Blob is a later phase) |

### Forbidden in production

| Variable | Behaviour |
| --- | --- |
| `ADMIN_DEV_AUTH=1` | Process **refuses to start** |

## Health probes (ACA)

| Probe | Path | Expect |
| --- | --- | --- |
| Liveness / startup | `/api/health` | 200 even if DB is briefly unreachable |
| Readiness | `/api/health/ready` | 200 when `SELECT 1` succeeds; 503 otherwise |

Neither endpoint returns connection strings, pool settings, staff data, or env dumps. Admin responses continue to send `X-Robots-Tag: noindex, nofollow`.

## GitHub Actions review

`.github/workflows/admin-image.yml`:

- Triggers: `workflow_dispatch` + path-filtered PRs
- Permissions: `contents: read` only
- Builds with `docker/build-push-action` **`push: false`** + `load: true`
- No `azure/login`, no OIDC federated Azure credentials, no ACR push, no `az containerapp`
- In-job smoke: liveness, dev-auth 403, console redirect, noindex, `docker stop`

## Staging prerequisites (not done in R1)

1. ACR repository + admin Container App + managed identity  
2. DNS/TLS for admin hostname + Entra redirect URI  
3. Key Vault secrets listed above (secret-scoped grants)  
4. Approved CMS migrations on the shared staging DB  
5. Durable shared marketing-media storage for admin + consumer  
6. Separate deploy workflow (explicit owner approval) — **out of R1 scope**

## Security properties (R1)

- No secrets in image layers (build placeholders scoped to build `RUN`)  
- Dev auth closed in production (startup + route 403)  
- Host-only session cookie; `Secure` when `ADMIN_APP_URL` is https; `SameSite=Lax`  
- Redirects and OAuth callback URLs built from `ADMIN_APP_URL`, not forwarded Host  
- Console layout redirects anonymous users via canonical admin URL  
- Staff pages remain behind session gate; health leaks no staff data  

## Remaining risks after R1

1. Still **no** Azure hosting — image is buildable but not deployable until infra exists.  
2. Marketing media remains local disk — must not rely on container ephemeral storage in ACA.  
3. CMS migrations not applied outside local `mawica_test`.  
4. Consumer CI still does not run `admin:test` / `admin:build` (admin-image workflow covers image build only).  
