import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { defaultHero, defaultLegalPrivacy } from "@/modules/cms/defaults";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const canRun = Boolean(url?.includes("5433") && url?.includes("mawica_test"));

describe.skipIf(!canRun)("CMS consumer resolution (DB)", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url!, options: "-c timezone=UTC" }),
  });
  const heroKey = "home.hero";
  const legalKey = "legal.privacy";
  let heroDocId = "";
  let legalDocId = "";

  beforeAll(async () => {
    // Clean prior test rows.
    for (const key of [heroKey, legalKey]) {
      await db.cmsDocument.updateMany({ where: { key }, data: { publishedRevisionId: null } }).catch(() => undefined);
      await db.cmsRevision.deleteMany({ where: { document: { key } } }).catch(() => undefined);
      await db.cmsDocument.deleteMany({ where: { key } }).catch(() => undefined);
    }

    const hero = await db.cmsDocument.create({
      data: {
        key: heroKey,
        title: "Homepage hero",
        draftPayload: { ...defaultHero(), eyebrow: "Draft Only Season" } as object,
        draftVersion: 2,
      },
    });
    heroDocId = hero.id;

    const legal = await db.cmsDocument.create({
      data: {
        key: legalKey,
        title: "Privacy Policy",
        draftPayload: defaultLegalPrivacy() as object,
        draftVersion: 1,
      },
    });
    legalDocId = legal.id;
  });

  afterAll(async () => {
    for (const key of [heroKey, legalKey]) {
      await db.cmsDocument.updateMany({ where: { key }, data: { publishedRevisionId: null } }).catch(() => undefined);
      await db.cmsRevision.deleteMany({ where: { document: { key } } }).catch(() => undefined);
      await db.cmsDocument.deleteMany({ where: { key } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it("falls back while only a draft exists (no draft leak)", async () => {
    const { resolveHeroCopy } = await import("@/modules/cms/resolve");
    const hero = await resolveHeroCopy();
    expect(hero.source).toBe("fallback");
    expect(hero.data.eyebrow).toBe(defaultHero().eyebrow);
    expect(hero.data.eyebrow).not.toBe("Draft Only Season");
  });

  it("resolves published hero content after pointer is set", async () => {
    const published = { ...defaultHero(), eyebrow: "Published Season 2026" };
    const rev = await db.cmsRevision.create({
      data: {
        documentId: heroDocId,
        revisionNumber: 1,
        payload: published as object,
        note: "consumer resolve test",
      },
    });
    await db.cmsDocument.update({
      where: { id: heroDocId },
      data: { publishedRevisionId: rev.id, publishedAt: new Date() },
    });

    // Clear module cache so resolve uses live DB (same process).
    const { resolveHeroCopy } = await import("@/modules/cms/resolve");
    const hero = await resolveHeroCopy();
    expect(hero.source).toBe("cms");
    expect(hero.data.eyebrow).toBe("Published Season 2026");
  });

  it("keeps static legal JSX path until a privacy revision is published", async () => {
    const { resolveLegal } = await import("@/modules/cms/resolve");
    const before = await resolveLegal("privacy");
    expect(before.source).toBe("fallback");

    const payload = {
      ...defaultLegalPrivacy(),
      title: "Privacy Policy (CMS)",
      showDraftBanner: false,
      sections: [{ heading: "Published section", paragraphs: ["Published privacy paragraph."] }],
    };
    const rev = await db.cmsRevision.create({
      data: {
        documentId: legalDocId,
        revisionNumber: 1,
        payload: payload as object,
        note: "legal publish",
      },
    });
    await db.cmsDocument.update({
      where: { id: legalDocId },
      data: { publishedRevisionId: rev.id, publishedAt: new Date() },
    });

    const after = await resolveLegal("privacy");
    expect(after.source).toBe("cms");
    expect(after.data.title).toBe("Privacy Policy (CMS)");
    expect(after.data.sections[0]?.heading).toBe("Published section");
  });
});
