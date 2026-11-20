import Link from "next/link";
import { hasPermission } from "@/modules/staff/roles";
import { db } from "@/lib/db";
import { readStaffSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await readStaffSession();
  if (!session) return null;

  const [openReports, removedCards, recentRemovals, customers] = await Promise.all([
    hasPermission(session.role, "reports:read")
      ? db.report.count({ where: { card: { status: "PUBLISHED" } } })
      : null,
    hasPermission(session.role, "reports:read") ? db.card.count({ where: { status: "REMOVED" } }) : null,
    hasPermission(session.role, "audit:read")
      ? db.auditLog.count({ where: { action: "moderation.card_removed" } })
      : null,
    hasPermission(session.role, "users:read") ? db.user.count() : null,
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-[var(--admin-muted)]">
          Staff operations for Mawica. Consumer data is minimised; message bodies and full report details are not shown
          in lists.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={customers} />
        <Stat label="Open reports (published cards)" value={openReports} />
        <Stat label="Removed cards" value={removedCards} />
        <Stat label="Removal audit events" value={recentRemovals} />
      </div>

      <div className="flex flex-wrap gap-3">
        {hasPermission(session.role, "users:read") ? (
          <Link
            href="/customers"
            className="rounded-full bg-[var(--admin-accent)] px-5 py-2.5 text-sm font-semibold text-[#fff8f4]"
          >
            Customer directory
          </Link>
        ) : null}
        {hasPermission(session.role, "reports:read") ? (
          <Link
            href="/reports"
            className="rounded-full border border-[var(--admin-line)] bg-[var(--admin-card)] px-5 py-2.5 text-sm font-semibold"
          >
            Open report queue
          </Link>
        ) : null}
        {hasPermission(session.role, "audit:read") ? (
          <Link
            href="/audit"
            className="rounded-full border border-[var(--admin-line)] bg-[var(--admin-card)] px-5 py-2.5 text-sm font-semibold"
          >
            Moderation history
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-5">
      <div className="text-sm text-[var(--admin-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value === null ? "—" : value}</div>
    </div>
  );
}
