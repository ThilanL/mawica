import { MetricCard, NamedCountList } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data, exportQuery } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Moderation trends" range={range} rangeError={rangeError} basePath="/ops/moderation">
      {data.moderation.measured ? (
        <>
          <a
            href={`/api/ops/export?${exportQuery}&dataset=moderation`}
            className="inline-block text-sm text-[var(--admin-accent)] underline-offset-2 hover:underline"
          >
            Export CSV
          </a>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Reports" value={String(data.moderation.reportsInRange ?? 0)} />
            <MetricCard label="Open on published" value={String(data.moderation.openOnPublished ?? 0)} />
            <MetricCard label="Removals (audit)" value={String(data.moderation.removalsInRange ?? 0)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
              <h3 className="mb-2 text-sm font-semibold">By reason</h3>
              <NamedCountList rows={data.moderation.byReason ?? []} />
            </div>
            <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
              <SparkBars series={data.moderation.series ?? []} label="Reports per UTC day" />
            </div>
          </div>
        </>
      ) : (
        <p className="text-[var(--admin-muted)]">{data.moderation.reason}</p>
      )}
    </OpsDetailShell>
  );
}
