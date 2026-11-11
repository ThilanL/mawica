-- Additive: retry budget restarts when the sender reschedules (counted from this attempt number).
ALTER TABLE "ScheduledDelivery" ADD COLUMN "attemptBase" INTEGER NOT NULL DEFAULT 0;
