import "server-only";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { assertPermission, type StaffRoleName } from "./roles";
import { recordStaffAudit } from "./audit";
import {
  CMS_DOCUMENT_KEYS,
  DOCUMENT_TITLES,
  defaultPayloadFor,
  isCmsDocumentKey,
  parseDocumentPayload,
  type CmsDocumentKey,
} from "@mawica/modules/cms";

export class CmsConflictError extends Error {
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "CmsConflictError";
  }
}

export class CmsValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "CmsValidationError";
  }
}

function isMissingCmsTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /CmsDocument|CmsRevision|does not exist|P2021/i.test(msg);
}

async function ensureDocument(key: CmsDocumentKey) {
  try {
    const existing = await db.cmsDocument.findUnique({ where: { key } });
    if (existing) return existing;
    return await db.cmsDocument.create({
      data: {
        key,
        title: DOCUMENT_TITLES[key],
        draftPayload: defaultPayloadFor(key) as object,
        draftVersion: 1,
      },
    });
  } catch (e) {
    if (isMissingCmsTable(e)) {
      throw new CmsValidationError(
        "CMS tables are not available. Apply the local cms_foundation migration before editing.",
      );
    }
    throw e;
  }
}

export async function listCmsDocuments(role: StaffRoleName) {
  assertPermission(role, "cms:read");
  let rows: Array<{
    id: string;
    key: string;
    title: string;
    draftVersion: number;
    publishedAt: Date | null;
    updatedAt: Date;
    publishedRevision: { revisionNumber: number } | null;
  }> = [];
  try {
    rows = await db.cmsDocument.findMany({
      orderBy: { key: "asc" },
      select: {
        id: true,
        key: true,
        title: true,
        draftVersion: true,
        publishedAt: true,
        updatedAt: true,
        publishedRevision: { select: { revisionNumber: true } },
      },
    });
  } catch (e) {
    if (!isMissingCmsTable(e)) throw e;
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return CMS_DOCUMENT_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      title: row?.title ?? DOCUMENT_TITLES[key],
      draftVersion: row?.draftVersion ?? 0,
      publishedRevisionNumber: row?.publishedRevision?.revisionNumber ?? null,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      seeded: Boolean(row),
    };
  });
}

export async function getCmsDocument(key: string, role: StaffRoleName) {
  assertPermission(role, "cms:read");
  if (!isCmsDocumentKey(key)) throw new CmsValidationError("Unknown document key");
  const doc = await ensureDocument(key);
  const revisions = await db.cmsRevision.findMany({
    where: { documentId: doc.id },
    orderBy: { revisionNumber: "desc" },
    take: 20,
    select: {
      id: true,
      revisionNumber: true,
      note: true,
      publishedAt: true,
      publishedByStaffId: true,
    },
  });
  return {
    key: doc.key,
    title: doc.title,
    draftPayload: doc.draftPayload,
    draftVersion: doc.draftVersion,
    publishedRevisionId: doc.publishedRevisionId,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    revisions,
  };
}

export async function saveCmsDraft(opts: {
  key: string;
  payload: unknown;
  expectedDraftVersion: number;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
  title?: string;
}) {
  assertPermission(opts.role, "cms:write");
  if (!isCmsDocumentKey(opts.key)) throw new CmsValidationError("Unknown document key");
  const key = opts.key;

  let parsed;
  try {
    parsed = parseDocumentPayload(key, opts.payload);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new CmsValidationError(e.issues.map((i) => i.message).join("; "));
    }
    throw e;
  }

  const doc = await ensureDocument(key);
  if (doc.draftVersion !== opts.expectedDraftVersion) {
    throw new CmsConflictError(
      `Draft version conflict: expected ${opts.expectedDraftVersion}, found ${doc.draftVersion}`,
    );
  }

  const updated = await db.cmsDocument.updateMany({
    where: { id: doc.id, draftVersion: opts.expectedDraftVersion },
    data: {
      draftPayload: parsed as object,
      draftVersion: { increment: 1 },
      title: opts.title?.trim() || doc.title,
      updatedByStaffId: opts.staffPrincipalId,
    },
  });
  if (updated.count !== 1) {
    throw new CmsConflictError("Draft was updated by another editor");
  }

  await recordStaffAudit("cms.document_saved", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: true,
    meta: { key, draftVersion: opts.expectedDraftVersion + 1 },
  });

  return getCmsDocument(key, opts.role);
}

export async function publishCmsDocument(opts: {
  key: string;
  expectedDraftVersion: number;
  note?: string;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
}) {
  assertPermission(opts.role, "cms:publish");
  if (!isCmsDocumentKey(opts.key)) throw new CmsValidationError("Unknown document key");
  const key = opts.key;

  const result = await db.$transaction(async (tx) => {
    const doc = await tx.cmsDocument.findUnique({ where: { key } });
    if (!doc) throw new CmsValidationError("Document not found — save a draft first");
    if (doc.draftVersion !== opts.expectedDraftVersion) {
      throw new CmsConflictError(
        `Draft version conflict: expected ${opts.expectedDraftVersion}, found ${doc.draftVersion}`,
      );
    }

    let parsed;
    try {
      parsed = parseDocumentPayload(key, doc.draftPayload);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new CmsValidationError(e.issues.map((i) => i.message).join("; "));
      }
      throw e;
    }

    const last = await tx.cmsRevision.findFirst({
      where: { documentId: doc.id },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    });
    const revisionNumber = (last?.revisionNumber ?? 0) + 1;

    const rev = await tx.cmsRevision.create({
      data: {
        documentId: doc.id,
        revisionNumber,
        payload: parsed as object,
        note: opts.note?.slice(0, 300) || null,
        publishedByStaffId: opts.staffPrincipalId,
      },
    });

    const updated = await tx.cmsDocument.updateMany({
      where: { id: doc.id, draftVersion: opts.expectedDraftVersion },
      data: {
        publishedRevisionId: rev.id,
        publishedAt: new Date(),
        updatedByStaffId: opts.staffPrincipalId,
      },
    });
    if (updated.count !== 1) {
      throw new CmsConflictError("Publish aborted due to concurrent draft change");
    }

    return { revisionNumber: rev.id, number: revisionNumber };
  });

  await recordStaffAudit("cms.document_published", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: false,
    meta: { key, revisionNumber: result.number },
  });

  return getCmsDocument(key, opts.role);
}
