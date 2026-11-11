-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('LINK', 'EMAIL');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('NONE', 'REQUESTED', 'GRANTED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CardStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "CardStatus" ADD VALUE 'CANCELLED';

-- CreateTable
CREATE TABLE "Recipient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "email" VARCHAR(254),
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "senderAttestedAt" TIMESTAMPTZ(3),
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'NONE',
    "consentUpdatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledDelivery" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "recipientId" UUID,
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'LINK',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "deliverAtUtc" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "localTime" VARCHAR(5) NOT NULL,
    "utcOffsetMinutes" INTEGER NOT NULL,
    "reservationId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),

    CONSTRAINT "ScheduledDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deliveryId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "errorCode" VARCHAR(60),
    "providerRef" VARCHAR(120),

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderPreference" (
    "userId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "leadHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReminderPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Recipient_ownerId_createdAt_idx" ON "Recipient"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_ownerId_email_key" ON "Recipient"("ownerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledDelivery_cardId_key" ON "ScheduledDelivery"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledDelivery_reservationId_key" ON "ScheduledDelivery"("reservationId");

-- CreateIndex
CREATE INDEX "ScheduledDelivery_ownerId_status_deliverAtUtc_idx" ON "ScheduledDelivery"("ownerId", "status", "deliverAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledDelivery_ownerId_idempotencyKey_key" ON "ScheduledDelivery"("ownerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_deliveryId_attemptNo_key" ON "DeliveryAttempt"("deliveryId", "attemptNo");

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT "ScheduledDelivery_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT "ScheduledDelivery_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT "ScheduledDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT "ScheduledDelivery_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ScheduledDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===================== Hand-written guarantees (Prisma cannot express these) =====================
ALTER TABLE "Recipient" ADD CONSTRAINT recipient_name_not_blank CHECK (length(btrim(name)) > 0);
ALTER TABLE "Recipient" ADD CONSTRAINT recipient_email_lowercase CHECK (email IS NULL OR email = lower(email));
ALTER TABLE "Recipient" ADD CONSTRAINT recipient_timezone_present CHECK (length("timeZone") > 0);

ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_local_date CHECK ("localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_local_time CHECK ("localTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_offset CHECK ("utcOffsetMinutes" BETWEEN -840 AND 840);
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_timezone_present CHECK (length("timeZone") > 0);
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_counters CHECK ("attemptCount" >= 0 AND version >= 0);
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_cancel_consistency CHECK ((status = 'CANCELLED') = ("cancelledAt" IS NOT NULL));
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_delivered_consistency CHECK ((status = 'DELIVERED') = ("deliveredAt" IS NOT NULL));
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT delivery_attempt_no_positive CHECK ("attemptNo" >= 1);
ALTER TABLE "ReminderPreference" ADD CONSTRAINT reminder_lead_range CHECK ("leadHours" BETWEEN 1 AND 168);

-- Due-job lookup for the future worker: only rows that are waiting.
CREATE INDEX "ScheduledDelivery_due" ON "ScheduledDelivery"("nextAttemptAt") WHERE status = 'SCHEDULED';

-- Identity of a delivery never changes; status moves only along the delivery state machine; once it is no longer SCHEDULED its
-- time fields are frozen. (SCHEDULED -> PROCESSING | CANCELLED; PROCESSING -> DELIVERED | FAILED | SCHEDULED for a retry.)
CREATE FUNCTION scheduled_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId" <> OLD."ownerId" OR NEW."cardId" <> OLD."cardId" OR NEW."reservationId" <> OLD."reservationId"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."requestHash" <> OLD."requestHash" OR NEW.channel <> OLD.channel THEN
    RAISE EXCEPTION 'scheduled delivery identity fields are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'SCHEDULED'  AND NEW.status IN ('PROCESSING', 'CANCELLED'))
    OR (OLD.status = 'PROCESSING' AND NEW.status IN ('DELIVERED', 'FAILED', 'SCHEDULED'))) THEN
    RAISE EXCEPTION 'illegal schedule transition % -> %', OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'SCHEDULED' AND NEW.status = OLD.status AND
     (NEW."deliverAtUtc" <> OLD."deliverAtUtc" OR NEW."timeZone" <> OLD."timeZone" OR NEW."localDate" <> OLD."localDate"
      OR NEW."localTime" <> OLD."localTime" OR NEW."utcOffsetMinutes" <> OLD."utcOffsetMinutes") THEN
    RAISE EXCEPTION 'a % schedule cannot be changed', OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scheduled_delivery_transition BEFORE UPDATE ON "ScheduledDelivery" FOR EACH ROW EXECUTE FUNCTION scheduled_delivery_guard();
