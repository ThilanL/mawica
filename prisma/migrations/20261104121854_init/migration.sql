-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('PUBLISHED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('INAPPROPRIATE', 'HARASSMENT', 'SPAM', 'OTHER');

-- CreateTable
CREATE TABLE "Card" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(16) NOT NULL,
    "templateKey" VARCHAR(40) NOT NULL,
    "recipientName" VARCHAR(40) NOT NULL,
    "senderName" VARCHAR(40) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedReason" VARCHAR(200),

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(300),
    "reporterHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" VARCHAR(80) NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_slug_key" ON "Card"("slug");

-- CreateIndex
CREATE INDEX "Card_status_createdAt_idx" ON "Card"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_cardId_idx" ON "Report"("cardId");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
