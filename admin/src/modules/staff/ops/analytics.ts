import "server-only";
import { db } from "@/lib/db";
import { assertPermission, hasPermission, type StaffRoleName } from "../roles";
import { recordStaffAudit } from "../audit";
import { occasionForTemplateKey } from "./template-meta";
import { enumerateUtcDays, type OpsDateRange } from "./dates";

export type SeriesPoint = { day: string; count: number };
export type NamedCount = { key: string; count: number };

export type OpsDashboard = {
  range: { preset: string; from: string; toExclusive: string; label: string };
  customers: {
    measured: true;
    registrations: number;
    verifiedRegistrations: number;
    series: SeriesPoint[];
  };
  cards: {
    measured: true;
    created: number;
    byTier: NamedCount[];
    byStatus: NamedCount[];
    byOccasion: NamedCount[];
    byTemplate: NamedCount[];
    series: SeriesPoint[];
  };
  deliveries: {
    measured: true;
    createdInRange: number;
    failedInRange: number;
    publishedInRange: number;
    byStatusCurrent: NamedCount[];
    failuresByCategory: NamedCount[];
    dueNow: number;
    expiredLeases: number;
    seriesFailed: SeriesPoint[];
  };
  moderation: {
    measured: boolean;
    reason?: string;
    reportsInRange?: number;
    openOnPublished?: number;
    removalsInRange?: number;
    byReason?: NamedCount[];
    series?: SeriesPoint[];
  };
  wallet: {
    measured: boolean;
    reason?: string;
    /** Ledger activity only — not revenue. */
    ledgerByKind?: NamedCount[];
    grantsBySource?: NamedCount[];
    premiumCommits?: number;
    seriesLedger?: SeriesPoint[];
  };
  media: {
    measured: true;
    objectsTotal: number;
    bytesTotal: number;
    unattachedObjects: number;
    createdInRange: number;
    bytesCreatedInRange: number;
    seriesObjects: SeriesPoint[];
  };
  health: {
    queueByStatus: NamedCount[];
    dueNow: number;
    expiredLeases: number;
    recentDeliveryFailures: number;
    appHttpHealth: { measured: false; reason: string } | { measured: true; status: string };
    workerHeartbeat: { measured: false; reason: string };
  };
};

type DayCountRow = { day: Date; count: bigint | number };
type KeyCountRow = { key: string; count: bigint | number };

function n(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

function fillSeries(days: string[], rows: DayCountRow[]): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    map.set(day, n(r.count));
  }
  return days.map((day) => ({ day, count: map.get(day) ?? 0 }));
}

function named(rows: KeyCountRow[]): NamedCount[] {
  return rows.map((r) => ({ key: r.key || "(none)", count: n(r.count) })).sort((a, b) => b.count - a.count);
}

