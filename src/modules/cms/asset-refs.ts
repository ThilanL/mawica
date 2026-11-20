import type { CmsDocumentKey } from "./schemas";
import { isCmsDocumentKey } from "./schemas";

/**
 * Deterministic marketing-asset references extracted from typed CMS payloads.
 * Field paths are stable JSON Pointer–style segments (dot notation) for indexing.
 * Only known asset UUID fields are considered — never substring matching.
 */
export type CmsAssetRefHit = {
  fieldPath: string;
  assetId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pushAsset(out: CmsAssetRefHit[], fieldPath: string, value: unknown) {
  if (typeof value !== "string" || !UUID_RE.test(value)) return;
  out.push({ fieldPath, assetId: value.toLowerCase() });
}

/** Extract marketing asset UUID refs for a document key + payload. */
export function extractCmsAssetRefs(key: string, payload: unknown): CmsAssetRefHit[] {
  if (!isCmsDocumentKey(key)) return [];
  const out: CmsAssetRefHit[] = [];
  const root = asRecord(payload);
  if (!root) return out;

  switch (key as CmsDocumentKey) {
    case "campaign.christmas":
    case "campaign.newyear":
      pushAsset(out, "mediaAssetId", root.mediaAssetId);
      break;
    // Future hero/section media fields register here only — keep deterministic.
    default:
      break;
  }

  // Deduplicate identical path+id pairs
  const seen = new Set<string>();
  return out.filter((h) => {
    const k = `${h.fieldPath}:${h.assetId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Unique asset ids referenced by a payload. */
export function uniqueCmsAssetIds(key: string, payload: unknown): string[] {
  return [...new Set(extractCmsAssetRefs(key, payload).map((h) => h.assetId))];
}
