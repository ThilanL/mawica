# Mawica: Stripe Phase 2 Foundations report

| | |
|---|---|
| Status | **Phase 2 Foundations (release gate E1) implemented and validated locally.** Not committed, not pushed, not deployed. Awaiting owner review (Part B). Part A is the preflight record. |
| Date | 27 November 2026 |
| Decisions source | `STRIPE-PHASE-1B-DECISIONS.md` revision 3 (§0) |
| Stripe environment | Mawica sandbox (`acct_…dpf9`), test mode |

Approvals requested in this part:
1. **C1 customer identity:** classic Customer objects (§4).
2. **Restricted key** permissions for Phase 2 (§5).
3. **Exact `docs/release-gates.md` wording** (§8).
4. **Branch and implementation plan** (§9).

---

# Part A: Phase 2 preflight

## 0. Preflight revalidation after Phase 2 approval (27 Nov 2026, 03:40 UTC): ❌ BLOCKED (superseded: all checks passed at 04:20 UTC, see Part B §B1)
| Check | Result |
|---|---|
| Branch | ✅ `feature/stripe-phase-2-foundations` created from freshly fetched `origin/main` = `db58366` (includes PR #27 / `b52d9eb`). Upstream unset so a plain `git push` cannot target `main`. Untracked files unchanged (diffed before and after); both stashes intact; nothing reset or cleaned. Done in place rather than in a worktree: the tracked tree was clean, and a worktree would need a second copy of `.env.local` secrets and `node_modules`. |
| CLI login | ❌ Not renewed: same login, expires 03:59 UTC |
| Account / mode | ✅ Mawica sandbox `acct_…dpf9`, test only (CLI and env key) |
| `STRIPE_SECRET_KEY` prefix | ❌ still `sk_test_` (restricted `rk_test_` required) |
| Key permissions | ❌ The current key can read Customers, Checkout Sessions, Subscriptions and Account (full secret key). Expected for the RAK: Products / Prices / Events = 200; Customers / Checkout Sessions / Subscriptions = 403 |
| `STRIPE_WEBHOOK_SECRET` | ❌ defined, empty |
| `.env.local` excluded from Git | ✅ |
| Stripe secrets in client bundles | ✅ none: existing `.next/static` (build of 24 Nov) has 0 files matching `sk_` / `rk_` / `whsec_` / `pk_` patterns; 0 source references to `STRIPE` variables |

**Implementation has not started** and waits for the owner's manual steps, a passing re-check, and approval of the §8 wording.

## 1. Repository baseline
| Check | Result |
|---|---|
| Current branch | `feature/hero-copy-readability` at `b52d9eb` |
| Default branch | `main` at `db58366` (= `b52d9eb` + merge commit of PR #27). The current branch is **already merged**. |
| Note | The repository's configured "main branch" for this session (`feature/phase-1-landing-page`, `c68da1b`) does **not** contain `b52d9eb`; GitHub's default branch is `main`. |
| Tracked changes | **None** (clean tracked tree) |
| Untracked (unrelated, to preserve) | `admin/` (build leftovers + git-ignored `.env.local`), `docs/ci/`, `docs/screenshots/catalogue/{after,before,review}.zip`, `storage/`, `tmp/` |
| Untracked (this work) | `STRIPE-PHASE-1-AUDIT.md`, `STRIPE-PHASE-1B-DECISIONS.md`, this report |
| Stashes (unrelated, untouched) | `stash@{0}` (admin-deployment-r1 WIP), `stash@{1}` (cinematic WIP) |
| **Proposed Phase 2 branch** | `feature/stripe-phase-2-foundations`, created from **`origin/main` (`db58366`)**. Untracked files carry over untouched; nothing is stashed, reset or deleted. |

## 2. Stripe CLI and account
| Check | Result |
|---|---|
| CLI authenticated | ✅ `authorized: true` |
| Account | ✅ **Mawica sandbox**, `acct_…dpf9`; the **only** authorised account (`modes: [test]`). Not Mercor, not Closetsu. |
| Mode | ✅ test |
| **Login renewed?** | ❌ **Not yet.** The current CLI login is the same one verified earlier. It expires **27 Nov 2026 03:59 UTC** (about 29 minutes after this check at 03:30 UTC). **Action (owner):** run `stripe login` in a terminal and choose **Mawica sandbox**. I'll re-check with `stripe whoami` before any Phase 2 step that needs the CLI (`stripe listen`). |
| `.env.local` secret key → account | ✅ Resolves to **Mawica sandbox** (`acct_…dpf9`, AU, AUD). Checked with a read-only `GET /v1/account`; the key value was never printed. |

## 3. Environment file and variables
| Check | Result |
|---|---|
| Location | ✅ `/Users/thilanh/Projects/mawica-web/.env.local`: the Next.js project root, where `next dev` / `next build` load it. Permissions `-rw-------` (owner only). |
| Git exclusion | ✅ `.gitignore:34` `.env*` (with `!.env.example`); `git check-ignore` confirms `.env.local`; no `.env*` file is tracked except `.env.example`. |
| `STRIPE_SECRET_KEY` | ⚠️ **Present, prefix `sk_test_`** (a full-access test **secret** key). Phase 2 requires a **restricted key `rk_test_`** (§5). Replace it before implementation. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Present, prefix `pk_test_`. **Not needed** (hosted Checkout). Phase 2 code will **not reference it**, so Next.js will not inline it into any bundle. Leaving it is harmless (publishable keys are public by design); you may blank it. |
| `STRIPE_WEBHOOK_SECRET` | ❌ **Defined but empty.** Obtain it with §7. |

Validation was done by a local script that prints only *defined / empty / prefix class / length*, never values. Phase 2 adds the same checks to the app's Zod env schema (§9).

## 4. C1: customer identity architecture

### 4.1 Evidence (Stripe docs, read via `stripe docs /accounts-v2/use-accounts-as-customers`)
- *"The Accounts v2 API is GA for Connect users, and in **public preview** for other Stripe users."* Mawica is not a Connect platform.
- Preview users must **opt in in the Dashboard** (Settings → Account previews) and call v2 with a **preview API version** (`2026-11-18.preview`), not the stable `2026-11-18.endive`.
- Once opted in, *Checkout and other Stripe-hosted integrations create customer-configured Accounts instead of Customer objects*, and existing Customers are auto-synced. **Opting out does not revert** Customers already associated with Accounts.
- The preview **does not support** cloning customers, sharing customers or payment methods across an organisation, or third-party tax integrations.
- v1 APIs (Subscriptions, SetupIntents, …) accept either `customer` or `customer_account`. Subscription webhooks stay v1 (`customer.subscription.*`). Customer-data changes arrive as v2 *thin* events.
- The planner's Portal blueprint used `customer_account` (Accounts v2). That is the planner's default template; it does not show that Mawica needs it.

### 4.2 Comparison
| Criterion | Classic Customer (`cus_`) | Accounts v2 customer (`acct_`) |
|---|---|---|
| Hosted Checkout | ✅ GA (`customer`) | ✅ (`customer_account`); with opt-in, Checkout creates Accounts by default |
| Billing (subscriptions, proration, Smart Retries) | ✅ GA | ✅ via `customer_account` on v1; subscription events stay v1 |
| Customer Portal | ✅ GA (`customer`) | ✅ (`customer_account`) |
| Corporate invoicing | ✅ GA (invoice settings, templates, tax IDs on Customer) | ✅ mostly mapped; **tax IDs not on the Account** (separate Tax IDs API); invoice credit balance handled differently |
| API / SDK maturity | **GA, stable version `2026-11-18.endive`**, Node SDK 23.2.0 | **Public preview** for direct businesses; preview version header; behaviour may change before GA |
| Dashboard change required | None | **Yes**: account-wide preview opt-in (not allowed in this phase without approval), and it is effectively **irreversible** for synced customers |
| Webhooks | `customer.*`, `customer.subscription.*` (v1 snapshot) | Mix of v1 snapshot + v2 thin events (two event formats to verify and process) |
| Migration complexity | Later move to v2 is supported: opting in auto-syncs existing Customers to Accounts | Moving back is not clean (opt-out doesn't revert) |
| Future Connect compatibility | Connect is **excluded**. If ever needed, Connect uses v2 Accounts for *connected* accounts, which is independent of how *customers* are modelled; the opt-in path syncs Customers | Unified identity is the main benefit, but it only matters if Mawica later becomes a platform |
| Operational / security | One stable object; standard RAK permission (`Customers`); one event format | Preview version pinning; v2 thin-event fetch path; extra RAK permissions for v2 Accounts; preview limitations |

### 4.3 Recommendation [PROPOSED-TECH, needs approval]
**Use classic Stripe Customer objects (`cus_`) on the stable API version `2026-11-18.endive`.**
- It is the simplest **GA** option and fully meets Mawica's needs: hosted Checkout, Billing, Portal, Invoicing and Radar.
- It needs **no Dashboard change**, which this phase forbids without approval.
- It avoids an irreversible preview opt-in.
- Future-proofing: the mapping table stores `stripeCustomerRef` + `refType` (`CUSTOMER` now, `ACCOUNT_V2` reserved), so a later move to Accounts v2 after GA needs no schema change. Stripe auto-syncs existing Customers on opt-in.
- Revisit when Accounts v2 is GA for non-Connect businesses, or if Connect enters scope.

## 5. Restricted API key: minimum permissions

### 5.1 Phase 2 (Foundations): what the code will call
Phase 2 makes **no** writes to Stripe. Webhook signature verification is local (it uses `STRIPE_WEBHOOK_SECRET`, not an API permission). The only API calls are read-only:

| Resource (Dashboard name) | Permission | Why |
|---|---|---|
| **Products** | **Read** | Catalogue drift check (dry-run only: confirm no unexpected products; no creates) |
| **Prices** | **Read** | Catalogue drift check by `lookup_key` (dry-run only) |
| **Events** | **Read** | Re-fetch an event or object for out-of-order protection and replay tests |
| *Everything else* | **None** | Including Checkout Sessions, Customers, Subscriptions, Payment Intents, Charges, Refunds, Invoices, Webhook Endpoints, Accounts, Customer portal, Tax |

**How to create it (owner, Stripe Dashboard, Mawica sandbox):**
1. Developers → API keys → **Create restricted key** → *custom permissions*.
2. Name it `mawica-web-local-phase2`.
3. Set Products: Read, Prices: Read, Events: Read; leave the rest **None**.
4. Copy the key straight into `.env.local` as the value of `STRIPE_SECRET_KEY` (the variable name stays the same; the value becomes `rk_test_…`). Don't paste it into chat.
5. Keep the existing `sk_test_` key unused. You may delete or roll it in the Dashboard later.

Creating a key is an owner action in the Dashboard; Claude does not do it.

### 5.2 Phase 3 additions (for planning only; a separate key or update later)
Checkout Sessions: Write; Customers: Write; Subscriptions: Write; Customer portal: Write; Invoices: Read (Write only for Corporate in Phase 5); Payment Intents: Read; Charges: Read; Refunds: Read (Write if refunds are issued from admin); Disputes: Read; Balance transactions: Read; Credit notes: Read; Radar early fraud warnings: Read; Products/Prices: Write **only** for the one-off sync script key (separate RAK, used manually).

### 5.3 App-side key guard (Phase 2, D1)
- Accept `rk_test_` (preferred).
- `sk_test_` is accepted **only** when `NODE_ENV !== "production"`, with a startup warning.
- Refuse **any `*_live_` key** unless a future, separately approved `STRIPE_LIVE_MODE_ENABLED` gate is set in production. That gate does not exist in Phase 2, so live keys are always refused.
- Missing key → Stripe features disabled, app runs normally (free experience unchanged).

## 6. Stripe tax-threshold monitoring: review and recommendation
*(Approved direction: no automatic tax collection. Any Dashboard change needs separate approval. This is not tax advice; confirm with an accountant.)*

- **What it is:** a free Stripe Tax feature. It tracks Stripe-processed sales against jurisdictions' registration thresholds and **emails alerts** when you approach or exceed one. It does **not** collect tax and needs **no code**. It uses the account's **head office address** and a **preset product tax code**. Refunds and credit notes reduce the tracked totals.
- **Australia (domestic GST):** registration is required when GST turnover reaches **A$75,000** (ATO rules). That is measured on *total* business turnover, including non-Stripe income, so the owner or accountant must track it directly. Stripe monitoring is a helpful signal, not the authority.
- **Overseas:** digital services sold to overseas consumers can trigger obligations elsewhere (for example the EU, UK and NZ), some with low or no thresholds. This is where monitoring adds the most value, alongside the deferred Managed Payments decision (Q21).
- **Recommended configuration (for approval, owner applies it in the Dashboard):**
  1. Enable threshold monitoring with **notification emails on**.
  2. Head office address: the partnership's Australian business address.
  3. Preset tax code: **"General – Electronically Supplied Services"** (verify the exact code name in the Dashboard picker).
  4. Default tax behaviour: **inclusive**, matching the approved "final consumer price" display so prices need not change if GST later applies (Q7).
  5. **No registrations added; `automatic_tax` stays off in code.**
  6. Review alerts monthly.

## 7. Local webhook signing secret: how to obtain it securely
For local development the secret comes from the Stripe CLI forwarder (it is tied to your CLI login and is stable across `stripe listen` runs). Staging and production later get **different** secrets from their own Dashboard webhook endpoints.

1. Renew the CLI login first: run `stripe login` and choose **Mawica sandbox**.
2. Write the secret straight into `.env.local` **without displaying it**. Run this from the project root; the existing empty line is replaced in place:

```bash
secret="$(stripe listen --print-secret)" && sed -i '' "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=${secret}|" .env.local && unset secret
```

3. Tell me when it's done. I'll re-run the presence check (prefix and length only).

Never paste the secret into chat, commits, issues or logs. If it is ever exposed, rotate it by logging out and back in to the CLI (`stripe logout`, `stripe login`) and repeat step 2.

## 8. Exact proposed `docs/release-gates.md` changes (revision 2, not applied)

Revision 2 separates the four payment stages the owner asked for: **E1** foundation development, **E2** sandbox payment testing, **E3** customer-facing activation, **E4** production (live) activation. **Approving Phase 2 authorises E1 only.**

**Change 1: section A (existing line replaced)**
```diff
-- [ ] No secrets in git (scan), client bundle contains no server settings (tested), `ENABLE_PROXY_DEBUG` only on staging
+- [ ] No secrets in git (scan, including Stripe `sk_`, `rk_` and `whsec_` patterns), client bundle contains no server settings or Stripe secrets (tested), `ENABLE_PROXY_DEBUG` only on staging
```

**Change 2: section C (existing line replaced by two lines)**
```diff
-- [ ] Payment decision: no payment integration is in scope; credits remain free allowance until decided **(owner)**
+- [x] Payment decision: Stripe integration approved for foundation development and sandbox testing only (AUD, hosted Checkout, Billing, Customer Portal) per `STRIPE-PHASE-1B-DECISIONS.md`; customer-facing or live payments need gates E3 and E4 **(owner, 27 Nov 2026)**
+- [ ] Payment feature gates verified off in the beta environment (no checkout, subscription, premium, Corporate, Event or Unlimited purchasing); the free experience is unchanged
```

**Change 3: section D (new line inserted after the existing first line)**
```diff
 - [ ] Everything in A to C
+- [ ] Payment status at launch decided: either E3 and E4 passed for every paid product offered, or every payment feature gate verified off in production
```

**Change 4: new section E appended at the end of the file**
```markdown
## E. Payments (Stripe)
Each stage needs every item in the stages before it. Approving one stage never authorises a later one. Live payments are only possible after E4.

### E1. Payment foundation development (local, Stripe sandbox, nothing purchasable)
- [ ] Only a restricted **test** key (`rk_test_`) and a local webhook secret in the git-ignored `.env.local`; the dedicated MAWICA sandbox verified **(owner)**
- [ ] Code refuses live keys; Stripe features stay disabled when configuration is missing; Stripe secrets never reach client bundles (tested)
- [ ] Webhook signature, duplicate, concurrent and out-of-order tests green; unsupported events handled safely
- [ ] Prisma migrations tested only against the isolated local test database
- [ ] Every payment feature gate defaults to off; free card and wallet regression suites green
- [ ] No Stripe products, prices or Checkout Sessions created; no Dashboard settings changed

### E2. Sandbox payment testing (local and staging, test mode, internal testers only)
- [ ] Separate Stripe sandboxes for development, CI and staging; staging restricted test key and webhook secret in Key Vault via managed identity
- [ ] Sandbox products and prices created only by the reviewed catalogue sync script after owner approval **(owner)**
- [ ] Checkout limited to allow-listed internal accounts; Stripe test cards only
- [ ] Test-clock suites pass: renewals, annual monthly allocations, 72-hour grace → Free → recovery, upgrade/downgrade, cancellation at period end, Corporate cumulative allocation (if built)
- [ ] Refund, dispute and early-fraud-warning handling rehearsed; reconciliation shows zero drift for 7 days on staging

### E3. Customer-facing payment activation (per product: premium card, Plus, Unlimited, Corporate, Event)
- [ ] The product's own phase approved; its feature gate turned on individually with owner sign-off **(owner)**
- [ ] Terms, Privacy (Stripe as processor), refund policy (Australian Consumer Law), auto-renewal and cancellation disclosures published **(legal)**
- [ ] Pricing and membership pages read the shared catalogue; card classification golden test green; no free launch card paywalled
- [ ] Unlimited: fair-use thresholds and terms approved and published. Corporate and Event: functionality implemented, tested and approved **(owner)**
- [ ] Customer support, refund and dispute procedures ready
- [ ] Real money requires E4 as well; without E4 a product may only be offered in sandbox to allow-listed testers

### E4. Production payment activation (Stripe live mode)
- [ ] Live Stripe account verified as MAWICA; business profile, ABN, payout account, statement descriptor and support contact set **(owner)**
- [ ] Live restricted key and live webhook signing secret only in production Key Vault via managed identity; `web_params.py` presence checks; webhook endpoint restricted to Stripe IPs
- [ ] Live-mode gate enabled in production only, by the owner; rollback (all payment gates off) rehearsed without data loss **(owner)**
- [ ] Tax position documented: GST registration status, tax-inclusive price display, threshold monitoring, Adaptive Pricing and Managed Payments decisions **(accountant)**
- [ ] Admin placeholder prices removed; actual-revenue reporting separate from projections
- [ ] Apple and Google in-app purchase requirements reviewed before any mobile app sells digital goods

Applied only after the owner approves this exact wording.

## 9. Phase 2 implementation plan (for approval; nothing done yet)
Branch `feature/stripe-phase-2-foundations` from `origin/main`. Read the relevant `node_modules/next/dist/docs/` pages first (route handlers, env, server-only), per `AGENTS.md`.

| Step | Deliverable | Key files (new unless noted) |
|---|---|---|
| 0 | Regenerate `src/generated/prisma` from HEAD; baseline test run recorded | n/a |
| D1 | `stripe` (Node SDK **23.2.0**, exact pin), API version `2026-11-18.endive`; `server-only` client factory; key-mode guard (§5.3); Zod env additions (all optional, fail-safe) | `src/lib/stripe.ts`, `src/lib/env.ts` (edit), `package.json` (edit) |
| D2 | Shared catalogue (all approved prices incl. $2.99 pass; `purchasable:false` everywhere); consistency tests against `Plan` rows; golden card-tier test; **no customer-facing price display added** (no current prices change) | `src/modules/billing/catalogue.ts`, `tests/billing-catalogue.test.ts` |
| D3 | Additive Prisma models: `BillingCustomer` (`stripeCustomerRef` + `refType`), `BillingSubscription`, `BillingOrder`, `BillingInvoice`, `BillingPayment`, `BillingRefund`, `BillingDispute`, `StripeEvent`; enum additions (`PREMIUM_PASS`, `SUBSCRIPTION_PERIOD`, `ORG_ALLOCATION`, reservation `entitlement`). **No organisation or event tables yet; no Plan rows for corporate/unlimited until their phases.** Migration validated on the isolated local `mawica_test` DB only (`migrate diff` + `migrate deploy` against test DB) | `prisma/schema.prisma` (edit), `prisma/migrations/<ts>_billing_foundations/` |
| D4 | `POST /api/stripe/webhook`: raw body (`request.text()`), `constructEvent`, livemode guard, `StripeEvent` insert-first dedupe in a transaction, `created`-ordering guard, handler registry with **no-op** handlers (including a stub for `credit_note.created`), ownership resolution helper (object graph → `BillingCustomer`), structured redacted logs, 5xx on transient errors for Stripe retry | `src/app/api/stripe/webhook/route.ts`, `src/modules/billing/webhook/*` |
| D5 | Feature gates, all **off** by default: `PAYMENTS_CHECKOUT`, `PAYMENTS_SUBSCRIPTIONS`, `PAYMENTS_PREMIUM`, `PAYMENTS_CORPORATE`, `PAYMENTS_EVENT`, `PAYMENTS_UNLIMITED`, `PAYMENTS_LIVE` (server-only env, Zod booleans; `PAYMENTS_LIVE` cannot be enabled in Phase 2) | `src/modules/billing/flags.ts` |
| D6 | Tests: env missing/invalid; live-key refusal; secret-in-bundle check (build output scanned for `sk_`, `rk_` and `whsec_`); bad signature → 400 with no writes; duplicate event; 20× concurrent same event → one row; out-of-order; ownership refusal; catalogue ↔ approved matrix; golden tiers; wallet and welcome regression; full existing suite + `wallet-e2e` / `auth-e2e` against the test DB | `tests/billing-*.test.ts` |
| Report | Fill Part B of this file | this file |

Restrictions honoured: no Stripe products, prices or sessions; no payments; no purchasing; no paid grants; no Dashboard changes; no staging/production migrations; no admin merge; no Azure changes; no deploy; **no commit or push without approval**.

---

## 10. Approved decision register (summary)
See `STRIPE-PHASE-1B-DECISIONS.md` §0 (revision 3) for the full text. Approved: card classification, premium passes (never expire; 7-day card-specific reservation), Corporate Q1/Q2 (not purchasable yet), grace Option A, Unlimited principles (thresholds pending), Adaptive Pricing off, Managed Payments off, AUD, 50% annual discount, hosted Checkout, Portal, cancellation at period end, no tax collection, in-app payment requirements documented. Unresolved items: §0.1 of that document.

## 11. Owner actions before Part B can start
| # | Action | Who |
|---|---|---|
| 1 | Approve **C1 = classic Customer objects** (§4.3) | owner |
| 2 | Approve the Phase 2 RAK permissions (§5.1) and the implementation plan / branch (§9) | owner |
| 3 | Approve or edit the **exact release-gate wording** (§8) | owner |
| 4 | Renew the CLI login: `stripe login` → **Mawica sandbox** | owner |
| 5 | Create the `rk_test_` key and put it in `.env.local` as `STRIPE_SECRET_KEY` | owner |
| 6 | Write `STRIPE_WEBHOOK_SECRET` with the §7 command | owner |
| 7 | (Optional, separate approval) Apply the tax-monitoring configuration (§6) in the Dashboard | owner |

After these, I re-verify (whoami, key prefix and account, secret presence) and start Part B.

---

# Part B: implementation and validation results (release gate E1 only)

**Status: local implementation and validation complete. Not committed, not pushed, nothing deployed. Waiting for owner review.**

## B1. Final preflight verification (27 Nov 2026, 04:20 UTC): ✅ all passed
| Check | Result |
|---|---|
| Stripe CLI authentication | ✅ renewed; valid until 05:16 UTC today |
| Account | ✅ **Mawica sandbox** `acct_…dpf9`, the only authorised account; the restricted key embeds the same account and returns the same latest event id as the CLI |
| Mode | ✅ test only (CLI modes `[test]`, events `livemode=false`) |
| `STRIPE_SECRET_KEY` prefix | ✅ `rk_test_` (restricted) |
| Allowed permissions | ✅ Products, Prices, Events read → 200 |
| Denied resources | ✅ Customers, Checkout Sessions, Subscriptions, Payment Intents, Invoices, Webhook Endpoints, Charges → **403** |
| `STRIPE_WEBHOOK_SECRET` | ✅ `whsec_` present and **identical to the local `stripe listen` secret** (compared in memory, never printed); verified end-to-end through the app's own verifier |
| `.env.local` excluded from Git | ✅ |
| Secrets in source, logs or client bundles | ✅ none (see B9) |

## B2. Branch and baseline
- Branch `feature/stripe-phase-2-foundations`, created from freshly fetched `origin/main` = **`db58366`** (includes PR #27). There are no commits on it yet. Its upstream is unset, so a plain `git push` cannot target `main`.
- Unrelated untracked files (`admin/`, `docs/ci/`, `docs/screenshots/catalogue/*.zip`, `storage/`, `tmp/`) and **both stashes** are untouched. Nothing was reset, cleaned or overwritten.
- `src/generated/prisma` (git-ignored) was regenerated from this branch's schema, which removed the stale admin-branch models.

## B3. Approved release-gate changes (applied to `docs/release-gates.md`)
The approved wording was applied with the owner's three corrections:
1. Section C authorises **E1 only**; **E2 requires separate explicit owner approval**.
2. E1 permits **only a restricted sandbox key**; there is no `sk_test_` exception, and the code refuses full-access keys.
3. E4 explicitly requires **webhook signature verification**; Stripe IP allowlisting is additional defence, never a replacement.

The other wording is as approved: the section A secret-scan line, the section C feature-gate line, the section D launch line, and new section E (E1–E4).

## B4. Architecture decisions implemented
| Decision | Implementation |
|---|---|
| Classic Stripe Customer (C1) | `BillingCustomer.refType` defaults to `CUSTOMER`; a DB CHECK enforces the `cus_` prefix (or `acct_` only if `ACCOUNT_V2` is ever chosen). Accounts v2 is deferred. |
| Server-only SDK | `stripe@23.2.0` (exact pin), API version pinned to **`2026-11-18.endive`** (asserted equal to the SDK's own version), `src/lib/stripe.ts` is `server-only`; the client is null unless the key passes the guard; constructing it makes no network call. |
| Restricted key only | `src/modules/billing/config.ts`: accepts only `rk_test_…`; refuses `sk_*` (`full_access_key_refused`), any `*_live_*` (`live_key_refused`), `pk_*` and malformed values. Missing or refused key = payments disabled, app unaffected. |
| Shared pricing | `src/modules/billing/catalogue.ts` (pure data, no secrets, safe for web, admin and mobile): all approved AUD prices, versioned lookup keys, one Stripe product per plan, approved entitlements, Event package; `purchasable: false` everywhere. `allocation.ts`: approved Corporate cumulative formula (not wired into the engine). |
| No parallel wallet | New tables hold Stripe **references and processing state only**. The ledger, its triggers, `CreditGrant` / `CreditReservation`, `WelcomeGrantTombstone`, `Plan` rows and the engine are **unchanged**. Free and Plus catalogue entitlements are test-checked against the seeded `PlanEntitlement` rows. |
| Webhooks | Raw-bytes signature verification, sandbox-only, exactly-once transactional processing, per-object serialisation, out-of-order protection, safe retries, ownership via the Stripe object graph, allow-listed logs (B7). |
| Feature gates | Code constants, frozen, all `false` (B8). |

Deliberately **deferred** (smaller than the Phase 1B §13 plan, per "minimum necessary"): the wallet enum additions (`PREMIUM_PASS`, `SUBSCRIPTION_PERIOD`, `ORG_ALLOCATION`), reservation `entitlement` column, refund/dispute/invoice mirror tables, organisation and event tables. They arrive with the phases that use them, so Phase 2 leaves the ledger schema untouched.

## B5. Changed files
**Modified (7):**

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | + `stripe` **23.2.0** (exact) |
| `src/lib/env.ts` | + optional `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (documented; validated in billing config, never breaks the app) |
| `prisma/schema.prisma` | + 5 billing models, 6 enums; back-relations on `User` and `CreditAccount` (relation fields only, no column change) |
| `.env.example` | + Stripe placeholders (empty) and the safe webhook-secret command |
| `scripts/migration-dryrun.sh` | + rewind recipe for the new migration |
| `docs/release-gates.md` | approved E1–E4 wording (B3) |

**New:**

| File | Purpose |
|---|---|
| `src/lib/stripe.ts` | server-only client factory, pinned API version |
| `src/modules/billing/config.ts` | key and webhook-secret guard |
| `src/modules/billing/flags.ts` | payment feature gates (all off) |
| `src/modules/billing/catalogue.ts` | shared pricing and entitlement catalogue |
| `src/modules/billing/allocation.ts` | Corporate cumulative allocation (pure) |
| `src/modules/billing/ownership.ts` | object-graph ownership + session-only customer lookup |
| `src/modules/billing/webhook/{verify,process,handlers,log}.ts` | webhook verification, processing, deferred handlers, safe logging |
| `src/app/api/stripe/webhook/route.ts` | `POST /api/stripe/webhook` |
| `prisma/migrations/20261127100000_billing_foundations/migration.sql` | additive migration + 16 hand-written CHECKs |
| `scripts/stripe-catalogue-check.mts` | **read-only** sandbox price check by lookup key |
| `scripts/scan-stripe-secrets.mjs` | source + client-bundle secret scan (prints counts only) |
| `tests/billing-config.test.ts`, `tests/billing-catalogue.test.ts`, `tests/billing-webhook.test.ts` | 44 tests |
| `STRIPE-PHASE-1-AUDIT.md`, `STRIPE-PHASE-1B-DECISIONS.md`, this report | planning documents |

## B6. Dependency changes
| Package | Version | Notes |
|---|---|---|
| `stripe` | **23.2.0** (exact pin) | Official Stripe Node SDK, published by `stripe-bindings <dev-platform-bots@stripe.com>`, latest stable; generated for API `2026-11-18.endive`. No transitive dependencies added to the lockfile. Server-side only. |

No frontend payment dependency (`@stripe/stripe-js` was not added). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not read anywhere.

## B7. Database schema and migration
**Migration `20261127100000_billing_foundations`:** additive only (new enums, tables, indexes, FKs). No existing table, column, constraint, trigger or row is changed.

| Table | Purpose | Key constraints |
|---|---|---|
| `BillingCustomer` | wallet ↔ Stripe customer (`stripeCustomerRef` + `refType`) | unique ref; unique `(accountId, livemode)`; FK `CreditAccount` RESTRICT, `User` SET NULL |
| `BillingSubscription` | subscription reference + lifecycle (`entitlementState`, `paidThrough`, `graceEndsAt`, `graceInvoiceId`, pending downgrade, `lastStripeEventAt`) | unique Stripe id |
| `BillingOrder` | one-time orders ($2.99 pass, Event) with client idempotency, request hash, 7-day purchase intent | unique `(accountId, idempotencyKey)`, unique Checkout Session / PaymentIntent |
| `BillingPayment` | settled charges: amount, refunded, fee, net (reconciliation and finance actuals) | unique charge id |
| `StripeEvent` | exactly-once webhook record (no payload) | PK = `evt_` id |

**Hand-written CHECKs (16):**
- `livemode = false` on all 5 tables. E1 is sandbox-only; lifting it needs a reviewed migration at E4.
- `currency = 'aud'`.
- Non-negative amounts; `amountRefunded ≤ amount`.
- Quantity between 1 and 10.
- Stripe id prefixes: `cus_` / `acct_`, `sub_`, `ch_` / `py_`, `evt_`.
- `attempts ≥ 1`.
- Processed/ignored ⇔ `processedAt` set.

**Validation (isolated local cluster 127.0.0.1:5433 only):**

| Check | Result |
|---|---|
| `prisma validate` | ✅ valid |
| `migrate diff` migrations → schema | ✅ no difference |
| Applied to `mawica_test` (isolated test DB) | ✅ applied |
| `scripts/migration-dryrun.sh` step 1 (empty DB → all migrations) | ✅ |
| Step 2 (drift) | ✅ no drift |
| Step 3 (upgrade a copy holding 33,333 rows) | ✅ row counts identical in every table. The post-upgrade drift check lists only admin-branch objects (CMS / StaffPrincipal) that exist in the copied test data, not in this branch: expected, unrelated. |
| Step 4 (backwards compatibility) | ✅ 0 columns removed or changed |
| `mawica_dev`, staging, production | **Not touched** |

## B8. Webhook architecture and security controls
```
POST /api/stripe/webhook
  ├─ content-length > 512 KB → 413 (before reading)
  ├─ raw bytes (request.arrayBuffer) ─ signature (stripe-signature, 300 s tolerance) ─ fail → 400, no DB write
  ├─ secret missing/malformed → 503 · livemode=true → 400 · Connect `account` → 400
  └─ processStripeEvent (one transaction)
       1. INSERT StripeEvent … ON CONFLICT DO UPDATE … WHERE status='FAILED'  → claim (duplicates return 200 "duplicate")
       2. pg_advisory_xact_lock(object id)                                       → per-object serialisation
       3. newer PROCESSED event for same object (created strictly greater)?     → IGNORED STALE_OUT_OF_ORDER
       4. handler (Phase 2: ownership check only → DEFERRED_PHASE2; unknown type → IGNORED UNSUPPORTED_TYPE)
       5. status + outcome + processedAt
     error → full rollback, row marked FAILED (attempts+1), 500 → Stripe retries and reclaims
```
- **Ownership:** Stripe customer → `BillingCustomer` → wallet. Conflicting `metadata.mawica_account_id` → `OWNERSHIP_MISMATCH`, nothing applied. App-side lookups only via the session user (`getOwnBillingCustomer`); no API accepts customer or account ids.
- **Supported (deferred) event types (23):**
  - Checkout: completed, async succeeded/failed, expired
  - Subscriptions: created, updated, deleted
  - Invoices: paid, payment_failed, finalized, voided, marked_uncollectible, overdue
  - Refunds and disputes: **`credit_note.created`**, `charge.refunded`, refund created/updated, dispute created/updated/closed
  - Fraud: `radar.early_fraud_warning.created`
  - Customers: `customer.updated`, `customer.deleted`
- **No entitlement is granted** and no wallet row changes; a test asserts grant, ledger, reservation and plan counts are unchanged.
- **Logging:** allow-listed fields only (event id, type, status, outcome, livemode, attempts, duration, code, error name). Key or secret patterns are redacted, and payload, signature and personal data never appear (tested).
- **No session, Origin or rate-limit checks on this route by design**, because the signature is the authentication. Not in `proxy.ts` scope.

## B9. Feature-gate status
| Gate | Value | Can configuration enable it? |
|---|---|---|
| checkout | **off** | No (code constant, frozen) |
| subscriptions | **off** | No |
| premiumPurchases | **off** | No |
| corporate | **off** | No |
| events | **off** | No |
| unlimited | **off** | No |
| livePayments | **off** | No |

Every catalogue product also has `purchasable: false`; `Plan.plus.purchasable` stays false; no Corporate or Unlimited `Plan` rows exist. **No checkout, purchase or pricing UI was added. The free experience is unchanged.**

## B10. Test, build and validation results
| Check | Result |
|---|---|
| New billing tests (3 files, **44 tests**) | ✅ 44/44 |
| Full Vitest suite | 642 tests: **616 passed, 26 failed**. The 26 failures are **identical** to the baseline run on `origin/main` before any change (diffed by test name): 15 in `delivery.test.ts`, 11 in `scheduling.test.ts` |
| Cause of the 26 pre-existing failures | `mawica_test` contains two credit grants (`period:free:p2-test:TOTAL`, created 23 and 26 Nov by admin-branch test work) **without ledger entries**, so the delivery/scheduling drift assertions fail. The test DB also carries the admin branch's 4 migrations. Not caused by and not touched by this work. |
| Wallet and welcome-gift regression (`wallet.test.ts`, `wallet-routes.test.ts`) | ✅ all pass. One guard (`planKey` only in wallet modules) initially caught a descriptive field in the catalogue; it was renamed to `plan`, and **the guard was kept unchanged**. |
| Free card classification (golden) | ✅ six launch cards STANDARD (snow globe, tree, gift, warm wishes, two New Year); Lumi's Wish ×2 PREMIUM; unknown templates throw |
| Pricing consistency | ✅ exact approved matrix; annual = 6 × monthly; AUD integer cents; unique versioned lookup keys; Free/Plus match DB entitlements; Corporate 83/84 & 8/9 sum to exactly 1,000 and 100 |
| Env / live-mode / secret tests | ✅ missing, malformed, `sk_test`, every live prefix, publishable-in-secret-slot all refused; descriptions never contain values; gates cannot be enabled by env |
| Webhook security tests | ✅ wrong secret, tampered body, missing header, stale timestamp, forged header → 400 with no write; signed live event → 400; Connect event → 400; > 512 KB → 413; missing/malformed secret → 503 |
| Duplicate / concurrent / out-of-order | ✅ duplicate → 200 `duplicate:true`, attempts 1; **20 concurrent identical deliveries → exactly 1 processed**; 10 concurrent events on one object all terminal, newest never marked stale; older-after-newer → `STALE_OUT_OF_ORDER`; equal timestamps processed; failure → FAILED, retry → PROCESSED attempts 2, then duplicate |
| Ownership tests | ✅ mapped customer processed; conflicting metadata → mismatch; user B cannot read user A's billing customer |
| DB guarantees | ✅ live-mode row, wrong id prefix, non-AUD order, live event all refused by the database |
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| ESLint | ✅ **0 errors** (2 warnings, both in files not touched by this work) on the project. The untracked `admin/` build leftovers, `tmp/`, `storage/` and `docs/` were excluded; run over everything, they add ~23k problems that are unrelated and pre-existing. |
| Production build (`next build`) | ✅ compiled; `/api/stripe/webhook` is a dynamic route |
| Production smoke (`next start`) | ✅ `/` (incl. Meet Lumi) 200, `/create` 200, `/about` 200, `/api/health` 200, unknown card 404, unsigned webhook 400; no server errors |
| Dev smoke + browser | ✅ `/create` renders all six free cards with no payment UI; unsigned webhook 400, bad signature 400, GET 405 |
| Real local configuration | ✅ app guard reports `api: enabled:restricted-test-key`, `webhook: enabled`; the real secret verifies a signed payload; a wrong secret is refused |
| Secret scan (`scripts/scan-stripe-secrets.mjs`) | ✅ **0** of 936 source files; **0** of 128 client-bundle files contain Stripe keys, secrets or any of the 3 configured values |
| Read-only sandbox catalogue check | ✅ 0 of 8 lookup keys exist in the sandbox (expected); **nothing created or changed** |

## B11. Security review (E1)
- **Secrets:** only in git-ignored `.env.local`; read server-side at call time; never logged, returned, bundled or used as `NEXT_PUBLIC_`; static tests block client imports of Stripe or billing config; scanner covers source and bundle.
- **Least privilege:** `rk_test_` with Products/Prices/Events Read; the app refuses `sk_` and live keys; the DB refuses live-mode rows.
- **Webhook authenticity:** signature over raw bytes with replay tolerance; IP allowlisting is planned for E4 as additional defence only.
- **Integrity:** exactly-once claim in the same transaction as effects; per-object locks; stale-event protection; prefix, currency and amount CHECKs.
- **Authorisation:** ownership resolved through Stripe's object graph; session-only customer lookups.
- **No payment surface:** no Checkout Sessions, products, prices, payments, grants, Dashboard changes, staging/production DB or Azure changes.

## B12. Remaining risks and blockers
| # | Item | Impact | Proposed action |
|---|---|---|---|
| R1 | `mawica_test` is contaminated by admin-branch work (2 ledger-less grants, 4 admin migrations), so 26 delivery/scheduling tests fail on this machine | Masks regressions in those suites | With owner approval: delete the two `period:free:p2-test:TOTAL` grants, or recreate `mawica_test` from this branch's migrations; then re-run. Not done here (unrelated data). |
| R2 | Dev-only error on `/`: "Could not validate `instant`… MeetLumi module factory is not available" (Next 16 cache-components prefetch validation) | Dev console noise; production build and `next start` are clean | The home page imports none of the billing code. A comparison run of `main` could not be completed (Turbopack refuses a worktree with linked `node_modules`), so it is **not yet proven pre-existing**. Recommend checking on a clean `main` checkout. |
| R3 | Stripe CLI login expires 05:16 UTC today | `stripe listen` stops working | Re-run `stripe login` when needed |
| R4 | The local `.env.local` still contains a `pk_test_` publishable key | None (not read by code, not bundled) | Optionally blank it |
| R5 | The admin branches' migrations will need ordering against `20261127100000_billing_foundations` when merged | Migration conflict risk at Phase 7 | Plan a merge order before merging the admin branches |
| R6 | Wallet-engine changes (passes, subscription slices, grace, unlimited) are not implemented | Expected: Phase 3+ | — |

## B13. Phase 3 GO / NO-GO recommendation
**NO-GO to start Phase 3 work now; GO for owner review of Phase 2.** Phase 2 Foundations (E1) is implemented and validated locally. Phase 3 (Plus subscriptions + the $2.99 premium pass in sandbox) also requires **E2 sandbox payment testing**, which needs separate explicit owner approval and will create sandbox products and prices. Recommended order:
1. Owner reviews this report and the diff, then approves a commit (and later a PR) of the Phase 2 branch.
2. Resolve R1 (clean test DB) so the full suite is green, and check R2 on `main`.
3. Owner decides on **E2 approval**. Phase 3 also needs the remaining Phase 3 decisions: Q8 refund wording, Q9 trials/promo codes, Q11 deletion with an active subscription, Q19 tier switching, Q23 scheduled cards after suspension, and the D5/D6 refund and upgrade/downgrade mechanics.
4. Then Phase 3: enable sandbox catalogue sync (Products/Prices write, separate RAK), Checkout and Portal behind the gates, the wallet `PREMIUM_PASS` unit and subscription slices, and grace handling, all in sandbox only.

---

# Part C: Phase 2A final hardening and validation (27 Nov 2026)

**Status: complete and validated locally. Not committed, not pushed, not deployed. E1 remains the only authorised gate.**

## C1. Before and after test results
| Run | Database | Result |
|---|---|---|
| Baseline (before any Phase 2 change, `origin/main` code) | `mawica_test` (existing) | 598 tests: 572 passed, **26 failed** (15 delivery, 11 scheduling) |
| Phase 2 (Part B) | `mawica_test` (existing) | 642 tests: 616 passed, **the same 26 failed** |
| Phase 2 (Part B code) | **`mawica_test_e1_20261127` (fresh)** | **642 / 642 passed** |
| **Phase 2A final (this part)** | **`mawica_test_e1_20261127` (fresh)** | **648 / 648 passed** (34 files) |
| Stripe-specific (3 files) | fresh | **50 / 50** |
| Wallet, entitlement, scheduling, delivery, registry and premium regression (6 files) | fresh | **165 / 165** |

No test was skipped, weakened or removed. The only harness change: `tests/setup.ts` now also accepts a uniquely named `mawica_test_<suffix>` database (lowercase, digits, underscores). The local-cluster host and port guard is unchanged, and an explicitly exported `TEST_DATABASE_URL` takes precedence over `.env.local`.

## C2. Test database isolation evidence
- **Existing `mawica_test`:** on the isolated local Mawica cluster `127.0.0.1:5433` (not the shared 5432 Postgres, not staging, not production). **Preserved untouched:** its two orphaned grants (`period:free:p2-test:TOTAL`) are still present, and no rows newer than the Part B run exist.
- **Fresh database:** `mawica_test_e1_20261127`, created on the same isolated cluster as owner `mawica_app`, with `CONNECT` revoked from `PUBLIC`.
  - Built from the **10 migrations of this branch only**, without the admin-branch migrations.
  - Fixtures: only the deterministic seed rows in the migrations (Plan `free`, `plus` and their entitlements). Tests create and clean up their own data.
  - After the full run: 0 ledger drift, 0 Stripe events left behind.
- **No remote connection:** every database URL used was `127.0.0.1:5433`, and `db-guard.ts` refuses any non-local host outside `NODE_ENV=production`. Staging and production were never contacted.
- **Root cause of the 26 failures, now proven:** the stale admin-branch data in `mawica_test`, not the code. With a clean database, everything passes.
- **Recommendation for the owner:** point `.env.local`'s `TEST_DATABASE_URL` at `mawica_test_e1_20261127`, or approve cleaning `mawica_test`. This needs your decision; nothing was deleted.

## C3. Meet Lumi "Could not validate `instant`" investigation
| Question | Finding |
|---|---|
| Reproduced on the Phase 2 branch? | Yes, in `next dev` after a browser load of `/`: `Route "/": Could not validate instant … MeetLumi.tsx (client reference proxy) … module factory is not available` (environment `Prefetch`). |
| Pre-existing? | **Yes.** A clean worktree of `origin/main` (`db58366`) with its **own `npm ci` install** (isolated dependencies) and isolated environment variables produced the **identical error** after a browser load (3 occurrences). The worktree and its server were removed afterwards. |
| Root cause | Next.js 16 development-only **instant-navigation validation** (enabled by `cacheComponents: true` + `partialPrefetching: true` in `next.config.ts`) renders the route in a "Prefetch" environment. The home page (`src/app/(site)/page.tsx`, from PR #27) loads the client component `MeetLumi` through `next/dynamic` inside a **server** component. In that validation pass, the lazily loaded client module's factory is not available, so validation of the segment cannot complete. |
| Production impact | **None.** `next build` succeeds; `next start` serves `/` (including the Meet Lumi section) with 200 and **zero server errors**. Next.js docs: dev performs no prefetching; the validation is a development diagnostic. |
| Severity | **Low**: development console noise only; no user impact; no data or security impact. |
| Fix | **Not made in the Stripe branch** (as instructed). Proposed separately as branch `fix/home-instant-validation-meetlumi`, with a small PR that moves the `next/dynamic` calls for below-the-fold sections into a `"use client"` wrapper (or marks the segment's instant expectation explicitly), then confirms the dev console is clean and Lighthouse and mobile first-load are unchanged. No redesign of Lumi or the hero. |

## C4. Security review findings and hardening
| Area | Finding | Action |
|---|---|---|
| Server-only SDK imports | All modules that can see a secret start with `import "server-only"`. A new test asserts no page, layout or component imports billing or Stripe code. | ✅ + new test |
| Restricted test key | Only `rk_test_` accepted; `sk_*`, `pk_*`, every `*_live_*` and malformed keys refused | ✅ (unchanged) |
| Accidental live mode | Live keys refused by the guard; signed live events refused (400); DB CHECK `livemode = false` on all billing tables | ✅ |
| Missing configuration | Missing/refused key → client null, app unaffected; missing/malformed webhook secret → 503 | ✅ |
| Signature over the original body | Verified against the exact bytes. **Hardened:** the body is now read as a stream with a hard 512 KB cap, so a request without (or with a false) `Content-Length` can no longer make the server buffer an unbounded body (new test). | 🔧 hardened |
| Malformed events | **Hardened:** a correctly signed body that is not a well-formed event (bad `evt_` id, non-integer `created`, missing type/livemode) is refused with 400 before any database access (new test). | 🔧 hardened |
| Replay protection | Signature timestamp tolerance 300 s + event-id dedupe. A replay re-signed within tolerance is acknowledged as a duplicate and never re-applied (new test). | ✅ + new test |
| Duplicate / concurrent delivery | Primary-key claim inside the processing transaction; 20 concurrent identical deliveries → exactly one processed | ✅ |
| **Out-of-order / authoritative state** | Part B ignored an event when a newer one (by `event.created`) had been processed. That relied on a one-second, non-authoritative timestamp and could permanently drop an event. **Changed:** no event is dropped on its timestamp. Ordering facts (`newerEventProcessed`, `sameSecondEventProcessed`) are computed under the per-object advisory lock and passed to the handler as **hints**. A binding **handler contract** (`handlers.ts`) requires Phase 3+ handlers to re-fetch the authoritative Stripe object and apply it with compare-and-set transitions, so late, reordered or same-second events converge on the current state. Phase 2 records superseded snapshots as `DEFERRED_SUPERSEDED_SNAPSHOT`. | 🔧 redesigned + tests |
| Transaction atomicity | Claim, handler effects and outcome commit together. New test: a handler that writes a row and then fails leaves **no row** and the event `FAILED` (never done). | ✅ + new test |
| Interruption and recovery | New test kills the database connection **inside** the processing transaction (`pg_terminate_backend`). Nothing is committed, the event is not marked done, and Stripe's retry processes it successfully. The final status update is also guarded (`WHERE status = 'PROCESSING'`). | ✅ + new test |
| Failed processing can never be "completed" | PROCESSED/IGNORED is only reachable through the committed transaction; the failure path can only write `FAILED` (it never touches PROCESSED/IGNORED rows); FAILED rows are reclaimed on the next delivery | ✅ |
| Idempotent business effects | Stripe delivers at least once, in any order. The contract requires effects keyed on business ids (deterministic grantKeys with the existing unique constraint, conditional order transitions), so different events causing the same effect are no-ops the second time. No effect is implemented in E1. | ✅ documented |
| Ownership | Resolved via Stripe customer → `BillingCustomer` → wallet; conflicting metadata → `OWNERSHIP_MISMATCH`; customer lookups only via the session user | ✅ |
| Safe logging | Allow-listed fields only; key/secret patterns redacted; payload, signature and personal data never logged (test) | ✅ |
| Uniqueness constraints | `StripeEvent.id` PK; unique Stripe ids on customer, subscription, order (Checkout Session, PaymentIntent), payment (charge); unique `(accountId, livemode)` and `(accountId, idempotencyKey)` | ✅ |
| Unsupported events | Acknowledged (200), recorded `IGNORED/UNSUPPORTED_TYPE`, never acted on | ✅ |
| Test seam | `__setHandlerForTests` now **throws outside the test runner** | 🔧 hardened |
| Paid entitlements | None granted; wallet, ledger, reservation and plan counts asserted unchanged | ✅ |

## C5. Migration compatibility findings
- **Non-destructive:** `20261127100000_billing_foundations` only creates (6 enums, 5 tables, indexes, FKs, 16 CHECKs). The dry run kept 33,333 copied rows with identical counts and **0 columns removed or changed**.
- **No naming collisions:** the admin chain adds `20261121000000_staff_admin`, `20261122000000_cms_foundation`, `20261122010000_cms_marketing_media` and `20261122020000_cms_asset_reference` (models `StaffPrincipal`, `Cms*`, enums `StaffRole`, `Cms*`). None share a name with `Billing*` / `StripeEvent` or the new enums.
- **No duplicate payment or wallet models:** the admin branches have **no** payment, order, subscription or invoice models. Their finance module is projection-only. The wallet models are shared and unchanged.
- **No conflicting constraints:** admin migrations only alter `AuditLog` (adds `staffPrincipalId`) and their own tables. The billing migration alters no existing table.
- **Both orders verified on the scratch database:** (A) admin 21–22 Nov then billing 27 Nov, and (B) billing first then admin. Both apply cleanly to an identical end state (34 tables, 115 constraints, 5 billing + 5 admin tables). The scratch schema was reset afterwards.
- **Existing data intact:** additive DDL only; `mawica_test` and `mawica_dev` untouched.
- **Future merge ordering (documented, admin branches not modified):**
  1. `prisma/schema.prisma` will have **one textual conflict**: both branches append models after `CardMediaBlob`. Resolve by keeping both blocks; there are no overlapping definitions.
  2. Migration folders merge without conflict. Prisma sorts by name, so on a fresh database the admin migrations (21–22 Nov) run before billing (27 Nov).
  3. On a database that already has billing applied, `prisma migrate deploy` applies the earlier-dated admin migrations as pending (order B, verified).
  4. Before merging the admin chain, run `scripts/migration-dryrun.sh` on the merge result and `prisma migrate diff` (schema vs migrations).

## C6. Shared pricing validation (verified from the catalogue and by tests)
| Item | Catalogue | Approved |
|---|---|---|
| Free | 10/month, 0 premium, 1 welcome premium; $2.99 add-on | ✅ |
| Plus | $10.00/month, $60.00/year; 50/month incl. 5 premium | ✅ |
| Corporate | $20.00/month, $120.00/year; 1,000/year incl. 100 premium; cumulative 83/84 & 8/9 (sums exactly 1,000 / 100) | ✅ |
| Unlimited | $30.00/month, $180.00/year; unlimited regular and premium (`null`, not a large number) | ✅ |
| Event | $60.00 one-time; 500 invitations; RSVP, guests, tables, reminders, digital tickets | ✅ |
| Individual premium card | $2.99 one-time | ✅ |
| Annual discount | annual = 6 × monthly for all three tiers | ✅ |
| Free launch cards | snow-globe, christmas-tree, special-gift, warm-wishes, new-year-2027, new-year-celebration → STANDARD (free), AR intact | ✅ |
| Lumi's Wish | lumis-wish, lumis-wish-cinema → PREMIUM | ✅ |
| Purchasing gates | checkout, subscriptions, premiumPurchases, corporate, events, unlimited, livePayments: **all false** (frozen constants); every catalogue entry `purchasable: false` | ✅ |

## C7. Final validation summary
| Check | Result |
|---|---|
| Full suite (fresh isolated DB) | ✅ 648/648 |
| Stripe-specific tests | ✅ 50/50 |
| Wallet and entitlement regression | ✅ 165/165 |
| TypeScript | ✅ 0 errors |
| ESLint | ✅ 0 errors (project; 2 warnings in a file not touched by this work). Changed/new files: 0 errors, 0 warnings. |
| Production build | ✅ compiled; `/api/stripe/webhook` dynamic |
| Prisma validate / migrations vs schema | ✅ valid / no difference |
| Migration dry run (scratch DB) | ✅ steps 1–4 (empty → all; no drift; 33,333 rows preserved; 0 columns removed) |
| Admin migration compatibility | ✅ both orders apply cleanly |
| Secret scan (source) | ✅ 0 of 936 files |
| Client bundle scan | ✅ 0 of 128 files (patterns + the 3 configured values) |
| Dependency audit | `stripe` has **no advisories**. The project reports 3 high (`prisma` → `@prisma/config` → `effect` ReDoS) and 7 moderate (ESLint toolchain → `minimatch`). All are **pre-existing**: the only lockfile change on this branch is `stripe@23.2.0` itself. They are not introduced or changed here; propose a separate dependency-update task. |
| `git diff --check` | ✅ no whitespace errors in tracked changes; no trailing whitespace in new files |
| Free experience smoke (`next start`) | ✅ `/`, `/create`, `/about`, `/privacy`, `/terms`, `/sign-in`, `/account`, `/api/health` → 200; unknown card 404; `/api/wallet` 401 without a session; home shows "Create Your Free Card" / "Free to create" and **no prices or Stripe scripts**; unsigned webhook 400, GET 405; **0 server errors** |

## C8. Files changed in Part C
| File | Change |
|---|---|
| `src/modules/billing/webhook/process.ts` | no timestamp-based dropping; ordering hints under the object lock; guarded final update; contract documentation |
| `src/modules/billing/webhook/handlers.ts` | `HandlerContext`; binding handler contract; `DEFERRED_SUPERSEDED_SNAPSHOT`; test seam refuses outside Vitest |
| `src/modules/billing/webhook/verify.ts` | streaming body cap (`readRawBodyCapped`); malformed-event refusal |
| `src/app/api/stripe/webhook/route.ts` | uses the capped stream reader |
| `tests/billing-webhook.test.ts` | +5 tests (partial-write rollback, connection-kill interruption and recovery, ordering hints, replay, malformed event); streaming-size test; updated out-of-order expectations |
| `tests/billing-config.test.ts` | +1 test (no UI imports billing/Stripe code) |
| `tests/setup.ts` | accepts `mawica_test_<suffix>` for isolated runs (guard otherwise unchanged) |

**Full branch change set (vs `origin/main` `db58366`):**
- **Modified:** `.env.example`, `docs/release-gates.md`, `package.json`, `package-lock.json`, `prisma/schema.prisma`, `scripts/migration-dryrun.sh`, `src/lib/env.ts`, `tests/setup.ts`.
- **New:** `prisma/migrations/20261127100000_billing_foundations/`, `src/lib/stripe.ts`, `src/modules/billing/**` (config, flags, catalogue, allocation, ownership, webhook/{verify,process,handlers,log}), `src/app/api/stripe/webhook/route.ts`, `scripts/scan-stripe-secrets.mjs`, `scripts/stripe-catalogue-check.mts`, `tests/billing-{config,catalogue,webhook}.test.ts`, `STRIPE-PHASE-1-AUDIT.md`, `STRIPE-PHASE-1B-DECISIONS.md`, `STRIPE-PHASE-2-FOUNDATIONS-REPORT.md`.
- **Local environment only (not in git):** the new database `mawica_test_e1_20261127` on the isolated cluster.

## C9. Remaining risks
| # | Risk | Status |
|---|---|---|
| R1 | `mawica_test` still contains stale admin-branch data; anyone running tests against it sees 26 failures | Owner decision: switch `TEST_DATABASE_URL` to the fresh DB, or approve cleaning `mawica_test` |
| R2 | Meet Lumi dev-only validation error | Pre-existing on `main`; low severity; separate fix branch proposed |
| R3 | Pre-existing `npm audit` advisories (prisma/effect high; eslint/minimatch moderate) | Not introduced here; separate dependency-update task proposed |
| R4 | `schema.prisma` will have one trivial textual conflict when the admin branches merge | Resolution documented (C5) |
| R5 | Stripe CLI login expiry (05:16 UTC) | Re-login when `stripe listen` is next needed |
| R6 | `StripeEvent` grows without retention | Define a retention/purge policy before E3 (rows hold no payload or personal data) |
| R7 | Phase 3 handlers must follow the handler contract (re-fetch, compare-and-set, business-key idempotency) | Enforced by review and Phase 3 tests |

## C10. Final E1 completion recommendation
**E1 (payment foundation development) is complete and validated locally: recommend approval to commit and open a PR.**
- All E1 release-gate items are demonstrably met:
  - restricted key only;
  - live and full-access keys refused;
  - webhook security, duplicate, concurrent, out-of-order and interruption tests green;
  - migrations tested on isolated local databases only;
  - every gate off;
  - free card and wallet regressions green;
  - no Stripe products, prices or sessions; no Dashboard changes.
- **E2 is not started** and still requires separate explicit owner approval.

## C11. Proposed commit message
```
feat(billing): Stripe E1 payment foundations (sandbox only, purchasing disabled)

Release gate E1 only. No Stripe products, prices, Checkout Sessions, payments or
paid entitlements; every payment feature gate is off.

- stripe@23.2.0 (exact), API 2026-11-18.endive; server-only client that accepts
  only a restricted sandbox key (rk_test_) and refuses full-access and live keys
- Shared pricing/entitlement catalogue (approved AUD prices, $2.99 premium card)
  and Corporate cumulative allocation helper; nothing purchasable
- Additive migration: BillingCustomer, BillingSubscription, BillingOrder,
  BillingPayment, StripeEvent with sandbox-only, AUD, amount and id-prefix CHECKs;
  wallet ledger untouched
- POST /api/stripe/webhook: signature over raw bytes (streamed 512 KB cap),
  malformed/live/Connect events refused, transactional claim with duplicate,
  concurrent, out-of-order and interruption safety; deferred no-op handlers with a
  re-fetch / compare-and-set / business-key idempotency contract; safe logging
- Release gates: section E (E1-E4) with E1-only authorisation
- Tests: 50 Stripe tests; full suite 648/648 on a fresh isolated database
- Tooling: secret/bundle scanner, read-only sandbox catalogue check, dry-run recipe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## C12. Proposed pull request
**Title:** `feat(billing): Stripe E1 payment foundations (sandbox only, purchasing disabled)`

**Description:**
```markdown
## Summary
Release gate **E1 (payment foundation development)** for Mawica's Stripe integration. Sandbox only; nothing is purchasable.

- Server-only Stripe SDK (`stripe@23.2.0`, API `2026-11-18.endive`) that accepts only a restricted sandbox key; full-access and live keys are refused
- One shared pricing and entitlement catalogue with the approved AUD prices (Plus, Corporate, Unlimited, Event, $2.99 premium card); every product non-purchasable
- Additive migration with 5 billing tables (references and webhook processing state only, no parallel wallet) and sandbox-only/AUD/id-prefix CHECK constraints
- Secure webhook endpoint: raw-body signature verification, streamed size cap, live/Connect/malformed refusal, exactly-once transactional claim, per-object locking, ordering hints (no timestamp-based dropping), interruption recovery, safe logging; handlers are deferred no-ops
- All payment feature gates hard-coded off; free experience and card classifications unchanged
- `docs/release-gates.md`: new section E (E1-E4); E1 only is authorised

## Not in this PR
No Stripe products, prices, Checkout Sessions, payments, paid entitlements, Dashboard changes, staging/production migrations or admin changes. E2 needs separate owner approval.

## Test plan
- [x] Full suite on a fresh isolated test database: 648/648
- [x] Stripe tests 50/50; wallet/entitlement regression 165/165
- [x] tsc, ESLint (0 errors), next build, prisma validate, migrate diff
- [x] scripts/migration-dryrun.sh (rows preserved, 0 columns removed); admin migrations apply in both orders
- [x] scripts/scan-stripe-secrets.mjs: 0 secrets in source or client bundle
- [x] Free experience smoke on `next start`

Details: `STRIPE-PHASE-2-FOUNDATIONS-REPORT.md` (Parts A-C).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
