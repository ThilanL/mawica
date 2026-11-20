import { MetricCard, NamedCountList } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data, exportQuery } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Scheduled deliveries" range={range} rangeError={rangeError} basePath="/ops/deliveries">
      <a
        href={`/api/ops/export?${exportQuery}&dataset=deliveries`}
        className="inline-block text-sm text-[var(--admin-accent)] underline-offset-2 hover:underline"
      >
        Export CSV (current status snapshot)
      </a>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Created" value={String(data.deliveries.createdInRange)} />
        <MetricCard label="Published" value={String(data.deliveries.publishedInRange)} />
        <MetricCard label="Failed" value={String(data.deliveries.failedInRange)} />
        <MetricCard label="Expired leases" value={String(data.deliveries.expiredLeases)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
          <h3 className="mb-2 text-sm font-semibold">Current status</h3>
          <NamedCountList rows={data.deliveries.byStatusCurrent} />
        </div>
        <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
          <h3 className="mb-2 text-sm font-semibold">Failures by category</h3>
          <NamedCountList rows={data.deliveries.failuresByCategory} empty="No failures in range" />
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <SparkBars series={data.deliveries.seriesFailed} label="Failures per UTC day" />
      </div>
    </OpsDetailShell>
  );
}
