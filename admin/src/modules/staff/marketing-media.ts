import "server-only";
import { unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { storeMarketingBytes } from "@mawica/modules/cms/marketing-media/process";
import { publicMarketingUrl, resolveStorageKey } from "@mawica/modules/cms/marketing-media/paths";
import {
  CmsMediaError,
  sanitizeOriginalFilename,
  validateMarketingUpload,
} from "@mawica/modules/cms/marketing-media/validate";
import { CMS_MEDIA_LIMITS } from "@mawica/modules/cms/marketing-media/limits";
import { recordStaffAudit } from "./audit";
import { countIndexedAssetReferences } from "./cms-asset-refs";
import { assertPermission, type StaffRoleName } from "./roles";

function isMissingTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /CmsMarketingAsset|does not exist|P2021/i.test(msg);
}

export type MarketingAssetDto = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  title: string;
  altText: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalFilename: string;
  createdAt: string;
  url: string;
  thumbUrl: string | null;
};

function toDto(row: {
  id: string;
  kind: "IMAGE" | "VIDEO";
  title: string;
  altText: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalFilename: string;
  createdAt: Date;
  thumbStorageKey: string | null;
}): MarketingAssetDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    altText: row.altText,
    contentType: row.contentType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    originalFilename: row.originalFilename,
    createdAt: row.createdAt.toISOString(),
    url: publicMarketingUrl(row.id, "full"),
    thumbUrl: row.thumbStorageKey ? publicMarketingUrl(row.id, "thumb") : null,
  };
}

