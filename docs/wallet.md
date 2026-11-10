# Card wallet and credit engine (Phase 2B.2)

Local only: nothing is deployed, there are no payments, no scheduling worker and no premium card scene. Guest publishing is unchanged.

> The first premium card built on this wallet is documented in docs/premium-lumis-wish.md.

## What exists
| Area | Where |
|---|---|
| Schema + migration (reviewed SQL, seed, constraints, triggers) | `prisma/schema.prisma`, `prisma/migrations/*_card_wallet` |
| Allowance periods (pure, UTC) | `src/modules/wallet/periods.ts` |
| Plan entitlements read from the database | `src/modules/wallet/entitlements.ts` |
| Credit engine: grant, reserve, commit/release, expire, balances, reconcile | `src/modules/wallet/engine.ts` |
| Wallet creation + welcome credit, summary, activity, internal plan assignment | `src/modules/wallet/wallet.ts` |
| Atomic account-owned publishing | `src/modules/wallet/publish.ts`, branch in `src/app/api/cards/route.ts` |
| Wallet API | `GET /api/wallet`, `GET /api/wallet/activity` |
| UI | `/account/wallet` (`src/components/wallet/WalletView.tsx`), link on `/account` |
| Server-side tier | `templateTier()` in `src/modules/templates/registry.ts` (all six cards STANDARD) |

## Rules (as implemented and tested)
- **Free**: 10 sends per period + one lifetime premium welcome credit, scheduling horizon 1 month (stored, unused until scheduling). **Plus**: 50 sends and 5 premium per period, horizon 12 months (data only: `purchasable = false`, no route or UI can move an account to it; only the internal `assignPlan` can, and only tests call it). Plans are rows in `Plan`/`PlanEntitlement`; periods `SUBSCRIPTION_YEAR`/`EVENT`/unlimited (`NULL`) exist in the model but are refused by the engine until those plans are built.
- **Periods**: fixed account anniversary (`CreditAccount.periodAnchor`), UTC arithmetic, clamped month ends (31 Jan -> 28/29 Feb -> 31 Mar), no daylight-saving or time-zone input, no reset job: the period's grants are created lazily and idempotently (`grantKey` unique per account). Annual Plus gets monthly allowances.
- **Spending**: a standard send takes 1 TOTAL. A premium send takes 1 TOTAL then 1 PREMIUM atomically; if TOTAL is empty the welcome credit is untouched. Credits expiring soonest are spent first, the never-expiring welcome credit last.
- **Atomicity**: a conditional decrement (`WHERE remaining > 0`) on a row locked `FOR UPDATE`, inside the caller's transaction; `CHECK (0 <= remaining <= amount)`; ledger deltas must match the kind; `remaining = SUM(ledger delta)` per grant (`reconcile`).
- **Reservations**: HELD -> COMMITTED | RELEASED only (trigger). Release restores a credit only while the **original grant** is still valid; after its period ended nothing is restored and nothing moves to another period (zero-delta RELEASE with a reason). A committed reservation can never be released; repeated cancels are no-ops; an account cannot settle another account's reservation.
- **Idempotency**: `(accountId, idempotencyKey)` unique; `requestHash` is a canonical SHA-256 of the request; same key + same request replays, same key + different request is refused (HTTP 422).
- **Publishing (signed-in)**: reserve -> create owned card -> commit in ONE transaction, tier from the server registry, never the client. No credit -> 402 and nothing is created; a card insert error rolls everything back; a slug collision retries the whole transaction. Guests (no valid session) take the unchanged path: per-IP limits, no owner, no wallet, no credit.
- **Welcome credit**: one grant per verified account, ever. `WelcomeGrantTombstone(emailHash)` = HMAC-SHA256(`WELCOME_PEPPER`, `welcome|` + normalised email), kept after account deletion, so deleting and re-registering the same verified email does not regrant it. Keep the pepper separate from every other secret and **never rotate it** (that would unlink old tombstones). It fails closed without the pepper. Only the hash is stored; the raw email and the pepper are never logged.
- **Account deletion**: `CreditAccount.userId` becomes NULL (anonymised wallet, ledger kept), cards keep existing with `ownerId` NULL, the tombstone stays. `releaseAllHeld` cancels HELD reservations for a closing account (nothing creates HELD ones yet).

## API (session only, no ids accepted)
`GET /api/wallet` returns plan, period start/end/next reset, sends (limit/used/remaining), premium (remaining, welcome, per period) and the scheduling horizon. `GET /api/wallet/activity?limit&before` returns the caller's own card events and welcome gift only. No ledger, grant, reservation or idempotency ids are ever returned; 401 without a session, 429 per-user rate limit, `no-store`.

## Privacy and retention (decisions still needed; not legal advice)
The tombstone is a keyed hash of an email address kept indefinitely so a gift cannot be re-claimed. Whether that is acceptable, how long to keep it, how to disclose it in the privacy policy, and whether to also bind it to a stronger identifier are **unresolved** and need legal review before launch. Known gap: aliases (`name+tag@`, dotted Gmail) and brand-new addresses get a new gift. Ledger and audit retention periods are also undecided.

## Known limits
- Until the separately approved cutover, anyone can still publish as a guest, so the monthly allowance only constrains signed-in publishing. This is intentional for this phase.
- `assignPlan` is an interim mechanism: the full upgrade/downgrade/refund policy belongs to the payments phase (credits reserved by an expired old-plan grant are not restored on cancel).
- No scheduling UI/worker, no premium scene, no payments.

## Tests
```bash
npm test                         # 159 tests (wallet engine, routes with mocked sessions, accounts, existing suites)
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
# against a production-mode server + isolated mawica_test (see script headers):
node scripts/wallet-e2e.mjs      # 37 checks with real sessions incl. 50 simultaneous requests
node scripts/auth-e2e.mjs        # 66 checks (also with SECURE=1)
node scripts/wallet-shots.mjs    # drives the UI, saves docs/screenshots/wallet
```
The spike artifacts this was built from: the isolated 25-check credit-ledger spike (kept outside the repo), now superseded by `tests/wallet.test.ts`.
