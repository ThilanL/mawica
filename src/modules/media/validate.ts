import { MEDIA_LIMITS } from "./limits";

export class MediaError extends Error {
  constructor(public readonly code: "UNSUPPORTED_TYPE" | "TYPE_MISMATCH" | "TOO_LARGE" | "EMPTY" | "CORRUPT" | "TOO_SMALL" | "TOO_COMPLEX" | "ANIMATED" | "VIDEO_UNAVAILABLE" | "TOO_MANY_PENDING" | "NOT_AVAILABLE" | "NOT_ALLOWED_FOR_TEMPLATE" | "RATE_LIMITED" | "NOT_FOUND", message: string, public readonly status = 400, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

export type SniffedType = "jpeg" | "png" | "webp";
const MIME: Record<SniffedType, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** File type from the first bytes ONLY (the client's filename and header are never trusted). */
export function sniffImage(b: Uint8Array): SniffedType | "video" | "other" {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  // common video containers: refused with a clear message (video is not enabled yet)
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video"; // ISO base media: mp4, mov, 3gp
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video"; // Matroska / WebM
  return "other";
}

/** Validates what the client sent against what the bytes really are. Throws MediaError. Returns the detected type. */
export function validateUpload(declaredContentType: string | null, bytes: Uint8Array): SniffedType {
  if (bytes.length === 0) throw new MediaError("EMPTY", "That file is empty.");
  if (bytes.length > MEDIA_LIMITS.maxUploadBytes) throw new MediaError("TOO_LARGE", "That photo is too large. Choose one under 8 MB.", 413);
  const sniffed = sniffImage(bytes);
  if (sniffed === "video" || /^video\//i.test(declaredContentType ?? "")) throw new MediaError("VIDEO_UNAVAILABLE", "Video isn't available yet. Choose a photo instead.", 415);
  if (sniffed === "other") throw new MediaError("UNSUPPORTED_TYPE", "Use a JPEG, PNG or WebP photo.", 415);
  const declared = (declaredContentType ?? "").split(";")[0].trim().toLowerCase();
  if (declared !== MIME[sniffed]) throw new MediaError("TYPE_MISMATCH", "That file isn't the type it says it is. Choose a JPEG, PNG or WebP photo.", 415);
  return sniffed;
}
