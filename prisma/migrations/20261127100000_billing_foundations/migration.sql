-- Stripe Phase 2 foundations (release gate E1). Additive only: no existing table, column, constraint, trigger or row is changed.
-- The wallet ledger (CreditGrant / LedgerEntry and its append-only triggers) is untouched.

-- CreateEnum
CREATE TYPE "StripeCustomerRefType" AS ENUM ('CUSTOMER', 'ACCOUNT_V2');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "BillingEntitlementState" AS ENUM ('PENDING', 'ACTIVE', 'GRACE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "BillingOrderKind" AS ENUM ('PREMIUM_PASS', 'EVENT_PASS');

-- CreateEnum
CREATE TYPE "BillingOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "StripeEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "userId" UUID,
    "stripeCustomerRef" VARCHAR(255) NOT NULL,
    "refType" "StripeCustomerRefType" NOT NULL DEFAULT 'CUSTOMER',
    "livemode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "stripeSubscriptionId" VARCHAR(255) NOT NULL,
    "stripePriceId" VARCHAR(255) NOT NULL,
    "catalogueCode" VARCHAR(40) NOT NULL,
    "planKey" VARCHAR(40) NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "stripeStatus" VARCHAR(32) NOT NULL,
    "entitlementState" "BillingEntitlementState" NOT NULL DEFAULT 'PENDING',
    "billingAnchor" TIMESTAMPTZ(3),
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "paidThrough" TIMESTAMPTZ(3),
    "graceEndsAt" TIMESTAMPTZ(3),
    "graceInvoiceId" VARCHAR(255),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ(3),
    "pendingPlanKey" VARCHAR(40),
    "pendingEffectiveAt" TIMESTAMPTZ(3),
    "lastStripeEventAt" TIMESTAMPTZ(3),
    "lastStripeEventId" VARCHAR(255),
    "livemode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "customerId" UUID,
    "kind" "BillingOrderKind" NOT NULL,
    "catalogueCode" VARCHAR(40) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amountTotal" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'aud',
    "status" "BillingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "stripeCheckoutSessionId" VARCHAR(255),
    "stripePaymentIntentId" VARCHAR(255),
    "intentRef" VARCHAR(64),
    "intentExpiresAt" TIMESTAMPTZ(3),
    "fulfilledAt" TIMESTAMPTZ(3),
    "lastStripeEventAt" TIMESTAMPTZ(3),
    "livemode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "orderId" UUID,
    "subscriptionId" UUID,
    "stripeChargeId" VARCHAR(255) NOT NULL,
    "stripePaymentIntentId" VARCHAR(255),
    "stripeInvoiceId" VARCHAR(255),
    "amount" INTEGER NOT NULL,
    "amountRefunded" INTEGER NOT NULL DEFAULT 0,
    "fee" INTEGER,
    "net" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'aud',
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMPTZ(3),
    "livemode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "apiVersion" VARCHAR(40),
    "stripeCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "objectId" VARCHAR(255),
    "objectType" VARCHAR(60),
    "status" "StripeEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "outcome" VARCHAR(40),
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_stripeCustomerRef_key" ON "BillingCustomer"("stripeCustomerRef");

-- CreateIndex
CREATE INDEX "BillingCustomer_userId_idx" ON "BillingCustomer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_accountId_livemode_key" ON "BillingCustomer"("accountId", "livemode");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_stripeSubscriptionId_key" ON "BillingSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "BillingSubscription_accountId_entitlementState_idx" ON "BillingSubscription"("accountId", "entitlementState");

-- CreateIndex
CREATE INDEX "BillingSubscription_customerId_idx" ON "BillingSubscription"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_stripeCheckoutSessionId_key" ON "BillingOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_stripePaymentIntentId_key" ON "BillingOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "BillingOrder_accountId_createdAt_idx" ON "BillingOrder"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_accountId_idempotencyKey_key" ON "BillingOrder"("accountId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_stripeChargeId_key" ON "BillingPayment"("stripeChargeId");

-- CreateIndex
CREATE INDEX "BillingPayment_accountId_createdAt_idx" ON "BillingPayment"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPayment_stripeInvoiceId_idx" ON "BillingPayment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "StripeEvent_status_receivedAt_idx" ON "StripeEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "StripeEvent_objectId_stripeCreatedAt_idx" ON "StripeEvent"("objectId", "stripeCreatedAt");

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BillingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===================== Hand-written guarantees (Prisma cannot express these) =====================

-- E1 is sandbox-only. Live-mode Stripe data cannot be stored until a reviewed migration lifts these at release gate E4.
ALTER TABLE "BillingCustomer"     ADD CONSTRAINT billing_customer_e1_sandbox_only     CHECK (livemode = false);
ALTER TABLE "BillingSubscription" ADD CONSTRAINT billing_subscription_e1_sandbox_only CHECK (livemode = false);
ALTER TABLE "BillingOrder"        ADD CONSTRAINT billing_order_e1_sandbox_only        CHECK (livemode = false);
ALTER TABLE "BillingPayment"      ADD CONSTRAINT billing_payment_e1_sandbox_only      CHECK (livemode = false);
ALTER TABLE "StripeEvent"         ADD CONSTRAINT stripe_event_e1_sandbox_only         CHECK (livemode = false);

-- AUD only (approved currency); amounts are non-negative integer cents; refunds never exceed the payment.
ALTER TABLE "BillingOrder"   ADD CONSTRAINT billing_order_currency_aud   CHECK (currency = 'aud');
ALTER TABLE "BillingPayment" ADD CONSTRAINT billing_payment_currency_aud CHECK (currency = 'aud');
ALTER TABLE "BillingOrder"   ADD CONSTRAINT billing_order_amount_nonneg  CHECK ("amountTotal" >= 0);
ALTER TABLE "BillingOrder"   ADD CONSTRAINT billing_order_quantity_range CHECK (quantity BETWEEN 1 AND 10);
ALTER TABLE "BillingPayment" ADD CONSTRAINT billing_payment_amounts      CHECK (amount >= 0 AND "amountRefunded" >= 0 AND "amountRefunded" <= amount);

-- Stripe object references keep their type prefix, so a wrong id can never be stored in the wrong column.
ALTER TABLE "BillingCustomer"     ADD CONSTRAINT billing_customer_ref_prefix CHECK (("refType" = 'CUSTOMER' AND "stripeCustomerRef" LIKE 'cus\_%') OR ("refType" = 'ACCOUNT_V2' AND "stripeCustomerRef" LIKE 'acct\_%'));
ALTER TABLE "BillingSubscription" ADD CONSTRAINT billing_subscription_id_prefix CHECK ("stripeSubscriptionId" LIKE 'sub\_%');
ALTER TABLE "BillingPayment"      ADD CONSTRAINT billing_payment_charge_prefix  CHECK ("stripeChargeId" LIKE 'ch\_%' OR "stripeChargeId" LIKE 'py\_%');
ALTER TABLE "StripeEvent"         ADD CONSTRAINT stripe_event_id_prefix        CHECK (id LIKE 'evt\_%');
ALTER TABLE "StripeEvent"         ADD CONSTRAINT stripe_event_attempts_pos     CHECK (attempts >= 1);
-- A processed or ignored event always records when; a claimed event never does.
ALTER TABLE "StripeEvent"         ADD CONSTRAINT stripe_event_processed_consistency CHECK ((status IN ('PROCESSED','IGNORED')) = ("processedAt" IS NOT NULL));
