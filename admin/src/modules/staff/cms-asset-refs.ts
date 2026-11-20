import "server-only";
import type { Prisma } from "../../../../src/generated/prisma/client";
import { db } from "@/lib/db";
import { extractCmsAssetRefs, isCmsDocumentKey, type CmsDocumentKey } from "@mawica/modules/cms";

function isMissingRefTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /CmsAssetReference|does not exist|P2021/i.test(msg);
}

type Tx = Prisma.TransactionClient | typeof db;

/** Cached probe — must run outside an open transaction (failed queries abort PG txns). */
let assetRefTableAvailable: boolean | null = null;

export async function hasCmsAssetRefTable(): Promise<boolean> {
  if (assetRefTableAvailable != null) return assetRefTableAvailable;
  try {
    await db.$queryRaw`SELECT 1 FROM "CmsAssetReference" LIMIT 0`;
    assetRefTableAvailable = true;
  } catch (e) {
    if (isMissingRefTable(e)) assetRefTableAvailable = false;
    else throw e;
  }
  return assetRefTableAvailable;
}

/** Test helper / after migrate apply in-process. */
export function resetCmsAssetRefTableProbe() {
  assetRefTableAvailable = null;
}

/** Replace all DRAFT-scope refs for a document from its current draft payload. */
export async function syncDraftAssetRefs(
  tx: Tx,
  opts: { documentId: string; documentKey: CmsDocumentKey; payload: unknown },
): Promise<number> {
  if (!(await hasCmsAssetRefTable())) return 0;
  const hits = extractCmsAssetRefs(opts.documentKey, opts.payload);
  await tx.cmsAssetReference.deleteMany({
    where: { documentId: opts.documentId, scope: "DRAFT" },
  });
  if (hits.length === 0) return 0;
  await tx.cmsAssetReference.createMany({
    data: hits.map((h) => ({
      assetId: h.assetId,
      documentId: opts.documentId,
      documentKey: opts.documentKey,
      scope: "DRAFT" as const,
      revisionId: null,
      fieldPath: h.fieldPath,
    })),
    skipDuplicates: true,
  });
  return hits.length;
}

/** Insert REVISION-scope refs for a newly published revision. */
export async function syncRevisionAssetRefs(
  tx: Tx,
  opts: {
    documentId: string;
    documentKey: CmsDocumentKey;
    revisionId: string;
    payload: unknown;
  },
): Promise<number> {
  if (!(await hasCmsAssetRefTable())) return 0;
  const hits = extractCmsAssetRefs(opts.documentKey, opts.payload);
  await tx.cmsAssetReference.deleteMany({
    where: { revisionId: opts.revisionId, scope: "REVISION" },
  });
  if (hits.length === 0) return 0;
  await tx.cmsAssetReference.createMany({
    data: hits.map((h) => ({
      assetId: h.assetId,
      documentId: opts.documentId,
      documentKey: opts.documentKey,
      scope: "REVISION" as const,
      revisionId: opts.revisionId,
      fieldPath: h.fieldPath,
    })),
    skipDuplicates: true,
  });
  return hits.length;
}

/** Field-aware scan (never JSON substring). Always available as integrity fallback. */
export async function scanFieldAwareAssetReferences(assetId: string): Promise<{
  draft: number;
  published: number;
}> {
  const id = assetId.toLowerCase();
  const docs = await db.cmsDocument.findMany({
    select: {
      key: true,
      draftPayload: true,
      revisions: { select: { id: true, payload: true } },
    },
  });
  let draft = 0;
  let published = 0;
  for (const d of docs) {
    if (extractCmsAssetRefs(d.key, d.draftPayload).some((h) => h.assetId === id)) draft += 1;
    for (const r of d.revisions) {
      if (extractCmsAssetRefs(d.key, r.payload).some((h) => h.assetId === id)) {
        published += 1;
      }
    }
  }
  return { draft, published };
}

/**
 * Count references for delete protection.
 * Uses index when present AND always retains field-aware scan — never under-count if index is incomplete.
 */
export async function countIndexedAssetReferences(assetId: string): Promise<{
  count: number;
  source: "index+scan" | "scan";
  published: number;
  draft: number;
  indexDraft: number;
  indexRevision: number;
  scanDraft: number;
  scanPublished: number;
}> {
  const id = assetId.toLowerCase();
  const scan = await scanFieldAwareAssetReferences(id);
  const scanTotal = scan.draft + scan.published;

  if (!(await hasCmsAssetRefTable())) {
    return {
      count: scanTotal,
      source: "scan",
      published: scan.published,
      draft: scan.draft,
      indexDraft: 0,
      indexRevision: 0,
      scanDraft: scan.draft,
      scanPublished: scan.published,
    };
  }

  const [indexDraft, indexRevision] = await Promise.all([
    db.cmsAssetReference.count({ where: { assetId: id, scope: "DRAFT" } }),
    db.cmsAssetReference.count({ where: { assetId: id, scope: "REVISION" } }),
  ]);
  const indexTotal = indexDraft + indexRevision;

  return {
    count: Math.max(indexTotal, scanTotal),
    source: "index+scan",
    published: Math.max(indexRevision, scan.published),
    draft: Math.max(indexDraft, scan.draft),
    indexDraft,
    indexRevision,
    scanDraft: scan.draft,
    scanPublished: scan.published,
  };
}

/**
 * Idempotent historical backfill: rebuild DRAFT + REVISION refs for every CMS document.
 * Safe to re-run (delete-then-insert per scope).
 */
export async function backfillCmsAssetReferences(): Promise<{
  documents: number;
  draftRefs: number;
  revisionRefs: number;
  skippedUnknownKeys: number;
}> {
  resetCmsAssetRefTableProbe();
  if (!(await hasCmsAssetRefTable())) {
    throw new Error("CmsAssetReference table is not available — apply cms_asset_reference migration first.");
  }

  const docs = await db.cmsDocument.findMany({
    select: {
      id: true,
      key: true,
      draftPayload: true,
      revisions: { select: { id: true, payload: true } },
    },
  });

  let draftRefs = 0;
  let revisionRefs = 0;
  let skippedUnknownKeys = 0;

  for (const doc of docs) {
    if (!isCmsDocumentKey(doc.key)) {
      skippedUnknownKeys += 1;
      continue;
    }
    draftRefs += await syncDraftAssetRefs(db, {
      documentId: doc.id,
      documentKey: doc.key,
      payload: doc.draftPayload,
    });
    for (const rev of doc.revisions) {
      revisionRefs += await syncRevisionAssetRefs(db, {
        documentId: doc.id,
        documentKey: doc.key,
        revisionId: rev.id,
        payload: rev.payload,
      });
    }
  }

  return {
    documents: docs.length - skippedUnknownKeys,
    draftRefs,
    revisionRefs,
    skippedUnknownKeys,
  };
}
