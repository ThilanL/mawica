# Smart card scheduling (Phase 2C.1)

Local only: not deployed. **Foundation only**: nothing is delivered, no email/SMS/WhatsApp is sent, there is no background worker, and no card is published automatically. The six cards, homepage hero/Lumi and guest standard publishing are unchanged.

## What exists
| Area | Where |
|---|---|
| Schema + migrations | `prisma/migrations/*_scheduling`, `*_scheduling_date_check` |
| Time-zone + horizon engine (pure, shared by browser and server) | `src/modules/scheduling/time.ts` |
| Service: create / cancel / reschedule / list / recipients | `src/modules/scheduling/service.ts`, `schema.ts` |
| HTTP guard (Origin, session, rate limit, error mapping) | `src/modules/scheduling/http.ts` |
| API | `POST/GET /api/schedules`, `PATCH/DELETE /api/schedules/[id]`, `GET/POST /api/recipients` |
| UI | "Send now / Schedule for later" in the `/create` preview (`SchedulePanel`, lazy-loaded), `/account/scheduled` (`ScheduledList`) |

## Data model
- **Card.status** gains `SCHEDULED` (created by scheduling, not yet delivered) and `CANCELLED`. Every public path (page via `proxy.ts`, QR, report, `getPublishedCard`) already requires `PUBLISHED`, so scheduled and cancelled cards return 404 to everyone, including the owner. The slug is allocated at scheduling time but never revealed by the API.
- **ScheduledDelivery**: owner, card (unique), recipient (nullable), channel (`LINK` only; `EMAIL` is refused until a provider exists), status (`SCHEDULED, PROCESSING, DELIVERED, CANCELLED, FAILED`), `deliverAtUtc` (timestamptz), `timeZone` (IANA), `localDate` + `localTime` (what the sender chose, as text), `utcOffsetMinutes` (the offset that resolved it), `reservationId` (unique FK to the wallet reservation), `idempotencyKey` + `requestHash` (unique per owner), `nextAttemptAt`, `attemptCount`, `version` (optimistic concurrency). Constraints: shape/range checks on local date/time/offset, cancel/delivered consistency, one delivery per card and per reservation. A trigger freezes identity fields, allows only `SCHEDULED -> PROCESSING|CANCELLED` and `PROCESSING -> DELIVERED|FAILED|SCHEDULED`, and freezes the time fields once a schedule is not `SCHEDULED`. A partial index on `nextAttemptAt WHERE status = 'SCHEDULED'` serves the future worker.
- **Recipient**: name, time zone, optional email, `senderAttestedAt` (what the SENDER says: they may contact this person) and `consentStatus` (the RECIPIENT's own consent, default `NONE`). These are different facts and are never interchangeable; only `GRANTED` may ever enable recipient-directed email. The UI collects only a name and time zone today.
- **DeliveryAttempt** and **ReminderPreference**: schema only. Scheduling events (`schedule.created/rescheduled/cancelled`) are written to the existing `AuditLog` (no content, no addresses).

## Rules
- **Horizon** from the plan's `schedule.months_ahead` entitlement: Free 1, Plus 12 *calendar* months, measured in UTC from the request (day clamped: 31 Jan + 1 month = 28/29 Feb). The earliest time is now + 5 minutes. The server enforces it on create and reschedule; the browser previews it with the same code.
- **Daylight saving, never silent**: a local time that does not exist (spring-forward gap) is refused (422 `NONEXISTENT_LOCAL_TIME`) with the nearest valid time suggested but not applied; a local time that occurs twice (fall-back overlap) is refused (422 `AMBIGUOUS_LOCAL_TIME`) with both UTC offsets until the sender chooses `earlier` or `later`. The stored local date/time keep what the sender intended.
- **Credits** use the existing wallet engine: scheduling reserves 1 total (+1 premium for a premium card) in the same transaction as the card and delivery rows, with the idempotency key and a request fingerprint. The reservation stays `HELD`; a future worker settles it. No credit is spent twice.
- **Cancel** (`SCHEDULED` only; idempotent): `-> CANCELLED`, the card becomes `CANCELLED`, the reservation is released under the wallet rule (restore only while the original grant is valid; after that period nothing is restored or moved). A schedule already in delivery returns 409.
- **Reschedule**: only the time changes; the same reservation is kept (no second deduction); the client must send the schedule's current `version` (409 `STALE_VERSION` otherwise).
- **Authorisation**: all mutations check the browser Origin, the validated session and a per-user rate limit; the user always comes from the session. Every mutation locks the delivery row `FOR UPDATE` filtered by owner, so another account's id is indistinguishable from "not found" (404). A payload cannot set owner, tier, status or plan (strict schemas).
- **Account deletion**: schedules and recipients cascade; held reservations must first be released with `releaseAllHeld` (covered by a test).

## Remaining dependencies for Phase 2C.2 (delivery)
A delivery worker (claim due rows with `SKIP LOCKED`, `PROCESSING`, publish the card, commit the reservation, write `DeliveryAttempt`s, retries/dead-letter, recovery of stuck `PROCESSING`); an email provider and sending domain with SPF/DKIM/DMARC, bounce/complaint handling and unsubscribe; recipient-consent flow before any recipient-directed email; reminder sending (`ReminderPreference`); a hosting decision for the timer/worker on Azure; verification of `TRUSTED_PROXY_HOPS`; legal review of recipient data and retention. Provider restrictions for WhatsApp, Messenger and SMS are unchanged from the Phase 2A audit (automated delivery there is not assumed).

## Tests
`tests/scheduling-time.test.ts` (DST, half-hour zones, calendar months, property tests), `tests/scheduling.test.ts` (service: reservations, rollback, horizon, idempotency, races, cancellation, reschedule, ownership, privacy, DB guarantees), `tests/scheduling-routes.test.ts` (auth, CSRF, validation, DST over HTTP), `scripts/schedule-e2e.mts` (real sessions, 25 simultaneous schedules, cancel/reschedule races), `scripts/schedule-shots.mts` (UI journey, screenshots, widths from 320px).
