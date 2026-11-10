# Accounts (Phase 2B.1)

Email one-time-code sign-in with database sessions, built on **Better Auth 1.7.19** (`@better-auth/prisma-adapter` 1.7.19, pinned exactly).
Local-only: nothing here is deployed, no real email is sent, and the guest card flow is unchanged.

> The card wallet that builds on these accounts is documented in docs/wallet.md.

## What exists
| Area | Where |
|---|---|
| Auth config (telemetry off, `authRateLimit`, secure cookies by https base URL, hooks) | `src/lib/auth.ts` |
| Auth route wrapper: deny-by-default allowlist, our rate limits, trusted client IP | `src/app/api/auth/[...all]/route.ts` |
| Helpers: email normalisation, Origin check, profile schema | `src/modules/auth/request.ts` |
| Audit trail (no PII in `meta`) | `src/modules/auth/audit.ts` |
| Server session helpers | `src/modules/auth/session.ts` |
| Local mail transport (writes codes to a gitignored file; fails closed in production) | `src/modules/email/transport.ts` |
| Account APIs (session probe, profile GET/PATCH) | `src/app/api/account/*` |
| UI: `/sign-in`, `/account`, header `AccountNav` | `src/components/auth/*`, `src/app/(site)/{sign-in,account}` |
| Migration | `prisma/migrations/*_accounts_foundation` (additive only) |

Reachable auth endpoints (everything else is 404): `GET /api/auth/ok`, `POST /api/auth/email-otp/send-verification-otp` (type `sign-in` only), `POST /api/auth/sign-in/email-otp`, `POST /api/auth/sign-out`.

## Configuration
`BETTER_AUTH_SECRET` (>= 32 chars, required for auth routes; the guest flow never imports auth), `BETTER_AUTH_URL` (defaults to `NEXT_PUBLIC_SITE_URL`; **must be https outside localhost**, which also turns on `Secure` cookies and the `__Secure-` prefix), `AUTH_TRUSTED_ORIGINS` (dev ports only), `MAIL_LOCAL_OUTBOX` (local transport file; in production it must be set explicitly to be used, so with no real provider sign-in fails closed). See `.env.example`.
Client IP comes from Mawica's own `pickClientIp` (`TRUSTED_PROXY_HOPS`); the wrapper deletes any client-supplied `x-mawica-client-ip` and sets its own. **The correct hop count on Azure is still unverified** (`docs/security.md`). Do not guess it.

## Behaviour decisions made here
- Session lifetime 14 days, sliding refresh daily. Codes: 6 digits, 5 minutes, 3 attempts, stored hashed.
- Limits: Better Auth per IP (3 sends/min, 5 verifies/min) plus ours: 5 sends/hour per email, 20/hour per IP, 1000/hour global, 20 verify attempts/hour per email.
- Registration = first successful code. There is no separate "verify email" step: confirming the code is the verification.
- New cards are **not** assigned to the signed-in user yet. `Card.ownerId` exists (nullable, `ON DELETE SET NULL`), nothing sets it, and no constraint requires it, so the future guest-publishing flag can be switched off again.

## Findings from implementation (read before changing the DB layer)
1. **`@prisma/adapter-pg` shifts `timestamptz` by the session time zone.** On a server or database not set to UTC (this machine: Australia/Melbourne) Dates were stored and read 11 hours off (audit rows, and sessions/OTP expiry compared with SQL `now()`). Fixed by `options: "-c timezone=UTC"` in `src/lib/db.ts` (also `scripts/admin.mts`); locked by tests. The credit-ledger spike's timestamptz claim was therefore incomplete: apply the same connection option there.
2. **Better Auth's rate-limit table is named `rateLimit`**, which collided with (and was silently merged into) Mawica's own `RateLimit` model with the deprecated CLI. We use `rateLimit.modelName: "authRateLimit"`.
3. `new Request(nextRequest, init)` throws in the Next runtime; the wrapper rebuilds from url/method/body.
4. The CLI is `npx auth@1.7.19 generate` (the `@better-auth/cli` package is deprecated). It needs a config without `server-only` or `@/` aliases and **overwrites** `schema.prisma`: generate to a temp file and diff, never into the repo schema. Our edits to the generated models: `Timestamptz(3)`, `gen_random_uuid()` defaults (so migrations and schema show no drift), extra indexes.
5. `/account` is a dynamic page; for a signed-out visitor Next streams the redirect (HTTP 200 with a redirect payload, not a 307). No account data is in that response. A real 307 would need `proxy.ts`, which was left untouched.
6. `prisma migrate dev` hung after applying once; use `--create-only` plus `migrate deploy`.

## Tests
```bash
npm test                      # 97 tests incl. tests/auth.test.ts (helpers, config guards, isolation, schema, DB behaviour)
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code   # no drift
# end-to-end against a production-mode server and the isolated mawica_test database (see headers of the scripts):
node scripts/auth-e2e.mjs     # 66 checks (run again with SECURE=1 and an https BETTER_AUTH_URL for the cookie checks)
node scripts/account-shots.mjs  # drives the real UI, saves docs/screenshots/accounts, responsive checks
```

## Unresolved decisions (not legal advice; nothing here is reviewed for compliance)
- Privacy policy: accounts wording was added with `<Todo>` markers. Retention periods, lawful basis/consent wording, minimum age, processors (the future email provider), and region are undecided.
- **Account deletion is not implemented.** Open: what happens to the owner's cards (default in schema: they stay, owner becomes null), how long audit rows and sessions are kept, and the welcome-credit tombstone (planned for the wallet stage).
- Real email provider and sending domain (ACS Email is the leading candidate; bake-off needs approval). Until then production sign-in cannot send codes.
- Whether to add CAPTCHA if abuse appears; Google sign-in (not configured).
- Audit-log retention and who may read it (no admin UI exists).

## Guest-publishing cutover (design only; NOT active)
Phases: guests publish as today; accounts live with a server flag off; wallet enforcement complete and separately approved; then the flag requires sign-in at publish while previews stay free and existing cards keep working. Enforce the quota in the same transaction as the card insert; keep one creation path (`createCard`); any "owner required" DB constraint must be `NOT VALID` and added only at cutover, never before, so rollback stays possible.
