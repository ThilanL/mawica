import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import type { MarketingFileMeta } from "./headers";
import { resolveStorageKey } from "./paths";
import { CmsMediaError } from "./validate";

export type MarketingFilePayload = MarketingFileMeta;
export { marketingDeliveryHeaders } from "./headers";

export async function readMarketingAssetFile(
  assetId: string,
  variant: "full" | "thumb",
): Promise<MarketingFilePayload> {
  let row;
  try {
    row = await db.cmsMarketingAsset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: {
        contentType: true,
        storageKey: true,
        thumbStorageKey: true,
        byteSize: true,
        sha256: true,
        updatedAt: true,
        kind: true,
      },
    });
  } catch {
    throw new CmsMediaError("NOT_FOUND", "Asset not found.", 404);
  }
  if (!row) throw new CmsMediaError("NOT_FOUND", "Asset not found.", 404);

  if (variant === "thumb") {
    if (!row.thumbStorageKey) throw new CmsMediaError("NOT_FOUND", "Thumbnail not available.", 404);
    const bytes = await readFile(resolveStorageKey(row.thumbStorageKey));
    const thumbHash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    return {
      bytes,
      contentType: "image/webp",
      byteSize: bytes.length,
      etag: `"${row.sha256}:thumb:${thumbHash}"`,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  const bytes = await readFile(resolveStorageKey(row.storageKey));
  return {
    bytes,
    contentType: row.contentType,
    byteSize: row.byteSize,
    etag: `"${row.sha256}:full"`,
    updatedAt: row.updatedAt.toISOString(),
  };
}
