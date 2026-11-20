import { describe, expect, it, vi } from "vitest";
import {
  defaultHero,
  defaultHomeSections,
  defaultNav,
  escapeText,
  parseDocumentPayload,
} from "@/modules/cms";

vi.mock("@/lib/db", () => ({
  db: {
    cmsDocument: {
      findUnique: vi.fn(async () => {
        throw new Error('relation "CmsDocument" does not exist');
      }),
    },
  },
}));

describe("CMS consumer resolution", () => {
  it("falls back when CMS tables are missing", async () => {
    const { resolveHeroCopy, resolveNav } = await import("@/modules/cms/resolve");
    const hero = await resolveHeroCopy();
    const nav = await resolveNav();
    expect(hero.source).toBe("fallback");
    expect(hero.data.eyebrow).toBe(defaultHero().eyebrow);
    expect(nav.source).toBe("fallback");
    expect(nav.data.links[0]?.href).toBe(defaultNav().links[0]?.href);
  });

  it("uses published payload when valid", async () => {
    const { db } = await import("@/lib/db");
    const published = { ...defaultHero(), eyebrow: "Published Season" };
    vi.mocked(db.cmsDocument.findUnique).mockResolvedValueOnce({
      publishedRevision: { payload: published },
    } as never);
    const { resolveHeroCopy } = await import("@/modules/cms/resolve");
    // Re-import is cached; call resolve again after mock change via same module.
    const hero = await resolveHeroCopy();
    expect(hero.source).toBe("cms");
    expect(hero.data.eyebrow).toBe("Published Season");
  });

  it("ignores draft-only documents (no published revision)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.cmsDocument.findUnique).mockResolvedValueOnce({
      publishedRevision: null,
    } as never);
    const { resolveHeroCopy } = await import("@/modules/cms/resolve");
    const hero = await resolveHeroCopy();
    expect(hero.source).toBe("fallback");
  });

  it("falls back when published payload fails schema validation", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.cmsDocument.findUnique).mockResolvedValueOnce({
      publishedRevision: { payload: { eyebrow: "<script>" } },
    } as never);
    const { resolveHeroCopy } = await import("@/modules/cms/resolve");
    const hero = await resolveHeroCopy();
    expect(hero.source).toBe("fallback");
  });
});

describe("CMS homepage defaults match live architecture", () => {
  it("includes Christmas and New Year section headings only", () => {
    const sections = defaultHomeSections();
    expect(sections.galleryChristmasHeading).toMatch(/Christmas/i);
    expect(sections.galleryNewYearHeading).toMatch(/New Year/i);
    expect(JSON.stringify(sections)).not.toMatch(/wedding|birthday/i);
  });

  it("keeps SEO escaping available for metadata consumers", () => {
    const dirty = 'Title with <tag> & "quotes"';
    expect(escapeText(dirty)).not.toContain("<");
    expect(() => parseDocumentPayload("seo.site", {
      titleDefault: dirty.replace(/[<>]/g, ""),
      description: "Safe description text for Mawica SEO.",
      ogTitle: "Safe OG",
      ogDescription: "Safe OG description text for Mawica.",
      twitterTitle: "Safe Twitter",
      twitterDescription: "Safe Twitter description text.",
    })).not.toThrow();
  });
});
