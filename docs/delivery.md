# LINK delivery engine (Phase 2C.2)

Local only: not deployed, no Azure resources, no DNS changes, **no real email**. The engine publishes due LINK schedules. Email notifications to recipients are designed (interface, consent gate, risks) but disabled and unreachable.

## What "delivered" means for LINK
At the scheduled time the card **becomes available at its link**. Nothing is sent to anyone: the sender must share the link. The UI says so ("Your card will become available at the scheduled time. You will need to share the link with your recipient.") and never claims a notification. The terminal success state is `PUBLISHED` (renamed from `DELIVERED` in this phase for that reason).

## Architecture
| Piece | Where |
|---|---|
| Business logic (claim, atomic publish, retry, recover, shutdown, one cycle, loop) | `src/modules/delivery/queue.ts` |
| Policy (bounded exponential backoff, lease, attempts, concurrency; all clamped) | `src/modules/delivery/config.ts` |
| Error classification / simulated crash (tests) | `src/modules/delivery/errors.ts` |
| Consistency report (cards, reservations, deliveries, ledger) | `src/modules/delivery/reconcile.ts` |
| Host-independent entry point `runDeliveryCycle()` | `src/modules/delivery/index.ts` |
| Local worker process | `npm run delivery:worker -- once \| loop \| reconcile` (`scripts/delivery-worker.mts`) |
| Email abstraction, consent gate, sender-reminder design (inert) | `src/modules/delivery/email/*`, `reminders.ts` |

The queue is PostgreSQL (no Redis, no new service). There is **no HTTP route** that can trigger delivery (a test fails if one appears); the worker is a command-line process, and a future timer trigger calls `runDeliveryCycle()`.

## Lifecycle (database state machine)
`SCHEDULED -> PROCESSING -> PUBLISHED` | `PROCESSING -> SCHEDULED` (retry / lease recovery) | `PROCESSING -> FAILED` (dead letter) | `SCHEDULED -> CANCELLED`. PUBLISHED, FAILED and CANCELLED are terminal. A trigger enforces the transitions, requires a claim to start a new attempt, forbids changing the fencing token while a claim is held and freezes the time fields outside SCHEDULED; CHECK constraints tie `leaseToken/leaseOwner/leaseExpiresAt` to PROCESSING and `publishedAt/failedAt/cancelledAt` to their statuses. A second trigger limits card status to `SCHEDULED -> PUBLISHED|CANCELLED` and `PUBLISHED -> REMOVED`.

## Claim, lease and fencing
`claimDue` is one statement: `FOR UPDATE SKIP LOCKED` selects due LINK rows ordered by due time, stamps `leaseToken` (a fresh fencing token), `leaseOwner`, `leaseExpiresAt`, increments `attemptCount` and inserts a STARTED `DeliveryAttempt`. Two workers cannot get the same row. **Every later write is conditioned on `status = 'PROCESSING' AND leaseToken = <my token>`**: a worker whose lease was recovered gets zero rows and writes nothing (tested, including a late failure handler and a late release). Expired leases are recovered by any worker (`recoverExpired`), which clears the token so the old holder is fenced out for good.

## Atomic publication
One transaction: lock the delivery (fenced) -> verify owner/card/reservation line up -> card still `SCHEDULED` -> reservation `HELD` -> card `PUBLISHED` -> reservation `COMMIT` (wallet engine) -> delivery `PUBLISHED` (+ clear lease) -> attempt `SUCCEEDED` -> audit row. Any failure rolls back **all** of it: the card stays private, credits untouched. The card URL is never returned before this commits. A retry cannot publish or commit twice (the fence, the HELD/SCHEDULED checks and the unique commit make a second pass a no-op).

