# Email provider assessment (Phase 2D.2): ACS Email is being retired

Checked against Microsoft Learn on 2026-11-11. **Nothing was created, called or sent.**

## 1. Headline finding
**Azure Communication Services Email retires on 30 September 2028** (announced 23 September 2026, "Retirement and breaking changes guide for Azure Communication Services", page dated 2026-10-29). The guide says:
- ACS Email is in **maintenance mode**: security and critical fixes only, no new features.
- New ACS Email resources can still be created today, but "this availability is subject to change at any time", and Microsoft recommends migrating off rather than onboarding new solutions.
- Restrictions on retiring services begin with limiting onboarding for customers **without an ACS resource created before 23 October 2026**. Mawica has none, so it is exactly the customer the restriction targets.
- Quota increases continue "case by case". Verified domains keep working until the retirement date.
- Microsoft's suggested destinations: Microsoft 365 High Volume Email (**internal send only**, so unusable for external users), Exchange Online (person-to-person mail, not designed for application bulk), or Marketplace partners (Infobip, Telesign).

**Recommendation: do not build Mawica's staging or production email on ACS Email. Migrate the adapter before staging.** The provider-independent interface from Phase 2D.1 exists for exactly this; the change is one new adapter plus config validation, not a redesign. The existing ACS adapter is **not** replaced or deleted in this phase (kept, tested, marked "do not deploy").

## 2. What is verified, assumed and untested
### Verified in current Microsoft documentation
| Topic | Finding | Source page |
|---|---|---|
| Send API | `POST {endpoint}/emails:send?api-version=2025-09-01` (the current REST version listed; older: 2021-10-01-preview, 2023-01-15-preview, 2023-03-31). `Operation-Id` (optional customer UUID), `x-ms-client-request-id`, `Authorization` required. `202` + `Operation-Location` + `retry-after`; error header `x-ms-error-code`. 10 MB request limit. | REST reference "Email - Send" |
| Signing | HMAC-SHA256, headers `x-ms-date`, `host`, `x-ms-content-sha256`; string to sign `VERB\npath?query\ndate;host;contenthash`; base64 key. Microsoft recommends the Azure SDKs; HMAC is the fallback. | HMAC tutorial |
| Auth | Access key or Microsoft Entra ID (including managed identity) for Email; Microsoft recommends Entra. Roles: the page names none for Email specifically. | Authentication; managed identity how-to |
| Data location | Chosen per resource as a geography (Australia available); delivery logs in your Azure Monitor workspace; hard-bounce addresses retained temporarily. | privacy page (earlier phase) |
| Limits | Custom domain 30/min, 100/h per subscription; managed domain 5/min, 10/h no increase; 429 + Retry-After. | service limits (earlier phase) |
| Domains | Custom domain: verification TXT, SPF TXT `v=spf1 include:spf.protection.outlook.com -all`, DKIM CNAMEs `selector1-azurecomm-prod-net._domainkey` and `selector2-...` pointing at `azurecomm.net`; subdomains supported; 15 to 30 min to propagate. **DMARC is not mentioned** on the pages read. | add-custom-verified-domains |
| Events | Event Grid `EmailDeliveryReportReceived` (statuses Delivered, Suppressed, Bounced, Quarantined, FilteredSpam, Expanded, Failed) with `messageId`, `recipient`, `sender`, `deliveryAttemptTimeStamp`; engagement events optional. **No dedicated complaint/spam-report event is documented**; spam outcomes appear as Quarantined/FilteredSpam. | Event Grid email events |
| Suppression | Managed suppression of hard-bounced addresses: 24 h, then 48 h, 96 h, 7 d, up to 14 d; status `Suppressed`. Asynchronous bounces go to the Return-Path address, not to the API. | sender reputation page |
| Idempotency | **Not documented.** `Operation-Id` identifies the long-running operation; no statement that a repeated id is deduplicated. | REST reference |
| Pricing | Public pricing page did not expose per-email numbers when fetched ("$-"). Unknown. | pricing page |

### Implemented locally on assumptions (Phase 2D.1)
HMAC request construction and signing, the error classification table (401/403/400/404/409 permanent, 429 throttled with Retry-After, 5xx/408 temporary, timeout and network errors uncertain), the 20/min and 80/h caps, treating `202` as "accepted by the provider, not delivered". The signature test checks the documented string-to-sign, but only a real call proves the service accepts it.

### Requires a real staging integration test (only if ACS were kept)
Signature acceptance, real error codes, `Operation-Id` replay behaviour, Event Grid payloads, DMARC alignment, pricing. Given the retirement, **these tests are not worth running**; run the equivalents against the replacement provider.

