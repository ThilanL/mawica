import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getReportDetail } from "@/modules/staff/moderation";
import { hasPermission } from "@/modules/staff/roles";
import { RemoveCardForm } from "@/components/RemoveCardForm";
import { readStaffSession } from "@/lib/session";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "reports:read")) {
    return <p className="text-[var(--admin-muted)]">Forbidden.</p>;
  }

  const { id } = await params;
  const report = await getReportDetail(id);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/reports" className="text-sm text-[var(--admin-muted)] hover:underline">
        ← Back to queue
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report detail</h1>
        <p className="mt-2 text-[var(--admin-muted)]">Sensitive card copy is not loaded in admin.</p>
      </div>

      <dl className="grid gap-4 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-5 sm:grid-cols-2">
        <Item label="Reason" value={report.reason} />
        <Item label="Reported" value={new Date(report.createdAt).toLocaleString()} />
        <Item label="Details preview" value={report.detailsPreview || "—"} />
        <Item label="Card slug" value={report.card.slug} />
        <Item label="Template" value={report.card.templateKey} />
        <Item label="Tier" value={report.card.tier} />
        <Item label="Status" value={report.card.status} />
        <Item label="Total reports on card" value={String(report.card.reportCount)} />
        <Item label="Removed at" value={report.card.removedAt ? new Date(report.card.removedAt).toLocaleString() : "—"} />
        <Item label="Removal reason" value={report.card.removedReason || "—"} />
      </dl>

      <div className="flex flex-wrap gap-3">
        {hasPermission(session.role, "cards:remove") && report.card.status === "PUBLISHED" ? (
          <RemoveCardForm slug={report.card.slug} />
        ) : null}
        {report.card.status === "REMOVED" ? (
          <p className="text-sm text-[var(--admin-muted)]">
            Removal is terminal in the database (same as the CLI). Re-publish is not available in P1.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
