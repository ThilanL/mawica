-- P5 CMS foundation (additive). Review before applying to any shared environment.
-- Local/test only until separately approved.

CREATE TABLE "CmsDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "draftPayload" JSONB NOT NULL,
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedRevisionId" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByStaffId" UUID,

    CONSTRAINT "CmsDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmsRevision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "note" VARCHAR(300),
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByStaffId" UUID,

    CONSTRAINT "CmsRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CmsDocument_key_key" ON "CmsDocument"("key");
CREATE UNIQUE INDEX "CmsDocument_publishedRevisionId_key" ON "CmsDocument"("publishedRevisionId");
CREATE INDEX "CmsDocument_updatedAt_idx" ON "CmsDocument"("updatedAt");

CREATE UNIQUE INDEX "CmsRevision_documentId_revisionNumber_key" ON "CmsRevision"("documentId", "revisionNumber");
CREATE INDEX "CmsRevision_documentId_publishedAt_idx" ON "CmsRevision"("documentId", "publishedAt");

ALTER TABLE "CmsDocument" ADD CONSTRAINT "CmsDocument_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "CmsRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CmsDocument" ADD CONSTRAINT "CmsDocument_updatedByStaffId_fkey" FOREIGN KEY ("updatedByStaffId") REFERENCES "StaffPrincipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CmsDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_publishedByStaffId_fkey" FOREIGN KEY ("publishedByStaffId") REFERENCES "StaffPrincipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
