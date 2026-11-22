import { MetricCard } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data, exportQuery } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Customer growth" range={range} rangeError={rangeError} basePath="/ops/customers">
      <a
        href={`/api/ops/export?${exportQuery}&dataset=customers`}
        className="inline-block text-sm text-[var(--admin-accent)] underline-offset-2 hover:underline"
      >
        Export CSV
      </a>
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="Registrations" value={String(data.customers.registrations)} hint="user.createdAt in range" />
        <MetricCard label="Email verified" value={String(data.customers.verifiedRegistrations)} />
      </div>
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <SparkBars series={data.customers.series} label="Daily registrations (UTC)" />
      </div>
    </OpsDetailShell>
  );
}
