import { describe, expect, it, vi } from "vitest";
import { defaultCampaignChristmas, defaultCampaignNewYear, defaultHomeSections } from "@/modules/cms";

vi.mock("@/lib/db", () => ({
  db: {
    cmsDocument: {
      findUnique: vi.fn(async () => {
        throw new Error('relation "CmsDocument" does not exist');
      }),
    },
  },
}));

describe("Campaign consumer resolution (P5C)", () => {
  it("falls back to default campaigns when CMS tables are missing", async () => {
    const { resolveActiveCampaigns } = await import("@/modules/cms/resolve");
    const now = new Date("2026-11-22T12:00:00+11:00");
    const result = await resolveActiveCampaigns(now); // explicit now — no Date() inside resolve
    expect(result.christmas.source).toBe("fallback");
    expect(result.christmas.data.title).toBe(defaultCampaignChristmas().title);
    expect(result.christmas.active).toBe(true);
    expect(result.newYear.source).toBe("fallback");
    expect(result.newYear.data.title).toBe(defaultCampaignNewYear().title);
    expect(result.newYear.active).toBe(false);
  });

  it("honours published campaign payload and schedule", async () => {
    const { db } = await import("@/lib/db");
    const published = {
      ...defaultCampaignChristmas(),
      title: "Published Noel",
      startsAt: "2026-11-01T00:00:00+11:00",
      endsAt: "2026-12-26T00:00:00+11:00",
      sectionVisible: true,
    };
    vi.mocked(db.cmsDocument.findUnique).mockResolvedValueOnce({
      publishedRevision: { payload: published },
    } as never);
    const { resolveCampaign } = await import("@/modules/cms/resolve");
    const c = await resolveCampaign("christmas");
    expect(c.source).toBe("cms");
    expect(c.data.title).toBe("Published Noel");
  });

  it("keeps homepage gallery free of wedding/birthday sections", () => {
    const sections = defaultHomeSections();
    const blob = JSON.stringify(sections).toLowerCase();
    expect(blob).not.toMatch(/wedding|birthday/);
    expect(sections.galleryChristmasHeading).toBeTruthy();
    expect(sections.galleryNewYearHeading).toBeTruthy();
  });
});
