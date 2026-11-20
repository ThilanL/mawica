import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { defaultCampaignChristmas } from "@mawica/modules/cms";
import {
  getCmsDocument,
  publishCmsDocument,
  saveCmsDraft,
} from "@/modules/staff/cms";
// ensure getCmsDocument import used for post-publish version
import {
  assetReferenceCount,
  getMarketingAsset,
  listMarketingAssets,
  replaceMarketingAsset,
  softDeleteMarketingAsset,
  uploadMarketingAsset,
} from "@/modules/staff/marketing-media";
import { CmsMediaError } from "@mawica/modules/cms/marketing-media/validate";
import { readMarketingAssetFile } from "@mawica/modules/cms/marketing-media/read";
import { StaffAuthzError } from "@/modules/staff/roles";
import { upsertStaffPrincipal } from "@/modules/staff/principals";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433") && url.includes("mawica_test"));

/** Minimal valid 1×1 PNG */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(!canRun)("Marketing media service (P5C)", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });
  let staffId = "";
  let mediaReady = false;
  let assetId = "";
  const campaignKey = "campaign.christmas" as const;
  const salt = process.env.RATE_LIMIT_SALT!;

  beforeAll(async () => {
    try {
      await db.$queryRaw`SELECT 1 FROM "CmsMarketingAsset" LIMIT 1`;
      await db.$queryRaw`SELECT 1 FROM "StaffPrincipal" LIMIT 1`;
      mediaReady = true;
    } catch {
      mediaReady = false;
      return;
    }
    const staff = await upsertStaffPrincipal({
      entraOid: "test-media-owner-oid",
      email: "media.owner@mawica.local",
      displayName: "Media Owner",
      seedRole: "OWNER",
    });
    if (!staff) throw new Error("staff upsert failed");
    staffId = staff.id;
    await db.auditLog.deleteMany({
      where: {
        staffPrincipalId: staffId,
        action: { in: ["cms.media_uploaded", "cms.media_updated", "cms.media_deleted"] },
      },
    });
  });

  afterAll(async () => {
    if (mediaReady && staffId) {
      await db.cmsMarketingAsset.deleteMany({ where: { uploadedByStaffId: staffId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { staffPrincipalId: staffId } }).catch(() => undefined);
      await db.staffPrincipal.deleteMany({ where: { id: staffId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it("requires media tables", () => {
    expect(mediaReady).toBe(true);
  });

  it("enforces cms RBAC on media writes and reads", async () => {
    await expect(listMarketingAssets({ role: "MODERATOR" })).rejects.toBeInstanceOf(StaffAuthzError);
    await expect(
      uploadMarketingAsset({
        role: "OPS",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
        bytes: PNG_1X1,
        declaredContentType: "image/png",
        filename: "x.png",
        title: "Nope",
        altText: "Nope",
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);
  });

  it("rejects mismatched content-type and path-like filenames safely", async () => {
    await expect(
      uploadMarketingAsset({
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
        bytes: PNG_1X1,
        declaredContentType: "image/jpeg",
        filename: "../../etc/passwd.png",
        title: "Bad",
        altText: "Bad",
      }),
    ).rejects.toBeInstanceOf(CmsMediaError);

    await expect(
      uploadMarketingAsset({
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
        bytes: Buffer.from([0x4d, 0x5a]),
        declaredContentType: "image/png",
        filename: "evil.exe",
        title: "Exe",
        altText: "Exe",
      }),
    ).rejects.toBeInstanceOf(CmsMediaError);
  });

  it("uploads, lists, previews, replaces, and soft-deletes", async () => {
    const uploaded = await uploadMarketingAsset({
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      bytes: PNG_1X1,
      declaredContentType: "image/png",
      filename: "hero.png",
      title: "P5C Hero",
      altText: "Hero alt",
    });
    assetId = uploaded.id;
    expect(uploaded.kind).toBe("IMAGE");
    expect(uploaded.url).toBe(`/marketing-media/${assetId}`);
    expect(uploaded.thumbUrl).toBe(`/marketing-media/${assetId}/thumb`);
    expect(uploaded.width).toBeGreaterThan(0);

    const listed = await listMarketingAssets({ role: "OWNER", q: "P5C Hero" });
    expect(listed.some((a) => a.id === assetId)).toBe(true);

    const file = await readMarketingAssetFile(assetId, "full");
    expect(file.byteSize).toBeGreaterThan(0);
    expect(file.contentType).toMatch(/^image\//);

    const thumb = await readMarketingAssetFile(assetId, "thumb");
    expect(thumb.contentType).toBe("image/webp");

    const replaced = await replaceMarketingAsset({
      id: assetId,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      bytes: PNG_1X1,
      declaredContentType: "image/png",
      filename: "hero-v2.png",
    });
    expect(replaced.id).toBe(assetId);
    expect(replaced.originalFilename).toBe("hero-v2.png");

    const audits = await db.auditLog.findMany({
      where: {
        staffPrincipalId: staffId,
        action: { in: ["cms.media_uploaded", "cms.media_updated"] },
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);

    await softDeleteMarketingAsset({
      id: assetId,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    await expect(getMarketingAsset(assetId, "OWNER")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(readMarketingAssetFile(assetId, "full")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const delAudit = await db.auditLog.findFirst({
      where: { staffPrincipalId: staffId, action: "cms.media_deleted" },
    });
    expect(delAudit).toBeTruthy();
  });

  it("blocks soft-delete while CMS payloads reference the asset", async () => {
    const uploaded = await uploadMarketingAsset({
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      bytes: PNG_1X1,
      declaredContentType: "image/png",
      filename: "camp.png",
      title: "Campaign Ref",
      altText: "Campaign Ref",
    });

    const doc = await getCmsDocument(campaignKey, "OWNER");
    const payload = { ...defaultCampaignChristmas(), mediaAssetId: uploaded.id, title: "Referenced Campaign" };
    const saved = await saveCmsDraft({
      key: campaignKey,
      payload,
      expectedDraftVersion: doc.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    expect(await assetReferenceCount(uploaded.id)).toBeGreaterThan(0);

    await expect(
      softDeleteMarketingAsset({
        id: uploaded.id,
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
      }),
    ).rejects.toMatchObject({ code: "IN_USE", status: 409 });

    // Clear reference then delete
    await saveCmsDraft({
      key: campaignKey,
      payload: { ...defaultCampaignChristmas(), mediaAssetId: null },
      expectedDraftVersion: saved.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    await softDeleteMarketingAsset({
      id: uploaded.id,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
  });

  it("publishes campaign and keeps draft unpublished until publish; supports rollback revision", async () => {
    const doc = await getCmsDocument(campaignKey, "OWNER");
    const v1 = {
      ...defaultCampaignChristmas(),
      title: "Published Christmas A",
      startsAt: "2026-11-01T00:00:00+11:00",
      endsAt: "2026-12-26T00:00:00+11:00",
    };
    const saved = await saveCmsDraft({
      key: campaignKey,
      payload: v1,
      expectedDraftVersion: doc.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    const pub1 = await publishCmsDocument({
      key: campaignKey,
      expectedDraftVersion: saved.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      note: "P5C publish A",
    });
    expect(pub1.publishedAt).toBeTruthy();
    expect(pub1.revisions.length).toBeGreaterThanOrEqual(1);

    const afterPub = await getCmsDocument(campaignKey, "OWNER");
    const v2 = { ...v1, title: "Published Christmas B" };
    const saved2 = await saveCmsDraft({
      key: campaignKey,
      payload: v2,
      expectedDraftVersion: afterPub.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    expect(saved2.draftVersion).toBeGreaterThan(afterPub.draftVersion);
    await publishCmsDocument({
      key: campaignKey,
      expectedDraftVersion: saved2.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      note: "P5C publish B",
    });

    // Rollback: re-save A and publish
    const cur = await getCmsDocument(campaignKey, "OWNER");
    const rolledDraft = await saveCmsDraft({
      key: campaignKey,
      payload: v1,
      expectedDraftVersion: cur.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    const rolled = await publishCmsDocument({
      key: campaignKey,
      expectedDraftVersion: rolledDraft.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      note: "P5C rollback to A",
    });
    const row = await db.cmsDocument.findUnique({
      where: { key: campaignKey },
      select: { publishedRevision: { select: { payload: true, note: true } } },
    });
    expect((row?.publishedRevision?.payload as { title: string }).title).toBe("Published Christmas A");
    expect(rolled.revisions[0]?.note).toBe("P5C rollback to A");
    expect(rolled.revisions.some((r) => r.note === "P5C publish A")).toBe(true);

    await expect(
      publishCmsDocument({
        key: campaignKey,
        expectedDraftVersion: rolled.draftVersion,
        role: "OPS",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
      }),
    ).rejects.toBeInstanceOf(StaffAuthzError);
  });
});
