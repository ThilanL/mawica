-- P5D deterministic CMS ↔ marketing-asset reference index (additive).
-- Review before applying. Local/test only until separately approved.
-- Independent of CardMedia. Does not rewrite existing CmsDocument payloads.

CREATE TYPE "CmsAssetRefScope" AS ENUM ('DRAFT', 'REVISION');

CREATE TABLE "CmsAssetReference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "documentKey" VARCHAR(80) NOT NULL,
    "scope" "CmsAssetRefScope" NOT NULL,
    "revisionId" UUID,
    "fieldPath" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsAssetReference_pkey" PRIMARY KEY ("id")
);

-- One draft ref per (document, field, asset); one revision ref per (revision, field, asset).
CREATE UNIQUE INDEX "CmsAssetReference_draft_uniq"
  ON "CmsAssetReference"("documentId", "fieldPath", "assetId")
  WHERE "scope" = 'DRAFT';
CREATE UNIQUE INDEX "CmsAssetReference_revision_uniq"
  ON "CmsAssetReference"("revisionId", "fieldPath", "assetId")
  WHERE "scope" = 'REVISION' AND "revisionId" IS NOT NULL;

CREATE INDEX "CmsAssetReference_assetId_scope_idx" ON "CmsAssetReference"("assetId", "scope");
CREATE INDEX "CmsAssetReference_documentId_scope_idx" ON "CmsAssetReference"("documentId", "scope");
CREATE INDEX "CmsAssetReference_revisionId_idx" ON "CmsAssetReference"("revisionId");
CREATE INDEX "CmsAssetReference_documentId_fieldPath_assetId_idx"
  ON "CmsAssetReference"("documentId", "fieldPath", "assetId");

ALTER TABLE "CmsAssetReference"
  ADD CONSTRAINT "CmsAssetReference_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "CmsDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CmsAssetReference"
  ADD CONSTRAINT "CmsAssetReference_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "CmsRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
