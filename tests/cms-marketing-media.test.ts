import { describe, expect, it } from "vitest";
import {
  sanitizeOriginalFilename,
  sniffMarketingBytes,
  validateMarketingUpload,
  CmsMediaError,
} from "@/modules/cms/marketing-media/validate";
import { resolveStorageKey, publicMarketingUrl } from "@/modules/cms/marketing-media/paths";
import { CMS_MEDIA_LIMITS } from "@/modules/cms/marketing-media/limits";
import {
  defaultCampaignChristmas,
  defaultCampaignNewYear,
  isCampaignActiveNow,
  parseDocumentPayload,
} from "@/modules/cms";

function jpegStub(size = 64): Buffer {
  const b = Buffer.alloc(size, 0);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  return b;
}

function pngStub(size = 64): Buffer {
  const b = Buffer.alloc(size, 0);
  b[0] = 0x89;
  b[1] = 0x50;
  b[2] = 0x4e;
  b[3] = 0x47;
  b[4] = 0x0d;
  b[5] = 0x0a;
  b[6] = 0x1a;
  b[7] = 0x0a;
  return b;
}

describe("CMS marketing media validation (P5C)", () => {
  it("sniffs JPEG and PNG from magic bytes", () => {
    expect(sniffMarketingBytes(jpegStub())?.format).toBe("jpeg");
    expect(sniffMarketingBytes(pngStub())?.format).toBe("png");
  });

  it("rejects executables and mismatched Content-Type", () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ
    expect(sniffMarketingBytes(exe)).toBeNull();
    expect(() => validateMarketingUpload("image/jpeg", exe)).toThrow(CmsMediaError);
    expect(() => validateMarketingUpload("image/png", jpegStub())).toThrow(/match/i);
  });

  it("enforces size limits", () => {
    const huge = Buffer.alloc(CMS_MEDIA_LIMITS.maxImageBytes + 1, 0xff);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(() => validateMarketingUpload("image/jpeg", huge)).toThrow(/12 MB/);
  });

  it("sanitizes filenames and blocks path traversal storage keys", () => {
    expect(sanitizeOriginalFilename("../../etc/passwd.jpg", "jpg")).toBe("passwd.jpg");
    expect(sanitizeOriginalFilename("..", "png")).toBe("upload.png");
    expect(() => resolveStorageKey("../etc/passwd")).toThrow(/Invalid storage key/);
    expect(() => resolveStorageKey("not-a-uuid/full.webp")).toThrow(/Invalid storage key/);
  });

  it("builds CDN-ready public URLs separate from CardMedia", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(publicMarketingUrl(id)).toBe(`/marketing-media/${id}`);
    expect(publicMarketingUrl(id, "thumb")).toBe(`/marketing-media/${id}/thumb`);
    expect(publicMarketingUrl(id)).not.toMatch(/card-media|CardMedia/i);
  });

  it("revalidates delivery via ETag after replace (not immutable forever)", async () => {
    const { marketingDeliveryHeaders } = await import("@/modules/cms/marketing-media/headers");
    const file = {
      bytes: Buffer.from("x"),
      contentType: "image/webp",
      byteSize: 1,
      etag: `"abc:full"`,
      updatedAt: "2026-11-22T00:00:00.000Z",
    };
    const miss = marketingDeliveryHeaders(file, new Request("http://localhost/m"));
    expect(miss.status).toBe(200);
    expect(miss.headers.ETag).toBe(`"abc:full"`);
    expect(miss.headers["Cache-Control"]).toMatch(/must-revalidate/);
    expect(miss.headers["Cache-Control"]).not.toMatch(/immutable/);
    const hit = marketingDeliveryHeaders(
      file,
      new Request("http://localhost/m", { headers: { "if-none-match": `"abc:full"` } }),
    );
    expect(hit.status).toBe(304);
  });
});

describe("Campaign scheduling (P5C)", () => {
  it("activates only inside timezone-aware window when visible", () => {
    const c = defaultCampaignChristmas();
    expect(isCampaignActiveNow(c, new Date("2026-11-22T12:00:00+11:00"))).toBe(true);
    expect(isCampaignActiveNow(c, new Date("2026-10-01T12:00:00+11:00"))).toBe(false);
    expect(isCampaignActiveNow({ ...c, sectionVisible: false }, new Date("2026-11-22T12:00:00+11:00"))).toBe(
      false,
    );
  });

  it("parses default christmas and new-year campaign payloads", () => {
    expect(() => parseDocumentPayload("campaign.christmas", defaultCampaignChristmas())).not.toThrow();
    expect(() => parseDocumentPayload("campaign.newyear", defaultCampaignNewYear())).not.toThrow();
  });
});
