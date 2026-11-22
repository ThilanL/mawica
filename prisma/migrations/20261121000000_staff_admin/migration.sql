-- Staff RBAC for admin.mawica.com (P0). Consumer app does not use these tables at runtime.

CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MODERATOR', 'SUPPORT', 'FINANCE', 'OPS', 'READONLY');

CREATE TABLE "StaffPrincipal" (
    "id" UUID NOT NULL,
    "entraOid" VARCHAR(64) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "role" "StaffRole" NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffPrincipal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffPrincipal_entraOid_key" ON "StaffPrincipal"("entraOid");
CREATE INDEX "StaffPrincipal_email_idx" ON "StaffPrincipal"("email");
CREATE INDEX "StaffPrincipal_role_disabledAt_idx" ON "StaffPrincipal"("role", "disabledAt");

ALTER TABLE "AuditLog" ADD COLUMN "staffPrincipalId" UUID;
CREATE INDEX "AuditLog_staffPrincipalId_createdAt_idx" ON "AuditLog"("staffPrincipalId", "createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_staffPrincipalId_fkey" FOREIGN KEY ("staffPrincipalId") REFERENCES "StaffPrincipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
