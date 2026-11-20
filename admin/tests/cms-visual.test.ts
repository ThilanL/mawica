import { describe, expect, it } from "vitest";
import {
  CMS_DOCUMENT_KEYS,
  defaultCampaignChristmas,
  defaultCampaignNewYear,
  defaultHero,
  defaultPayloadFor,
  documentSchemas,
  extractCmsAssetRefs,
  parseDocumentPayload,
} from "@mawica/modules/cms";

describe("P5D structured validation", () => {
  it("maps campaign schedule errors to field paths", () => {
    const bad = {
      ...defaultCampaignChristmas(),
      endsAt: "2026-10-01T00:00:00+11:00",
      startsAt: "2026-11-01T00:00:00+11:00",
    };
    const result = documentSchemas["campaign.christmas"].safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /endsAt|after/i.test(i.message))).toBe(true);
    }
  });

  it("rejects HTML in hero fields via safeParse", () => {
    const result = documentSchemas["home.hero"].safeParse({
      ...defaultHero(),
      eyebrow: "<script>x</script>",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid structured defaults for every key used by forms", () => {
    for (const key of CMS_DOCUMENT_KEYS) {
      expect(() => parseDocumentPayload(key, defaultPayloadFor(key))).not.toThrow();
    }
  });

  it("asset extract stays field-path based for media picker integrity", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(
      extractCmsAssetRefs("campaign.newyear", { ...defaultCampaignNewYear(), mediaAssetId: id }),
    ).toEqual([{ fieldPath: "mediaAssetId", assetId: id }]);
  });
});