## 3. Candidates to replace it
| | Amazon SES, Sydney (`ap-southeast-2`) | Third-party API (Postmark, Resend, SendGrid) | Infobip / Telesign via Azure Marketplace |
|---|---|---|---|
| Verified here | Region exists with API and SMTP endpoints. SESv2 `POST /v2/email/outbound-emails` returns `MessageId` (HTTP 200); errors include `TooManyRequestsException` (429), `MessageRejected`, `MailFromDomainNotVerifiedException`, `SendingPausedException`, `AccountSuspendedException`. **No idempotency token** in the request. Bounce/complaint/delivery events via configuration sets to SNS or Firehose; SES also forwards bounces to the Return-Path when no destination is set. Price list: $0.10 per 1,000 emails (à la carte), $0.16 per 1,000 (Essentials) for 0 to 10M a month, $0.12 per GB of attachments; new accounts get up to $200 credits for 6 months. Default quota in the listing: **200 emails per 24 h and 1 per second per region** until production access is granted. | **Not researched in this phase** | Named by Microsoft as migration targets; **not researched** |
| Fit | AU data residency, mature complaint and bounce handling, but a second cloud (AWS account, IAM, SigV4 or the AWS SDK, cross-cloud secrets) | Simplest API, commonly idempotent options differ per vendor | Billing through Azure possible; details unknown |
| Cost drivers | Per-email price tiny at MVP volume; plan fees only on Pro/Enterprise | unknown | unknown |

**Leading option: SES Sydney**, because it is the only candidate whose behaviour this phase could verify from official documentation and it keeps data in Australia. The cross-cloud cost (a second account, key management, an AWS bill) is a **decision for the owner**. If one-cloud simplicity matters more, evaluate a Marketplace or third-party provider with the same checklist before choosing. Either way the interface, purpose policy, rate caps, logging and failure handling from Phase 2D.1 stay.

### Work to migrate (not done; needs your decision)
1. New `SesTransport` (or the chosen vendor) implementing `TransactionalTransport`, with injected `fetch`/client and mocked tests (SigV4 signing needs the AWS SDK or a hand-written signer; the SDK is a new dependency and needs approval).
2. `EMAIL_PROVIDER` value, endpoint/region validation, credentials via IAM role or short-lived keys in Key Vault (no long-lived key in git or the client bundle).
3. Domain: SPF, DKIM (SES issues three CNAMEs), custom MAIL FROM, DMARC; SES production-access request (default quota is far too low for launch).
4. Event receiver (section 4) for bounces and complaints.
5. Keep `AcsEmailTransport` until the new adapter ships, then remove it in a separate reviewed change.

## 4. Observability design (provider-neutral; nothing active)
Implemented now as pure, tested logic: `src/modules/email/events.ts` (`DeliveryEvent`, `applyDeliveryEvent`, `SUPPRESSING`). Not wired to any route or table.

| Concern | Design |
|---|---|
| Message identity | Store `providerRef` (ACS operation id, SES `MessageId`) against the send, never the address. For auth codes there is no row today: the structured log line already carries `providerRef` and outcome; add a short-lived `EmailSend` table only when a receiver exists. |
| Callback authentication | The receiver route must reject everything unauthenticated before parsing: SNS signature verification (SES) or the Event Grid handshake plus a shared secret/AAD token (ACS). Body size cap, fixed content type, constant-time token compare, no logging of payloads. |
| Duplicates | At-least-once delivery. The fold is idempotent (`changed:false` on replay). Persist by unique (`providerRef`, `status`). |
| Out of order | Status rank: accepted < deferred < delivered < failed < suppressed < bounced < complained. A weaker late event never overwrites a stronger one; an asynchronous bounce after `delivered` correctly wins. Tested over every permutation. |
| Bounce / complaint | `bounced`, `complained`, `suppressed` add the address (as a keyed hash, like the welcome tombstone) to a suppression list consulted before any send. For **auth codes** a bounce suppresses nothing the user asked for; policy: suppress after a permanent bounce for 30 days, and show the same generic message (no enumeration). |
| Metrics (no personal data) | counts by outcome, provider code, latency from request to `accepted` (we have `ms` in the log) and, once events exist, request-to-`delivered`; OTP acceptance rate, 429 and `rate_limited` counts, kill-switch state. Alert: failure rate above 5% over 15 minutes, any `http_401/403` (credentials), `rate_limited` above 1% of requests. |
| Privacy | Logs and metrics carry codes, ids and durations only. Event payloads contain recipient addresses: parse, fold, then discard; never log them; never store the raw payload. |
| Recipient email | Stays off. The receiver must not be able to enable anything: it only updates delivery state and suppression. |
