import "server-only";
import { db } from "@/lib/db";
import { recordStaffAudit } from "./audit";
import { assertPermission, type StaffRoleName } from "./roles";

export type ReportQueueFilters = {
  reason?: "INAPPROPRIATE" | "HARASSMENT" | "SPAM" | "OTHER";
  cardStatus?: "PUBLISHED" | "REMOVED" | "SCHEDULED" | "CANCELLED";
  /** Case-insensitive slug contains */
  q?: string;
  page?: number;
  pageSize?: number;
};

/** Public-safe card fields for admin — no message body, no recipient/sender names. */
export type AdminCardSummary = {
  id: string;
  slug: string;
  status: string;
  templateKey: string;
  tier: string;
  createdAt: string;
  removedAt: string | null;
  removedReason: string | null;
  reportCount: number;
};

export type AdminReportRow = {
  id: string;
  reason: string;
  /** Truncated details only (max 80 chars); may be null. */
  detailsPreview: string | null;
  createdAt: string;
  card: AdminCardSummary;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export async function listReports(filters: ReportQueueFilters = {}): Promise<{
  rows: AdminReportRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = {
    ...(filters.reason ? { reason: filters.reason } : {}),
    card: {
      ...(filters.cardStatus ? { status: filters.cardStatus } : {}),
      ...(filters.q?.trim()
        ? { slug: { contains: filters.q.trim().toLowerCase(), mode: "insensitive" as const } }
        : {}),
    },
  };

  const [total, reports] = await Promise.all([
    db.report.count({ where }),
    db.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        card: {
          select: {
            id: true,
            slug: true,
            status: true,
            templateKey: true,
            tier: true,
            createdAt: true,
            removedAt: true,
            removedReason: true,
            _count: { select: { reports: true } },
          },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      detailsPreview: r.details ? r.details.slice(0, 80) : null,
      createdAt: r.createdAt.toISOString(),
      card: {
        id: r.card.id,
        slug: r.card.slug,
        status: r.card.status,
        templateKey: r.card.templateKey,
        tier: r.card.tier,
        createdAt: r.card.createdAt.toISOString(),
        removedAt: r.card.removedAt?.toISOString() ?? null,
        removedReason: r.card.removedReason,
        reportCount: r.card._count.reports,
      },
    })),
  };
}

export async function getReportDetail(reportId: string): Promise<AdminReportRow | null> {
  const r = await db.report.findUnique({
    where: { id: reportId },
    include: {
      card: {
        select: {
          id: true,
          slug: true,
          status: true,
          templateKey: true,
          tier: true,
          createdAt: true,
          removedAt: true,
          removedReason: true,
          _count: { select: { reports: true } },
        },
      },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    reason: r.reason,
    detailsPreview: r.details ? r.details.slice(0, 80) : null,
    createdAt: r.createdAt.toISOString(),
    card: {
      id: r.card.id,
      slug: r.card.slug,
      status: r.card.status,
      templateKey: r.card.templateKey,
      tier: r.card.tier,
      createdAt: r.card.createdAt.toISOString(),
      removedAt: r.card.removedAt?.toISOString() ?? null,
      removedReason: r.card.removedReason,
      reportCount: r.card._count.reports,
    },
  };
}

/**
 * Soft-remove a published card — same semantics as `npm run admin -- remove`.
 */
export async function softRemoveCard(opts: {
  slug: string;
  reason: string;
  role: StaffRoleName;
  staffPrincipalId: string;
  rateLimitSalt: string;
  ip?: string | null;
}): Promise<{ ok: true; slug: string } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }> {
  assertPermission(opts.role, "cards:remove");
  const reason = opts.reason.trim().slice(0, 200) || "admin";
  const result = await db.card.updateMany({
    where: { slug: opts.slug, status: "PUBLISHED" },
    data: { status: "REMOVED", removedAt: new Date(), removedReason: reason },
  });
  if (!result.count) return { ok: false, code: "NOT_FOUND" };

  await recordStaffAudit("moderation.card_removed", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: false,
    meta: { slug: opts.slug, reason },
  });
  return { ok: true, slug: opts.slug };
}

/**
 * Note: Postgres trigger `card_status_guard` treats REMOVED as terminal
 * (PUBLISHED → REMOVED only). Restore is intentionally not offered in P1 —
 * same as the break-glass CLI.
 */

export async function listModerationAudit(opts: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const where = {
    action: { in: ["moderation.card_removed"] as string[] },
  };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        meta: true,
        createdAt: true,
        staffPrincipal: { select: { id: true, displayName: true, role: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id.toString(),
      action: r.action,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
      staff: r.staffPrincipal
        ? { id: r.staffPrincipal.id, displayName: r.staffPrincipal.displayName, role: r.staffPrincipal.role }
        : null,
    })),
  };
}