## Failure handling (reconcile first, then decide)
| Situation | Behaviour |
|---|---|
| Transient database failure (connection lost, deadlock, pool timeout), unknown error | attempt FAILED (retryable), back to `SCHEDULED` at now + bounded backoff (base x factor^(n-1), capped, jittered) until `maxAttempts` |
| Retries exhausted, outcome **certain** (card still SCHEDULED, reservation HELD, relationships intact) | `FAILED` + reservation **released** (wallet rule: restored only inside the original allowance period) + card `CANCELLED` (private) + audit `delivery.failed` |
| Permanent or uncertain state (corrupt owner/card/reservation links, card not SCHEDULED, reservation not HELD) | `FAILED` **without touching credits** + audit `delivery.needs_review` |
| Card already live (e.g. repaired by hand) | idempotent replay: delivery completes, a still-HELD reservation is committed once, nothing is published again |
| Lost connection at COMMIT (outcome unknown to the worker) | the failure handler re-reads state: if the first attempt committed it reports `PUBLISHED_REPLAY` and does nothing else; credits are never released on an uncertain outcome |
| Worker dies | lease expires; `recoverExpired` reconciles (published? certainly not? corrupt?) then retries, fails or flags; attempt marked `ABANDONED` |
| Graceful stop (SIGINT/SIGTERM) | in-flight jobs finish; unstarted claims are handed back and their attempt number is not consumed |
| Cancel / reschedule racing delivery | both lock the same row; the loser sees the new state (cancel of a PROCESSING/PUBLISHED schedule is 409, reschedule likewise); the claim skips locked rows and re-checks state |

## Attempts and audit
`DeliveryAttempt`: delivery, attempt number, start/finish, status (`STARTED/SUCCEEDED/FAILED/ABANDONED`), `errorCategory`, `retryable`, `retryAt`, `workerId`, `leaseToken`. System audit rows (`delivery.published|retry_scheduled|failed|recovered|needs_review`) carry only ids and categories, written in the same transaction as the change. Logs contain counts and ids only (tests assert no card text, names, addresses or tokens).

