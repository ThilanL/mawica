import { MetricCard, NamedCountList } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { loadOpsPageData, OpsDetailShell } from "../_shared";

export default async function OpsWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, rangeError, data, exportQuery } = await loadOpsPageData(searchParams);
  return (
    <OpsDetailShell title="Wallet credit activity" range={range} rangeError={rangeError} basePath="/ops/wallet">
      <p className="text-sm text-[var(--admin-muted)]">
        Credit ledger and grant counts only. Not financial revenue. Stripe is out of scope.
      </p>
      {data.wallet.measured ? (
        <>
          <a
            href={`/api/ops/export?${exportQuery}&dataset=wallet`}
            className="inline-block text-sm text-[var(--admin-accent)] underline-offset-2 hover:underline"
          >
            Export CSV
          </a>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Premium COMMITs" value={String(data.wallet.premiumCommits ?? 0)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
              <h3 className="mb-2 text-sm font-semibold">Ledger by kind</h3>
              <NamedCountList rows={data.wallet.ledgerByKind ?? []} />
            </div>
            <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
              <h3 className="mb-2 text-sm font-semibold">Grants by source</h3>
              <NamedCountList rows={data.wallet.grantsBySource ?? []} />
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
            <SparkBars series={data.wallet.seriesLedger ?? []} label="Ledger entries per UTC day" />
          </div>
        </>
      ) : (
        <p className="text-[var(--admin-muted)]">{data.wallet.reason}</p>
      )}
    </OpsDetailShell>
  );
}
