import { formatBytes, MetricCard } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data, exportQuery } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Media storage" range={range} rangeError={rangeError} basePath="/ops/media">
      <p className="text-sm text-[var(--admin-muted)]">
        Uses CardMedia.byteSize only. CardMediaBlob.data is never selected.
      </p>
      <a
        href={`/api/ops/export?${exportQuery}&dataset=media`}
        className="inline-block text-sm text-[var(--admin-accent)] underline-offset-2 hover:underline"
      >
        Export CSV
      </a>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Objects" value={String(data.media.objectsTotal)} />
        <MetricCard label="Total bytes" value={formatBytes(data.media.bytesTotal)} />
        <MetricCard label="Unattached" value={String(data.media.unattachedObjects)} />
        <MetricCard label="Bytes in range" value={formatBytes(data.media.bytesCreatedInRange)} />
      </div>
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <SparkBars series={data.media.seriesObjects} label="Objects created per UTC day" />
      </div>
    </OpsDetailShell>
  );
}
