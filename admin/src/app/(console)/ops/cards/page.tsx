import { MetricCard, NamedCountList } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data, exportQuery } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Greeting cards" range={range} rangeError={rangeError} basePath="/ops/cards">
      <a
        href={`/api/ops/export?${exportQuery}&dataset=cards`}
        className="inline-block text-sm text-[var(--admin-accent)] underline-offset-2 hover:underline"
      >
        Export CSV
      </a>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Created" value={String(data.cards.created)} />
        <MetricCard label="Premium tier" value={String(data.cards.byTier.find((t) => t.key === "PREMIUM")?.count ?? 0)} />
        <MetricCard label="Standard tier" value={String(data.cards.byTier.find((t) => t.key === "STANDARD")?.count ?? 0)} />
      </div>
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <SparkBars series={data.cards.series} label="Cards created per UTC day" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By status">
          <NamedCountList rows={data.cards.byStatus} />
        </Panel>
        <Panel title="By occasion">
          <NamedCountList rows={data.cards.byOccasion} />
        </Panel>
        <Panel title="By template key">
          <NamedCountList rows={data.cards.byTemplate} />
        </Panel>
      </div>
    </OpsDetailShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
