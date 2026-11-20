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

## Out of scope (this phase)

Stripe/billing, events/RSVP, CMS, Azure deploy, DNS, production migrations.
