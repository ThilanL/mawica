# Release gates

A gate passes only when every item is demonstrably done. Items marked **(owner)** are decisions, not engineering.

## A. Ready for staging deployment
- [ ] Mawica Azure subscription and tenant IDs recorded in `docs/azure/mawica-ids.md`; identity check passes **(owner)**
- [ ] Email provider chosen to replace ACS Email **(owner)**; staging starts with `EMAIL_PROVIDER=none` and the kill switch on
- [ ] Reviewed IaC (or reviewed manual runbook) with a `what-if`; cost estimate approved **(owner)**
- [ ] Bundled production worker entrypoint, pool limits configured, deploy workflow written (all open)
- [ ] PITR enabled, manual backup taken, `scripts/migration-dryrun.sh` green on the release commit
- [ ] No secrets in git (scan, including Stripe `sk_`, `rk_` and `whsec_` patterns), client bundle contains no server settings or Stripe secrets (tested), `ENABLE_PROXY_DEBUG` only on staging
- [x] 325+ unit tests, E2E suites, TypeScript, ESLint, build, bundle sizes unchanged (this phase)

## B. Ready for limited real OTP email testing (allow-listed test addresses)
- [ ] Sending domain verified, SPF/DKIM aligned, DMARC `p=none` with a reporting mailbox
- [ ] Provider production quota sufficient (not the default sandbox-like limits)
- [ ] Proxy hop count verified on staging with the procedure in azure-readiness.md
- [ ] Failure drills passed against the real provider: wrong credential (503, loud log), throttle, timeout, blackhole, kill switch
- [ ] Bounce and complaint receiver built, authenticated, idempotent, with a suppression list; or an explicit written decision to defer it for allow-listed testing
- [ ] Alerts live (auth 503 rate, credential errors, worker missed run)
- [ ] Privacy notice names the email processor and region; log retention decided **(owner)**
- [ ] Real-device pass: iOS Safari, Android Chrome (sign-in, code paste, cookies, 503 message, resend cooldown)

### Photo uploads (cinematic card) before any beta
- [ ] Privacy policy and terms cover personal photos: what is stored (a re-encoded WebP, no metadata), who can see it (the owner; everyone once the card is published), retention (unclaimed uploads purged after 24 h; deleted with the card or account), processor/region **(legal)**
- [ ] Image moderation decision: **there is no automated content scanning**; published photos rely on the existing Report flow and `admin remove` **(owner/legal)**
- [ ] A staging upload on a Linux build (sharp binaries) and on a real iPhone (HEIC photos are converted by iOS Safari when the input restricts types; direct HEIC is refused)
- [ ] Video stays off until a safe transcoder exists (see docs/premium-cinematic-card.md)

## C. Ready for controlled beta
- [ ] Two weeks of sign-in email with a failure rate under 1% and no unexplained 503s
- [ ] **Account deletion implemented** (currently not), including cards, sessions, audit rows, and the wallet anonymisation already designed
- [ ] **Welcome-credit tombstone retention** decided and disclosed (keyed hash kept indefinitely today) **(owner/legal)**
- [ ] Privacy policy and terms finalised (current text contains `<Todo>` markers) **(legal)**
- [ ] Support path for "no code received" and for failed scheduled cards; failed-delivery policy decisions in docs/delivery.md **(owner)**
- [ ] Worker operational monitoring running for two weeks: no missed runs, `reconcile` clean, no stuck leases
- [ ] Worker hosting prerequisites done (bundle, slot setting, alerting)
- [ ] Recipient email still **off**; recipient consent design and legal review not required until it is proposed
- [ ] Safari/iOS testing of scheduling and the live card page on real devices
- [x] Payment decision: Stripe integration approved for **E1 payment foundation development only** (AUD, hosted Checkout, Billing, Customer Portal) per `STRIPE-PHASE-1B-DECISIONS.md`. E2 sandbox payment testing requires separate explicit owner approval; customer-facing or live payments also require gates E3 and E4 **(owner, 27 Nov 2026)**
- [ ] Payment feature gates verified off in the beta environment (no checkout, subscription, premium, Corporate, Event or Unlimited purchasing); the free experience is unchanged

## D. Ready for public production launch
- [ ] Everything in A to C
- [ ] Payment status at launch decided: either E3 and E4 passed for every paid product offered, or every payment feature gate verified off in production
- [x] **Guest publishing cutover** (application-enforced): `POST /api/cards` requires session + Origin + Idempotency-Key; historical ownerless cards keep public links; no DB `NOT NULL` on `ownerId` (rollback = restore guest branch in code). Re-verify wallet reconciliation and guests' existing cards on staging before launch.
- [ ] **Recipient consent** flow and legal review complete **before** any recipient or sender notification email is enabled (Spam Act 2003; Sri Lankan data-protection rules) **(legal)**
- [ ] DMARC moved to quarantine/reject after a clean ramp; provider ramp plan followed
- [ ] HSTS raised from 1 day; production domain, TLS and redirects verified
- [ ] Production backups and restore drill performed; disaster recovery documented
- [ ] Load test at the expected launch volume; worker capacity re-measured on Azure (local numbers are not capacity)
- [ ] Abuse and takedown process (`admin remove`) rehearsed; report endpoint monitored
- [ ] Final security review (auth, rate limits behind the real proxy, headers, dependency audit)

## E. Payments (Stripe)
Each stage needs every item in the stages before it. Approving one stage never authorises a later one. Live payments are only possible after E4.

### E1. Payment foundation development (local, Stripe sandbox, nothing purchasable)
- [ ] Only a **restricted** sandbox key (`rk_test_`, least-privilege permissions) and a local webhook secret in the git-ignored `.env.local`; full-access secret keys (`sk_`) are not permitted; the dedicated MAWICA sandbox verified **(owner)**
- [ ] Code refuses live keys and full-access secret keys; Stripe features stay disabled when configuration is missing; Stripe secrets never reach client bundles (tested)
- [ ] Webhook signature, duplicate, concurrent and out-of-order tests green; unsupported events handled safely
- [ ] Prisma migrations tested only against the isolated local test database
- [ ] Every payment feature gate defaults to off; free card and wallet regression suites green
- [ ] No Stripe products, prices or Checkout Sessions created; no Dashboard settings changed

### E2. Sandbox payment testing (local and staging, test mode, internal testers only). Requires separate explicit owner approval.
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
- [ ] Live restricted key and live webhook signing secret only in production Key Vault via managed identity; `web_params.py` presence checks
- [ ] **Webhook signature verification** (live signing secret, original request body) enforced and tested on the live endpoint; restricting the endpoint to Stripe IPs is additional defence only, never a replacement for signature verification
- [ ] Live-mode gate enabled in production only, by the owner; rollback (all payment gates off) rehearsed without data loss **(owner)**
- [ ] Tax position documented: GST registration status, tax-inclusive price display, threshold monitoring, Adaptive Pricing and Managed Payments decisions **(accountant)**
- [ ] Admin placeholder prices removed; actual-revenue reporting separate from projections
- [ ] Apple and Google in-app purchase requirements reviewed before any mobile app sells digital goods
