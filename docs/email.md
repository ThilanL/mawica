# Transactional email (Phase 2D.1)

**Status:** built and tested locally. Nothing has been sent to a real mailbox, no Azure resource exists, no DNS was touched. Real delivery is off by default and stays off until staging integration is approved.

## Three purposes, one enabled
| Purpose | Who receives it | Status |
|---|---|---|
| `auth-code` | the person who typed their own address into sign-in | **enabled** |
| `sender-notification` | a card's sender (delivery notices) | hard-disabled in `purposes.ts` (needs product approval) |
| `recipient-greeting` | the recipient of a greeting | hard-disabled; also behind the existing consent gate in `modules/delivery/email` and legal review |

Enabling another purpose is a code change with sign-off, not a runtime flag. `modules/email` and `modules/delivery` do not import each other (tested). Only `src/lib/auth.ts` sends mail.

## Architecture (`src/modules/email/`)
- `types.ts`: provider-independent contract. A transport returns `accepted | rejected(permanent?, code, retryAfter) | uncertain`. Callers see `SendOutcome` (stable codes, no recipient data).
- `config.ts`: pure resolution and validation (`resolveEmailConfig`). Never throws, never falls back silently: a provider that cannot run becomes `none` plus *problems* (names only, never values) and sending fails closed.
- `service.ts`: purpose policy, address/subject sanity (no header injection), global rate caps for external providers (20/min, 80/hour, below ACS's documented 30/min, 100/hour defaults), timeout, redacted structured log line (`purpose, provider, outcome, code, ref, ms` only).
- `transports/local-outbox.ts`: development/test only. Gitignored 0600 file that contains the readable code.
- `transports/acs.ts`: Azure Communication Services Email over REST, HMAC-SHA256 signing, `fetch` injected so tests use mocks only. No SDK dependency.
- `transports/fake.ts`: in-memory, tests only.
- `auth-code.ts`: server-only glue; `send-signal.ts`: carries a send failure from the Better Auth hook to the route.

### Where the local outbox is allowed
`NODE_ENV !== "production"`, **or** a production build with `MAWICA_ENV=local` **and** a loopback `DATABASE_URL` (so the E2E scripts keep working). A production host with a remote database can never use it, even if `MAIL_LOCAL_OUTBOX` or `EMAIL_PROVIDER=local-outbox` is set (tested).

## Authentication integration
1. Route wrapper (unchanged limits): per-email 5/h, per-IP 20/h, global 1000/h, plus Better Auth's 3/min per IP.
2. Better Auth `emailOTP`: 6 digits, 300 s, 3 attempts, hashed at rest (unchanged).
3. Hook sends through the `auth-code` purpose. The code is in the body, **not the subject**.
4. On any failure the stored code row is deleted and the request is flagged. **Better Auth catches errors thrown from this hook and still answers 200**, so a thrown error would have looked like success; the flag (`AsyncLocalStorage`) makes the route return a generic **503** ("We couldn't send a sign-in code right now") with `Retry-After: 60`. The failure depends only on the provider, never on whether the address has an account, so there is no enumeration signal.
5. Accounts are created only when a code is *verified*, so a failed send cannot create or bypass anything.
6. `npm run email:check` validates the environment (no network, secrets not printed; exits 1 when sign-in would fail closed).

## Settings
See `.env.example`. `EMAIL_PROVIDER` (`none|local-outbox|acs`), `ACS_EMAIL_ENDPOINT`, `ACS_EMAIL_ACCESS_KEY`, `EMAIL_FROM_AUTH`, `MAWICA_DISABLE_EXTERNAL_EMAIL=1` (kill switch), `MAIL_LOCAL_OUTBOX`, `MAWICA_ENV=local`. Secrets belong in Key Vault references, never in git or client bundles (tested: no client file references them).

## Provider evaluation: Azure Communication Services Email
### Verified from Microsoft documentation (read 2026-11-11)
| Topic | Finding |
|---|---|
| Send API | `POST {endpoint}/emails:send?api-version=2025-09-01`; body `senderAddress`, `content{subject,plainText,html}`, `recipients.to[]`, optional `headers`, `replyTo`, `attachments`, `userEngagementTrackingDisabled`. 10 MB request cap. |
| Response | `202 Accepted` = queued, **not delivered**. Body `{id,status}`, headers `Operation-Location` and `retry-after`. Errors carry `x-ms-error-code` and an `error{code,message}` body. Operation status: `NotStarted/Running/Succeeded/Failed/Canceled`. |
| Auth | Access key (HMAC-SHA256 over `POST\n{path?query}\n{x-ms-date};{host};{content-sha256}`, headers `x-ms-date`, `host`, `x-ms-content-sha256`) or Microsoft Entra ID / managed identity (Microsoft's recommendation). The adapter uses the key scheme for the evaluation; **managed identity is the production recommendation** (no secret to rotate). |
| Limits | Custom domain: 30 emails/min, 100/hour per subscription; Azure-managed domain: 5/min and 10/hour with no increase. 429 with `Retry-After`. Increases only for verified custom domains (up to 72 h, failure rate < 1%); ramp volume over 2 to 4 weeks. |
| Domains | Custom domain needs SPF and DKIM records (managed domains are preconfigured). |
| Data | Data location is chosen as a geography when the resource is created (Australia available). Message content is processed in that location; delivery logs go to *your* Azure Monitor workspace; hard-bounced addresses are retained temporarily for abuse prevention; Event Grid system topics are global. |
| Delivery reports | Event Grid `Microsoft.Communication.EmailDeliveryReportReceived` on terminal states (Delivered, Failed, FilteredSpam, Quarantined, ...); engagement tracking is optional and off in the adapter. |
| Status | Pages carry a "breaking changes and retirements" notice (https://aka.ms/acs-retirement-and-breaking-changes-guide): **read it before staging**. |

### Requires a real integration test (not verifiable offline)
1. That the service accepts the HMAC request exactly as built (signature, `host` handling, `api-version=2025-09-01`).
2. **Idempotency:** `Operation-Id` is documented as a customer-supplied operation id, but no document states that a repeated id is deduplicated. Treat it as *unconfirmed*. The adapter sends a fresh UUID per call and never retries an uncertain send; for sign-in codes a duplicate is harmless, for any future purpose it is not.
3. Actual error codes for bad sender, unverified domain, suppressed recipient, throttling.
4. Event Grid delivery-report payload schema (the page shows screenshots only) and the validation handshake.
5. Pricing: the public pricing page did not expose per-email rates in this evaluation; use the Azure pricing calculator for Australia East and record the number.
6. DMARC guidance and inbox placement for the real sending domain.
7. Whether the access key REST path or Entra bearer tokens are preferred in the target App Service setup (managed identity needs a token-acquisition step not built here).
8. A 202 does not prove delivery. Asynchronous failures (bounce, quarantine) are invisible until a status poll or Event Grid receiver exists. **Not built**; for OTP the user simply asks again.

### Comparison (decision input, not a recommendation to switch)
| | Azure Communication Services Email | Alternatives (Amazon SES in Sydney, Postmark, SendGrid) |
|---|---|---|
| Fit | Same cloud, managed identity, Event Grid, Australia data location | **Not researched in this phase**; listed so the owner can request an evaluation |
| Risks | Low default quota (30/min), retirement/breaking-change notices, unconfirmed idempotency | unknown here |
Recommendation: proceed with ACS to staging evaluation behind the existing interface; the interface keeps a switch cheap.

## Failure behaviour
| Event | Result |
|---|---|
| no provider / invalid config / kill switch | `unavailable`: 503, code row deleted, config problem logged once as a code |
| ACS 401/403/400/404/409 | permanent rejection: 503, loud log code (credentials or sender setup wrong) |
| ACS 429 | rejected, honours `Retry-After` for the log; user sees the generic 503 |
| ACS 5xx/408 | temporary rejection: 503 |
| timeout / connection loss | `uncertain`: 503 (code row deleted, so even if the mail arrives the code is dead) |
| our own rate caps | `rate_limited`: 503 |
Provider response bodies are discarded (they can echo recipient addresses).

## Tests
`tests/email.test.ts` (config guards, purposes, service, local outbox, ACS signing and classification with mocked fetch, static separation), `tests/auth-email.test.ts` (real route + Better Auth + database: dev outbox, production fail-closed, kill switch, mocked ACS 500 and 202, no enumeration difference, no user/credit side effects, no secrets in logs), updated `tests/auth.test.ts`.
