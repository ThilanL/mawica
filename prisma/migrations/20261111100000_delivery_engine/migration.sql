-- Phase 2C.2: LINK delivery engine.
-- Hand-written (Prisma would recreate the enum): a rename of the terminal status, lease + fencing columns, attempt telemetry, and
-- rewritten state-machine triggers. No data is dropped; no row can exist in the renamed state yet (nothing could deliver before this phase).

-- The terminal success state is PUBLISHED: for LINK cards the card goes live at its link; nothing is sent to the recipient.
ALTER TYPE "ScheduleStatus" RENAME VALUE 'DELIVERED' TO 'PUBLISHED';
ALTER TYPE "AttemptStatus" ADD VALUE 'ABANDONED';
ALTER TABLE "ScheduledDelivery" RENAME COLUMN "deliveredAt" TO "publishedAt";

ALTER TABLE "ScheduledDelivery"
  ADD COLUMN "failedAt" TIMESTAMPTZ(3),
  ADD COLUMN "leaseToken" UUID,
  ADD COLUMN "leaseOwner" VARCHAR(80),
  ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastErrorCategory" VARCHAR(40);

ALTER TABLE "DeliveryAttempt"
  ADD COLUMN "workerId" VARCHAR(80),
  ADD COLUMN "leaseToken" UUID,
  ADD COLUMN "errorCategory" VARCHAR(40),
  ADD COLUMN "retryable" BOOLEAN,
  ADD COLUMN "retryAt" TIMESTAMPTZ(3);

-- Status columns must agree with the status; the lease exists exactly while PROCESSING.
ALTER TABLE "ScheduledDelivery" DROP CONSTRAINT scheduled_delivery_delivered_consistency;
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_published_consistency CHECK ((status = 'PUBLISHED') = ("publishedAt" IS NOT NULL));
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_failed_consistency CHECK ((status = 'FAILED') = ("failedAt" IS NOT NULL));
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_lease_consistency CHECK (
     (status = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  OR (status <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL));

-- Finding abandoned leases.
CREATE INDEX "ScheduledDelivery_lease_expiry" ON "ScheduledDelivery"("leaseExpiresAt") WHERE status = 'PROCESSING';

-- State machine (replaces the 2C.1 function). Identity never changes. Legal moves only:
--   SCHEDULED -> PROCESSING (claim: must stamp a NEW attempt number) | CANCELLED
--   PROCESSING -> PUBLISHED | FAILED | SCHEDULED (retry or lease recovery)
-- PUBLISHED, FAILED and CANCELLED are terminal. While PROCESSING the fencing token cannot change (only a claim sets it), and the time fields are
-- frozen whenever the schedule is not SCHEDULED.
CREATE OR REPLACE FUNCTION scheduled_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId" <> OLD."ownerId" OR NEW."cardId" <> OLD."cardId" OR NEW."reservationId" <> OLD."reservationId"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."requestHash" <> OLD."requestHash" OR NEW.channel <> OLD.channel THEN
    RAISE EXCEPTION 'scheduled delivery identity fields are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'SCHEDULED'  AND NEW.status IN ('PROCESSING', 'CANCELLED'))
    OR (OLD.status = 'PROCESSING' AND NEW.status IN ('PUBLISHED', 'FAILED', 'SCHEDULED'))) THEN
    RAISE EXCEPTION 'illegal schedule transition % -> %', OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'SCHEDULED' AND NEW.status = 'PROCESSING' AND NEW."attemptCount" <= OLD."attemptCount" THEN
    RAISE EXCEPTION 'a claim must start a new attempt' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'PROCESSING' AND NEW.status = 'PROCESSING' AND NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken" THEN
    RAISE EXCEPTION 'the fencing token cannot change while a claim is held' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'SCHEDULED' AND NEW.status = OLD.status AND
     (NEW."deliverAtUtc" <> OLD."deliverAtUtc" OR NEW."timeZone" <> OLD."timeZone" OR NEW."localDate" <> OLD."localDate"
      OR NEW."localTime" <> OLD."localTime" OR NEW."utcOffsetMinutes" <> OLD."utcOffsetMinutes") THEN
    RAISE EXCEPTION 'a % schedule cannot be changed', OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

-- Card status moves only along the lifecycle: a scheduled card goes live or is cancelled; a live card can be removed (moderation).
-- Nothing ever returns to SCHEDULED, and REMOVED / CANCELLED are terminal. (Inserts are unrestricted.)
CREATE FUNCTION card_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'SCHEDULED' AND NEW.status IN ('PUBLISHED', 'CANCELLED'))
    OR (OLD.status = 'PUBLISHED' AND NEW.status = 'REMOVED')) THEN
    RAISE EXCEPTION 'illegal card transition % -> %', OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER card_status_transition BEFORE UPDATE OF status ON "Card" FOR EACH ROW EXECUTE FUNCTION card_status_guard();
