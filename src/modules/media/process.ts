import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { MEDIA_LIMITS } from "./limits";
import { MediaError } from "./validate";

export type ProcessedImage = { data: Buffer; width: number; height: number; contentType: "image/webp"; sha256: string };

/**
 * Safe re-encode. The upload is DECODED and a brand-new WebP is produced, so nothing from the original file survives: no EXIF (GPS, camera, dates),
 * no ICC oddities, no appended or polyglot payload, no animation, no embedded scripts. Orientation is applied first so the picture is upright
 * without metadata. Input pixels are bounded (decompression-bomb guard) and a single libvips thread is used so one upload cannot starve the server.
 */
sharp.cache(false);
sharp.concurrency(1);

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MEDIA_LIMITS.maxInputPixels, failOn: "error", pages: -1 }).metadata(); // pages: -1 counts every frame, so an animated file cannot hide behind its first frame
  } catch {
    throw new MediaError("CORRUPT", "We couldn't read that photo. Try a different one.");
  }
  if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format ?? "")) throw new MediaError("UNSUPPORTED_TYPE", "Use a JPEG, PNG or WebP photo.", 415);
  if ((meta.pages ?? 1) > 1) throw new MediaError("ANIMATED", "Animated images aren't supported. Choose a still photo.");
  if (Math.min(meta.width, meta.height) < MEDIA_LIMITS.minEdge) throw new MediaError("TOO_SMALL", "That photo is too small.");

  for (const edge of [MEDIA_LIMITS.maxEdge, 1024, 800, 640]) {
    for (const quality of [82, 74, 66, 58, 50, 42, 34]) {
      let out: { data: Buffer; info: OutputInfo };
      try {
        out = await sharp(input, { limitInputPixels: MEDIA_LIMITS.maxInputPixels, failOn: "error" })
          .rotate() // apply EXIF orientation, then drop the tag with everything else
          .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
          .toColorspace("srgb")
          .webp({ quality, effort: 4 }) // sharp keeps no metadata unless asked
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw new MediaError("CORRUPT", "We couldn't read that photo. Try a different one.");
      }
      if (out.data.length <= MEDIA_LIMITS.targetBytes) return finish(out.data, out.info);
      if (edge === 640 && quality === 34 && out.data.length <= MEDIA_LIMITS.hardMaxBytes) return finish(out.data, out.info);
    }
  }
  throw new MediaError("TOO_COMPLEX", "That photo is too detailed to shrink. Try a different one.");
}

async function finish(data: Buffer, info: OutputInfo): Promise<ProcessedImage> {
  // Defence in depth: the output must be a single still WebP with no metadata blocks.
  const m = await sharp(data).metadata();
  if (m.format !== "webp" || (m.pages ?? 1) > 1 || m.exif || m.icc || m.xmp || m.iptc) throw new MediaError("CORRUPT", "We couldn't prepare that photo.");
  return { data, width: info.width, height: info.height, contentType: "image/webp", sha256: createHash("sha256").update(data).digest("hex") };
}
