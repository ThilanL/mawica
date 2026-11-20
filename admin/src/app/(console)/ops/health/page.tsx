import { MetricCard, NamedCountList } from "@/components/ops/MetricCard";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Application & worker health" range={range} rangeError={rangeError} basePath="/ops/health">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Due now" value={String(data.health.dueNow)} hint="Measured from ScheduledDelivery" />
        <MetricCard label="Expired leases" value={String(data.health.expiredLeases)} />
        <MetricCard label="Failures in range" value={String(data.health.recentDeliveryFailures)} />
      </div>
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <h3 className="mb-2 text-sm font-semibold">Queue by status (current)</h3>
        <NamedCountList rows={data.health.queueByStatus} />
      </div>
      <div className="space-y-3 rounded-2xl border border-dashed border-[var(--admin-line)] bg-[var(--admin-card)] p-4 text-sm text-[var(--admin-muted)]">
        <p>
          <strong className="text-[var(--admin-ink)]">Unavailable — app HTTP health:</strong>{" "}
          {data.health.appHttpHealth.measured === false
            ? data.health.appHttpHealth.reason
            : data.health.appHttpHealth.status}
        </p>
        <p>
          <strong className="text-[var(--admin-ink)]">Unavailable — worker heartbeat:</strong>{" "}
          {data.health.workerHeartbeat.reason}
        </p>
      </div>
    </OpsDetailShell>
  );
}
