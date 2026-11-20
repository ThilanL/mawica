import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { defaultHero } from "@mawica/modules/cms";
import {
  CmsConflictError,
  CmsValidationError,
  getCmsDocument,
  listCmsDocuments,
  publishCmsDocument,
  saveCmsDraft,
} from "@/modules/staff/cms";
import { StaffAuthzError } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433") && url.includes("mawica_test"));

describe.skipIf(!canRun)("CMS draft/publish service", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });
  let staffId = "";
  let cmsReady = false;
  const key = "home.hero";

  beforeAll(async () => {
    try {
      await db.$queryRaw`SELECT 1 FROM "CmsDocument" LIMIT 1`;
      await db.$queryRaw`SELECT 1 FROM "StaffPrincipal" LIMIT 1`;
      cmsReady = true;
    } catch {
      cmsReady = false;
      return;
    }
    const staff = await upsertStaffPrincipal({
      entraOid: "test-cms-owner-oid",
      email: "cms.owner@mawica.local",
      displayName: "CMS Owner",
      seedRole: "OWNER",
    });
    if (!staff) throw new Error("staff upsert failed");
    staffId = staff.id;
    await db.cmsDocument.updateMany({ where: { key }, data: { publishedRevisionId: null } });
    await db.cmsRevision.deleteMany({ where: { document: { key } } });
    await db.cmsDocument.deleteMany({ where: { key } });
    await db.auditLog.deleteMany({
      where: { staffPrincipalId: staffId, action: { in: ["cms.document_saved", "cms.document_published"] } },
    });
  });

  afterAll(async () => {
    if (cmsReady && staffId) {
      await db.cmsDocument.updateMany({ where: { key }, data: { publishedRevisionId: null } }).catch(() => undefined);
      await db.cmsRevision.deleteMany({ where: { document: { key } } }).catch(() => undefined);
      await db.cmsDocument.deleteMany({ where: { key } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { staffPrincipalId: staffId } }).catch(() => undefined);
      await db.staffPrincipal.deleteMany({ where: { id: staffId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it("rejects unauthorized list", async () => {
    await expect(listCmsDocuments("MODERATOR")).rejects.toBeInstanceOf(StaffAuthzError);
  });

  it("requires cmsReady for DB-backed cases", () => {
    expect(cmsReady).toBe(true);
  });

  it("saves draft with optimistic concurrency and rejects conflicts", async () => {
    const created = await getCmsDocument(key, "OWNER");
    const payload = { ...defaultHero(), eyebrow: "CMS Test Season" };
    const saved = await saveCmsDraft({
      key,
      payload,
      expectedDraftVersion: created.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });
    expect(saved.draftVersion).toBe(created.draftVersion + 1);
    expect((saved.draftPayload as { eyebrow: string }).eyebrow).toBe("CMS Test Season");

    // Draft must not appear as published content.
    const row = await db.cmsDocument.findUnique({
      where: { key },
      select: { publishedRevisionId: true, draftPayload: true },
    });
    expect(row?.publishedRevisionId).toBeNull();
    expect((row?.draftPayload as { eyebrow: string }).eyebrow).toBe("CMS Test Season");

    await expect(
      saveCmsDraft({
        key,
        payload,
        expectedDraftVersion: created.draftVersion,
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(CmsConflictError);

    const audits = await db.auditLog.findMany({
      where: { staffPrincipalId: staffId, action: "cms.document_saved" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(audits.length).toBe(1);
    expect((audits[0]?.meta as { key?: string } | null)?.key).toBe(key);
  });

  it("publishes atomically, preserves history, and blocks non-owners", async () => {
    const doc = await getCmsDocument(key, "OWNER");
    await expect(
      publishCmsDocument({
        key,
        expectedDraftVersion: doc.draftVersion,
        role: "READONLY",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);

    const published = await publishCmsDocument({
      key,
      expectedDraftVersion: doc.draftVersion,
      note: "p5 test publish",
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });
    expect(published.publishedAt).toBeTruthy();
    expect(published.revisions.length).toBeGreaterThanOrEqual(1);
    expect(published.revisions[0]?.note).toBe("p5 test publish");
    expect(published.publishedRevisionId).toBeTruthy();

    const again = await getCmsDocument(key, "OWNER");
    const payload = { ...defaultHero(), eyebrow: "Second draft" };
    const draft2 = await saveCmsDraft({
      key,
      payload,
      expectedDraftVersion: again.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });
    const pub2 = await publishCmsDocument({
      key,
      expectedDraftVersion: draft2.draftVersion,
      note: "second",
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: process.env.RATE_LIMIT_SALT!,
    });
    expect(pub2.revisions.length).toBeGreaterThanOrEqual(2);
    // Previous published revision remains in history.
    expect(pub2.revisions.some((r) => r.note === "p5 test publish")).toBe(true);
    expect(pub2.revisions[0]?.note).toBe("second");

    await expect(
      publishCmsDocument({
        key,
        expectedDraftVersion: 1,
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(CmsConflictError);

    const audits = await db.auditLog.findMany({
      where: { staffPrincipalId: staffId, action: "cms.document_published" },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid draft payloads", async () => {
    const doc = await getCmsDocument(key, "OWNER");
    await expect(
      saveCmsDraft({
        key,
        payload: { ...defaultHero(), eyebrow: "<b>nope</b>" },
        expectedDraftVersion: doc.draftVersion,
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: process.env.RATE_LIMIT_SALT!,
      }),
    ).rejects.toBeInstanceOf(CmsValidationError);
  });
});
