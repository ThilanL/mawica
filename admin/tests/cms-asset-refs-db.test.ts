import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { defaultCampaignChristmas } from "@mawica/modules/cms";
import {
  backfillCmsAssetReferences,
  countIndexedAssetReferences,
  hasCmsAssetRefTable,
  resetCmsAssetRefTableProbe,
  scanFieldAwareAssetReferences,
} from "@/modules/staff/cms-asset-refs";
import { getCmsDocument, publishCmsDocument, saveCmsDraft } from "@/modules/staff/cms";
import {
  softDeleteMarketingAsset,
  uploadMarketingAsset,
} from "@/modules/staff/marketing-media";
import { upsertStaffPrincipal } from "@/modules/staff/principals";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433") && url.includes("mawica_test"));

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(!canRun)("CmsAssetReference index (P5D DB)", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });
  let staffId = "";
  let ready = false;
  const key = "campaign.christmas" as const;
  const salt = process.env.RATE_LIMIT_SALT!;

  beforeAll(async () => {
    resetCmsAssetRefTableProbe();
    ready = await hasCmsAssetRefTable();
    if (!ready) return;
    const staff = await upsertStaffPrincipal({
      entraOid: "test-asset-ref-oid",
      email: "asset.ref@mawica.local",
      displayName: "Asset Ref Owner",
      seedRole: "OWNER",
    });
    if (!staff) throw new Error("staff upsert failed");
    staffId = staff.id;
  });

  afterAll(async () => {
    if (ready && staffId) {
      await db.cmsMarketingAsset.deleteMany({ where: { uploadedByStaffId: staffId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { staffPrincipalId: staffId } }).catch(() => undefined);
      await db.staffPrincipal.deleteMany({ where: { id: staffId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it("has CmsAssetReference table on mawica_test", () => {
    expect(ready).toBe(true);
  });

  it("syncs on save/publish, backfill is idempotent, and delete protects drafts+revisions", async () => {
    expect(ready).toBe(true);
    const uploaded = await uploadMarketingAsset({
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
      bytes: PNG_1X1,
      declaredContentType: "image/png",
      filename: "ref.png",
      title: "Ref Asset",
      altText: "Ref Asset",
    });

    const doc = await getCmsDocument(key, "OWNER");
    const payload = { ...defaultCampaignChristmas(), mediaAssetId: uploaded.id, title: "Indexed Campaign" };
    const saved = await saveCmsDraft({
      key,
      payload,
      expectedDraftVersion: doc.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });

    const afterSave = await countIndexedAssetReferences(uploaded.id);
    expect(afterSave.source).toBe("index+scan");
    expect(afterSave.draft).toBeGreaterThanOrEqual(1);
    expect(afterSave.indexDraft).toBeGreaterThanOrEqual(1);
    expect(afterSave.scanDraft).toBeGreaterThanOrEqual(1);

    await publishCmsDocument({
      key,
      expectedDraftVersion: saved.draftVersion,
      note: "p5d index publish",
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });

    const afterPub = await countIndexedAssetReferences(uploaded.id);
    expect(afterPub.published).toBeGreaterThanOrEqual(1);
    expect(afterPub.indexRevision).toBeGreaterThanOrEqual(1);

    const first = await backfillCmsAssetReferences();
    const second = await backfillCmsAssetReferences();
    expect(second.documents).toBe(first.documents);
    // Idempotent: re-run does not explode; ref counts stay coherent with scan
    const afterBackfill = await countIndexedAssetReferences(uploaded.id);
    const scan = await scanFieldAwareAssetReferences(uploaded.id);
    expect(afterBackfill.count).toBeGreaterThanOrEqual(scan.draft + scan.published);

    await expect(
      softDeleteMarketingAsset({
        id: uploaded.id,
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
      }),
    ).rejects.toMatchObject({ code: "IN_USE" });

    // Clear draft + publish without media so historical revision still protects
    const cur = await getCmsDocument(key, "OWNER");
    const cleared = await saveCmsDraft({
      key,
      payload: { ...defaultCampaignChristmas(), mediaAssetId: null },
      expectedDraftVersion: cur.draftVersion,
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });
    await publishCmsDocument({
      key,
      expectedDraftVersion: cleared.draftVersion,
      note: "clear media",
      role: "OWNER",
      staffPrincipalId: staffId,
      rateLimitSalt: salt,
    });

    // Historical revision with media still referenced
    const still = await countIndexedAssetReferences(uploaded.id);
    expect(still.published).toBeGreaterThanOrEqual(1);
    await expect(
      softDeleteMarketingAsset({
        id: uploaded.id,
        role: "OWNER",
        staffPrincipalId: staffId,
        rateLimitSalt: salt,
      }),
    ).rejects.toMatchObject({ code: "IN_USE" });
  });
});
