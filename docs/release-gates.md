# Release gates

A gate passes only when every item is demonstrably done. Items marked **(owner)** are decisions, not engineering.

## A. Ready for staging deployment
- [ ] Mawica Azure subscription and tenant IDs recorded in `docs/azure/mawica-ids.md`; identity check passes **(owner)**
- [ ] Email provider chosen to replace ACS Email **(owner)**; staging starts with `EMAIL_PROVIDER=none` and the kill switch on
- [ ] Reviewed IaC (or reviewed manual runbook) with a `what-if`; cost estimate approved **(owner)**
- [ ] Bundled production worker entrypoint, pool limits configured, deploy workflow written (all open)
- [ ] PITR enabled, manual backup taken, `scripts/migration-dryrun.sh` green on the release commit
- [ ] No secrets in git (scan), client bundle contains no server settings (tested), `ENABLE_PROXY_DEBUG` only on staging
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
- [ ] Payment decision: no payment integration is in scope; credits remain free allowance until decided **(owner)**

## D. Ready for public production launch
- [ ] Everything in A to C
- [x] **Guest publishing cutover** (application-enforced): `POST /api/cards` requires session + Origin + Idempotency-Key; historical ownerless cards keep public links; no DB `NOT NULL` on `ownerId` (rollback = restore guest branch in code). Re-verify wallet reconciliation and guests' existing cards on staging before launch.
- [ ] **Recipient consent** flow and legal review complete **before** any recipient or sender notification email is enabled (Spam Act 2003; Sri Lankan data-protection rules) **(legal)**
- [ ] DMARC moved to quarantine/reject after a clean ramp; provider ramp plan followed
- [ ] HSTS raised from 1 day; production domain, TLS and redirects verified
- [ ] Production backups and restore drill performed; disaster recovery documented
- [ ] Load test at the expected launch volume; worker capacity re-measured on Azure (local numbers are not capacity)
- [ ] Abuse and takedown process (`admin remove`) rehearsed; report endpoint monitored
- [ ] Final security review (auth, rate limits behind the real proxy, headers, dependency audit)