export async function listMarketingAssets(opts: {
  role: StaffRoleName;
  q?: string;
  kind?: "IMAGE" | "VIDEO" | "ALL";
  take?: number;
}) {
  assertPermission(opts.role, "cms:read");
  try {
    const kind = opts.kind && opts.kind !== "ALL" ? opts.kind : undefined;
    const q = opts.q?.trim();
    const rows = await db.cmsMarketingAsset.findMany({
      where: {
        deletedAt: null,
        ...(kind ? { kind } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { altText: { contains: q, mode: "insensitive" } },
                { originalFilename: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 60, 100),
    });
    return rows.map(toDto);
  } catch (e) {
    if (isMissingTable(e)) {
      throw new CmsMediaError(
        "NOT_FOUND",
        "Marketing media tables are not available. Apply the cms_marketing_media migration first.",
        503,
      );
    }
    throw e;
  }
}

export async function getMarketingAsset(id: string, role: StaffRoleName) {
  assertPermission(role, "cms:read");
  const row = await db.cmsMarketingAsset.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw new CmsMediaError("NOT_FOUND", "Asset not found.", 404);
  return toDto(row);
}

export async function uploadMarketingAsset(opts: {
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
  bytes: Buffer;
  declaredContentType: string | null;
  filename?: string;
  title: string;
  altText: string;
}) {
  assertPermission(opts.role, "cms:write");
  const title = opts.title.trim().slice(0, CMS_MEDIA_LIMITS.titleMax);
  const altText = opts.altText.trim().slice(0, CMS_MEDIA_LIMITS.altMax);
  if (!title || !altText) throw new CmsMediaError("EMPTY", "Title and alt text are required.");

  const sniffed = validateMarketingUpload(opts.declaredContentType, opts.bytes);
  const stored = await storeMarketingBytes(opts.bytes, sniffed);
  const originalFilename = sanitizeOriginalFilename(opts.filename, sniffed.ext);

  try {
    const row = await db.cmsMarketingAsset.create({
      data: {
        kind: sniffed.kind,
        title,
        altText,
        contentType: stored.contentType,
        storageKey: stored.storageKey,
        thumbStorageKey: stored.thumbStorageKey,
        originalFilename,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        durationMs: stored.durationMs,
        sha256: stored.sha256,
        uploadedByStaffId: opts.staffPrincipalId,
      },
    });

    await recordStaffAudit("cms.media_uploaded", {
      staffPrincipalId: opts.staffPrincipalId,
      rateLimitSalt: opts.rateLimitSalt,
      ip: opts.ip,
      bestEffort: true,
      meta: { assetId: row.id, kind: row.kind, byteSize: row.byteSize },
    });

    return toDto(row);
  } catch (e) {
    // Best-effort cleanup of orphan files
    for (const key of [stored.storageKey, stored.thumbStorageKey]) {
      if (!key) continue;
      try {
        await unlink(resolveStorageKey(key));
      } catch {
        /* ignore */
      }
    }
    if (isMissingTable(e)) {
      throw new CmsMediaError(
        "NOT_FOUND",
        "Marketing media tables are not available. Apply the cms_marketing_media migration first.",
        503,
      );
    }
    throw e;
  }
}

export async function updateMarketingAssetMeta(opts: {
  id: string;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
  title?: string;
  altText?: string;
}) {
  assertPermission(opts.role, "cms:write");
  const data: { title?: string; altText?: string } = {};
  if (opts.title != null) data.title = opts.title.trim().slice(0, CMS_MEDIA_LIMITS.titleMax);
  if (opts.altText != null) data.altText = opts.altText.trim().slice(0, CMS_MEDIA_LIMITS.altMax);
  if (data.title === "" || data.altText === "") throw new CmsMediaError("EMPTY", "Title and alt text cannot be empty.");

  const row = await db.cmsMarketingAsset.updateMany({
    where: { id: opts.id, deletedAt: null },
    data,
  });
  if (row.count !== 1) throw new CmsMediaError("NOT_FOUND", "Asset not found.", 404);

  await recordStaffAudit("cms.media_updated", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: true,
    meta: { assetId: opts.id },
  });

  return getMarketingAsset(opts.id, opts.role);
}

/**
 * Count CMS references to a marketing asset.
 * Uses CmsAssetReference index when migrated; otherwise deterministic field extract (not JSON substring).
 */
export async function assetReferenceCount(assetId: string): Promise<number> {
  const result = await countIndexedAssetReferences(assetId);
  return result.count;
}

export async function assetReferenceDetail(assetId: string) {
  return countIndexedAssetReferences(assetId);
}

/**
 * Replace file bytes in place (same asset id / public URL). Safe for published references.
 * Old files are unlinked after the DB row updates.
 */
export async function replaceMarketingAsset(opts: {
  id: string;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
  bytes: Buffer;
  declaredContentType: string | null;
  filename?: string;
}) {
  assertPermission(opts.role, "cms:write");
  const existing = await db.cmsMarketingAsset.findFirst({ where: { id: opts.id, deletedAt: null } });
  if (!existing) throw new CmsMediaError("NOT_FOUND", "Asset not found.", 404);

  const sniffed = validateMarketingUpload(opts.declaredContentType, opts.bytes);
  if (sniffed.kind !== existing.kind) {
    throw new CmsMediaError("TYPE_MISMATCH", `Replacement must remain a ${existing.kind.toLowerCase()}.`, 415);
  }

  const stored = await storeMarketingBytes(opts.bytes, sniffed);
  const originalFilename = sanitizeOriginalFilename(opts.filename, sniffed.ext);
  const previousKeys = [existing.storageKey, existing.thumbStorageKey].filter(Boolean) as string[];

  try {
    const row = await db.cmsMarketingAsset.update({
      where: { id: opts.id },
      data: {
        contentType: stored.contentType,
        storageKey: stored.storageKey,
        thumbStorageKey: stored.thumbStorageKey,
        originalFilename,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        durationMs: stored.durationMs,
        sha256: stored.sha256,
      },
    });

    for (const key of previousKeys) {
      try {
        await unlink(resolveStorageKey(key));
      } catch {
        /* orphan cleanup best-effort */
      }
    }

    await recordStaffAudit("cms.media_updated", {
      staffPrincipalId: opts.staffPrincipalId,
      rateLimitSalt: opts.rateLimitSalt,
      ip: opts.ip,
      bestEffort: true,
      meta: { assetId: row.id, replaced: true, byteSize: row.byteSize },
    });

    return toDto(row);
  } catch (e) {
    for (const key of [stored.storageKey, stored.thumbStorageKey]) {
      if (!key) continue;
      try {
        await unlink(resolveStorageKey(key));
      } catch {
        /* ignore */
      }
    }
    if (isMissingTable(e)) {
      throw new CmsMediaError(
        "NOT_FOUND",
        "Marketing media tables are not available. Apply the cms_marketing_media migration first.",
        503,
      );
    }
    throw e;
  }
}

export async function softDeleteMarketingAsset(opts: {
  id: string;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
  force?: boolean;
}) {
  assertPermission(opts.role, "cms:write");
  const row = await db.cmsMarketingAsset.findFirst({ where: { id: opts.id, deletedAt: null } });
  if (!row) throw new CmsMediaError("NOT_FOUND", "Asset not found.", 404);

  const detail = await assetReferenceDetail(opts.id);
  if (detail.count > 0 && !opts.force) {
    throw new CmsMediaError(
      "IN_USE",
      `Asset is referenced by ${detail.count} CMS draft/revision payload(s)` +
        ` (${detail.draft} draft, ${detail.published} revision; via ${detail.source}).` +
        ` Remove references or restore without this asset before deleting.`,
      409,
    );
  }
  const refs = detail.count;

  await db.cmsMarketingAsset.update({
    where: { id: opts.id },
    data: { deletedAt: new Date() },
  });

  await recordStaffAudit("cms.media_deleted", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: false,
    meta: { assetId: opts.id, refs },
  });

  return { ok: true as const, id: opts.id, refs };
}
