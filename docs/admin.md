# Mawica Admin (P0 + P1)

Separate Next.js application for staff operations, intended for `admin.mawica.com`.

## Local run

1. Apply the staff migration **only** to your local Mawica Postgres (port 5433), never shared/prod:

```bash
npx prisma migrate deploy
# or: npx prisma migrate dev
```

2. Install and start the admin app (port **3010**):

```bash
cd admin
cp .env.example .env.local
# Set DATABASE_URL, RATE_LIMIT_SALT, ADMIN_SESSION_SECRET
# For local auth without Entra:
# ADMIN_DEV_AUTH=1
# ADMIN_DEV_STAFF_EMAIL=...
# ADMIN_DEV_STAFF_ROLE=OWNER
# ADMIN_STAFF_ALLOWLIST=you@mawica.com:OWNER
npm install
npm run dev
```

3. Open http://localhost:3010 — use **Local development sign-in** when `ADMIN_DEV_AUTH=1`.

Consumer app remains on port 3000 and is unchanged in behaviour.

## Entra ID

Set `ADMIN_ENTRA_TENANT_ID`, `ADMIN_ENTRA_CLIENT_ID`, `ADMIN_ENTRA_CLIENT_SECRET`, `ADMIN_ENTRA_REDIRECT_URI`
(`…/api/auth/callback`). First-time users must appear in `ADMIN_STAFF_ALLOWLIST` (`email:ROLE` or `oid:email:ROLE`).
Existing `StaffPrincipal` rows keep their DB role on subsequent sign-ins.

## Break-glass CLI

`npm run admin` in the repo root is unchanged (trusted host + `DATABASE_URL`).

## P2 — Customers & wallet (read-only)

- `/customers` — searchable, paginated directory (`users:read`)
- `/customers/[id]` — account + card counts; wallet/ledger when `wallet:read`
- Detail views write `support.customer_viewed` audit events (userId only in meta; never email)
- Never calls consumer `ensureWallet` / period grant writers / expire writers
- No credit adjustments in this phase (`wallet:adjust` reserved, not granted to SUPPORT)

### Authorization matrix (P2)

| Role | Directory | Detail | Wallet / ledger | Adjust credits |
|------|-----------|--------|-----------------|----------------|
| OWNER | yes | yes | yes | permission exists; UI/API not shipped |
| SUPPORT | yes | yes | yes | no |
| READONLY | yes | yes | yes | no |
| FINANCE | no (`users:read` absent) | no | (has `wallet:read` only) | no |
| MODERATOR | no | no | no | no |
| OPS | no | no | no | no |

### Privacy

- Card messages, recipient/sender names, and media blobs are never selected for customer views.
- Directory/detail expose email + display name for support lookup; minimize further PII.

## P3 — Operations & analytics

- `/ops` — date-filtered dashboard (7d / 30d / 90d / custom UTC range, max 366 days)
- Detail routes: `/ops/customers`, `/ops/cards`, `/ops/deliveries`, `/ops/moderation`, `/ops/wallet`, `/ops/media`, `/ops/health`
- CSV export: `GET /api/ops/export?dataset=…&preset=…` (`ops:read`; moderation also needs `reports:read`; wallet needs `wallet:read`)
- Server-side SQL aggregations only; never selects card messages, report details, or `CardMediaBlob.data`
- Wallet section is **credit activity** (ledger/grant counts), not revenue
- Explicitly unavailable: consumer HTTP health probe, worker CycleStats heartbeat (no `WorkerRun` table)
- Audits: `ops.dashboard_viewed`, `ops.export_downloaded`

### Authorization matrix (P3 ops)

| Role | Ops dashboard | Moderation metrics | Wallet credit metrics | CSV export |
|------|---------------|--------------------|-----------------------|------------|
| OWNER | yes | yes | yes | yes |
| OPS | yes | yes | yes (`wallet:read`) | yes |
| READONLY | yes | yes | yes | yes (aggregates) |
| SUPPORT | no | — | — | no |
| MODERATOR | no | (queue UI only) | no | no |
| FINANCE | no | no | (has `wallet:read` only) | no |

### Query performance notes

Global date aggregations may sequential-scan until additive indexes exist (not migrated in P3): `user(createdAt)`, `Report(createdAt)`, `LedgerEntry(kind, createdAt)`, `CardMedia(createdAt)`. Partial delivery indexes already help due/lease health probes. Ranges are capped at 366 days.

## P4A — Financial planning & revenue forecasting

- `/finance` — editable assumptions, 12/24/36-month projections, Conservative/Base/Optimistic comparison
- `/finance/formulas` — calculation explanations and scenario multipliers
- `GET /api/finance/export` — monthly projection CSV (`finance:plan` only)
- **Not** coupled to wallet, ledger, or Stripe. Labels every figure as a projection.
- Currency: **AUD**. Tax treatment: **exclusive of GST** (planning label, not tax advice).
- Annual subscriptions recognised as `annual_price / 12` per month (no double-counting).
- Permission: `finance:plan` — **OWNER** and **FINANCE** only (READONLY keeps `finance:read` but cannot open planning).
- Audits: `finance.plan_viewed`, `finance.projection_exported`
- No DB migration: assumptions live in code defaults + query-string overrides (session-less planning inputs).

### Authorization matrix (P4A)

| Role | Finance plan UI | CSV export |
|------|-----------------|------------|
| OWNER | yes | yes |
| FINANCE | yes | yes |
| READONLY / OPS / SUPPORT / MODERATOR | no | no |

## Out of scope

Live Stripe/billing, wallet adjustments, events/RSVP, CMS, Azure deploy, DNS, production migrations.
