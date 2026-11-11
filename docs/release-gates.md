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
- [ ] **Guest publishing cutover** decision and rollback rehearsed (`NOT VALID` owner constraint approach); wallet reconciliation clean; guests' existing cards verified
- [ ] **Recipient consent** flow and legal review complete **before** any recipient or sender notification email is enabled (Spam Act 2003; Sri Lankan data-protection rules) **(legal)**
- [ ] DMARC moved to quarantine/reject after a clean ramp; provider ramp plan followed
- [ ] HSTS raised from 1 day; production domain, TLS and redirects verified
- [ ] Production backups and restore drill performed; disaster recovery documented
- [ ] Load test at the expected launch volume; worker capacity re-measured on Azure (local numbers are not capacity)
- [ ] Abuse and takedown process (`admin remove`) rehearsed; report endpoint monitored
- [ ] Final security review (auth, rate limits behind the real proxy, headers, dependency audit)
