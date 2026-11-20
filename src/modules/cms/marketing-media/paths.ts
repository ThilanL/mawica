import path from "node:path";
import { CmsMediaError } from "./validate";

/**
 * Absolute root for CMS marketing bytes. Independent of CardMediaBlob.
 * Override with CMS_MARKETING_MEDIA_DIR (must stay under the repo or an explicit absolute path).
 */
export function marketingMediaRoot(): string {
  const override = process.env.CMS_MARKETING_MEDIA_DIR?.trim();
  if (override) {
    const abs = path.resolve(override);
    assertSafeAbsPath(abs);
    return abs;
  }
  // Repo root: admin and consumer both resolve via cwd or relative climb.
  return path.resolve(process.cwd().endsWith(`${path.sep}admin`) ? ".." : ".", "storage", "cms-marketing");
}

export function assertSafeAbsPath(abs: string): void {
  const normalized = path.normalize(abs);
  if (normalized.includes("\0")) throw new CmsMediaError("PATH", "Invalid storage path.", 400);
}

/** Resolve a storage key under the media root; rejects traversal. */
export function resolveStorageKey(storageKey: string): string {
  if (!/^[a-f0-9-]{36}\/[a-z0-9._-]+$/i.test(storageKey)) {
    throw new CmsMediaError("PATH", "Invalid storage key.", 400);
  }
  const root = marketingMediaRoot();
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new CmsMediaError("PATH", "Path traversal blocked.", 400);
  }
  return full;
}

export function publicMarketingUrl(assetId: string, variant: "full" | "thumb" = "full"): string {
  const base = `/marketing-media/${encodeURIComponent(assetId)}`;
  return variant === "thumb" ? `${base}/thumb` : base;
}
