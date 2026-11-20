import { describe, expect, it } from "vitest";
import {
  defaultCampaignChristmas,
  defaultHero,
  extractCmsAssetRefs,
  uniqueCmsAssetIds,
} from "@/modules/cms";

describe("CMS asset reference extract (P5D)", () => {
  it("extracts campaign mediaAssetId deterministically", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const hits = extractCmsAssetRefs("campaign.christmas", {
      ...defaultCampaignChristmas(),
      mediaAssetId: id,
    });
    expect(hits).toEqual([{ fieldPath: "mediaAssetId", assetId: id }]);
    expect(uniqueCmsAssetIds("campaign.christmas", { ...defaultCampaignChristmas(), mediaAssetId: id })).toEqual([
      id,
    ]);
  });

  it("ignores UUID substrings in plain text fields", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const hits = extractCmsAssetRefs("campaign.christmas", {
      ...defaultCampaignChristmas(),
      mediaAssetId: null,
      description: `Mentions ${id} in copy only`,
    });
    expect(hits).toEqual([]);
  });

  it("returns no refs for documents without asset fields", () => {
    expect(extractCmsAssetRefs("home.hero", defaultHero())).toEqual([]);
  });

  it("ignores unknown keys", () => {
    expect(extractCmsAssetRefs("nope", { mediaAssetId: "11111111-1111-4111-8111-111111111111" })).toEqual([]);
  });
});
