import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DateRangeFilter } from "@/components/ops/DateRangeFilter";
import { formatBytes, MetricCard, NamedCountList } from "@/components/ops/MetricCard";
import { SparkBars } from "@/components/ops/SparkBars";
import { requestIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { readStaffSession } from "@/lib/session";
import { loadOpsDashboard } from "@/modules/staff/ops/analytics";
import { formatYmd, OpsDateRangeError, resolveOpsDateRange } from "@/modules/staff/ops/dates";
import { hasPermission } from "@/modules/staff/roles";

export default async function OpsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  if (!hasPermission(session.role, "ops:read")) {
    return (
      <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-8 text-[var(--admin-muted)]">
        You do not have permission to view operations analytics (`ops:read`).
      </div>
    );
  }

  const sp = await searchParams;
  let rangeError: string | null = null;
  let range;
  try {
    range = resolveOpsDateRange(sp);
  } catch (e) {
    rangeError = e instanceof OpsDateRangeError ? e.message : "Invalid date range";
    range = resolveOpsDateRange({ preset: "30d" });
  }

  const h = await headers();
  const data = await loadOpsDashboard(range, {
    role: session.role,
    staffPrincipalId: session.staffPrincipalId,
    rateLimitSalt: env.RATE_LIMIT_SALT,
    ip: requestIp(h),
  });

  const qs = new URLSearchParams();
  qs.set("preset", range.preset);
  if (range.preset === "custom") {
    qs.set("from", formatYmd(range.from));
    qs.set("to", formatYmd(new Date(range.toExclusive.getTime() - 1)));
  }
  const exportBase = `/api/ops/export?${qs.toString()}&dataset=`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations & analytics</h1>
          <p className="mt-2 max-w-2xl text-[var(--admin-muted)]">
            Measured from Mawica Postgres. Message bodies and media blobs are never loaded. Credit metrics are
            activity counts — not revenue.
          </p>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">Range: {data.range.label}</p>
        </div>
      </div>

      {rangeError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {rangeError}. Showing last 30 days instead.
        </div>
      ) : null}

      <DateRangeFilter
        preset={range.preset}
        from={range.preset === "custom" ? formatYmd(range.from) : undefined}
        to={range.preset === "custom" ? formatYmd(new Date(range.toExclusive.getTime() - 1)) : undefined}
      />

      <section className="space-y-3">
        <SectionHead title="Customers" href="/ops/customers" exportHref={`${exportBase}customers`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Registrations" value={String(data.customers.registrations)} />
          <MetricCard label="Verified (of those)" value={String(data.customers.verifiedRegistrations)} />
        </div>
        <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
          <SparkBars series={data.customers.series} label="Registrations per UTC day" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Greeting cards" href="/ops/cards" exportHref={`${exportBase}cards`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Created in range" value={String(data.cards.created)} />
          <MetricCard
            label="Premium (tier)"
            value={String(data.cards.byTier.find((t) => t.key === "PREMIUM")?.count ?? 0)}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
            <SparkBars series={data.cards.series} label="Cards created per UTC day" />
          </div>
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
            <h3 className="mb-2 text-sm font-semibold">By occasion (from template registry)</h3>
            <NamedCountList rows={data.cards.byOccasion} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Scheduled deliveries" href="/ops/deliveries" exportHref={`${exportBase}deliveries`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Created in range" value={String(data.deliveries.createdInRange)} />
          <MetricCard label="Published in range" value={String(data.deliveries.publishedInRange)} />
          <MetricCard label="Failed in range" value={String(data.deliveries.failedInRange)} />
          <MetricCard label="Due now" value={String(data.deliveries.dueNow)} hint="SCHEDULED with nextAttemptAt ≤ now" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
            <h3 className="mb-2 text-sm font-semibold">Current queue by status</h3>
            <NamedCountList rows={data.deliveries.byStatusCurrent} />
          </div>
          <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
            <SparkBars series={data.deliveries.seriesFailed} label="Failures per UTC day" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Moderation"
          href="/ops/moderation"
          exportHref={data.moderation.measured ? `${exportBase}moderation` : undefined}
        />
        {data.moderation.measured ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Reports in range" value={String(data.moderation.reportsInRange ?? 0)} />
              <MetricCard label="Open on published" value={String(data.moderation.openOnPublished ?? 0)} />
              <MetricCard label="Removals in range" value={String(data.moderation.removalsInRange ?? 0)} />
            </div>
            <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
              <SparkBars series={data.moderation.series ?? []} label="Reports per UTC day" />
            </div>
          </>
        ) : (
          <Unavailable reason={data.moderation.reason ?? "Unavailable"} />
        )}
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Wallet credit activity"
          href="/ops/wallet"
          exportHref={data.wallet.measured ? `${exportBase}wallet` : undefined}
        />
        {data.wallet.measured ? (
          <>
            <p className="text-sm text-[var(--admin-muted)]">
              Ledger and grant counts only. No Stripe amounts, ARPU, or invented revenue.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Premium COMMITs" value={String(data.wallet.premiumCommits ?? 0)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
                <h3 className="mb-2 text-sm font-semibold">Ledger by kind</h3>
                <NamedCountList rows={data.wallet.ledgerByKind ?? []} />
              </div>
              <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
                <SparkBars series={data.wallet.seriesLedger ?? []} label="Ledger entries per UTC day" />
              </div>
            </div>
          </>
        ) : (
          <Unavailable reason={data.wallet.reason ?? "Unavailable"} />
        )}
      </section>

      <section className="space-y-3">
        <SectionHead title="Media storage" href="/ops/media" exportHref={`${exportBase}media`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Objects (all time)" value={String(data.media.objectsTotal)} />
          <MetricCard label="Bytes (metadata sum)" value={formatBytes(data.media.bytesTotal)} hint="CardMedia.byteSize only" />
          <MetricCard label="Unattached" value={String(data.media.unattachedObjects)} />
          <MetricCard label="Created in range" value={String(data.media.createdInRange)} />
        </div>
        <div className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
          <SparkBars series={data.media.seriesObjects} label="Media objects created per UTC day" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Health indicators" href="/ops/health" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Due now" value={String(data.health.dueNow)} />
          <MetricCard label="Expired leases" value={String(data.health.expiredLeases)} />
          <MetricCard label="Failures in range" value={String(data.health.recentDeliveryFailures)} />
          <MetricCard
            label="App HTTP health"
            value="—"
            unavailable
            hint={
              data.health.appHttpHealth.measured === false
                ? data.health.appHttpHealth.reason
                : data.health.appHttpHealth.status
            }
          />
        </div>
        <Unavailable reason={data.health.workerHeartbeat.reason} />
      </section>
    </div>
  );
}

function SectionHead({
  title,
  href,
  exportHref,
}: {
  title: string;
  href: string;
  exportHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={href} className="text-[var(--admin-accent)] underline-offset-2 hover:underline">
          Details
        </Link>
        {exportHref ? (
          <a href={exportHref} className="text-[var(--admin-accent)] underline-offset-2 hover:underline">
            Export CSV
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--admin-line)] bg-[var(--admin-card)] px-4 py-6 text-sm text-[var(--admin-muted)]">
      Unavailable: {reason}
    </div>
  );
}