export async function loadOpsDashboard(
  range: OpsDateRange,
  opts: {
    role: StaffRoleName;
    staffPrincipalId: string;
    rateLimitSalt: string;
    ip?: string | null;
  },
): Promise<OpsDashboard> {
  assertPermission(opts.role, "ops:read");

  const { from, toExclusive } = range;
  const days = enumerateUtcDays(from, toExclusive);
  const includeModeration = hasPermission(opts.role, "reports:read");
  const includeWallet = hasPermission(opts.role, "wallet:read");

  const [
    customerSeries,
    customerTotals,
    cardSeries,
    cardByTier,
    cardByStatus,
    cardByTemplate,
    deliveryCreated,
    deliveryFailed,
    deliveryPublished,
    deliveryStatus,
    failureCats,
    dueNowRows,
    expiredLeaseRows,
    failedSeries,
    reportSeries,
    reportByReason,
    openReports,
    removalCount,
    ledgerByKind,
    grantBySource,
    premiumCommits,
    ledgerSeries,
    mediaTotals,
    mediaInRange,
    mediaSeries,
  ] = await Promise.all([
    db.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
      FROM "user"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ total: bigint; verified: bigint }[]>`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE "emailVerified")::bigint AS verified
      FROM "user"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}`,
    db.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
      FROM "Card"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<KeyCountRow[]>`
      SELECT tier::text AS key, count(*)::bigint AS count
      FROM "Card"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`,
    db.$queryRaw<KeyCountRow[]>`
      SELECT status::text AS key, count(*)::bigint AS count
      FROM "Card"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`,
    db.$queryRaw<KeyCountRow[]>`
      SELECT "templateKey" AS key, count(*)::bigint AS count
      FROM "Card"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "ScheduledDelivery"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}`,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "ScheduledDelivery"
      WHERE "failedAt" IS NOT NULL AND "failedAt" >= ${from} AND "failedAt" < ${toExclusive}`,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "ScheduledDelivery"
      WHERE "publishedAt" IS NOT NULL AND "publishedAt" >= ${from} AND "publishedAt" < ${toExclusive}`,
    db.$queryRaw<KeyCountRow[]>`
      SELECT status::text AS key, count(*)::bigint AS count FROM "ScheduledDelivery" GROUP BY 1`,
    db.$queryRaw<KeyCountRow[]>`
      SELECT coalesce("lastErrorCategory", '(none)') AS key, count(*)::bigint AS count
      FROM "ScheduledDelivery"
      WHERE "failedAt" IS NOT NULL AND "failedAt" >= ${from} AND "failedAt" < ${toExclusive}
      GROUP BY 1`,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "ScheduledDelivery"
      WHERE status = 'SCHEDULED' AND "nextAttemptAt" <= ${new Date()}`,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "ScheduledDelivery"
      WHERE status = 'PROCESSING' AND "leaseExpiresAt" < ${new Date()}`,
    db.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "failedAt") AS day, count(*)::bigint AS count
      FROM "ScheduledDelivery"
      WHERE "failedAt" IS NOT NULL AND "failedAt" >= ${from} AND "failedAt" < ${toExclusive}
      GROUP BY 1 ORDER BY 1`,
    includeModeration
      ? db.$queryRaw<DayCountRow[]>`
          SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
          FROM "Report"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
          GROUP BY 1 ORDER BY 1`
      : Promise.resolve([] as DayCountRow[]),
    includeModeration
      ? db.$queryRaw<KeyCountRow[]>`
          SELECT reason::text AS key, count(*)::bigint AS count
          FROM "Report"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
          GROUP BY 1`
      : Promise.resolve([] as KeyCountRow[]),
    includeModeration
      ? db.report.count({ where: { card: { status: "PUBLISHED" } } })
      : Promise.resolve(0),
    includeModeration
      ? db.auditLog.count({
          where: {
            action: "moderation.card_removed",
            createdAt: { gte: from, lt: toExclusive },
          },
        })
      : Promise.resolve(0),
    includeWallet
      ? db.$queryRaw<KeyCountRow[]>`
          SELECT kind::text AS key, count(*)::bigint AS count
          FROM "LedgerEntry"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
          GROUP BY 1`
      : Promise.resolve([] as KeyCountRow[]),
    includeWallet
      ? db.$queryRaw<KeyCountRow[]>`
          SELECT source::text AS key, count(*)::bigint AS count
          FROM "CreditGrant"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
          GROUP BY 1`
      : Promise.resolve([] as KeyCountRow[]),
    includeWallet
      ? db.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count FROM "LedgerEntry"
          WHERE kind = 'COMMIT' AND "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
            AND "grantId" IN (SELECT id FROM "CreditGrant" WHERE unit = 'PREMIUM')`
      : Promise.resolve([{ count: BigInt(0) }]),
    includeWallet
      ? db.$queryRaw<DayCountRow[]>`
          SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
          FROM "LedgerEntry"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
          GROUP BY 1 ORDER BY 1`
      : Promise.resolve([] as DayCountRow[]),
    db.$queryRaw<{ objects: bigint; bytes: bigint; unattached: bigint }[]>`
      SELECT count(*)::bigint AS objects,
             coalesce(sum("byteSize"), 0)::bigint AS bytes,
             count(*) FILTER (WHERE "cardId" IS NULL)::bigint AS unattached
      FROM "CardMedia"`,
    db.$queryRaw<{ objects: bigint; bytes: bigint }[]>`
      SELECT count(*)::bigint AS objects, coalesce(sum("byteSize"), 0)::bigint AS bytes
      FROM "CardMedia"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}`,
    db.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
      FROM "CardMedia"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const occasionMap = new Map<string, number>();
  for (const row of cardByTemplate) {
    const occasion = occasionForTemplateKey(row.key);
    occasionMap.set(occasion, (occasionMap.get(occasion) ?? 0) + n(row.count));
  }

  const ct = customerTotals[0];
  const mediaTot = mediaTotals[0];
  const mediaRange = mediaInRange[0];

  await recordStaffAudit("ops.dashboard_viewed", {
    staffPrincipalId: opts.staffPrincipalId,
    rateLimitSalt: opts.rateLimitSalt,
    ip: opts.ip,
    bestEffort: true,
    meta: {
      preset: range.preset,
      from: range.from.toISOString(),
      toExclusive: range.toExclusive.toISOString(),
    },
  });

  return {
    range: {
      preset: range.preset,
      from: range.from.toISOString(),
      toExclusive: range.toExclusive.toISOString(),
      label: range.label,
    },
    customers: {
      measured: true,
      registrations: n(ct?.total),
      verifiedRegistrations: n(ct?.verified),
      series: fillSeries(days, customerSeries),
    },
    cards: {
      measured: true,
      created: named(cardByTemplate).reduce((s, x) => s + x.count, 0),
      byTier: named(cardByTier),
      byStatus: named(cardByStatus),
      byOccasion: [...occasionMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      byTemplate: named(cardByTemplate),
      series: fillSeries(days, cardSeries),
    },
    deliveries: {
      measured: true,
      createdInRange: n(deliveryCreated[0]?.count),
      failedInRange: n(deliveryFailed[0]?.count),
      publishedInRange: n(deliveryPublished[0]?.count),
      byStatusCurrent: named(deliveryStatus),
      failuresByCategory: named(failureCats),
      dueNow: n(dueNowRows[0]?.count),
      expiredLeases: n(expiredLeaseRows[0]?.count),
      seriesFailed: fillSeries(days, failedSeries),
    },
    moderation: includeModeration
      ? {
          measured: true,
          reportsInRange: fillSeries(days, reportSeries).reduce((s, p) => s + p.count, 0),
          openOnPublished: openReports,
          removalsInRange: removalCount,
          byReason: named(reportByReason),
          series: fillSeries(days, reportSeries),
        }
      : { measured: false, reason: "Requires reports:read" },
    wallet: includeWallet
      ? {
          measured: true,
          ledgerByKind: named(ledgerByKind),
          grantsBySource: named(grantBySource),
          premiumCommits: n(premiumCommits[0]?.count),
          seriesLedger: fillSeries(days, ledgerSeries),
        }
      : { measured: false, reason: "Requires wallet:read — credit activity only, not revenue" },
    media: {
      measured: true,
      objectsTotal: n(mediaTot?.objects),
      bytesTotal: n(mediaTot?.bytes),
      unattachedObjects: n(mediaTot?.unattached),
      createdInRange: n(mediaRange?.objects),
      bytesCreatedInRange: n(mediaRange?.bytes),
      seriesObjects: fillSeries(days, mediaSeries),
    },
    health: {
      queueByStatus: named(deliveryStatus),
      dueNow: n(dueNowRows[0]?.count),
      expiredLeases: n(expiredLeaseRows[0]?.count),
      recentDeliveryFailures: n(deliveryFailed[0]?.count),
      appHttpHealth: {
        measured: false,
        reason: "Consumer /api/health is not probed from admin (no CONSUMER_APP_URL wiring in P3)",
      },
      workerHeartbeat: {
        measured: false,
        reason: "Delivery CycleStats are process stdout only — no WorkerRun table",
      },
    },
  };
}

export type OpsExportDataset =
  | "customers"
  | "cards"
  | "deliveries"
  | "moderation"
  | "wallet"
  | "media";

export async function buildOpsCsv(
  dataset: OpsExportDataset,
  range: OpsDateRange,
  role: StaffRoleName,
): Promise<{ filename: string; body: string }> {
  assertPermission(role, "ops:read");
  if (dataset === "moderation") assertPermission(role, "reports:read");
  if (dataset === "wallet") assertPermission(role, "wallet:read");

  const { from, toExclusive } = range;
  const days = enumerateUtcDays(from, toExclusive);

  let header = "";
  let rows: string[][] = [];

  if (dataset === "customers") {
    const series = await db.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
      FROM "user"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`;
    header = "day,registrations";
    rows = fillSeries(days, series).map((p) => [p.day, String(p.count)]);
  } else if (dataset === "cards") {
    const byTemplate = await db.$queryRaw<KeyCountRow[]>`
      SELECT "templateKey" AS key, count(*)::bigint AS count
      FROM "Card"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`;
    header = "template_key,occasion,count";
    rows = named(byTemplate).map((r) => [r.key, occasionForTemplateKey(r.key), String(r.count)]);
  } else if (dataset === "deliveries") {
    const byStatus = await db.$queryRaw<KeyCountRow[]>`
      SELECT status::text AS key, count(*)::bigint AS count FROM "ScheduledDelivery" GROUP BY 1`;
    header = "status,count_current,note";
    rows = named(byStatus).map((r) => [r.key, String(r.count), "current_snapshot"]);
  } else if (dataset === "moderation") {
    const byReason = await db.$queryRaw<KeyCountRow[]>`
      SELECT reason::text AS key, count(*)::bigint AS count
      FROM "Report"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`;
    header = "reason,count";
    rows = named(byReason).map((r) => [r.key, String(r.count)]);
  } else if (dataset === "wallet") {
    const byKind = await db.$queryRaw<KeyCountRow[]>`
      SELECT kind::text AS key, count(*)::bigint AS count
      FROM "LedgerEntry"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`;
    header = "ledger_kind,count,note";
    rows = named(byKind).map((r) => [r.key, String(r.count), "credit_activity_not_revenue"]);
  } else {
    const series = await db.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
      FROM "CardMedia"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1`;
    header = "day,media_objects_created";
    rows = fillSeries(days, series).map((p) => [p.day, String(p.count)]);
  }

  const body = [header, ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
  const filename = `mawica-ops-${dataset}-${range.preset}-${Date.now()}.csv`;
  return { filename, body };
}

/**
 * CSV cell escaping + spreadsheet formula-injection defence.
 * Neutralises leading = + - @ TAB CR so Excel/Sheets treat the value as text.
 */
export function csvCell(v: string): string {
  let out = v;
  if (/^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (/[",\n\r]/.test(out)) return `"${out.replace(/"/g, '""')}"`;
  return out;
}

/** Exported for unit tests without DB — occasion rollup. */
export function rollupOccasions(byTemplate: NamedCount[]): NamedCount[] {
  const map = new Map<string, number>();
  for (const row of byTemplate) {
    const occasion = occasionForTemplateKey(row.key);
    map.set(occasion, (map.get(occasion) ?? 0) + row.count);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}
