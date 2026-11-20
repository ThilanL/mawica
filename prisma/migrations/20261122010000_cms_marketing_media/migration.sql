-- P5C marketing media library (additive). Review before applying to any shared environment.
-- Local/test only until separately approved. Independent of CardMedia / CardMediaBlob.

CREATE TYPE "CmsMarketingKind" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "CmsMarketingAsset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "CmsMarketingKind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "altText" VARCHAR(300) NOT NULL,
    "contentType" VARCHAR(80) NOT NULL,
    "storageKey" VARCHAR(200) NOT NULL,
    "thumbStorageKey" VARCHAR(200),
    "originalFilename" VARCHAR(200) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadedByStaffId" UUID,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CmsMarketingAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CmsMarketingAsset_storageKey_key" ON "CmsMarketingAsset"("storageKey");
CREATE UNIQUE INDEX "CmsMarketingAsset_thumbStorageKey_key" ON "CmsMarketingAsset"("thumbStorageKey");
CREATE INDEX "CmsMarketingAsset_kind_createdAt_idx" ON "CmsMarketingAsset"("kind", "createdAt");
CREATE INDEX "CmsMarketingAsset_deletedAt_createdAt_idx" ON "CmsMarketingAsset"("deletedAt", "createdAt");
CREATE INDEX "CmsMarketingAsset_title_idx" ON "CmsMarketingAsset"("title");

ALTER TABLE "CmsMarketingAsset" ADD CONSTRAINT "CmsMarketingAsset_uploadedByStaffId_fkey" FOREIGN KEY ("uploadedByStaffId") REFERENCES "StaffPrincipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
