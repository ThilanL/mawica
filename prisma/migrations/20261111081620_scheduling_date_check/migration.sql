-- Tighten the local-date shape check: month 01-12 and day 01-31 (the service performs the full calendar validation).
ALTER TABLE "ScheduledDelivery" DROP CONSTRAINT scheduled_delivery_local_date;
ALTER TABLE "ScheduledDelivery" ADD CONSTRAINT scheduled_delivery_local_date
  CHECK ("localDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
