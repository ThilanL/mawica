import "server-only";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { assertPermission, type StaffRoleName } from "./roles";
import { recordStaffAudit } from "./audit";
import { syncDraftAssetRefs, syncRevisionAssetRefs } from "./cms-asset-refs";
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
  readonly issues: Array<{ path: string; message: string }>;
  constructor(message: string, issues: Array<{ path: string; message: string }> = []) {
    super(message);
    this.name = "CmsValidationError";
    this.issues = issues;
  }
}

function zodIssues(e: ZodError): Array<{ path: string; message: string }> {
  return e.issues.map((i) => ({
    path: i.path.length ? i.path.map(String).join(".") : "(root)",
    message: i.message,
  }));
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
    const publishedRevisionNumber = row?.publishedRevision?.revisionNumber ?? null;
    let state: "fallback" | "draft_only" | "published" = "fallback";
    if (row && publishedRevisionNumber != null) state = "published";
    else if (row) state = "draft_only";
    return {
      key,
      title: row?.title ?? DOCUMENT_TITLES[key],
      draftVersion: row?.draftVersion ?? 0,
      publishedRevisionNumber,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      seeded: Boolean(row),
      state,
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
    take: 30,
    select: {
      id: true,
      revisionNumber: true,
      note: true,
      publishedAt: true,
      publishedByStaffId: true,
      publishedByStaff: { select: { displayName: true, email: true } },
    },
  });

  let publishedPayload: unknown | null = null;
  if (doc.publishedRevisionId) {
    const pub = await db.cmsRevision.findUnique({
      where: { id: doc.publishedRevisionId },
      select: { payload: true, revisionNumber: true },
    });
    publishedPayload = pub?.payload ?? null;
  }

  const state: "draft_only" | "published" =
    doc.publishedRevisionId != null ? "published" : "draft_only";

  return {
    key: doc.key,
    title: doc.title,
    draftPayload: doc.draftPayload,
    draftVersion: doc.draftVersion,
    publishedRevisionId: doc.publishedRevisionId,
    publishedPayload,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    state,
    fallbackTitle: DOCUMENT_TITLES[key],
    revisions: revisions.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      note: r.note,
      publishedAt: r.publishedAt,
      publishedByStaffId: r.publishedByStaffId,
      publishedByName: r.publishedByStaff?.displayName ?? null,
      publishedByEmail: r.publishedByStaff?.email ?? null,
    })),
  };
}

export async function getCmsRevision(key: string, revisionId: string, role: StaffRoleName) {
  assertPermission(role, "cms:read");
  if (!isCmsDocumentKey(key)) throw new CmsValidationError("Unknown document key");
  const doc = await ensureDocument(key);
  const rev = await db.cmsRevision.findFirst({
    where: { id: revisionId, documentId: doc.id },
    select: {
      id: true,
      revisionNumber: true,
      note: true,
      payload: true,
      publishedAt: true,
      publishedByStaffId: true,
      publishedByStaff: { select: { displayName: true, email: true } },
    },
  });
  if (!rev) throw new CmsValidationError("Revision not found");
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    note: rev.note,
    payload: rev.payload,
    publishedAt: rev.publishedAt.toISOString(),
    publishedByName: rev.publishedByStaff?.displayName ?? null,
    publishedByEmail: rev.publishedByStaff?.email ?? null,
    isLive: doc.publishedRevisionId === rev.id,
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
      const issues = zodIssues(e);
      throw new CmsValidationError(issues.map((i) => `${i.path}: ${i.message}`).join("; "), issues);
    }
    throw e;
  }

  const doc = await ensureDocument(key);
  if (doc.draftVersion !== opts.expectedDraftVersion) {
    throw new CmsConflictError(
      `Draft version conflict: expected ${opts.expectedDraftVersion}, found ${doc.draftVersion}`,
    );
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.cmsDocument.updateMany({
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
    await syncDraftAssetRefs(tx, { documentId: doc.id, documentKey: key, payload: parsed });
  });

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
        const issues = zodIssues(e);
        throw new CmsValidationError(issues.map((i) => `${i.path}: ${i.message}`).join("; "), issues);
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

    await syncDraftAssetRefs(tx, { documentId: doc.id, documentKey: key, payload: parsed });
    await syncRevisionAssetRefs(tx, {
      documentId: doc.id,
      documentKey: key,
      revisionId: rev.id,
      payload: parsed,
    });

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

/** Copy a historical revision payload into the working draft (new draft version). */
export async function restoreCmsRevision(opts: {
  key: string;
  revisionId: string;
  expectedDraftVersion: number;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
}) {
  assertPermission(opts.role, "cms:write");
  if (!isCmsDocumentKey(opts.key)) throw new CmsValidationError("Unknown document key");
  const key = opts.key;

  const doc = await ensureDocument(key);
  if (doc.draftVersion !== opts.expectedDraftVersion) {
    throw new CmsConflictError(
      `Draft version conflict: expected ${opts.expectedDraftVersion}, found ${doc.draftVersion}`,
    );
  }

  const rev = await db.cmsRevision.findFirst({
    where: { id: opts.revisionId, documentId: doc.id },
    select: { id: true, revisionNumber: true, payload: true },
  });
  if (!rev) throw new CmsValidationError("Revision not found");

  let parsed;
  try {
    parsed = parseDocumentPayload(key, rev.payload);
  } catch (e) {
    if (e instanceof ZodError) {
      const issues = zodIssues(e);
      throw new CmsValidationError(issues.map((i) => `${i.path}: ${i.message}`).join("; "), issues);
    }
    throw e;
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.cmsDocument.updateMany({
      where: { id: doc.id, draftVersion: opts.expectedDraftVersion },
      data: {
        draftPayload: parsed as object,
        draftVersion: { increment: 1 },
        updatedByStaffId: opts.staffPrincipalId,
      },
    });
    if (updated.count !== 1) {
      throw new CmsConflictError("Draft was updated by another editor");
    }
    await syncDraftAssetRefs(tx, { documentId: doc.id, documentKey: key, payload: parsed });
  });

  await recordStaffAudit("cms.document_restored", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: true,
    meta: { key, fromRevision: rev.revisionNumber, draftVersion: opts.expectedDraftVersion + 1 },
  });

  return getCmsDocument(key, opts.role);
}