## Security
No HTTP trigger; command-line only, refuses to run with `NODE_ENV=production` without an explicit flag, and only against the isolated database (the app's database guard). Scheduled links stay 404 until publication; accounts stay isolated; balances cannot go negative and the ledger reconciles after every test group. Fault-injection hooks for the process-level crash tests are inert unless `MAWICA_DELIVERY_TEST_HOOKS=1` outside production.

## Measurements (local laptop, one PostgreSQL on the same machine; NOT production capacity)
- Queue latency, workers already running with a 300 ms poll: p50 76-317 ms, p95 90-331 ms (varies with where the poll lands; bounded by the poll interval).
- 60 due jobs across 3 worker processes (concurrency 4): drained in 0.11-0.35 s from the due instant (about 170-540 jobs/s overall); first-to-last publication span 54-99 ms; work spread 24/20/16.
- Database cost: a claim is **one statement for the whole batch**; a publish is **one transaction of 8 statements** per job (BEGIN/COMMIT excluded). Counted exactly by wrapping the pg driver (`scripts/delivery-querycount.mts`).
- Recovery after a hard worker crash (process exit mid-batch) with a 3 s lease and 0.5 s backoff: all jobs published about 4.0 s after the crash.
These come from a quiet local database with no network latency; do not extrapolate them to production.

## Azure Functions hosting proposal (not created)
1. A **timer-triggered** Function App (Node, TypeScript) with **no HTTP triggers**, calling `runDeliveryCycle()` every minute. Scheduled delivery granularity is then about a minute plus processing; if tighter timing is required, run the same `runLoop` in an App Service WebJob or Container Apps job instead (the logic does not change).
2. Network and identity: VNet integration to reach Azure Database for PostgreSQL over a private endpoint; managed identity + Key Vault references for `DATABASE_URL`; the isolation guard stays on. Keep the pool small (set `DELIVERY_CONCURRENCY` and the connection limit per instance; consider PgBouncer if instances scale out).
3. Safety does not depend on singleton timers: if two instances overlap, `SKIP LOCKED` and fencing keep every job exactly-once at the database level. Keep `leaseMs` (60 s) well above one cycle and the Function timeout above `leaseMs`.
4. Observability: emit `CycleStats` as Application Insights metrics; alert on (a) oldest due-and-unclaimed job age, (b) PROCESSING rows with expired leases, (c) any `delivery.needs_review` audit row, (d) FAILED count, (e) `reconcile` anomalies.
5. Deployment: its own slot and pipeline, `prisma migrate deploy` first; cron in UTC. Needs your approval, a subscription decision, and verification of `TRUSTED_PROXY_HOPS` for the web app. No resources have been created.

## Email notifications to recipients: design only
- **Not enabled**: `EMAIL_DELIVERY_ENABLED` is off by default and `getEmailTransport()` returns nothing even when it is on, because no provider is implemented. The delivery worker has no dependency on the email module; schedules created today are LINK, and the service refuses `EMAIL`. A LINK schedule is never converted to EMAIL.
- **Eligibility gate** (`checkEmailEligibility`): email enabled + transport configured + the schedule is an EMAIL schedule + the recipient has an address + the **sender attested** they may contact them + the **recipient's own consent is GRANTED** + the address is not suppressed. The sender's attestation is never a substitute for consent.
- **Provider (primary candidate): Azure Communication Services Email.** Needs: an Azure Communication Services + Email Communication Service resource, a verified custom sending domain (SPF `TXT`, two DKIM `CNAME`s, DMARC `TXT` starting at `p=none` then tightened), sender usernames, a data-location decision (Australia is the target; confirm against current docs), pricing review and a deliverability test before launch. Not verified yet: provider-side idempotency (none is assumed).
- **Delivery status callbacks** (Event Grid delivery reports): validate the subscription handshake, verify authenticity before parsing, treat events as at-least-once and unordered (idempotent by message id + status), and never act on an unverified event.
- **Bounces and complaints**: a permanent bounce, a complaint or an unsubscribe suppresses the address immediately and permanently for that sender; the eligibility gate reads the suppression list.
- **Unsubscribe**: footer link plus `List-Unsubscribe` and one-click `List-Unsubscribe-Post` headers (RFC 8058); honoured at once, no login required.
- **Timeouts and uncertain sends**: a timeout or connection loss after the request began is **uncertain**, not a failure. It is never resent automatically (`attemptSend` returns `RECONCILE_BEFORE_ANY_RETRY`); only a clean provider rejection may be retried. Record a notification row with a unique (delivery, kind) key *before* calling the provider and store the provider reference after.
- **Retry and duplicate-notification risks**: provider deduplication cannot be assumed (a test shows a blind retry after an uncertain send emails the recipient twice); webhooks repeat; a worker crash between "provider accepted" and "recorded" is the classic duplicate window, which is why uncertain outcomes wait for reconciliation instead of retrying.
- **Legal**: recipient-directed email needs legal review (Australia's Spam Act 2003, Sri Lanka's data-protection rules) and a consent flow (design: `REQUESTED` -> `GRANTED` through a signed confirmation link).

## Sender reminders: design only
Separate from delivery and from recipient email. `planSenderReminder` computes when a reminder to the SENDER would fall (deliver time minus `ReminderPreference.leadHours`, never in the past); nothing is scheduled or sent. Its only job would be to prompt the sender to share the link.

## Running it locally
```bash
DATABASE_URL=<mawica_test url> npm run delivery:worker -- once        # one cycle
DATABASE_URL=<mawica_test url> npm run delivery:worker -- loop --interval 5000
DATABASE_URL=<mawica_test url> npm run delivery:worker -- reconcile   # exit 1 if inconsistent
```

## Tests
`tests/delivery.test.ts` (lifecycle, controlled clock, 60 jobs across 4 in-process workers, two-worker races, crash before/after commit, lease expiry, stale-worker fencing, real lost-connection test via `pg_terminate_backend`, retry exhaustion, permanent states, replay, cancel/reschedule races, state-machine triggers, security), `tests/delivery-email.test.ts` (consent gate, fake provider, uncertain sends, wording), `scripts/delivery-e2e.mts` (real server + real worker process), `scripts/delivery-load.mts` (real worker processes: throughput, hard crashes before/after commit, graceful shutdown), `scripts/delivery-querycount.mts` (exact statements per job), and the scheduling browser journey (`scripts/schedule-shots.mts`).
