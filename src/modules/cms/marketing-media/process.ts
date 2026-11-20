import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CMS_MEDIA_LIMITS } from "./limits";
import { marketingMediaRoot, resolveStorageKey } from "./paths";
import { CmsMediaError, type SniffedMarketing } from "./validate";

sharp.cache(false);
sharp.concurrency(1);

export type StoredMarketingFile = {
  storageKey: string;
  thumbStorageKey: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sha256: string;
  contentType: string;
};

async function writeUnderRoot(storageKey: string, data: Buffer): Promise<void> {
  const full = resolveStorageKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { flag: "wx" });
}

/** Persist validated marketing bytes. Images get a sanitized re-encode + thumb; videos stored as sniffed. */
export async function storeMarketingBytes(
  bytes: Buffer,
  sniffed: SniffedMarketing,
): Promise<StoredMarketingFile> {
  const id = randomUUID();
  const dir = id;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (sniffed.kind === "VIDEO") {
    const storageKey = `${dir}/source.${sniffed.ext}`;
    await writeUnderRoot(storageKey, bytes);
    return {
      storageKey,
      thumbStorageKey: null,
      byteSize: bytes.length,
      width: null,
      height: null,
      durationMs: null,
      sha256,
      contentType: sniffed.contentType,
    };
  }

  // IMAGE — re-encode stills (defence in depth). AVIF kept via sharp when possible.
  let width: number;
  let height: number;
  let out: Buffer;
  let contentType: string;
  let ext: string;

  try {
    const pipeline = sharp(bytes, {
      limitInputPixels: CMS_MEDIA_LIMITS.maxInputPixels,
      failOn: "error",
      pages: 1,
    }).rotate();

    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new CmsMediaError("CORRUPT", "Could not read image dimensions.");

    const resized = pipeline.resize({
      width: CMS_MEDIA_LIMITS.maxEdge,
      height: CMS_MEDIA_LIMITS.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (sniffed.format === "png") {
      const buf = await resized.png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true });
      out = buf.data;
      width = buf.info.width;
      height = buf.info.height;
      contentType = "image/png";
      ext = "png";
    } else if (sniffed.format === "avif") {
      const buf = await resized.avif({ quality: 55 }).toBuffer({ resolveWithObject: true });
      out = buf.data;
      width = buf.info.width;
      height = buf.info.height;
      contentType = "image/avif";
      ext = "avif";
    } else {
      const buf = await resized.webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
      out = buf.data;
      width = buf.info.width;
      height = buf.info.height;
      contentType = "image/webp";
      ext = "webp";
    }

    const thumb = await sharp(out)
      .resize({
        width: CMS_MEDIA_LIMITS.thumbEdge,
        height: CMS_MEDIA_LIMITS.thumbEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 70, effort: 4 })
      .toBuffer();

    const storageKey = `${dir}/full.${ext}`;
    const thumbStorageKey = `${dir}/thumb.webp`;
    await writeUnderRoot(storageKey, out);
    await writeUnderRoot(thumbStorageKey, thumb);

    // Ensure root exists for ops visibility
    await mkdir(marketingMediaRoot(), { recursive: true });

    return {
      storageKey,
      thumbStorageKey,
      byteSize: out.length,
      width,
      height,
      durationMs: null,
      sha256: createHash("sha256").update(out).digest("hex"),
      contentType,
    };
  } catch (e) {
    if (e instanceof CmsMediaError) throw e;
    throw new CmsMediaError("CORRUPT", "Could not process that image.", 400);
  }
}
