-- CreateEnum
CREATE TYPE "CardTier" AS ENUM ('STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "EntitlementPeriod" AS ENUM ('NONE', 'MONTH', 'SUBSCRIPTION_YEAR', 'LIFETIME', 'EVENT');

-- CreateEnum
CREATE TYPE "GrantUnit" AS ENUM ('TOTAL', 'PREMIUM');

-- CreateEnum
CREATE TYPE "GrantSource" AS ENUM ('WELCOME', 'PLAN_PERIOD', 'PURCHASE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('GRANT', 'RESERVE', 'COMMIT', 'RELEASE', 'EXPIRE', 'REFUND', 'ADJUST');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "tier" "CardTier" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "Plan" (
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "purchasable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "planKey" VARCHAR(40) NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "value" INTEGER,
    "period" "EntitlementPeriod" NOT NULL,

    CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("planKey","key")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "planKey" VARCHAR(40) NOT NULL DEFAULT 'free',
    "periodAnchor" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "unit" "GrantUnit" NOT NULL,
    "source" "GrantSource" NOT NULL,
    "grantKey" VARCHAR(100) NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "premium" BOOLEAN NOT NULL,
    "cardId" UUID,
    "deliverAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" BIGSERIAL NOT NULL,
    "accountId" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "reservationId" UUID,
    "kind" "LedgerKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeGrantTombstone" (
    "emailHash" VARCHAR(64) NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeGrantTombstone_pkey" PRIMARY KEY ("emailHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_userId_key" ON "CreditAccount"("userId");

-- CreateIndex
CREATE INDEX "CreditGrant_accountId_unit_validTo_idx" ON "CreditGrant"("accountId", "unit", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "CreditGrant_accountId_grantKey_key" ON "CreditGrant"("accountId", "grantKey");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReservation_cardId_key" ON "CreditReservation"("cardId");

-- CreateIndex
CREATE INDEX "CreditReservation_accountId_createdAt_idx" ON "CreditReservation"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReservation_accountId_idempotencyKey_key" ON "CreditReservation"("accountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_grantId_idx" ON "LedgerEntry"("grantId");

-- CreateIndex
CREATE INDEX "LedgerEntry_reservationId_idx" ON "LedgerEntry"("reservationId");

-- AddForeignKey
ALTER TABLE "PlanEntitlement" ADD CONSTRAINT "PlanEntitlement_planKey_fkey" FOREIGN KEY ("planKey") REFERENCES "Plan"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_planKey_fkey" FOREIGN KEY ("planKey") REFERENCES "Plan"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CreditGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== Hand-written guarantees (Prisma cannot express these) =====================
-- Proven in the isolated spike (docs/wallet.md).

-- Balances can never go negative or exceed what was granted; windows are sane.
ALTER TABLE "CreditGrant" ADD CONSTRAINT credit_grant_remaining_range CHECK (amount > 0 AND remaining >= 0 AND remaining <= amount);
ALTER TABLE "CreditGrant" ADD CONSTRAINT credit_grant_window CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "PlanEntitlement" ADD CONSTRAINT plan_entitlement_value_nonneg CHECK (value IS NULL OR value >= 0);

-- Ledger delta sign must match the entry kind. Per grant, remaining = SUM(delta) (see the reconciliation query in the app).
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_delta_by_kind CHECK (
     (kind IN ('GRANT','REFUND') AND delta > 0)
  OR (kind IN ('RESERVE','EXPIRE') AND delta < 0)
  OR (kind = 'RELEASE' AND delta >= 0)   -- 0 when the original grant had already expired: nothing is restored
  OR (kind = 'COMMIT' AND delta = 0)
  OR  kind = 'ADJUST');

-- A reservation is HELD exactly until it has a settlement time.
ALTER TABLE "CreditReservation" ADD CONSTRAINT credit_reservation_settled_consistency CHECK ((status = 'HELD') = ("settledAt" IS NULL));

-- Append-only ledger. A retention purge must opt in explicitly inside its own transaction:
--   BEGIN; SET LOCAL mawica.ledger_purge = 'on'; DELETE ...; COMMIT;
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('mawica.ledger_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'LedgerEntry is append-only (% blocked)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER ledger_no_mutation BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON "LedgerEntry" FOR EACH STATEMENT EXECUTE FUNCTION ledger_append_only();

-- Reservation lifecycle: HELD -> COMMITTED | RELEASED only; identity fields are frozen; a card id, once set, is final.
CREATE FUNCTION credit_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'HELD' THEN
    RAISE EXCEPTION 'reservation % is already %', OLD.id, OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."accountId" <> OLD."accountId" OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."requestHash" <> OLD."requestHash" OR NEW.premium <> OLD.premium THEN
    RAISE EXCEPTION 'reservation identity fields are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."cardId" IS NOT NULL AND NEW."cardId" IS DISTINCT FROM OLD."cardId" THEN
    RAISE EXCEPTION 'reservation card is immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credit_reservation_transition BEFORE UPDATE ON "CreditReservation" FOR EACH ROW EXECUTE FUNCTION credit_reservation_guard();

-- Lazy expiry sweep.
CREATE INDEX "CreditGrant_expiry_sweep" ON "CreditGrant"("validTo") WHERE remaining > 0 AND "validTo" IS NOT NULL;

-- ===================== Seed: plans are data =====================
INSERT INTO "Plan" (key, name, active, purchasable, "sortOrder") VALUES
  ('free', 'Free', true, false, 0),
  ('plus', 'Plus', true, false, 10)   -- not purchasable until the payments phase
ON CONFLICT (key) DO NOTHING;

INSERT INTO "PlanEntitlement" ("planKey", key, value, period) VALUES
  ('free', 'sends.total',          10, 'MONTH'),
  ('free', 'welcome.premium',       1, 'LIFETIME'),
  ('free', 'schedule.months_ahead', 1, 'NONE'),
  ('plus', 'sends.total',          50, 'MONTH'),
  ('plus', 'sends.premium',         5, 'MONTH'),
  ('plus', 'schedule.months_ahead', 12, 'NONE')
ON CONFLICT ("planKey", key) DO NOTHING;
