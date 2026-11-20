import { CMS_MEDIA_LIMITS } from "./limits";

export class CmsMediaError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_TYPE"
      | "TYPE_MISMATCH"
      | "TOO_LARGE"
      | "EMPTY"
      | "CORRUPT"
      | "PATH"
      | "NOT_FOUND"
      | "IN_USE"
      | "FORBIDDEN",
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CmsMediaError";
  }
}

export type SniffedMarketing =
  | { kind: "IMAGE"; format: "jpeg" | "png" | "webp" | "avif"; contentType: string; ext: string }
  | { kind: "VIDEO"; format: "mp4" | "webm"; contentType: string; ext: string };

function hasAvifBrand(b: Uint8Array): boolean {
  // ISO BMFF: bytes 4-7 = 'ftyp', brands may include 'avif' / 'avis'
  if (b.length < 12) return false;
  if (!(b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)) return false;
  const head = Buffer.from(b.subarray(0, Math.min(b.length, 64))).toString("ascii");
  return head.includes("avif") || head.includes("avis");
}

function hasMp4Brand(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (!(b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)) return false;
  if (hasAvifBrand(b)) return false;
  return true;
}

/** Detect type from magic bytes only — never trust client Content-Type or filename. */
export function sniffMarketingBytes(b: Uint8Array): SniffedMarketing | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { kind: "IMAGE", format: "jpeg", contentType: "image/jpeg", ext: "jpg" };
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return { kind: "IMAGE", format: "png", contentType: "image/png", ext: "png" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return { kind: "IMAGE", format: "webp", contentType: "image/webp", ext: "webp" };
  }
  if (hasAvifBrand(b)) {
    return { kind: "IMAGE", format: "avif", contentType: "image/avif", ext: "avif" };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { kind: "VIDEO", format: "webm", contentType: "video/webm", ext: "webm" };
  }
  if (hasMp4Brand(b)) {
    return { kind: "VIDEO", format: "mp4", contentType: "video/mp4", ext: "mp4" };
  }
  return null;
}

export function validateMarketingUpload(declaredContentType: string | null, bytes: Uint8Array): SniffedMarketing {
  if (bytes.length === 0) throw new CmsMediaError("EMPTY", "That file is empty.");
  const sniffed = sniffMarketingBytes(bytes);
  if (!sniffed) {
    throw new CmsMediaError(
      "UNSUPPORTED_TYPE",
      "Use JPEG, PNG, WebP, AVIF, MP4 or WebM.",
      415,
    );
  }
  const max = sniffed.kind === "IMAGE" ? CMS_MEDIA_LIMITS.maxImageBytes : CMS_MEDIA_LIMITS.maxVideoBytes;
  if (bytes.length > max) {
    throw new CmsMediaError(
      "TOO_LARGE",
      sniffed.kind === "IMAGE" ? "Image must be under 12 MB." : "Video must be under 40 MB.",
      413,
    );
  }
  const declared = (declaredContentType ?? "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== sniffed.contentType) {
    throw new CmsMediaError("TYPE_MISMATCH", "File contents do not match the declared type.", 415);
  }
  return sniffed;
}

/** Safe display basename — never used as a filesystem path component for storage. */
export function sanitizeOriginalFilename(raw: string | undefined, fallbackExt: string): string {
  const base = (raw ?? "upload").split(/[/\\]/).pop() ?? "upload";
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  if (!cleaned || cleaned === "." || cleaned === "..") return `upload.${fallbackExt}`;
  return cleaned;
}
