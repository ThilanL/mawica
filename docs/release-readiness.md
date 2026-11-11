# Release readiness: transactional email and sign-in (Phase 2D.1)

**Nothing here has been provisioned or executed.** It is the plan for a *controlled staging integration*. Production sending, recipient email and the guest-publishing cutover are out of scope.

## 1. Provider recommendation
**Superseded by [email-provider-assessment.md](email-provider-assessment.md): ACS Email is retiring (30 Sep 2028); migrate the adapter before staging.** The text below is the original Phase 2D.1 position, kept for history. Azure Communication Services (ACS) Email, Australia data location, behind the provider-independent interface ([email.md](email.md)). Proceed to a staging evaluation, not to production. Conditions: the integration-test items in email.md pass; per-email pricing is confirmed; the ACS retirement/breaking-changes guide has been read and does not affect Email.

## 2. Azure resources required (staging; none created)
In the existing staging resource group of [azure-staging.md](azure-staging.md), Australia East:
1. Communication Services resource (data location **Australia**).
2. Email Communication Service (data location Australia) with one **custom domain** (e.g. `mail.mawica.com`; a subdomain keeps the apex's reputation separate). Do not use the Azure-managed domain beyond a smoke test: 5/min and 10/hour with no increase.
3. Link the domain to the Communication Services resource; add one sender username (`DoNotReply`).
4. Managed identity for the App Service with the *Communication and Email Service Owner*-style role limited to this resource (preferred), or the access key stored in Key Vault.
5. Event Grid system topic + subscription for delivery reports (only when the receiver exists; see section 9).
6. Diagnostic settings to the existing Log Analytics workspace (retention decision: section 7).
7. An alert on send failures and on 429s.

## 3. DNS records (to be added by the domain owner; **none added**)
Exact values come from the portal after the domain is added. Expect: SPF `TXT` on the sending domain; two DKIM `CNAME`s (selector1/selector2 style); a domain-verification `TXT`; a DMARC `TXT` at `_dmarc.<domain>` (start `p=none` with a reporting mailbox, move to `quarantine` then `reject` after a clean 2 to 4 weeks). DMARC specifics for ACS were not verified in this phase.

## 4. Secrets and settings
| Name | Where | Notes |
|---|---|---|
| `EMAIL_PROVIDER=acs` | App Service setting | |
| `ACS_EMAIL_ENDPOINT` | App Service setting | `https://<resource>.<geo>.communication.azure.com` |
| `ACS_EMAIL_ACCESS_KEY` | Key Vault reference | base64; rotate via primary/secondary keys; disappears if managed identity is adopted |
| `EMAIL_FROM_AUTH` | App Service setting | `DoNotReply@<verified domain>` |
| `MAWICA_DISABLE_EXTERNAL_EMAIL` | App Service setting | the kill switch |
| `MAWICA_ENV`, `MAIL_LOCAL_OUTBOX` | **must be unset** | the local outbox is refused anyway on a remote database |
Run `npm run email:check` with the staging environment first (no network, no email, secrets not printed).

## 5. Staging test plan
1. `email:check` is green; the app boots; sign-in with the kill switch on returns the generic 503 and no mail leaves.
2. Switch the kill switch off for one allow-listed tester address. Request a code: arrives, subject has no code, code works once, expires after 5 min, 3 wrong attempts lock it.
3. Failure drills: wrong key (expect 503 + `http_401` log code), revoked sender, 429 simulated by lowering `EXTERNAL_CAPS`, network blackhole (expect `uncertain`, 503, code row deleted).
4. Confirm the 202-vs-delivered gap: send to a mailbox that bounces and note whether and when the failure becomes visible.
5. Confirm Operation-Id behaviour: send twice with the same id to a test mailbox and record whether two messages arrive (decides whether any later purpose may rely on it).
6. Check logs and Application Insights contain no addresses, codes or keys.
7. Run the E2E suites against the staging build with a test database only.

## 6. Trusted-proxy verification procedure
Sign-in limits and audit rows key on the client IP, so the hop count must be right. On staging only: set `ENABLE_PROXY_DEBUG=1` and `ADMIN_TOKEN`, request `/api/_proxy-debug` with a spoofed `X-Forwarded-For: 1.2.3.4` through the real front end, confirm the IP it reports is the caller's real address and not `1.2.3.4`, and that two clients from different networks get different buckets; set `TRUSTED_PROXY_HOPS` (1 behind App Service, 2 behind Front Door) accordingly; then **remove `ENABLE_PROXY_DEBUG`** (must be unset in production). Details: [security.md](security.md).

## 7. Privacy and retention decisions needing review
- Delivery logs live in your Log Analytics workspace: retention period and whether recipient addresses may appear there (ACS delivery logs include recipients; decide retention or disable that category).
- Hard-bounced addresses are retained temporarily by Microsoft for abuse prevention.
- Content processing location: Australia data location; Event Grid system topics are global (metadata only).
- Sign-in codes are never stored by Mawica except hashed with a 5 minute expiry; the sender's address, subject and body are not logged by Mawica.
- Disclosure: privacy policy must name the email processor and region.
- Audit rows keep a hashed IP only (existing behaviour); confirm retention for `AuditLog`.
- Recipient/sender notification emails need a lawful basis, unsubscribe handling and legal review (Spam Act 2003; Sri Lanka's data-protection rules) before any purpose beyond `auth-code` is enabled.

## 8. Guest-publishing cutover prerequisites (not started)
Email sign-in reliably delivered in staging for at least two weeks with failure rate under 1%; support path for people who do not receive a code; wallet reconciliation clean; payments decision made; privacy policy and terms published; trusted-proxy verified; rollback rehearsed (the `NOT VALID` owner constraint approach in [accounts.md](accounts.md)); product approval. Guests keep publishing today.

## 9. Gaps knowingly left
No delivery-status receiver (Event Grid) and no bounce/suppression list for auth mail: a bounced sign-in address is simply re-requested by the user, capped by the rate limits. Build the receiver (signature/handshake validation, idempotent by message id) before any purpose beyond sign-in, or when bounce volume matters.

## 10. Real-device checklist (before staging sign-off)
iOS Safari and Android Chrome: sign-in form, keyboard type for the code field, paste of the code from the mail app, one-tap return to the browser, Secure cookies after verify, the 503 message, resend cooldown; Gmail, Outlook and Apple Mail rendering of the plain-text mail; spam-folder placement for new and warmed domains; dark mode.

## 11. Deliverability test plan
Seed a list of test mailboxes (Gmail, Outlook.com, iCloud, a corporate Microsoft 365 tenant, a Sri Lankan ISP mailbox) and a mail-tester style scoring service; verify SPF/DKIM/DMARC alignment in raw headers; ramp over 2 to 4 weeks as Microsoft advises; watch bounce, quarantine and spam-folder rates; keep the template plain, no tracking pixels or shortened links.

## 12. Rollback strategy
Instant: set `MAWICA_DISABLE_EXTERNAL_EMAIL=1` (sign-in fails closed with a generic 503; the existing signed-in sessions keep working). Config: `EMAIL_PROVIDER=none`. Code: the change is additive except the `attemptBase` column (nullable-safe default 0, ignorable by older code); reverting the commit restores the previous transport. No data migration needs undoing.
